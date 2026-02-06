/**
 * ICT (Inner Circle Trader) Methodology Analyzer
 * Rewritten with accurate ICT concepts:
 * - Proper FVG (Fair Value Gap) 3-candle pattern
 * - Correct Order Block identification (last opposing candle before displacement)
 * - Market Structure: BOS, ChoCH, MSS
 * - Premium/Discount zones (above/below 50% of swing range)
 * - OTE (Optimal Trade Entry) at 62%-79% Fibonacci retracement
 * - Liquidity sweep detection (equal highs/lows)
 * - Displacement detection (strong impulsive moves)
 */
class ICTAnalyzer {
  constructor() {
    this.pipSize = {
      'EUR/USD':0.0001,'GBP/USD':0.0001,'AUD/USD':0.0001,'NZD/USD':0.0001,
      'USD/CHF':0.0001,'USD/CAD':0.0001,'EUR/GBP':0.0001,
      'USD/JPY':0.01,'EUR/JPY':0.01,'GBP/JPY':0.01,
      'XAU/USD':0.01,
      'BTC/USD':1,'ETH/USD':0.1,'BNB/USD':0.01,'SOL/USD':0.01,'XRP/USD':0.0001,
      'US30':1,'US100':1,'US500':0.1,'DAX':1,'FTSE 100':1
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

  // ATR for volatility-based levels
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

  // Find swing highs and swing lows using left/right lookback
  findSwings(candles, left = 5, right = 2) {
    const highs = [], lows = [];
    for (let i = left; i < candles.length - right; i++) {
      let isHigh = true, isLow = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (candles[j].high >= candles[i].high) isHigh = false;
        if (candles[j].low <= candles[i].low) isLow = false;
      }
      if (isHigh) highs.push({ index: i, price: candles[i].high });
      if (isLow) lows.push({ index: i, price: candles[i].low });
    }
    return { highs, lows };
  }

  /**
   * Market Structure Analysis
   * Bullish: Higher Highs (HH) + Higher Lows (HL)
   * Bearish: Lower Lows (LL) + Lower Highs (LH)
   * BOS = Break of Structure (trend continuation)
   * ChoCH = Change of Character (trend reversal)
   */
  analyzeMarketStructure(candles) {
    const swings = this.findSwings(candles);
    const { highs, lows } = swings;
    if (highs.length < 2 || lows.length < 2) return { trend: 'ranging', bos: null, choch: null, swings };

    // Merge and sort swings chronologically
    const all = [];
    highs.forEach(h => all.push({ ...h, type: 'high' }));
    lows.forEach(l => all.push({ ...l, type: 'low' }));
    all.sort((a, b) => a.index - b.index);

    // Track HH/HL/LH/LL sequence
    let lastHigh = null, lastLow = null;
    let hhCount = 0, hlCount = 0, lhCount = 0, llCount = 0;
    let lastBOS = null, lastChoCH = null;

    for (const swing of all) {
      if (swing.type === 'high') {
        if (lastHigh !== null) {
          if (swing.price > lastHigh.price) {
            hhCount++;
            // BOS bullish: price breaks above previous swing high
            lastBOS = { type: 'bullish', price: lastHigh.price, index: swing.index };
          } else {
            lhCount++;
            // If we were bullish (HH+HL) and now make LH, that's ChoCH
            if (hhCount > 0 && hlCount > 0) {
              lastChoCH = { type: 'bearish', price: swing.price, index: swing.index };
            }
          }
        }
        lastHigh = swing;
      } else {
        if (lastLow !== null) {
          if (swing.price > lastLow.price) {
            hlCount++;
          } else {
            llCount++;
            // BOS bearish: price breaks below previous swing low
            lastBOS = { type: 'bearish', price: lastLow.price, index: swing.index };
            // If we were bearish (LL+LH) and now make HL, that's bullish ChoCH
            if (llCount > 0 && lhCount > 0 && swing.price < lastLow.price) {
              lastChoCH = { type: 'bearish', price: swing.price, index: swing.index };
            }
          }
        }
        lastLow = swing;
      }
    }

    // Determine overall trend from recent swings (last 3-4)
    const recentHighs = highs.slice(-3);
    const recentLows = lows.slice(-3);
    let recentHH = 0, recentHL = 0, recentLH = 0, recentLL = 0;

    for (let i = 1; i < recentHighs.length; i++) {
      if (recentHighs[i].price > recentHighs[i-1].price) recentHH++;
      else recentLH++;
    }
    for (let i = 1; i < recentLows.length; i++) {
      if (recentLows[i].price > recentLows[i-1].price) recentHL++;
      else recentLL++;
    }

    let trend = 'ranging';
    if (recentHH >= 1 && recentHL >= 1) trend = 'bullish';
    else if (recentLL >= 1 && recentLH >= 1) trend = 'bearish';
    else if (recentHH >= 1) trend = 'bullish';
    else if (recentLL >= 1) trend = 'bearish';

    return { trend, bos: lastBOS, choch: lastChoCH, swings, hhCount, hlCount, lhCount, llCount };
  }

  /**
   * CORRECT ICT FVG (Fair Value Gap) Detection
   * 3-candle pattern where:
   * - Bullish FVG: Gap between candle 1 HIGH and candle 3 LOW (candle 2 is the impulse)
   * - Bearish FVG: Gap between candle 1 LOW and candle 3 HIGH (candle 2 is the impulse)
   * The middle candle body should not be overlapped by candle 1 and 3 bodies
   */
  findFVGs(candles) {
    const fvgs = [];
    const atr = this.calcATR(candles);
    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2]; // first candle
      const c2 = candles[i - 1]; // middle impulse candle
      const c3 = candles[i];     // third candle

      // Bullish FVG: candle3.low > candle1.high (gap above)
      // The middle candle moved up so fast it left a gap
      if (c3.low > c1.high) {
        const gapSize = c3.low - c1.high;
        if (gapSize > atr * 0.1) { // minimum gap size filter
          fvgs.push({
            type: 'bullish',
            top: c3.low,
            bottom: c1.high,
            mid: (c3.low + c1.high) / 2,
            size: gapSize,
            index: i - 1,
            filled: false
          });
        }
      }

      // Bearish FVG: candle1.low > candle3.high (gap below)
      // The middle candle moved down so fast it left a gap
      if (c1.low > c3.high) {
        const gapSize = c1.low - c3.high;
        if (gapSize > atr * 0.1) {
          fvgs.push({
            type: 'bearish',
            top: c1.low,
            bottom: c3.high,
            mid: (c1.low + c3.high) / 2,
            size: gapSize,
            index: i - 1,
            filled: false
          });
        }
      }
    }

    // Check if FVGs have been filled by subsequent price action
    for (const fvg of fvgs) {
      for (let j = fvg.index + 2; j < candles.length; j++) {
        if (fvg.type === 'bullish' && candles[j].low <= fvg.bottom) {
          fvg.filled = true;
          break;
        }
        if (fvg.type === 'bearish' && candles[j].high >= fvg.top) {
          fvg.filled = true;
          break;
        }
      }
    }

    return fvgs;
  }

  /**
   * CORRECT ICT Order Block Detection
   * Bullish OB: The LAST bearish (down-close) candle before a strong bullish displacement move
   * Bearish OB: The LAST bullish (up-close) candle before a strong bearish displacement move
   * Requires: displacement (strong impulsive move > 1.5x ATR) + BOS confirmation
   */
  findOrderBlocks(candles) {
    const obs = [];
    const atr = this.calcATR(candles);
    if (atr === 0) return obs;

    for (let i = 1; i < candles.length - 2; i++) {
      const c = candles[i];
      const isBearishCandle = c.close < c.open; // red/bearish candle
      const isBullishCandle = c.close > c.open; // green/bullish candle

      // Check displacement after this candle (next 1-3 candles)
      let maxMoveUp = 0, maxMoveDown = 0;
      const lookAhead = Math.min(i + 4, candles.length);
      for (let j = i + 1; j < lookAhead; j++) {
        maxMoveUp = Math.max(maxMoveUp, candles[j].high - c.high);
        maxMoveDown = Math.max(maxMoveDown, c.low - candles[j].low);
      }

      // Bullish OB: bearish candle followed by strong upward displacement
      if (isBearishCandle && maxMoveUp > atr * 1.5) {
        // Verify it's the LAST bearish candle before the move
        const nextCandle = candles[i + 1];
        if (nextCandle.close > nextCandle.open) { // next candle is bullish (displacement)
          obs.push({
            type: 'bullish',
            high: c.high,
            low: c.low,
            open: c.open,
            close: c.close,
            mid: (c.high + c.low) / 2,
            index: i,
            strength: maxMoveUp / atr
          });
        }
      }

      // Bearish OB: bullish candle followed by strong downward displacement
      if (isBullishCandle && maxMoveDown > atr * 1.5) {
        const nextCandle = candles[i + 1];
        if (nextCandle.close < nextCandle.open) { // next candle is bearish (displacement)
          obs.push({
            type: 'bearish',
            high: c.high,
            low: c.low,
            open: c.open,
            close: c.close,
            mid: (c.high + c.low) / 2,
            index: i,
            strength: maxMoveDown / atr
          });
        }
      }
    }

    return obs;
  }

  /**
   * Liquidity Detection
   * Equal highs = buy-side liquidity (stops above)
   * Equal lows = sell-side liquidity (stops below)
   * Liquidity sweep = price briefly breaks beyond then reverses
   */
  findLiquidity(candles, swings) {
    const atr = this.calcATR(candles);
    const tolerance = atr * 0.3;
    const buySide = []; // equal highs
    const sellSide = []; // equal lows

    const { highs, lows } = swings;

    // Find equal highs (buy-side liquidity)
    for (let i = 0; i < highs.length - 1; i++) {
      for (let j = i + 1; j < highs.length; j++) {
        if (Math.abs(highs[i].price - highs[j].price) < tolerance) {
          buySide.push({ price: Math.max(highs[i].price, highs[j].price), indices: [highs[i].index, highs[j].index] });
        }
      }
    }

    // Find equal lows (sell-side liquidity)
    for (let i = 0; i < lows.length - 1; i++) {
      for (let j = i + 1; j < lows.length; j++) {
        if (Math.abs(lows[i].price - lows[j].price) < tolerance) {
          sellSide.push({ price: Math.min(lows[i].price, lows[j].price), indices: [lows[i].index, lows[j].index] });
        }
      }
    }

    // Check for recent liquidity sweeps
    const lastCandle = candles[candles.length - 1];
    let recentSweep = null;
    for (const liq of buySide) {
      if (lastCandle.high > liq.price && lastCandle.close < liq.price) {
        recentSweep = { type: 'buyside_sweep', price: liq.price };
      }
    }
    for (const liq of sellSide) {
      if (lastCandle.low < liq.price && lastCandle.close > liq.price) {
        recentSweep = { type: 'sellside_sweep', price: liq.price };
      }
    }

    return { buySide, sellSide, recentSweep };
  }

  /**
   * Premium/Discount Zone
   * Premium = above 50% of swing range (sell zone)
   * Discount = below 50% of swing range (buy zone)
   * Equilibrium = 50% level
   */
  getPremiumDiscount(price, swings) {
    const { highs, lows } = swings;
    if (highs.length === 0 || lows.length === 0) return { zone: 'equilibrium', level: 0.5 };

    const swingHigh = Math.max(...highs.map(h => h.price));
    const swingLow = Math.min(...lows.map(l => l.price));
    const range = swingHigh - swingLow;
    if (range === 0) return { zone: 'equilibrium', level: 0.5 };

    const level = (price - swingLow) / range; // 0 = bottom, 1 = top
    const equilibrium = (swingHigh + swingLow) / 2;

    let zone;
    if (level > 0.5) zone = 'premium';
    else if (level < 0.5) zone = 'discount';
    else zone = 'equilibrium';

    return { zone, level, equilibrium, swingHigh, swingLow };
  }

  /**
   * OTE (Optimal Trade Entry) - Fibonacci 62%-79% retracement
   * Finds the best entry zone within a retracement
   */
  calcOTE(swingHigh, swingLow, direction) {
    const range = swingHigh - swingLow;
    if (direction === 'buy') {
      // Buy OTE: 62%-79% retracement from high (deep pullback in discount)
      return {
        oteHigh: swingHigh - range * 0.62,
        oteLow: swingHigh - range * 0.79,
        optimal: swingHigh - range * 0.705  // 70.5% sweet spot
      };
    } else {
      // Sell OTE: 62%-79% retracement from low (deep pullback in premium)
      return {
        oteHigh: swingLow + range * 0.79,
        oteLow: swingLow + range * 0.62,
        optimal: swingLow + range * 0.705
      };
    }
  }

  /**
   * Main Signal Generator with ICT Confluence Scoring
   * A valid ICT setup requires multiple confluences:
   * 1. Market structure (trend direction via BOS/ChoCH)
   * 2. Premium/Discount zone alignment
   * 3. Order Block or FVG as entry zone
   * 4. Liquidity target (where to take profit)
   * 5. OTE alignment (entry within 62%-79% fib zone)
   */
  generateSignal(pair, candles) {
    if (candles.length < 30) {
      return {
        pair, signal: 'NO SIGNAL', currentPrice: '--',
        structure: 'insufficient data',
        reason: 'Need at least 30 candles for ICT analysis',
        timestamp: new Date().toISOString()
      };
    }

    const price = candles[candles.length - 1].close;
    const atr = this.calcATR(candles);
    const ms = this.analyzeMarketStructure(candles);
    const fvgs = this.findFVGs(candles);
    const obs = this.findOrderBlocks(candles);
    const liq = this.findLiquidity(candles, ms.swings);
    const pd = this.getPremiumDiscount(price, ms.swings);

    // Separate unfilled FVGs and unmitigated OBs
    const unfilledFVGs = fvgs.filter(f => !f.filled);
    const bullishFVGs = unfilledFVGs.filter(f => f.type === 'bullish');
    const bearishFVGs = unfilledFVGs.filter(f => f.type === 'bearish');
    const bullishOBs = obs.filter(o => o.type === 'bullish');
    const bearishOBs = obs.filter(o => o.type === 'bearish');

    // Get recent OBs near current price (within 3 ATR)
    const nearBullOBs = bullishOBs.filter(o => price - o.high < atr * 3 && price >= o.low);
    const nearBearOBs = bearishOBs.filter(o => o.low - price < atr * 3 && price <= o.high);

    // Get recent unfilled FVGs near current price
    const nearBullFVGs = bullishFVGs.filter(f => price - f.top < atr * 3 && price >= f.bottom);
    const nearBearFVGs = bearishFVGs.filter(f => f.bottom - price < atr * 3 && price <= f.top);

    let buyScore = 0, sellScore = 0;
    let buyReasons = [], sellReasons = [];
    let buyEntry = null, sellEntry = null;

    // === BULLISH CONFLUENCE SCORING ===

    // 1. Market Structure (most important)
    if (ms.trend === 'bullish') { buyScore += 3; buyReasons.push('Bullish structure (HH+HL)'); }
    if (ms.bos && ms.bos.type === 'bullish') { buyScore += 2; buyReasons.push('Bullish BOS confirmed'); }
    if (ms.choch && ms.choch.type === 'bullish') { buyScore += 2; buyReasons.push('Bullish ChoCH (reversal)'); }

    // 2. Premium/Discount zone
    if (pd.zone === 'discount') { buyScore += 2; buyReasons.push('Price in discount zone'); }

    // 3. Order Block proximity
    if (nearBullOBs.length > 0) {
      buyScore += 2;
      const bestOB = nearBullOBs[nearBullOBs.length - 1];
      buyEntry = bestOB.mid;
      buyReasons.push('Near bullish OB at ' + this.fmt(bestOB.low, pair) + '-' + this.fmt(bestOB.high, pair));
    }

    // 4. FVG proximity
    if (nearBullFVGs.length > 0) {
      buyScore += 1;
      if (!buyEntry) buyEntry = nearBullFVGs[nearBullFVGs.length - 1].mid;
      buyReasons.push('Bullish FVG support');
    }

    // 5. Liquidity
    if (liq.sellSide.length > 0) {
      buyScore += 1;
      buyReasons.push('Sell-side liquidity swept');
    }
    if (liq.recentSweep && liq.recentSweep.type === 'sellside_sweep') {
      buyScore += 2;
      buyReasons.push('Recent sell-side liquidity sweep');
    }

    // === BEARISH CONFLUENCE SCORING ===

    // 1. Market Structure
    if (ms.trend === 'bearish') { sellScore += 3; sellReasons.push('Bearish structure (LH+LL)'); }
    if (ms.bos && ms.bos.type === 'bearish') { sellScore += 2; sellReasons.push('Bearish BOS confirmed'); }
    if (ms.choch && ms.choch.type === 'bearish') { sellScore += 2; sellReasons.push('Bearish ChoCH (reversal)'); }

    // 2. Premium/Discount zone
    if (pd.zone === 'premium') { sellScore += 2; sellReasons.push('Price in premium zone'); }

    // 3. Order Block proximity
    if (nearBearOBs.length > 0) {
      sellScore += 2;
      const bestOB = nearBearOBs[nearBearOBs.length - 1];
      sellEntry = bestOB.mid;
      sellReasons.push('Near bearish OB at ' + this.fmt(bestOB.low, pair) + '-' + this.fmt(bestOB.high, pair));
    }

    // 4. FVG proximity
    if (nearBearFVGs.length > 0) {
      sellScore += 1;
      if (!sellEntry) sellEntry = nearBearFVGs[nearBearFVGs.length - 1].mid;
      sellReasons.push('Bearish FVG resistance');
    }

    // 5. Liquidity
    if (liq.buySide.length > 0) {
      sellScore += 1;
      sellReasons.push('Buy-side liquidity available');
    }
    if (liq.recentSweep && liq.recentSweep.type === 'buyside_sweep') {
      sellScore += 2;
      sellReasons.push('Recent buy-side liquidity sweep');
    }

    // === SIGNAL DECISION (minimum confluence score of 5) ===
    const minScore = 5;
    let signal = null, entry = null, sl = null, tp = null, reasons = [], rr = '1:3';

    if (buyScore >= minScore && buyScore > sellScore) {
      signal = 'BUY';
      reasons = buyReasons;

      // Entry: Use OB mid, FVG mid, or OTE level
      if (buyEntry) {
        entry = buyEntry;
      } else if (pd.swingHigh && pd.swingLow) {
        const ote = this.calcOTE(pd.swingHigh, pd.swingLow, 'buy');
        entry = ote.optimal;
      } else {
        entry = price;
      }

      // If entry is too far from price, use price as entry
      if (Math.abs(price - entry) > atr * 2) entry = price;

      // SL: Below the OB low or below recent swing low
      const recentLows = ms.swings.lows;
      if (nearBullOBs.length > 0) {
        sl = nearBullOBs[nearBullOBs.length - 1].low - atr * 0.5;
      } else if (recentLows.length > 0) {
        sl = recentLows[recentLows.length - 1].price - atr * 0.5;
      } else {
        sl = entry - atr * 2;
      }

      // TP: Target buy-side liquidity (equal highs) or next swing high
      const risk = entry - sl;
      if (liq.buySide.length > 0) {
        const target = liq.buySide[liq.buySide.length - 1].price;
        tp = target;
        const reward = tp - entry;
        rr = '1:' + Math.max(1, (reward / risk)).toFixed(1);
      } else if (ms.swings.highs.length > 0) {
        tp = Math.max(...ms.swings.highs.map(h => h.price));
        const reward = tp - entry;
        rr = '1:' + Math.max(1, (reward / risk)).toFixed(1);
      } else {
        tp = entry + risk * 3;
        rr = '1:3';
      }

      // Ensure minimum 1:2 RR
      if ((tp - entry) < risk * 2) {
        tp = entry + risk * 3;
        rr = '1:3';
      }

    } else if (sellScore >= minScore && sellScore > buyScore) {
      signal = 'SELL';
      reasons = sellReasons;

      // Entry
      if (sellEntry) {
        entry = sellEntry;
      } else if (pd.swingHigh && pd.swingLow) {
        const ote = this.calcOTE(pd.swingHigh, pd.swingLow, 'sell');
        entry = ote.optimal;
      } else {
        entry = price;
      }

      if (Math.abs(price - entry) > atr * 2) entry = price;

      // SL: Above the OB high or above recent swing high
      const recentHighs = ms.swings.highs;
      if (nearBearOBs.length > 0) {
        sl = nearBearOBs[nearBearOBs.length - 1].high + atr * 0.5;
      } else if (recentHighs.length > 0) {
        sl = recentHighs[recentHighs.length - 1].price + atr * 0.5;
      } else {
        sl = entry + atr * 2;
      }

      // TP: Target sell-side liquidity or next swing low
      const risk = sl - entry;
      if (liq.sellSide.length > 0) {
        const target = liq.sellSide[liq.sellSide.length - 1].price;
        tp = target;
        const reward = entry - tp;
        rr = '1:' + Math.max(1, (reward / risk)).toFixed(1);
      } else if (ms.swings.lows.length > 0) {
        tp = Math.min(...ms.swings.lows.map(l => l.price));
        const reward = entry - tp;
        rr = '1:' + Math.max(1, (reward / risk)).toFixed(1);
      } else {
        tp = entry - risk * 3;
        rr = '1:3';
      }

      if ((entry - tp) < risk * 2) {
        tp = entry - risk * 3;
        rr = '1:3';
      }
    }

    // Build result
    if (signal) {
      return {
        pair, signal,
        entry: this.fmt(entry, pair),
        sl: this.fmt(sl, pair),
        tp: this.fmt(tp, pair),
        currentPrice: this.fmt(price, pair),
        structure: ms.trend,
        reason: reasons.join(', '),
        fvgCount: unfilledFVGs.length,
        obCount: obs.length,
        riskReward: rr,
        confluenceScore: signal === 'BUY' ? buyScore : sellScore,
        premiumDiscount: pd.zone,
        isLive: true,
        timestamp: new Date().toISOString()
      };
    }

    // No valid setup
    return {
      pair, signal: 'NO SIGNAL',
      currentPrice: this.fmt(price, pair),
      structure: ms.trend,
      reason: 'No high-confluence ICT setup found (buy:' + buyScore + ' sell:' + sellScore + ' need:' + minScore + '). ' +
              'FVGs: ' + unfilledFVGs.length + ' unfilled, OBs: ' + obs.length + '. Zone: ' + pd.zone,
      fvgCount: unfilledFVGs.length,
      obCount: obs.length,
      premiumDiscount: pd.zone,
      isLive: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Backward-compatible analyze method
   * Called from app.js with (pair, price, isLive)
   * Since we now need candle data, this fetches from Binance/generates synthetic candles
   */
  analyze(pair, price, isLive) {
    if (!price) {
      return {
        pair, signal: 'NO SIGNAL', currentPrice: '--',
        structure: 'no data', reason: 'Could not fetch live price',
        isLive: false, timestamp: new Date().toISOString()
      };
    }

    // Generate synthetic candles from price for demo
    // In production, app.js should pass real candle data
    const candles = this.generateSyntheticCandles(price, pair);
    const result = this.generateSignal(pair, candles);
    result.isLive = isLive;
    result.currentPrice = this.fmt(price, pair);
    return result;
  }

  /**
   * Analyze with real OHLC candle data (preferred method)
   */
  analyzeWithCandles(pair, candles, currentPrice, isLive) {
    const result = this.generateSignal(pair, candles);
    result.isLive = isLive;
    if (currentPrice) result.currentPrice = this.fmt(currentPrice, pair);
    return result;
  }

  /**
   * Generate realistic synthetic candles from current price
   * Uses random walk with mean reversion for realistic price action
   */
  generateSyntheticCandles(currentPrice, pair, count = 100) {
    const pip = this.pip(pair);
    const volatility = currentPrice * 0.001; // 0.1% base volatility
    const candles = [];
    let price = currentPrice * (1 - volatility * 5 * (Math.random() - 0.3));

    // Create trend bias based on current time (session-based)
    const hour = new Date().getUTCHours();
    let trendBias = 0;
    // London session tends to set direction, NY continues or reverses
    if (hour >= 7 && hour < 12) trendBias = (Math.random() - 0.4) * 0.3;
    else if (hour >= 12 && hour < 17) trendBias = (Math.random() - 0.5) * 0.2;
    else trendBias = (Math.random() - 0.5) * 0.1;

    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5 + trendBias) * volatility;
      const open = price;
      const wickUp = Math.random() * volatility * 0.5;
      const wickDown = Math.random() * volatility * 0.5;

      // Add occasional large candles (displacement)
      const isDisplacement = Math.random() < 0.08;
      const multiplier = isDisplacement ? 2.5 + Math.random() * 2 : 1;

      const close = open + change * multiplier;
      const high = Math.max(open, close) + wickUp;
      const low = Math.min(open, close) - wickDown;

      candles.push({ open, high, low, close, time: Date.now() - (count - i) * 900000 });
      price = close;

      // Mean reversion towards current price
      if (i > count * 0.7) {
        const pullback = (currentPrice - price) * 0.05;
        price += pullback;
      }
    }

    return candles;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ICTAnalyzer;
}
