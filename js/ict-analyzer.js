/**
 * ICT (Inner Circle Trader) Methodology Analyzer
 * Fixed and corrected for accurate signal generation
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

  // Improved FVG detection - look for imbalances
  findFVG(candles) {
    const fvgs = [];
    for (let i = 2; i < candles.length; i++) {
      const prev = candles[i-2], mid = candles[i-1], curr = candles[i];
      
      // Bullish FVG: gap up (current low > previous high)
      const bullishGap = curr.low - prev.high;
      if (bullishGap > 0) {
        fvgs.push({ 
          type: 'bullish', 
          top: curr.low, 
          bottom: prev.high, 
          mid: (curr.low + prev.high) / 2,
          index: i, 
          time: curr.time 
        });
      }
      
      // Bearish FVG: gap down (current high < previous low)
      const bearishGap = prev.low - curr.high;
      if (bearishGap > 0) {
        fvgs.push({ 
          type: 'bearish', 
          top: prev.low, 
          bottom: curr.high,
          mid: (prev.low + curr.high) / 2,
          index: i, 
          time: curr.time 
        });
      }
    }
    return fvgs;
  }

  // Order Blocks: last opposing candle before strong move
  findOrderBlocks(candles) {
    const obs = [];
    const atr = this.calcATR(candles);
    
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i-2], c2 = candles[i-1], c3 = candles[i];
      const moveSize = Math.abs(c3.close - c1.close);
      
      // Bullish OB: bearish candle followed by strong bullish move
      if (moveSize > atr * 0.5 && c3.close > c1.close && c2.close < c2.open) {
        obs.push({ 
          type: 'bullish', 
          high: c2.high, 
          low: c2.low, 
          mid: (c2.high + c2.low) / 2,
          index: i-1, 
          time: c2.time 
        });
      }
      
      // Bearish OB: bullish candle followed by strong bearish move
      if (moveSize > atr * 0.5 && c3.close < c1.close && c2.close > c2.open) {
        obs.push({ 
          type: 'bearish', 
          high: c2.high, 
          low: c2.low,
          mid: (c2.high + c2.low) / 2,
          index: i-1, 
          time: c2.time 
        });
      }
    }
    return obs;
  }

  // Improved market structure determination
  determineMarketStructure(candles) {
    if (candles.length < 20) return 'ranging';
    
    const recent = candles.slice(-20);
    let higherHighs = 0, lowerLows = 0, lowerHighs = 0, higherLows = 0;
    
    for (let i = 5; i < recent.length; i += 5) {
      const prev = recent[i - 5];
      const curr = recent[i];
      
      if (curr.high > prev.high) higherHighs++;
      if (curr.low < prev.low) lowerLows++;
      if (curr.high < prev.high) lowerHighs++;
      if (curr.low > prev.low) higherLows++;
    }
    
    if (higherHighs >= 2 && higherLows >= 2) return 'bullish';
    if (lowerLows >= 2 && lowerHighs >= 2) return 'bearish';
    return 'ranging';
  }

  generateSignal(pair, candles) {
    if (candles.length < 20) {
      return { 
        pair, signal: 'NO SIGNAL', currentPrice: '--', 
        structure: 'insufficient data', 
        reason: 'Not enough price data', 
        timestamp: new Date().toISOString() 
      };
    }

    const current = candles[candles.length - 1];
    const price = current.close;
    const atr = this.calcATR(candles);
    const swings = this.findSwings(candles);
    const fvgs = this.findFVG(candles);
    const obs = this.findOrderBlocks(candles);
    const structure = this.determineMarketStructure(candles);
    
    // Get recent price action
    const recentCandles = candles.slice(-10);
    const priceChange = recentCandles[recentCandles.length-1].close - recentCandles[0].close;
    const momentum = priceChange > 0 ? 'bullish' : 'bearish';
    
    // Recent ICT elements
    const recentFVG = fvgs.slice(-10);
    const recentOB = obs.slice(-10);
    const bullishFVG = recentFVG.filter(f => f.type === 'bullish');
    const bearishFVG = recentFVG.filter(f => f.type === 'bearish');
    const bullishOB = recentOB.filter(o => o.type === 'bullish');
    const bearishOB = recentOB.filter(o => o.type === 'bearish');

    let signal = null, entry = null, sl = null, tp = null, reason = [];

    // BULLISH SIGNAL - need at least structure OR momentum + any ICT element
    if ((structure === 'bullish' || momentum === 'bullish') && 
        (bullishOB.length > 0 || bullishFVG.length > 0)) {
      
      signal = 'BUY';
      
      // Entry: use most recent OB or FVG level
      if (bullishOB.length > 0) {
        const ob = bullishOB[bullishOB.length - 1];
        entry = ob.mid;
        reason.push('Bullish Order Block at ' + this.fmt(entry, pair));
      } else if (bullishFVG.length > 0) {
        const fvg = bullishFVG[bullishFVG.length - 1];
        entry = fvg.mid;
        reason.push('Bullish Fair Value Gap at ' + this.fmt(entry, pair));
      }
      
      if (!entry) entry = price;
      
      // Stop Loss: below entry with 1.5x ATR buffer
      sl = entry - (atr * 1.5);
      
      // Take Profit: 3:1 risk/reward
      const risk = entry - sl;
      tp = entry + (risk * 3);
      
      if (structure === 'bullish') reason.push('Bullish market structure');
      if (momentum === 'bullish') reason.push('Bullish momentum');
    }

    // BEARISH SIGNAL
    else if ((structure === 'bearish' || momentum === 'bearish') && 
             (bearishOB.length > 0 || bearishFVG.length > 0)) {
      
      signal = 'SELL';
      
      // Entry: use most recent OB or FVG level
      if (bearishOB.length > 0) {
        const ob = bearishOB[bearishOB.length - 1];
        entry = ob.mid;
        reason.push('Bearish Order Block at ' + this.fmt(entry, pair));
      } else if (bearishFVG.length > 0) {
        const fvg = bearishFVG[bearishFVG.length - 1];
        entry = fvg.mid;
        reason.push('Bearish Fair Value Gap at ' + this.fmt(entry, pair));
      }
      
      if (!entry) entry = price;
      
      // Stop Loss: above entry with 1.5x ATR buffer
      sl = entry + (atr * 1.5);
      
      // Take Profit: 3:1 risk/reward
      const risk = sl - entry;
      tp = entry - (risk * 3);
      
      if (structure === 'bearish') reason.push('Bearish market structure');
      if (momentum === 'bearish') reason.push('Bearish momentum');
    }

    // Return signal if found
    if (signal) {
      return {
        pair, signal,
        entry: this.fmt(entry, pair),
        sl: this.fmt(sl, pair),
        tp: this.fmt(tp, pair),
        currentPrice: this.fmt(price, pair),
        structure,
        reason: reason.join(', '),
        fvgCount: recentFVG.length,
        obCount: recentOB.length,
        riskReward: '1:3',
        timestamp: new Date().toISOString()
      };
    }

    // No signal
    return {
      pair, signal: 'NO SIGNAL',
      currentPrice: this.fmt(price, pair),
      structure,
      reason: 'Waiting for clear ICT setup with proper momentum',
      fvgCount: recentFVG.length,
      obCount: recentOB.length,
      timestamp: new Date().toISOString()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ICTAnalyzer;
}
