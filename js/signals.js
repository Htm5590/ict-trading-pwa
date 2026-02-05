/**
 * Signal Generator - Creates trading signals from ICT analysis
 * Produces: Signal Name, Entry Point, Take Profit, Stop Loss
 */
class SignalGenerator {
  constructor(analyzer) {
    this.ict = analyzer || new ICTAnalyzer();
    this.minConfluence = 40;
  }

  generate(analysis, price, pair) {
    const signals = [];
    const { ms, obs, fvg, sweeps, displacement, ote, killzone } = analysis;
    const fmt = (v) => this.ict.fmt(v, pair);
    const pip = this.ict.pip(pair);
    const isActive = killzone !== 'Off Session';

    // 1. OTE Signal (highest priority ICT setup)
    if (ote && ms.trend !== 'neutral') {
      const dir = ms.trend === 'bullish' ? 'BUY' : 'SELL';
      let score = 60;
      if (displacement) score += 15;
      if (isActive) score += 10;
      if (obs.length > 0) score += 10;
      if (fvg.length > 0) score += 5;
      const rr = Math.abs(ote.tp - ote.entry) / Math.abs(ote.entry - ote.sl);
      if (score >= this.minConfluence) {
        signals.push({
          name: pair + ' ' + dir + ' - OTE Setup',
          direction: dir,
          entry: fmt(ote.entry),
          tp: fmt(ote.tp),
          sl: fmt(ote.sl),
          rr: '1:' + rr.toFixed(1),
          method: 'Optimal Trade Entry (Fib 0.705)',
          score: Math.min(score, 100),
          killzone
        });
      }
    }

    // 2. Order Block Signal
    if (obs.length > 0 && ms.trend !== 'neutral') {
      const lastOB = obs[obs.length - 1];
      const aligned = (ms.trend === 'bullish' && lastOB.type === 'bullish') ||
                       (ms.trend === 'bearish' && lastOB.type === 'bearish');
      if (aligned) {
        const dir = lastOB.type === 'bullish' ? 'BUY' : 'SELL';
        const mid = (lastOB.top + lastOB.bottom) / 2;
        const obRange = lastOB.top - lastOB.bottom;
        let entry, sl, tp;
        if (dir === 'BUY') {
          entry = mid;
          sl = lastOB.bottom - obRange * 0.5;
          tp = mid + (mid - sl) * 3;
        } else {
          entry = mid;
          sl = lastOB.top + obRange * 0.5;
          tp = mid - (sl - mid) * 3;
        }
        let score = 50;
        if (displacement) score += 15;
        if (ms.bos) score += 10;
        if (isActive) score += 10;
        if (fvg.length > 0) score += 5;
        const rr = Math.abs(tp - entry) / Math.abs(entry - sl);
        if (score >= this.minConfluence) {
          signals.push({
            name: pair + ' ' + dir + ' - Order Block',
            direction: dir,
            entry: fmt(entry),
            tp: fmt(tp),
            sl: fmt(sl),
            rr: '1:' + rr.toFixed(1),
            method: 'Order Block + Market Structure',
            score: Math.min(score, 100),
            killzone
          });
        }
      }
    }

    // 3. FVG Signal
    if (fvg.length > 0 && ms.trend !== 'neutral') {
      const lastGap = fvg[fvg.length - 1];
      const aligned = (ms.trend === 'bullish' && lastGap.type === 'bullish') ||
                       (ms.trend === 'bearish' && lastGap.type === 'bearish');
      if (aligned) {
        const dir = lastGap.type === 'bullish' ? 'BUY' : 'SELL';
        const mid = (lastGap.top + lastGap.bottom) / 2;
        const gapSize = lastGap.top - lastGap.bottom;
        let entry, sl, tp;
        if (dir === 'BUY') {
          entry = mid;
          sl = lastGap.bottom - gapSize * 2;
          tp = mid + (mid - sl) * 3;
        } else {
          entry = mid;
          sl = lastGap.top + gapSize * 2;
          tp = mid - (sl - mid) * 3;
        }
        let score = 45;
        if (displacement) score += 15;
        if (isActive) score += 10;
        if (ms.bos) score += 10;
        const rr = Math.abs(tp - entry) / Math.abs(entry - sl);
        if (score >= this.minConfluence) {
          signals.push({
            name: pair + ' ' + dir + ' - Fair Value Gap',
            direction: dir,
            entry: fmt(entry),
            tp: fmt(tp),
            sl: fmt(sl),
            rr: '1:' + rr.toFixed(1),
            method: 'FVG + Trend Alignment',
            score: Math.min(score, 100),
            killzone
          });
        }
      }
    }

    // 4. Liquidity Sweep Signal
    if (sweeps.length > 0) {
      const sweep = sweeps[sweeps.length - 1];
      const dir = sweep.type === 'buy' ? 'BUY' : 'SELL';
      const avgR = analysis.avgRange;
      let entry, sl, tp;
      if (dir === 'BUY') {
        entry = price;
        sl = sweep.level - avgR * 2;
        tp = price + (price - sl) * 3;
      } else {
        entry = price;
        sl = sweep.level + avgR * 2;
        tp = price - (sl - price) * 3;
      }
      let score = 55;
      if (displacement) score += 15;
      if (isActive) score += 10;
      if (ms.bos || ms.choch) score += 10;
      const rr = Math.abs(tp - entry) / Math.abs(entry - sl);
      if (score >= this.minConfluence) {
        signals.push({
          name: pair + ' ' + dir + ' - Liquidity Sweep',
          direction: dir,
          entry: fmt(entry),
          tp: fmt(tp),
          sl: fmt(sl),
          rr: '1:' + rr.toFixed(1),
          method: 'Liquidity Grab + Reversal',
          score: Math.min(score, 100),
          killzone
        });
      }
    }

    // Sort by score descending, return best signals
    signals.sort((a, b) => b.score - a.score);
    return signals.slice(0, 3);
  }
}
