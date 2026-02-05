/**
 * ICT (Inner Circle Trader) Methodology Analyzer
 * Implements: Market Structure, Order Blocks, Fair Value Gaps,
 * Liquidity Sweeps, Optimal Trade Entry, Killzones, Displacement
 */

class ICTAnalyzer {
  constructor() {
    this.pipValues = {
      'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'AUD/USD': 0.0001,
      'NZD/USD': 0.0001, 'USD/CHF': 0.0001, 'USD/CAD': 0.0001,
      'EUR/GBP': 0.0001, 'EUR/JPY': 0.01, 'GBP/JPY': 0.01,
      'USD/JPY': 0.01, 'XAU/USD': 0.01
    };
    this.killzones = {
      asian:   { start: 0,  end: 8,  name: 'Asian Session' },
      london:  { start: 7,  end: 16, name: 'London Killzone' },
      newyork: { start: 12, end: 21, name: 'New York Killzone' },
      londonClose: { start: 15, end: 17, name: 'London Close Killzone' }
    };
  }

  /**
   * Identify Market Structure: Higher Highs, Higher Lows (Bullish)
   * or Lower Highs, Lower Lows (Bearish) + Break of Structure (BOS)
   * and Change of Character (ChoCH)
   */
  analyzeMarketStructure(candles) {
    if (!candles || candles.length < 20) return { bias: 'neutral', structures: [] };
    const swings = this._findSwingPoints(candles);
    const structures = [];
    let bias = 'neutral';
    let lastHH = null, lastHL = null, lastLH = null, lastLL = null;

    for (let i = 1; i < swings.length; i++) {
      const prev = swings[i - 1];
      const curr = swings[i];

      if (curr.type === 'high') {
        if (prev.type === 'high') {
          if (curr.price > prev.price) {
            structures.push({ type: 'HH', price: curr.price, index: curr.index, label: 'Higher High' });
            lastHH = curr;
          } else {
            structures.push({ type: 'LH', price: curr.price, index: curr.index, label: 'Lower High' });
            lastLH = curr;
          }
        }
      } else {
        if (prev.type === 'low') {
          if (curr.price > prev.price) {
            structures.push({ type: 'HL', price: curr.price, index: curr.index, label: 'Higher Low' });
            lastHL = curr;
          } else {
            structures.push({ type: 'LL', price: curr.price, index: curr.index, label: 'Lower Low' });
            lastLL = curr;
          }
        }
      }
    }

    // Determine bias from recent structures
    const recent = structures.slice(-6);
    const hhCount = recent.filter(s => s.type === 'HH' || s.type === 'HL').length;
    const llCount = recent.filter(s => s.type === 'LH' || s.type === 'LL').length;

    if (hhCount > llCount) bias = 'bullish';
    else if (llCount > hhCount) bias = 'bearish';

    // Detect Break of Structure (BOS) and Change of Character (ChoCH)
    let bos = null, choch = null;
    const lastCandle = candles[candles.length - 1];
    const swingHighs = swings.filter(s => s.type === 'high');
    const swingLows = swings.filter(s => s.type === 'low');

    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const prevSwingHigh = swingHighs[swingHighs.length - 2];
      const prevSwingLow = swingLows[swingLows.length - 2];

      if (lastCandle.close > prevSwingHigh.price && bias !== 'bullish') {
        choch = { type: 'bullish_choch', price: prevSwingHigh.price, label: 'Bullish ChoCH' };
        bias = 'bullish';
      } else if (lastCandle.close < prevSwingLow.price && bias !== 'bearish') {
        choch = { type: 'bearish_choch', price: prevSwingLow.price, label: 'Bearish ChoCH' };
        bias = 'bearish';
      } else if (lastCandle.close > prevSwingHigh.price && bias === 'bullish') {
        bos = { type: 'bullish_bos', price: prevSwingHigh.price, label: 'Bullish BOS' };
      } else if (lastCandle.close < prevSwingLow.price && bias === 'bearish') {
        bos = { type: 'bearish_bos', price: prevSwingLow.price, label: 'Bearish BOS' };
      }
    }

    return { bias, structures, bos, choch, swings };
  }

  /**
   * Identify Order Blocks (OB)
   * Bullish OB: Last bearish candle before a significant bullish move
   * Bearish OB: Last bullish candle before a significant bearish move
   */
  findOrderBlocks(candles) {
    const orderBlocks = [];
    if (!candles || candles.length < 10) return orderBlocks;

    const avgRange = this._averageRange(candles);

    for (let i = 2; i < candles.length - 2; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];
      const next1 = candles[i + 1];
      const next2 = candles[i + 2];

      // Bullish Order Block
      if (this._isBearish(curr) && this._isBullish(next1) && this._isBullish(next2)) {
        const displacement = (next2.high - curr.low) / avgRange;
        if (displacement > 1.5) {
          orderBlocks.push({
            type: 'bullish_ob',
            label: 'Bullish Order Block',
            high: curr.high,
            low: curr.low,
            index: i,
            strength: Math.min(displacement / 2, 1),
            mitigated: this._isOBMitigated(candles, i, 'bullish')
          });
        }
      }

      // Bearish Order Block
      if (this._isBullish(curr) && this._isBearish(next1) && this._isBearish(next2)) {
        const displacement = (curr.high - next2.low) / avgRange;
        if (displacement > 1.5) {
          orderBlocks.push({
            type: 'bearish_ob',
            label: 'Bearish Order Block',
            high: curr.high,
            low: curr.low,
            index: i,
            strength: Math.min(displacement / 2, 1),
            mitigated: this._isOBMitigated(candles, i, 'bearish')
          });
        }
      }
    }

    return orderBlocks.filter(ob => !ob.mitigated).slice(-5);
  }

  /**
   * Identify Fair Value Gaps (FVG / Imbalance)
   * Bullish FVG: Gap between candle 1 high and candle 3 low (price moved up fast)
   * Bearish FVG: Gap between candle 1 low and candle 3 high (price moved down fast)
   */
  findFairValueGaps(candles) {
    const fvgs = [];
    if (!candles || candles.length < 5) return fvgs;

    const avgRange = this._averageRange(candles);

    for (let i = 1; i < candles.length - 1; i++) {
      const c1 = candles[i - 1];
      const c2 = candles[i];
      const c3 = candles[i + 1];

      // Bullish FVG: c1.high < c3.low
      if (c1.high < c3.low) {
        const gapSize = c3.low - c1.high;
        if (gapSize > avgRange * 0.3) {
          fvgs.push({
            type: 'bullish_fvg',
            label: 'Bullish FVG',
            top: c3.low,
            bottom: c1.high,
            midpoint: (c3.low + c1.high) / 2,
            index: i,
            filled: this._isFVGFilled(candles, i, c1.high, c3.low, 'bullish')
          });
        }
      }

      // Bearish FVG: c1.low > c3.high
      if (c1.low > c3.high) {
        const gapSize = c1.low - c3.high;
        if (gapSize > avgRange * 0.3) {
          fvgs.push({
            type: 'bearish_fvg',
            label: 'Bearish FVG',
            top: c1.low,
            bottom: c3.high,
            midpoint: (c1.low + c3.high) / 2,
            index: i,
            filled: this._isFVGFilled(candles, i, c3.high, c1.low, 'bearish')
          });
        }
      }
    }

    return fvgs.filter(f => !f.filled).slice(-5);
  }

  /**
   * Detect Liquidity Sweeps / Raids
   * Price sweeps above/below a key level and reverses
   */
  findLiquiditySweeps(candles) {
    const sweeps = [];
    if (!candles || candles.length < 15) return sweeps;

    const swings = this._findSwingPoints(candles);
    const swingHighs = swings.filter(s => s.type === 'high');
    const swingLows = swings.filter(s => s.type === 'low');

    // Check recent candles for sweeps of previous swing points
    const lookback = Math.min(10, candles.length);
    for (let i = candles.length - lookback; i < candles.length; i++) {
      const candle = candles[i];

      // Check for buy-side liquidity sweep (sweep above swing high then close below)
      for (const sh of swingHighs) {
        if (sh.index >= i - 1) continue;
        if (candle.high > sh.price && candle.close < sh.price) {
          sweeps.push({
            type: 'buyside_sweep',
            label: 'Buy-side Liquidity Sweep',
            level: sh.price,
            wick: candle.high,
            index: i,
            significance: 'high'
          });
        }
      }

      // Check for sell-side liquidity sweep (sweep below swing low then close above)
      for (const sl of swingLows) {
        if (sl.index >= i - 1) continue;
        if (candle.low < sl.price && candle.close > sl.price) {
          sweeps.push({
            type: 'sellside_sweep',
            label: 'Sell-side Liquidity Sweep',
            level: sl.price,
            wick: candle.low,
            index: i,
            significance: 'high'
          });
        }
      }
    }

    return sweeps.slice(-3);
  }

  /**
   * Optimal Trade Entry (OTE) using Fibonacci retracement
   * OTE zone is between 0.62 and 0.79 retracement of a swing
   */
  findOTE(candles, bias) {
    if (!candles || candles.length < 10) return null;

    const swings = this._findSwingPoints(candles);
    if (swings.length < 2) return null;

    const lastSwings = swings.slice(-4);
    let swingHigh = null, swingLow = null;

    for (const s of lastSwings) {
      if (s.type === 'high') swingHigh = s;
      if (s.type === 'low') swingLow = s;
    }

    if (!swingHigh || !swingLow) return null;

    const range = swingHigh.price - swingLow.price;
    let ote = {};

    if (bias === 'bullish') {
      ote = {
        type: 'bullish_ote',
        label: 'Bullish OTE Zone',
        top: swingHigh.price - range * 0.62,
        bottom: swingHigh.price - range * 0.79,
        midpoint: swingHigh.price - range * 0.705,
        fib62: swingHigh.price - range * 0.62,
        fib705: swingHigh.price - range * 0.705,
        fib79: swingHigh.price - range * 0.79,
        swingHigh: swingHigh.price,
        swingLow: swingLow.price
      };
    } else if (bias === 'bearish') {
      ote = {
        type: 'bearish_ote',
        label: 'Bearish OTE Zone',
        top: swingLow.price + range * 0.79,
        bottom: swingLow.price + range * 0.62,
        midpoint: swingLow.price + range * 0.705,
        fib62: swingLow.price + range * 0.62,
        fib705: swingLow.price + range * 0.705,
        fib79: swingLow.price + range * 0.79,
        swingHigh: swingHigh.price,
        swingLow: swingLow.price
      };
    }

    return ote;
  }

  /**
   * Detect Displacement (strong impulsive move)
   */
  findDisplacement(candles) {
    const displacements = [];
    if (!candles || candles.length < 5) return displacements;

    const avgRange = this._averageRange(candles);

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const bodySize = Math.abs(c.close - c.open);
      const range = c.high - c.low;

      if (bodySize > avgRange * 2 && bodySize / range > 0.7) {
        displacements.push({
          type: c.close > c.open ? 'bullish_displacement' : 'bearish_displacement',
          label: c.close > c.open ? 'Bullish Displacement' : 'Bearish Displacement',
          index: i,
          size: bodySize,
          relative: bodySize / avgRange
        });
      }
    }

    return displacements.slice(-3);
  }

  /**
   * Get current Killzone / Session
   */
  getCurrentKillzone() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const active = [];

    for (const [key, kz] of Object.entries(this.killzones)) {
      if (utcHour >= kz.start && utcHour < kz.end) {
        active.push({ key, ...kz });
      }
    }

    return active.length > 0 ? active : [{ key: 'off', name: 'Off-Session', start: 0, end: 0 }];
  }

  /**
   * Full ICT Analysis pipeline
   */
  fullAnalysis(candles, pair) {
    const structure = this.analyzeMarketStructure(candles);
    const orderBlocks = this.findOrderBlocks(candles);
    const fvgs = this.findFairValueGaps(candles);
    const sweeps = this.findLiquiditySweeps(candles);
    const ote = this.findOTE(candles, structure.bias);
    const displacements = this.findDisplacement(candles);
    const killzones = this.getCurrentKillzone();

    return {
      pair,
      timestamp: new Date().toISOString(),
      marketStructure: structure,
      orderBlocks,
      fairValueGaps: fvgs,
      liquiditySweeps: sweeps,
      ote,
      displacements,
      killzones,
      confluenceScore: this._calculateConfluence(structure, orderBlocks, fvgs, sweeps, ote, displacements)
    };
  }

  // ====== Private Helpers ======

  _findSwingPoints(candles, leftBars = 3, rightBars = 3) {
    const swings = [];
    for (let i = leftBars; i < candles.length - rightBars; i++) {
      let isSwingHigh = true, isSwingLow = true;
      for (let j = i - leftBars; j <= i + rightBars; j++) {
        if (j === i) continue;
        if (candles[j].high >= candles[i].high) isSwingHigh = false;
        if (candles[j].low <= candles[i].low) isSwingLow = false;
      }
      if (isSwingHigh) swings.push({ type: 'high', price: candles[i].high, index: i });
      if (isSwingLow) swings.push({ type: 'low', price: candles[i].low, index: i });
    }
    return swings;
  }

  _isBullish(candle) { return candle.close > candle.open; }
  _isBearish(candle) { return candle.close < candle.open; }

  _averageRange(candles) {
    const ranges = candles.map(c => c.high - c.low);
    return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }

  _isOBMitigated(candles, obIndex, type) {
    const ob = candles[obIndex];
    for (let i = obIndex + 3; i < candles.length; i++) {
      if (type === 'bullish' && candles[i].close < ob.low) return true;
      if (type === 'bearish' && candles[i].close > ob.high) return true;
    }
    return false;
  }

  _isFVGFilled(candles, fvgIndex, bottom, top, type) {
    for (let i = fvgIndex + 2; i < candles.length; i++) {
      if (type === 'bullish' && candles[i].low <= bottom) return true;
      if (type === 'bearish' && candles[i].high >= top) return true;
    }
    return false;
  }

  _calculateConfluence(structure, obs, fvgs, sweeps, ote, displacements) {
    let score = 0;
    if (structure.bias !== 'neutral') score += 20;
    if (structure.bos) score += 15;
    if (structure.choch) score += 20;
    if (obs.length > 0) score += 15;
    if (fvgs.length > 0) score += 10;
    if (sweeps.length > 0) score += 15;
    if (ote) score += 10;
    if (displacements.length > 0) score += 10;

    const activeKZ = this.getCurrentKillzone();
    if (activeKZ.some(k => k.key === 'london' || k.key === 'newyork')) score += 10;

    return Math.min(score, 100);
  }
}

if (typeof module !== 'undefined') module.exports = ICTAnalyzer;
