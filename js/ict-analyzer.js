/**
 * ICT (Inner Circle Trader) Methodology Analyzer
 * Enhanced signal generation with relaxed thresholds
 */
class ICTAnalyzer {
  constructor() {
    this.pipSize = {
      'EUR/USD':0.0001,'GBP/USD':0.0001,'AUD/USD':0.0001,'NZD/USD':0.0001,
      'USD/CHF':0.0001,'USD/CAD':0.0001,'EUR/GBP':0.0001,
      'USD/JPY':0.01,'EUR/JPY':0.01,'GBP/JPY':0.01,
      'XAU/USD':0.01,
      'BTC/USD':1,'ETH/USD':0.1,'BNB/USD':0.01,'SOL/USD':0.01,'XRP/USD':0.0001
    };
  }

  pip(pair) { return this.pipSize[pair] || 0.0001; }

  decimals(pair) {
    const p = this.pip(pair);
    if (p >= 1) return 0;
    return Math.abs(Math.floor(Math.log10(p)));
  }

  fmt(price, pair) {
    return Number(price).toFixed(this.decimals(pair));
  }

  calcATR(candles, period = 14) {
    if (candles.length < period + 1) return 0;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const prev = candles[i - 1];
      const c = candles[i];
      const tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
      sum += tr;
    }
    return sum / period;
  }

  findSwings(candles, left = 3, right = 3) {
    const highs = [], lows = [];
    for (let i = left; i < candles.length - right; i++) {
      let isHigh = true, isLow = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (candles[j].high >= candles[i].high) isHigh = false;
        if (candles[j].low <= candles[i].low) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time });
    }
    return { highs, lows };
  }

  findFVG(candles) {
    const fvgs = [];
    const atr = this.calcATR(candles);
    const minGap = atr * 0.1;
    for (let i = 2; i < candles.length; i++) {
      const prev = candles[i-2], mid = candles[i-1], curr = candles[i];
      if (curr.low > prev.high && (curr.low - prev.high) > minGap) {
        fvgs.push({ type: 'bullish', top: curr.low, bottom: prev.high, index: i, time: curr.time, midCandle: mid });
      }
      if (curr.high < prev.low && (prev.low - curr.high) > minGap) {
        fvgs.push({ type: 'bearish', top: prev.low, bottom: curr.high, index: i, time: curr.time, midCandle: mid });
      }
    }
    return fvgs;
  }

  findOrderBlocks(candles) {
    const obs = [];
    const atr = this.calcATR(candles);
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
      const moveSize = Math.abs(c3.close - c1.close);
      if (moveSize > atr * 0.8) {
        if (c3.close > c1.close && c2.close < c2.open) {
          obs.push({ type: 'bullish', high: c2.high, low: c2.low, index: i-1, time: c2.time });
        }
        if (c3.close < c1.close && c2.close > c2.open) {
          obs.push({ type: 'bearish', high: c2.high, low: c2.low, index: i-1, time: c2.time });
        }
      }
    }
    return obs;
  }

  findLiquidityZones(candles, swings) {
    const zones = [];
    swings.highs.slice(-5).forEach(sh => {
      zones.push({ type: 'sell-side', price: sh.price, index: sh.index, time: sh.time });
    });
    swings.lows.slice(-5).forEach(sl => {
      zones.push({ type: 'buy-side', price: sl.price, index: sl.index, time: sl.time });
    });
    return zones;
  }

  determineMarketStructure(swings) {
    const { highs, lows } = swings;
    if (highs.length < 2 || lows.length < 2) return 'ranging';
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);
    let hhCount = 0, llCount = 0, lhCount = 0, hlCount = 0;
    for (let i = 1; i < recentHighs.length; i++) {
      if (recentHighs[i].price > recentHighs[i-1].price) hhCount++;
      else lhCount++;
    }
    for (let i = 1; i < recentLows.length; i++) {
      if (recentLows[i].price > recentLows[i-1].price) hlCount++;
      else llCount++;
    }
    if (hhCount >= 1 && hlCount >= 1) return 'bullish';
    if (llCount >= 1 && lhCount >= 1) return 'bearish';
    return 'ranging';
  }

  generateSignal(pair, candles) {
    if (candles.length < 20) {
      return { pair, signal: 'NO SIGNAL', currentPrice: '--', structure: 'insufficient data', reason: 'Not enough price data', timestamp: new Date().toISOString() };
    }
    const current = candles[candles.length - 1];
    const price = current.close;
    const atr = this.calcATR(candles);
    const swings = this.findSwings(candles);
    const fvgs = this.findFVG(candles);
    const obs = this.findOrderBlocks(candles);
    const liqZones = this.findLiquidityZones(candles, swings);
    const structure = this.determineMarketStructure(swings);
    
    const recentFVG = fvgs.slice(-5);
    const recentOB = obs.slice(-5);
    const bullishFVG = recentFVG.filter(f => f.type === 'bullish');
    const bearishFVG = recentFVG.filter(f => f.type === 'bearish');
    const bullishOB = recentOB.filter(o => o.type === 'bullish');
    const bearishOB = recentOB.filter(o => o.type === 'bearish');

    let signal = null, entry = null, sl = null, tp = null;
    let reason = [], score = 0;

    // BULLISH CONDITIONS
    if (structure === 'bullish' || (bullishFVG.length > 0 && bullishOB.length > 0)) {
      const ob = bullishOB[bullishOB.length - 1];
      const fvg = bullishFVG[bullishFVG.length - 1];
      
      if (structure === 'bullish') { score += 30; reason.push('Bullish market structure'); }
      if (ob) { score += 25; reason.push('Bullish order block'); entry = ob.low; }
      if (fvg) { score += 20; reason.push('Bullish FVG'); if (!entry) entry = fvg.bottom; }
      
      if (score >= 40) {
        signal = 'BUY';
        entry = entry || price;
        sl = entry - (atr * 2);
        tp = entry + (atr * 4);
      }
    }

    // BEARISH CONDITIONS
    if (!signal && (structure === 'bearish' || (bearishFVG.length > 0 && bearishOB.length > 0))) {
      const ob = bearishOB[bearishOB.length - 1];
      const fvg = bearishFVG[bearishFVG.length - 1];
      
      if (structure === 'bearish') { score += 30; reason.push('Bearish market structure'); }
      if (ob) { score += 25; reason.push('Bearish order block'); entry = ob.high; }
      if (fvg) { score += 20; reason.push('Bearish FVG'); if (!entry) entry = fvg.top; }
      
      if (score >= 40) {
        signal = 'SELL';
        entry = entry || price;
        sl = entry + (atr * 2);
        tp = entry - (atr * 4);
      }
    }

    // LIQUIDITY SWEEP CHECK
    if (!signal && liqZones.length > 0) {
      const recentLow = swings.lows[swings.lows.length - 1];
      const recentHigh = swings.highs[swings.highs.length - 1];
      
      if (recentLow && price < recentLow.price && current.close > current.open) {
        signal = 'BUY';
        entry = price;
        sl = price - (atr * 2);
        tp = price + (atr * 4);
        reason = ['Liquidity sweep of lows', 'Bullish rejection'];
      } else if (recentHigh && price > recentHigh.price && current.close < current.open) {
        signal = 'SELL';
        entry = price;
        sl = price + (atr * 2);
        tp = price - (atr * 4);
        reason = ['Liquidity sweep of highs', 'Bearish rejection'];
      }
    }

    if (signal) {
      return {
        pair, signal,
        entry: this.fmt(entry, pair),
        sl: this.fmt(sl, pair),
        tp: this.fmt(tp, pair),
        currentPrice: this.fmt(price, pair),
        structure, reason: reason.join(', '),
        fvgCount: recentFVG.length, obCount: recentOB.length,
        timestamp: new Date().toISOString()
      };
    }

    return {
      pair, signal: 'NO SIGNAL',
      currentPrice: this.fmt(price, pair),
      structure,
      reason: 'No clear ICT setup found. Waiting for better confluence.',
      fvgCount: recentFVG.length, obCount: recentOB.length,
      timestamp: new Date().toISOString()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ICTAnalyzer;
}
