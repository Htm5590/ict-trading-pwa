// ICT Trading Analyzer - Proper ICT Methodology
// Implements: Market Structure (BOS/ChoCH), Order Blocks, FVG, Premium/Discount, OTE, Liquidity

class ICTAnalyzer {
  constructor() {
    this.swingLen = 5;
  }

  // ===== CANDLE DATA FETCHING =====
  async fetchCandles(pair, type) {
    try {
      if (type === 'crypto') {
        return await this.fetchBinanceCandles(pair);
      } else {
        return this.generateSimulatedCandles(pair);
      }
    } catch (e) {
      console.error('Candle fetch error:', e);
      return this.generateSimulatedCandles(pair);
    }
  }

  async fetchBinanceCandles(pair) {
    const symbol = pair.replace('/', '').toUpperCase();
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1h&limit=100`;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        const url2 = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`;
        const r2 = await fetch(url2);
        if (!r2.ok) return this.generateSimulatedCandles(pair);
        const d2 = await r2.json();
        return d2.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
      }
      const d = await r.json();
      return d.map(k => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    } catch {
      return this.generateSimulatedCandles(pair);
    }
  }

  generateSimulatedCandles(pair) {
    const candles = [];
    let price = pair.includes('JPY') ? 150 : pair.includes('GBP') ? 1.27 : pair.includes('EUR') ? 1.08 : pair.includes('BTC') ? 67000 : pair.includes('ETH') ? 3500 : pair.includes('US30') ? 39000 : pair.includes('NAS') ? 17500 : pair.includes('SPX') ? 5100 : 1.0;
    const vol = price * 0.003;
    for (let i = 0; i < 100; i++) {
      const o = price + (Math.random() - 0.5) * vol;
      const c = o + (Math.random() - 0.5) * vol;
      const h = Math.max(o, c) + Math.random() * vol * 0.5;
      const l = Math.min(o, c) - Math.random() * vol * 0.5;
      candles.push({ time: Date.now() - (100 - i) * 3600000, open: o, high: h, low: l, close: c, volume: Math.random() * 1000 });
      price = c;
    }
    return candles;
  }

  // ===== SWING POINT DETECTION =====
  findSwings(candles) {
    const highs = [];
    const lows = [];
    const len = this.swingLen;
    for (let i = len; i < candles.length - len; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = 1; j <= len; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high, time: candles[i].time });
      if (isLow) lows.push({ index: i, price: candles[i].low, time: candles[i].time });
    }
    return { highs, lows };
  }

  // ===== RSI CALCULATION =====
  calcRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff > 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - diff) / period;
      }
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // ===== KILLZONE DETECTION =====
  getKillzone() {
    const now = new Date();
    const utcH = now.getUTCHours();
    if (utcH >= 0 && utcH < 5) return { name: 'Asian', active: true };
    if (utcH >= 7 && utcH < 10) return { name: 'London', active: true };
    if (utcH >= 12 && utcH < 15) return { name: 'New York AM', active: true };
    if (utcH >= 15 && utcH < 17) return { name: 'New York PM', active: true };
    return { name: 'Off-Session', active: false };
  }

  // ===== MARKET STRUCTURE - BOS & ChoCH =====
  detectStructure(candles, swings) {
    const { highs, lows } = swings;
    let trend = 'neutral';
    let bos = null;
    let choch = null;
    const lastPrice = candles[candles.length - 1].close;

    // Need at least 2 swing highs and 2 swing lows
    if (highs.length < 2 || lows.length < 2) return { trend, bos, choch };

    const lastSH = highs[highs.length - 1];
    const prevSH = highs[highs.length - 2];
    const lastSL = lows[lows.length - 1];
    const prevSL = lows[lows.length - 2];

    // Bullish structure: Higher Highs and Higher Lows
    const hh = lastSH.price > prevSH.price;
    const hl = lastSL.price > prevSL.price;
    // Bearish structure: Lower Highs and Lower Lows
    const lh = lastSH.price < prevSH.price;
    const ll = lastSL.price < prevSL.price;

    if (hh && hl) trend = 'bullish';
    else if (lh && ll) trend = 'bearish';

    // BOS: price breaks past the last swing in trend direction
    if (trend === 'bullish' && lastPrice > lastSH.price) {
      bos = { type: 'bullish', level: lastSH.price };
    } else if (trend === 'bearish' && lastPrice < lastSL.price) {
      bos = { type: 'bearish', level: lastSL.price };
    }

    // ChoCH: Change of Character - price breaks against the trend
    if (trend === 'bullish' && lastPrice < lastSL.price) {
      choch = { type: 'bearish_choch', level: lastSL.price };
    } else if (trend === 'bearish' && lastPrice > lastSH.price) {
      choch = { type: 'bullish_choch', level: lastSH.price };
    }

    return { trend, bos, choch };
  }

  // ===== FAIR VALUE GAP (FVG) - 3 Candle Pattern =====
  findFVGs(candles) {
    const bullishFVGs = [];
    const bearishFVGs = [];
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];
      // Bullish FVG: candle 3 low > candle 1 high (gap up)
      if (c3.low > c1.high) {
        bullishFVGs.push({ top: c3.low, bottom: c1.high, index: i, midpoint: (c3.low + c1.high) / 2 });
      }
      // Bearish FVG: candle 1 low > candle 3 high (gap down)
      if (c1.low > c3.high) {
        bearishFVGs.push({ top: c1.low, bottom: c3.high, index: i, midpoint: (c1.low + c3.high) / 2 });
      }
    }
    return { bullish: bullishFVGs, bearish: bearishFVGs };
  }

  // ===== ORDER BLOCKS =====
  findOrderBlocks(candles) {
    const bullishOBs = [];
    const bearishOBs = [];
    for (let i = 1; i < candles.length - 2; i++) {
      const c = candles[i];
      const next = candles[i + 1];
      const bodySize = Math.abs(c.close - c.open);
      const nextBodySize = Math.abs(next.close - next.open);
      const avgBody = bodySize > 0 ? bodySize : 0.0001;

      // Bullish OB: bearish candle followed by strong bullish displacement
      if (c.close < c.open && next.close > next.open && nextBodySize > avgBody * 1.5) {
        // Check displacement: next candle closes above current candle high
        if (next.close > c.high) {
          bullishOBs.push({ high: c.open, low: c.low, index: i, midpoint: (c.open + c.low) / 2 });
        }
      }
      // Bearish OB: bullish candle followed by strong bearish displacement
      if (c.close > c.open && next.close < next.open && nextBodySize > avgBody * 1.5) {
        if (next.close < c.low) {
          bearishOBs.push({ high: c.high, low: c.open, index: i, midpoint: (c.high + c.open) / 2 });
        }
      }
    }
    return { bullish: bullishOBs, bearish: bearishOBs };
  }

  // ===== PREMIUM/DISCOUNT ZONES =====
  getPremiumDiscount(candles, swings) {
    const { highs, lows } = swings;
    if (highs.length === 0 || lows.length === 0) return { zone: 'equilibrium', eqLevel: candles[candles.length - 1].close };
    // Use the most recent swing range
    const recentHigh = Math.max(...highs.slice(-3).map(h => h.price));
    const recentLow = Math.min(...lows.slice(-3).map(l => l.price));
    const range = recentHigh - recentLow;
    const eq = recentLow + range * 0.5;
    const lastPrice = candles[candles.length - 1].close;
    let zone;
    if (lastPrice > eq + range * 0.1) zone = 'premium';
    else if (lastPrice < eq - range * 0.1) zone = 'discount';
    else zone = 'equilibrium';
    return { zone, eqLevel: eq, high: recentHigh, low: recentLow };
  }

  // ===== OPTIMAL TRADE ENTRY (OTE) - Fib 0.618-0.786 =====
  findOTE(candles, swings, trend) {
    const { highs, lows } = swings;
    if (highs.length === 0 || lows.length === 0) return null;
    const lastPrice = candles[candles.length - 1].close;
    let ote = null;

    if (trend === 'bullish' && lows.length >= 1 && highs.length >= 1) {
      const swingLow = lows[lows.length - 1].price;
      const swingHigh = highs[highs.length - 1].price;
      if (swingHigh > swingLow) {
        const range = swingHigh - swingLow;
        const fib618 = swingHigh - range * 0.618;
        const fib786 = swingHigh - range * 0.786;
        const inOTE = lastPrice >= fib786 && lastPrice <= fib618;
        ote = { fib618, fib786, inOTE, direction: 'long' };
      }
    } else if (trend === 'bearish' && highs.length >= 1 && lows.length >= 1) {
      const swingHigh = highs[highs.length - 1].price;
      const swingLow = lows[lows.length - 1].price;
      if (swingHigh > swingLow) {
        const range = swingHigh - swingLow;
        const fib618 = swingLow + range * 0.618;
        const fib786 = swingLow + range * 0.786;
        const inOTE = lastPrice >= fib618 && lastPrice <= fib786;
        ote = { fib618, fib786, inOTE, direction: 'short' };
      }
    }
    return ote;
  }

  // ===== LIQUIDITY DETECTION =====
  findLiquidity(candles, swings) {
    const { highs, lows } = swings;
    const lastPrice = candles[candles.length - 1].close;
    const buyLiquidity = []; // Above equal highs
    const sellLiquidity = []; // Below equal lows

    // Find equal highs (buy-side liquidity)
    for (let i = 0; i < highs.length - 1; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        const diff = Math.abs(highs[i].price - highs[j].price);
        const avg = (highs[i].price + highs[j].price) / 2;
        if (diff / avg < 0.002) { // Within 0.2%
          buyLiquidity.push({ level: avg, type: 'equal_highs' });
        }
      }
    }

    // Find equal lows (sell-side liquidity)
    for (let i = 0; i < lows.length - 1; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        const diff = Math.abs(lows[i].price - lows[j].price);
        const avg = (lows[i].price + lows[j].price) / 2;
        if (diff / avg < 0.002) {
          sellLiquidity.push({ level: avg, type: 'equal_lows' });
        }
      }
    }

    return { buyLiquidity, sellLiquidity };
  }

  // ===== MAIN ANALYSIS - CONFLUENCE SCORING =====
  async analyze(pair, type = 'forex') {
    try {
      const candles = await this.fetchCandles(pair, type);
      if (!candles || candles.length < 20) {
        return { signal: 'NEUTRAL', confidence: 0, reason: 'Insufficient data' };
      }

      const lastPrice = candles[candles.length - 1].close;
      const swings = this.findSwings(candles);
      const structure = this.detectStructure(candles, swings);
      const fvgs = this.findFVGs(candles);
      const obs = this.findOrderBlocks(candles);
      const pd = this.getPremiumDiscount(candles, swings);
      const ote = this.findOTE(candles, swings, structure.trend);
      const liquidity = this.findLiquidity(candles, swings);
      const rsi = this.calcRSI(candles);
      const killzone = this.getKillzone();

      // Confluence scoring
      let bullScore = 0;
      let bearScore = 0;
      const factors = [];

      // 1. Market Structure (3 points)
      if (structure.trend === 'bullish') { bullScore += 3; factors.push('Bullish Structure'); }
      if (structure.trend === 'bearish') { bearScore += 3; factors.push('Bearish Structure'); }

      // 2. BOS (2 points)
      if (structure.bos) {
        if (structure.bos.type === 'bullish') { bullScore += 2; factors.push('Bullish BOS'); }
        if (structure.bos.type === 'bearish') { bearScore += 2; factors.push('Bearish BOS'); }
      }

      // 3. ChoCH (2 points - reversal signal)
      if (structure.choch) {
        if (structure.choch.type === 'bullish_choch') { bullScore += 2; factors.push('Bullish ChoCH'); }
        if (structure.choch.type === 'bearish_choch') { bearScore += 2; factors.push('Bearish ChoCH'); }
      }

      // 4. Premium/Discount (2 points)
      if (pd.zone === 'discount') { bullScore += 2; factors.push('Discount Zone'); }
      if (pd.zone === 'premium') { bearScore += 2; factors.push('Premium Zone'); }

      // 5. OTE (2 points)
      if (ote && ote.inOTE) {
        if (ote.direction === 'long') { bullScore += 2; factors.push('OTE Long Zone'); }
        if (ote.direction === 'short') { bearScore += 2; factors.push('OTE Short Zone'); }
      }

      // 6. Order Blocks near price (1 point each)
      const priceRange = lastPrice * 0.005;
      const nearBullOB = obs.bullish.filter(ob => lastPrice >= ob.low - priceRange && lastPrice <= ob.high + priceRange);
      const nearBearOB = obs.bearish.filter(ob => lastPrice >= ob.low - priceRange && lastPrice <= ob.high + priceRange);
      if (nearBullOB.length > 0) { bullScore += 1; factors.push(`Bullish OB (${nearBullOB.length})`); }
      if (nearBearOB.length > 0) { bearScore += 1; factors.push(`Bearish OB (${nearBearOB.length})`); }

      // 7. FVGs (1 point)
      const recentBullFVG = fvgs.bullish.filter(f => f.index >= candles.length - 15);
      const recentBearFVG = fvgs.bearish.filter(f => f.index >= candles.length - 15);
      if (recentBullFVG.length > 0) { bullScore += 1; factors.push(`Bullish FVG (${recentBullFVG.length})`); }
      if (recentBearFVG.length > 0) { bearScore += 1; factors.push(`Bearish FVG (${recentBearFVG.length})`); }

      // 8. RSI confirmation (1 point)
      if (rsi < 40) { bullScore += 1; factors.push(`RSI Oversold (${rsi.toFixed(0)})`); }
      if (rsi > 60) { bearScore += 1; factors.push(`RSI Overbought (${rsi.toFixed(0)})`); }

      // 9. Killzone (1 point)
      if (killzone.active) { bullScore += 0.5; bearScore += 0.5; factors.push(`${killzone.name} Session`); }

      // Determine signal
      const totalPossible = 13;
      let signal, confidence, direction;
      if (bullScore > bearScore && bullScore >= 5) {
        signal = 'BUY';
        confidence = Math.min(Math.round((bullScore / totalPossible) * 100), 95);
        direction = 'bullish';
      } else if (bearScore > bullScore && bearScore >= 5) {
        signal = 'SELL';
        confidence = Math.min(Math.round((bearScore / totalPossible) * 100), 95);
        direction = 'bearish';
      } else {
        signal = 'NEUTRAL';
        confidence = Math.round(Math.max(bullScore, bearScore) / totalPossible * 100);
        direction = 'neutral';
      }

      // Calculate entry, SL, TP
      const atr = this.calcATR(candles);
      let entry = lastPrice;
      let sl, tp1, tp2, tp3;
      if (signal === 'BUY') {
        sl = entry - atr * 1.5;
        tp1 = entry + atr * 1;
        tp2 = entry + atr * 2;
        tp3 = entry + atr * 3;
      } else if (signal === 'SELL') {
        sl = entry + atr * 1.5;
        tp1 = entry - atr * 1;
        tp2 = entry - atr * 2;
        tp3 = entry - atr * 3;
      } else {
        sl = entry - atr; tp1 = entry + atr; tp2 = entry + atr * 2; tp3 = entry + atr * 3;
      }

      return {
        signal, confidence, direction, entry,
        stopLoss: sl, tp1, tp2, tp3,
        structure: structure.trend,
        bos: structure.bos,
        choch: structure.choch,
        zone: pd.zone,
        ote,
        fvgs: { bullish: recentBullFVG.length, bearish: recentBearFVG.length },
        orderBlocks: { bullish: nearBullOB.length, bearish: nearBearOB.length },
        rsi: rsi.toFixed(1),
        killzone,
        liquidity,
        factors,
        bullScore,
        bearScore,
        pair,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      console.error('Analysis error:', err);
      return { signal: 'NEUTRAL', confidence: 0, reason: 'Analysis error: ' + err.message, pair };
    }
  }

  // ===== ATR CALCULATION =====
  calcATR(candles, period = 14) {
    if (candles.length < period + 1) return candles[candles.length - 1].close * 0.01;
    let sum = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      sum += tr;
    }
    return sum / period;
  }
}

// Export global instance
const ictAnalyzer = new ICTAnalyzer();
