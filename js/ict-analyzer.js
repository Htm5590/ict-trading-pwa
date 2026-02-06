/**
 * ICT (Inner Circle Trader) Methodology Analyzer
 * Supports: Forex, Gold (XAU/USD), Crypto
 * Real-time price analysis with ICT concepts
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

  // Find swing highs and lows
  findSwings(candles, left = 5, right = 5) {
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

  // Identify Fair Value Gaps (FVG)
  findFVG(candles) {
    const fvgs = [];
    for (let i = 2; i < candles.length; i++) {
      const prev = candles[i-2], curr = candles[i];
      // Bullish FVG: gap between prev high and curr low
      if (curr.low > prev.high) {
        fvgs.push({
          type: 'bullish',
          top: curr.low,
          bottom: prev.high,
          index: i,
          time: candles[i].time
        });
      }
      // Bearish FVG: gap between prev low and curr high
      if (curr.high < prev.low) {
        fvgs.push({
          type: 'bearish',
          top: prev.low,
          bottom: curr.high,
          index: i,
          time: candles[i].time
        });
      }
    }
    return fvgs;
  }

  // Order Blocks - last opposing candle before strong move
  findOrderBlocks(candles) {
    const obs = [];
    for (let i = 3; i < candles.length; i++) {
      const c1 = candles[i-3], c2 = candles[i-2], c3 = candles[i-1], c4 = candles[i];
      const bullishMove = c4.close > c2.close && (c4.close - c2.close) > (c2.high - c2.low) * 2;
      const bearishMove = c4.close < c2.close && (c2.close - c4.close) > (c2.high - c2.low) * 2;
      
      if (bullishMove && c3.close < c3.open) {
        obs.push({
          type: 'bullish',
          high: c3.high,
          low: c3.low,
          index: i-1,
          time: c3.time
        });
      }
      if (bearishMove && c3.close > c3.open) {
        obs.push({
          type: 'bearish',
          high: c3.high,
          low: c3.low,
          index: i-1,
          time: c3.time
        });
      }
    }
    return obs;
  }

  // Liquidity zones (areas where stops accumulate)
  findLiquidityZones(candles, swings) {
    const zones = [];
    // Swing highs = sell-side liquidity
    swings.highs.slice(-5).forEach(sh => {
      zones.push({
        type: 'sell-side',
        price: sh.price,
        index: sh.index,
        time: sh.time
      });
    });
    // Swing lows = buy-side liquidity
    swings.lows.slice(-5).forEach(sl => {
      zones.push({
        type: 'buy-side',
        price: sl.price,
        index: sl.index,
        time: sl.time
      });
    });
    return zones;
  }

  // Market structure: higher highs, higher lows (bullish) or lower highs, lower lows (bearish)
  determineMarketStructure(swings) {
    const { highs, lows } = swings;
    if (highs.length < 2 || lows.length < 2) return 'ranging';
    
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);
    
    let highsRising = true, lowsRising = true;
    let highsFalling = true, lowsFalling = true;
    
    for (let i = 1; i < recentHighs.length; i++) {
      if (recentHighs[i].price <= recentHighs[i-1].price) highsRising = false;
      if (recentHighs[i].price >= recentHighs[i-1].price) highsFalling = false;
    }
    for (let i = 1; i < recentLows.length; i++) {
      if (recentLows[i].price <= recentLows[i-1].price) lowsRising = false;
      if (recentLows[i].price >= recentLows[i-1].price) lowsFalling = false;
    }
    
    if (highsRising && lowsRising) return 'bullish';
    if (highsFalling && lowsFalling) return 'bearish';
    return 'ranging';
  }

  // Generate trading signals based on ICT concepts
  generateSignal(pair, candles) {
    if (candles.length < 20) {
      return { error: 'Not enough data' };
    }

    const current = candles[candles.length - 1];
    const swings = this.findSwings(candles);
    const fvgs = this.findFVG(candles);
    const obs = this.findOrderBlocks(candles);
    const liqZones = this.findLiquidityZones(candles, swings);
    const structure = this.determineMarketStructure(swings);

    // Recent FVGs and OBs
    const recentFVG = fvgs.slice(-3);
    const recentOB = obs.slice(-3);

    let signal = null;
    let entry = null, sl = null, tp = null;
    let reason = [];

    // BULLISH SETUP
    if (structure === 'bullish' && recentFVG.some(f => f.type === 'bullish') && recentOB.some(o => o.type === 'bullish')) {
      const bullishOB = recentOB.filter(o => o.type === 'bullish').pop();
      const bullishFVG = recentFVG.filter(f => f.type === 'bullish').pop();
      
      // Entry: at the OB low or FVG bottom
      entry = Math.min(bullishOB.low, bullishFVG.bottom);
      // Stop loss: below OB
      sl = bullishOB.low - (50 * this.pip(pair));
      // Take profit: recent swing high or 2:1 RR
      const rr = entry - sl;
      tp = entry + (rr * 2);
      
      signal = 'BUY';
      reason.push('Bullish market structure');
      reason.push('Bullish order block identified');
      reason.push('Bullish FVG present');
    }
    
    // BEARISH SETUP
    else if (structure === 'bearish' && recentFVG.some(f => f.type === 'bearish') && recentOB.some(o => o.type === 'bearish')) {
      const bearishOB = recentOB.filter(o => o.type === 'bearish').pop();
      const bearishFVG = recentFVG.filter(f => f.type === 'bearish').pop();
      
      // Entry: at the OB high or FVG top
      entry = Math.max(bearishOB.high, bearishFVG.top);
      // Stop loss: above OB
      sl = bearishOB.high + (50 * this.pip(pair));
      // Take profit: recent swing low or 2:1 RR
      const rr = sl - entry;
      tp = entry - (rr * 2);
      
      signal = 'SELL';
      reason.push('Bearish market structure');
      reason.push('Bearish order block identified');
      reason.push('Bearish FVG present');
    }

    if (signal) {
      return {
        pair: pair,
        signal: signal,
        entry: this.fmt(entry, pair),
        sl: this.fmt(sl, pair),
        tp: this.fmt(tp, pair),
        currentPrice: this.fmt(current.close, pair),
        structure: structure,
        reason: reason.join(', '),
        fvgCount: recentFVG.length,
        obCount: recentOB.length,
        timestamp: new Date().toISOString()
      };
    }

    return {
      pair: pair,
      signal: 'NO SIGNAL',
      currentPrice: this.fmt(current.close, pair),
      structure: structure,
      reason: 'No clear setup matching ICT criteria',
      timestamp: new Date().toISOString()
    };
  }

  // Analyze multiple timeframes
  analyzeMultiTimeframe(pair, data) {
    const results = {};
    for (const [tf, candles] of Object.entries(data)) {
      results[tf] = this.generateSignal(pair, candles);
    }
    return results;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ICTAnalyzer;
}
