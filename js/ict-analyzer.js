/**
 * ICT (Inner Circle Trader) Methodology Analyzer
 * Supports: Forex, Gold (XAU/USD), Crypto
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
  fmt(price, pair) { return Number(price).toFixed(this.decimals(pair)); }

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

  marketStructure(candles) {
    const { highs, lows } = this.findSwings(candles, 3, 3);
    if (highs.length < 2 || lows.length < 2) return { trend: 'neutral', bos: null, choch: null };
    const lastH = highs.slice(-2);
    const lastL = lows.slice(-2);
    let trend = 'neutral', bos = null, choch = null;
    if (lastH[1].price > lastH[0].price && lastL[1].price > lastL[0].price) trend = 'bullish';
    else if (lastH[1].price < lastH[0].price && lastL[1].price < lastL[0].price) trend = 'bearish';
    const last = candles[candles.length - 1];
    if (trend === 'bullish' && last.close > lastH[0].price) bos = { type: 'bullish', level: lastH[0].price };
    if (trend === 'bearish' && last.close < lastL[0].price) bos = { type: 'bearish', level: lastL[0].price };
    if (trend === 'bullish' && last.close < lastL[0].price) choch = { type: 'bearish', level: lastL[0].price };
    if (trend === 'bearish' && last.close > lastH[0].price) choch = { type: 'bullish', level: lastH[0].price };
    return { trend, bos, choch, swingHighs: highs, swingLows: lows };
  }

  findOrderBlocks(candles) {
    const obs = [];
    const avgRange = candles.reduce((s, c) => s + Math.abs(c.high - c.low), 0) / candles.length;
    for (let i = 1; i < candles.length - 1; i++) {
      const curr = candles[i + 1];
      const prev = candles[i];
      const body = Math.abs(curr.close - curr.open);
      const range = curr.high - curr.low;
      if (range > avgRange * 1.5 && body / range > 0.6) {
        if (curr.close > curr.open && prev.close < prev.open) {
          obs.push({ type: 'bullish', top: prev.open, bottom: prev.close, index: i, candle: prev });
        } else if (curr.close < curr.open && prev.close > prev.open) {
          obs.push({ type: 'bearish', top: prev.close, bottom: prev.open, index: i, candle: prev });
        }
      }
    }
    return obs;
  }

  findFVG(candles) {
    const gaps = [];
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2], c3 = candles[i];
      if (c3.low > c1.high) {
        gaps.push({ type: 'bullish', top: c3.low, bottom: c1.high, index: i });
      } else if (c3.high < c1.low) {
        gaps.push({ type: 'bearish', top: c1.low, bottom: c3.high, index: i });
      }
    }
    return gaps;
  }

  findLiquiditySweeps(candles) {
    const sweeps = [];
    const { highs, lows } = this.findSwings(candles, 3, 3);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    for (const sh of highs) {
      if (prev.high > sh.price && last.close < sh.price) {
        sweeps.push({ type: 'sell', level: sh.price, index: candles.length - 1 });
      }
    }
    for (const sl of lows) {
      if (prev.low < sl.price && last.close > sl.price) {
        sweeps.push({ type: 'buy', level: sl.price, index: candles.length - 1 });
      }
    }
    return sweeps;
  }

  isDisplacement(candle, avgRange) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return range > avgRange * 2 && body / range > 0.7;
  }

  findOTE(candles, trend) {
    const { highs, lows } = this.findSwings(candles, 3, 3);
    if (highs.length < 1 || lows.length < 1) return null;
    const lastHigh = highs[highs.length - 1].price;
    const lastLow = lows[lows.length - 1].price;
    const range = lastHigh - lastLow;
    const price = candles[candles.length - 1].close;
    if (trend === 'bullish') {
      const oteTop = lastHigh - range * 0.62;
      const oteBot = lastHigh - range * 0.79;
      const sweet = lastHigh - range * 0.705;
      if (price >= oteBot && price <= oteTop) return { entry: sweet, sl: lastLow, tp: lastHigh + range * 0.5, zone: [oteBot, oteTop] };
    } else if (trend === 'bearish') {
      const oteTop = lastLow + range * 0.79;
      const oteBot = lastLow + range * 0.62;
      const sweet = lastLow + range * 0.705;
      if (price >= oteBot && price <= oteTop) return { entry: sweet, sl: lastHigh, tp: lastLow - range * 0.5, zone: [oteBot, oteTop] };
    }
    return null;
  }

  getKillzone() {
    const h = new Date().getUTCHours();
    if (h >= 0 && h < 8) return 'Asian Session';
    if (h >= 7 && h < 10) return 'London Open';
    if (h >= 12 && h < 16) return 'New York Open';
    if (h >= 15 && h < 17) return 'London Close';
    return 'Off Session';
  }

  analyze(candles, pair) {
    const ms = this.marketStructure(candles);
    const obs = this.findOrderBlocks(candles);
    const fvg = this.findFVG(candles);
    const sweeps = this.findLiquiditySweeps(candles);
    const avgRange = candles.reduce((s, c) => s + (c.high - c.low), 0) / candles.length;
    const lastCandle = candles[candles.length - 1];
    const displacement = this.isDisplacement(lastCandle, avgRange);
    const ote = this.findOTE(candles, ms.trend);
    const killzone = this.getKillzone();
    return { ms, obs, fvg, sweeps, displacement, ote, killzone, avgRange, pair };
  }
}
