/**
 * Signal Generator - Creates trading signals based on ICT analysis
 * Produces: Signal Name, Entry Point, Take Profit, Stop Loss
 */

class SignalGenerator {
  constructor(analyzer) {
    this.analyzer = analyzer || new ICTAnalyzer();
    this.minConfluence = 40;
  }

  /**
   * Generate signals from ICT analysis results and current price
   */
  generateSignals(analysis, currentPrice, pair) {
    const signals = [];
    if (!analysis || analysis.confluenceScore < this.minConfluence) return signals;

    const pip = this.analyzer.pipValues[pair] || 0.0001;
    const spread = pip * 2;
    const { bias } = analysis.marketStructure;

    // 1. Order Block Signal
    const obSignal = this._orderBlockSignal(analysis, currentPrice, pair, pip, bias);
    if (obSignal) signals.push(obSignal);

    // 2. Fair Value Gap Signal
    const fvgSignal = this._fvgSignal(analysis, currentPrice, pair, pip, bias);
    if (fvgSignal) signals.push(fvgSignal);

    // 3. OTE Signal
    const oteSignal = this._oteSignal(analysis, currentPrice, pair, pip, bias);
    if (oteSignal) signals.push(oteSignal);

    // 4. Liquidity Sweep Signal
    const sweepSignal = this._sweepSignal(analysis, currentPrice, pair, pip, bias);
    if (sweepSignal) signals.push(sweepSignal);

    // 5. Confluence Signal (combines multiple factors)
    if (analysis.confluenceScore >= 70) {
      const confSignal = this._confluenceSignal(analysis, currentPrice, pair, pip, bias);
      if (confSignal) signals.push(confSignal);
    }

    return signals.map(s => ({
      ...s,
      pair,
      timestamp: new Date().toISOString(),
      confluenceScore: analysis.confluenceScore,
      killzone: analysis.killzones.map(k => k.name).join(', '),
      id: `${pair}-${s.ictMethod}-${Date.now()}`
    }));
  }

  _orderBlockSignal(analysis, price, pair, pip, bias) {
    const obs = analysis.orderBlocks;
    if (!obs || obs.length === 0) return null;

    // Find the closest unmitigated OB to current price
    let bestOB = null;
    let minDist = Infinity;

    for (const ob of obs) {
      if (bias === 'bullish' && ob.type === 'bullish_ob') {
        const dist = Math.abs(price - ob.high);
        if (dist < minDist && price >= ob.low && price <= ob.high * 1.002) {
          minDist = dist;
          bestOB = ob;
        }
      } else if (bias === 'bearish' && ob.type === 'bearish_ob') {
        const dist = Math.abs(price - ob.low);
        if (dist < minDist && price <= ob.high && price >= ob.low * 0.998) {
          minDist = dist;
          bestOB = ob;
        }
      }
    }

    // Also generate a pending order signal if OB is nearby
    if (!bestOB && obs.length > 0) {
      const lastOB = obs[obs.length - 1];
      const distToPip = Math.abs(price - (bias === 'bullish' ? lastOB.high : lastOB.low)) / pip;
      if (distToPip < 50) bestOB = lastOB;
      else return null;
    }

    if (!bestOB) return null;

    const direction = bias === 'bullish' ? 'BUY' : 'SELL';
    const entry = bias === 'bullish' ? bestOB.high : bestOB.low;
    const slDistance = Math.abs(bestOB.high - bestOB.low) + pip * 5;
    const sl = bias === 'bullish' ? entry - slDistance : entry + slDistance;
    const tp = bias === 'bullish' ? entry + slDistance * 3 : entry - slDistance * 3;

    return {
      name: `${pair} ${direction} - Order Block`,
      direction,
      entry: this._round(entry, pair),
      tp: this._round(tp, pair),
      sl: this._round(sl, pair),
      rr: '1:3',
      ictMethod: 'Order Block',
      confidence: Math.round(bestOB.strength * 100),
      description: `${bias === 'bullish' ? 'Bullish' : 'Bearish'} Order Block detected. Price ${price > entry ? 'approaching' : 'at'} the OB zone (${this._round(bestOB.low, pair)} - ${this._round(bestOB.high, pair)}).`
    };
  }

  _fvgSignal(analysis, price, pair, pip, bias) {
    const fvgs = analysis.fairValueGaps;
    if (!fvgs || fvgs.length === 0) return null;

    let bestFVG = null;
    let minDist = Infinity;

    for (const fvg of fvgs) {
      if (bias === 'bullish' && fvg.type === 'bullish_fvg') {
        const dist = Math.abs(price - fvg.midpoint);
        if (dist < minDist) { minDist = dist; bestFVG = fvg; }
      } else if (bias === 'bearish' && fvg.type === 'bearish_fvg') {
        const dist = Math.abs(price - fvg.midpoint);
        if (dist < minDist) { minDist = dist; bestFVG = fvg; }
      }
    }

    if (!bestFVG) {
      bestFVG = fvgs[fvgs.length - 1];
    }

    const direction = bestFVG.type === 'bullish_fvg' ? 'BUY' : 'SELL';
    const entry = bestFVG.midpoint;
    const gapSize = Math.abs(bestFVG.top - bestFVG.bottom);
    const sl = direction === 'BUY' ? bestFVG.bottom - pip * 5 : bestFVG.top + pip * 5;
    const slDist = Math.abs(entry - sl);
    const tp = direction === 'BUY' ? entry + slDist * 3 : entry - slDist * 3;

    return {
      name: `${pair} ${direction} - Fair Value Gap`,
      direction,
      entry: this._round(entry, pair),
      tp: this._round(tp, pair),
      sl: this._round(sl, pair),
      rr: '1:3',
      ictMethod: 'Fair Value Gap',
      confidence: 70,
      description: `${bestFVG.label} detected between ${this._round(bestFVG.bottom, pair)} and ${this._round(bestFVG.top, pair)}. Entry at FVG midpoint for optimal fill.`
    };
  }

  _oteSignal(analysis, price, pair, pip, bias) {
    const ote = analysis.ote;
    if (!ote) return null;

    const direction = bias === 'bullish' ? 'BUY' : 'SELL';
    const entry = ote.fib705;

    let sl, tp;
    if (direction === 'BUY') {
      sl = ote.swingLow - pip * 5;
      tp = ote.swingHigh + (ote.swingHigh - entry) * 0.5;
    } else {
      sl = ote.swingHigh + pip * 5;
      tp = ote.swingLow - (entry - ote.swingLow) * 0.5;
    }

    const slDist = Math.abs(entry - sl);
    const tpDist = Math.abs(tp - entry);
    const rr = (tpDist / slDist).toFixed(1);

    return {
      name: `${pair} ${direction} - OTE Retracement`,
      direction,
      entry: this._round(entry, pair),
      tp: this._round(tp, pair),
      sl: this._round(sl, pair),
      rr: `1:${rr}`,
      ictMethod: 'Optimal Trade Entry',
      confidence: 75,
      description: `OTE zone (Fib 0.62-0.79) identified. Entry at 0.705 level (${this._round(entry, pair)}). Swing range: ${this._round(ote.swingLow, pair)} to ${this._round(ote.swingHigh, pair)}.`
    };
  }

  _sweepSignal(analysis, price, pair, pip, bias) {
    const sweeps = analysis.liquiditySweeps;
    if (!sweeps || sweeps.length === 0) return null;

    const lastSweep = sweeps[sweeps.length - 1];
    const direction = lastSweep.type === 'sellside_sweep' ? 'BUY' : 'SELL';
    const entry = lastSweep.level;

    const slDist = Math.abs(lastSweep.wick - lastSweep.level) + pip * 5;
    const sl = direction === 'BUY' ? entry - slDist : entry + slDist;
    const tp = direction === 'BUY' ? entry + slDist * 3 : entry - slDist * 3;

    return {
      name: `${pair} ${direction} - Liquidity Sweep`,
      direction,
      entry: this._round(entry, pair),
      tp: this._round(tp, pair),
      sl: this._round(sl, pair),
      rr: '1:3',
      ictMethod: 'Liquidity Sweep',
      confidence: 80,
      description: `${lastSweep.label} detected at ${this._round(lastSweep.level, pair)}. Wick to ${this._round(lastSweep.wick, pair)} suggests smart money reversal.`
    };
  }

  _confluenceSignal(analysis, price, pair, pip, bias) {
    const direction = bias === 'bullish' ? 'BUY' : 'SELL';
    let entry = price;
    let slPips, description;
    const methods = [];

    // Combine best levels from multiple ICT concepts
    if (analysis.ote) {
      entry = analysis.ote.fib705;
      methods.push('OTE');
    }

    if (analysis.orderBlocks.length > 0) {
      const ob = analysis.orderBlocks[analysis.orderBlocks.length - 1];
      if (bias === 'bullish' && ob.type === 'bullish_ob') {
        entry = (entry + ob.high) / 2;
      } else if (bias === 'bearish' && ob.type === 'bearish_ob') {
        entry = (entry + ob.low) / 2;
      }
      methods.push('OB');
    }

    if (analysis.fairValueGaps.length > 0) {
      methods.push('FVG');
    }

    if (analysis.liquiditySweeps.length > 0) {
      methods.push('Liq. Sweep');
    }

    if (analysis.marketStructure.bos) methods.push('BOS');
    if (analysis.marketStructure.choch) methods.push('ChoCH');

    slPips = pair.includes('JPY') || pair === 'XAU/USD' ? 30 : 25;
    const slDist = slPips * pip;
    const sl = direction === 'BUY' ? entry - slDist : entry + slDist;
    const tp = direction === 'BUY' ? entry + slDist * 4 : entry - slDist * 4;

    return {
      name: `${pair} ${direction} - ICT Confluence`,
      direction,
      entry: this._round(entry, pair),
      tp: this._round(tp, pair),
      sl: this._round(sl, pair),
      rr: '1:4',
      ictMethod: 'Multi-Confluence',
      confidence: analysis.confluenceScore,
      description: `High confluence signal combining: ${methods.join(' + ')}. Market bias: ${bias}. Score: ${analysis.confluenceScore}/100.`
    };
  }

  _round(value, pair) {
    if (pair.includes('JPY') || pair === 'XAU/USD') {
      return Math.round(value * 1000) / 1000;
    }
    return Math.round(value * 100000) / 100000;
  }
}

if (typeof module !== 'undefined') module.exports = SignalGenerator;
