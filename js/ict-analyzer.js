// ICT Trading Analyzer v4 - Improved Data + Accurate ICT Methodology
// Uses: Binance (crypto), multiple forex APIs with fallback
// ICT: BOS/ChoCH, OB, FVG, Premium/Discount, OTE, Liquidity, Displacement

class ICTAnalyzer {
  constructor() {
    this.swingLen = 5;
    this.cache = {};
    this.cacheTTL = 120000; // 2 min cache
  }

  // ===== MULTI-SOURCE REAL DATA FETCHING =====
  async fetchCandles(pair, type) {
    const key = `${pair}_${type}`;
    if (this.cache[key] && Date.now() - this.cache[key].ts < this.cacheTTL) {
      return this.cache[key].data;
    }
    let candles = null;
    let source = 'unknown';
    try {
      if (type === 'crypto') {
        candles = await this.fetchBinanceCrypto(pair);
        if (candles && candles.length >= 30) source = 'Binance';
      } else if (type === 'forex') {
        // Try multiple forex sources
        try {
          candles = await this.fetchForexViaProxy(pair);
          if (candles && candles.length >= 30) source = 'Forex API';
        } catch(e) { console.warn('Forex proxy failed:', e); }
        if (!candles || candles.length < 30) {
          try {
            candles = await this.fetchTwelveData(pair, type);
            if (candles && candles.length >= 30) source = 'TwelveData';
          } catch(e) { console.warn('TwelveData failed:', e); }
        }
      } else if (type === 'indices') {
        try {
          candles = await this.fetchTwelveData(pair, type);
          if (candles && candles.length >= 30) source = 'TwelveData';
        } catch(e) { console.warn('TwelveData indices failed:', e); }
      }
    } catch(e) { console.warn('Primary fetch failed:', e); }

    if (!candles || candles.length < 30) {
      candles = this.generateRealisticCandles(pair, type);
      source = 'Simulated';
    }
    this.cache[key] = { data: candles, ts: Date.now(), source };
    return candles;
  }

  getDataSource(pair, type) {
    const key = `${pair}_${type}`;
    if (this.cache[key]) return this.cache[key].source;
    return 'unknown';
  }

  // Binance crypto candles (1h, 200 candles)
  async fetchBinanceCrypto(pair) {
    const map = {'BTC/USD':'BTCUSDT','ETH/USD':'ETHUSDT','XRP/USD':'XRPUSDT','BNB/USD':'BNBUSDT','SOL/USD':'SOLUSDT','ADA/USD':'ADAUSDT','DOGE/USD':'DOGEUSDT','DOT/USD':'DOTUSDT','AVAX/USD':'AVAXUSDT','MATIC/USD':'MATICUSDT','LINK/USD':'LINKUSDT','LTC/USD':'LTCUSDT'};
    let sym = map[pair] || pair.replace('/','').replace('USD','USDT');
    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=200`);
    if (!r.ok) throw new Error('Binance error');
    const d = await r.json();
    return d.map(k => ({time:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
  }

  // Forex candles via free proxy APIs
  async fetchForexViaProxy(pair) {
    const sym = pair.replace('/', '');
    // Try forex candles from Alpha Vantage demo
    const avSymbol = pair.replace('/', '');
    const url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${pair.split('/')[0]}&to_symbol=${pair.split('/')[1]}&interval=60min&outputsize=full&apikey=demo`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('AlphaVantage error');
    const d = await r.json();
    const tsKey = Object.keys(d).find(k => k.includes('Time Series'));
    if (!tsKey || !d[tsKey]) throw new Error('No AV data');
    const entries = Object.entries(d[tsKey]).slice(0, 200).reverse();
    return entries.map(([dt, v]) => ({
      time: new Date(dt).getTime(),
      open: +v['1. open'], high: +v['2. high'],
      low: +v['3. low'], close: +v['4. close'],
      volume: 0
    }));
  }

  // TwelveData fallback for any symbol
  async fetchTwelveData(pair, type) {
    const sym = pair.replace('/', '');
    const url = `https://api.twelvedata.com/time_series?symbol=${type==='crypto'?pair:sym}&interval=1h&outputsize=200&apikey=demo`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('TwelveData error');
    const d = await r.json();
    if (d.status === 'error' || !d.values) throw new Error(d.message || 'No data');
    return d.values.reverse().map(v => ({
      time: new Date(v.datetime).getTime(),
      open: +v.open, high: +v.high, low: +v.low, close: +v.close,
      volume: +v.volume || 0
    }));
  }

  // Realistic candle generation as last resort
  generateRealisticCandles(pair, type) {
    const candles = [];
    const bases = {'EUR/USD':1.04,'GBP/USD':1.25,'USD/JPY':153,'AUD/USD':0.63,'USD/CAD':1.44,'NZD/USD':0.57,'USD/CHF':0.91,'EUR/GBP':0.83,'EUR/JPY':159,'GBP/JPY':191,'AUD/JPY':96,'EUR/AUD':1.65,'GBP/AUD':1.99,'EUR/CAD':1.50,'GBP/CAD':1.80,'EUR/CHF':0.94,'GBP/CHF':1.14,'AUD/CAD':0.91,'AUD/NZD':1.11,'CAD/JPY':106,'CHF/JPY':168,'NZD/JPY':87,'EUR/NZD':1.83,'GBP/NZD':2.20,'USD/SGD':1.35,'USD/MXN':20.5,'USD/ZAR':18.3,'USD/TRY':36.5,'XAU/USD':2860,'XAG/USD':32,'BTC/USD':97000,'ETH/USD':2700,'XRP/USD':2.5,'BNB/USD':650,'SOL/USD':200,'ADA/USD':0.75,'DOGE/USD':0.25,'DOT/USD':5,'AVAX/USD':25,'LINK/USD':18,'LTC/USD':110,'US30':44500,'US100':21500,'US500':6050,'DAX':21800,'FTSE':8500,'NI225':39000};
    let price = bases[pair] || 1.0;
    const volPct = pair.includes('JPY') ? 0.002 : pair.includes('BTC') ? 0.008 : pair.includes('XAU') ? 0.004 : ['US30','US100','US500','DAX','FTSE','NI225'].includes(pair) ? 0.003 : 0.0015;
    const vol = price * volPct;
    const trendBias = (Math.random() - 0.5) * vol * 0.3;
    for (let i = 0; i < 200; i++) {
      const o = price + (Math.random() - 0.48) * vol + trendBias;
      const c = o + (Math.random() - 0.48) * vol + trendBias;
      const h = Math.max(o, c) + Math.random() * vol * 0.5;
      const l = Math.min(o, c) - Math.random() * vol * 0.5;
      candles.push({time: Date.now() - (200 - i) * 3600000, open: o, high: h, low: l, close: c, volume: Math.random() * 1000});
      price = c;
    }
    return candles;
  }

  // ===== SWING DETECTION =====
  findSwings(candles) {
    const highs = [], lows = [];
    const len = this.swingLen;
    for (let i = len; i < candles.length - len; i++) {
      let isH = true, isL = true;
      for (let j = 1; j <= len; j++) {
        if (candles[i].high <= candles[i-j].high || candles[i].high <= candles[i+j].high) isH = false;
        if (candles[i].low >= candles[i-j].low || candles[i].low >= candles[i+j].low) isL = false;
      }
      if (isH) highs.push({i, price: candles[i].high, time: candles[i].time});
      if (isL) lows.push({i, price: candles[i].low, time: candles[i].time});
    }
    return {highs, lows};
  }

  // ===== RSI =====
  calcRSI(candles, period=14) {
    if (candles.length < period+1) return 50;
    let gains=0, losses=0;
    for (let i=1; i<=period; i++) {
      const d = candles[i].close - candles[i-1].close;
      if (d>0) gains+=d; else losses-=d;
    }
    let ag=gains/period, al=losses/period;
    for (let i=period+1; i<candles.length; i++) {
      const d = candles[i].close - candles[i-1].close;
      ag = (ag*(period-1)+(d>0?d:0))/period;
      al = (al*(period-1)+(d<0?-d:0))/period;
    }
    if (al===0) return 100;
    return 100-(100/(1+ag/al));
  }

  // ===== ATR =====
  calcATR(candles, period=14) {
    if (candles.length < period+1) return candles[candles.length-1].close * 0.01;
    let sum=0;
    for (let i=candles.length-period; i<candles.length; i++) {
      sum += Math.max(candles[i].high-candles[i].low, Math.abs(candles[i].high-candles[i-1].close), Math.abs(candles[i].low-candles[i-1].close));
    }
    return sum/period;
  }

  // ===== EMA =====
  calcEMA(candles, period) {
    const k = 2/(period+1);
    let ema = candles[0].close;
    for (let i=1; i<candles.length; i++) ema = candles[i].close*k + ema*(1-k);
    return ema;
  }

  // ===== KILLZONE DETECTION =====
  getKillzone() {
    const now = new Date();
    const h = now.getUTCHours();
    if (h>=2 && h<5) return {name:'Asian',active:true,weight:0.5};
    if (h>=7 && h<10) return {name:'London',active:true,weight:1};
    if (h>=12 && h<15) return {name:'New York AM',active:true,weight:1};
    if (h>=15 && h<17) return {name:'New York PM',active:true,weight:0.7};
    if (h>=10 && h<12) return {name:'London/NY Overlap',active:true,weight:0.8};
    return {name:'Off-Session',active:false,weight:0};
  }

  // ===== MARKET STRUCTURE (BOS/ChoCH) =====
  detectStructure(candles, swings) {
    const {highs, lows} = swings;
    let trend='neutral', bos=null, choch=null;
    const last = candles[candles.length-1].close;
    if (highs.length < 2 || lows.length < 2) return {trend, bos, choch};
    const sh = highs.slice(-3), sl = lows.slice(-3);
    const hh = sh.length>=2 && sh[sh.length-1].price > sh[sh.length-2].price;
    const hl = sl.length>=2 && sl[sl.length-1].price > sl[sl.length-2].price;
    const lh = sh.length>=2 && sh[sh.length-1].price < sh[sh.length-2].price;
    const ll = sl.length>=2 && sl[sl.length-1].price < sl[sl.length-2].price;
    if (hh && hl) trend = 'bullish';
    else if (lh && ll) trend = 'bearish';
    else if (hh && !hl) trend = 'bullish_weak';
    else if (ll && !lh) trend = 'bearish_weak';
    const lastSH = highs[highs.length-1];
    const lastSL = lows[lows.length-1];
    if ((trend==='bullish'||trend==='bullish_weak') && last > lastSH.price) {
      bos = {type:'bullish', level:lastSH.price};
    } else if ((trend==='bearish'||trend==='bearish_weak') && last < lastSL.price) {
      bos = {type:'bearish', level:lastSL.price};
    }
    if ((trend==='bullish'||trend==='bullish_weak') && last < lastSL.price) {
      choch = {type:'bearish_choch', level:lastSL.price};
    } else if ((trend==='bearish'||trend==='bearish_weak') && last > lastSH.price) {
      choch = {type:'bullish_choch', level:lastSH.price};
    }
    return {trend, bos, choch};
  }

  // ===== FVG - True 3-Candle Imbalance =====
  findFVGs(candles) {
    const bull=[], bear=[];
    for (let i=2; i<candles.length; i++) {
      const c1=candles[i-2], c3=candles[i];
      if (c3.low > c1.high) {
        const size = c3.low - c1.high;
        const avgRange = (c1.high-c1.low+candles[i-1].high-candles[i-1].low+c3.high-c3.low)/3;
        if (size > avgRange*0.1) bull.push({top:c3.low, bottom:c1.high, i, size, mid:(c3.low+c1.high)/2});
      }
      if (c1.low > c3.high) {
        const size = c1.low - c3.high;
        const avgRange = (c1.high-c1.low+candles[i-1].high-candles[i-1].low+c3.high-c3.low)/3;
        if (size > avgRange*0.1) bear.push({top:c1.low, bottom:c3.high, i, size, mid:(c1.low+c3.high)/2});
      }
    }
    return {bullish:bull, bearish:bear};
  }

  // ===== ORDER BLOCKS =====
  findOrderBlocks(candles) {
    const bullOBs=[], bearOBs=[];
    const atr = this.calcATR(candles);
    for (let i=1; i<candles.length-2; i++) {
      const c=candles[i], next=candles[i+1];
      const nBody = Math.abs(next.close-next.open);
      if (c.close < c.open && next.close > next.open) {
        if (nBody > atr*1.0 && next.close > c.high) {
          bullOBs.push({high:c.open, low:c.low, i, mid:(c.open+c.low)/2, strength: nBody/atr});
        }
      }
      if (c.close > c.open && next.close < next.open) {
        if (nBody > atr*1.0 && next.close < c.low) {
          bearOBs.push({high:c.high, low:c.open, i, mid:(c.high+c.open)/2, strength: nBody/atr});
        }
      }
    }
    return {bullish:bullOBs, bearish:bearOBs};
  }

  // ===== PREMIUM/DISCOUNT =====
  getPremiumDiscount(candles, swings) {
    const {highs, lows} = swings;
    if (!highs.length || !lows.length) return {zone:'equilibrium',eq:candles[candles.length-1].close};
    const rH = Math.max(...highs.slice(-4).map(h=>h.price));
    const rL = Math.min(...lows.slice(-4).map(l=>l.price));
    const range = rH-rL;
    const eq = rL+range*0.5;
    const last = candles[candles.length-1].close;
    let zone;
    if (last > eq+range*0.15) zone='premium';
    else if (last < eq-range*0.15) zone='discount';
    else zone='equilibrium';
    return {zone, eq, high:rH, low:rL};
  }

  // ===== OTE (Fib 0.618-0.786) =====
  findOTE(candles, swings, trend) {
    const {highs, lows} = swings;
    if (!highs.length || !lows.length) return null;
    const last = candles[candles.length-1].close;
    if (trend.includes('bullish') && lows.length>=1 && highs.length>=1) {
      const sL = lows[lows.length-1].price;
      const sH = highs[highs.length-1].price;
      if (sH > sL) {
        const r = sH-sL;
        const f618=sH-r*0.618, f786=sH-r*0.786, f705=sH-r*0.705;
        return {fib618:f618, fib786:f786, fib705:f705, inOTE:last>=f786&&last<=f618, dir:'long'};
      }
    } else if (trend.includes('bearish') && highs.length>=1 && lows.length>=1) {
      const sH = highs[highs.length-1].price;
      const sL = lows[lows.length-1].price;
      if (sH > sL) {
        const r = sH-sL;
        const f618=sL+r*0.618, f786=sL+r*0.786, f705=sL+r*0.705;
        return {fib618:f618, fib786:f786, fib705:f705, inOTE:last>=f618&&last<=f786, dir:'short'};
      }
    }
    return null;
  }

  // ===== LIQUIDITY POOLS =====
  findLiquidity(candles, swings) {
    const {highs, lows} = swings;
    const bsl=[], ssl=[];
    for (let i=0;i<highs.length-1;i++) {
      for (let j=i+1;j<highs.length;j++) {
        const d=Math.abs(highs[i].price-highs[j].price);
        const a=(highs[i].price+highs[j].price)/2;
        if (d/a<0.0015) bsl.push({level:a,type:'equal_highs'});
      }
    }
    for (let i=0;i<lows.length-1;i++) {
      for (let j=i+1;j<lows.length;j++) {
        const d=Math.abs(lows[i].price-lows[j].price);
        const a=(lows[i].price+lows[j].price)/2;
        if (d/a<0.0015) ssl.push({level:a,type:'equal_lows'});
      }
    }
    return {buyLiq:bsl, sellLiq:ssl};
  }

  // ===== DISPLACEMENT DETECTION =====
  hasDisplacement(candles, direction) {
    const atr = this.calcATR(candles);
    const recent = candles.slice(-5);
    for (const c of recent) {
      const body = Math.abs(c.close - c.open);
      if (direction==='bullish' && c.close>c.open && body>atr*1.5) return true;
      if (direction==='bearish' && c.close<c.open && body>atr*1.5) return true;
    }
    return false;
  }

  // ===== MAIN ANALYSIS - IMPROVED CONFLUENCE =====
  async analyze(pair, type='forex') {
    try {
      const candles = await this.fetchCandles(pair, type);
      if (!candles || candles.length < 30) return {signal:'NEUTRAL',confidence:0,reason:'Insufficient data',pair};
      const last = candles[candles.length-1].close;
      const swings = this.findSwings(candles);
      const structure = this.detectStructure(candles, swings);
      const fvgs = this.findFVGs(candles);
      const obs = this.findOrderBlocks(candles);
      const pd = this.getPremiumDiscount(candles, swings);
      const ote = this.findOTE(candles, swings, structure.trend);
      const liq = this.findLiquidity(candles, swings);
      const rsi = this.calcRSI(candles);
      const kz = this.getKillzone();
      const ema50 = this.calcEMA(candles, 50);
      const ema200 = this.calcEMA(candles, 200);
      const atr = this.calcATR(candles);
      const priceRange = last * 0.008;
      const src = this.getDataSource(pair, type);

      // ===== CONFLUENCE SCORING (max 20) =====
      let bull=0, bear=0;
      const factors=[];

      // 1. Market Structure (4pts)
      if (structure.trend==='bullish') {bull+=4; factors.push('Bullish Structure (HH+HL)');}
      else if (structure.trend==='bearish') {bear+=4; factors.push('Bearish Structure (LH+LL)');}
      else if (structure.trend==='bullish_weak') {bull+=2; factors.push('Weak Bullish Structure');}
      else if (structure.trend==='bearish_weak') {bear+=2; factors.push('Weak Bearish Structure');}

      // 2. BOS (3pts)
      if (structure.bos) {
        if (structure.bos.type==='bullish') {bull+=3; factors.push('Bullish BOS');}
        if (structure.bos.type==='bearish') {bear+=3; factors.push('Bearish BOS');}
      }

      // 3. ChoCH (2pts - reversal signal)
      if (structure.choch) {
        if (structure.choch.type==='bullish_choch') {bull+=2; factors.push('Bullish ChoCH');}
        if (structure.choch.type==='bearish_choch') {bear+=2; factors.push('Bearish ChoCH');}
      }

      // 4. Premium/Discount (2pts) - ICT: buy discount, sell premium
      if (pd.zone==='discount') {bull+=2; factors.push('Discount Zone');}
      if (pd.zone==='premium') {bear+=2; factors.push('Premium Zone');}

      // 5. OTE (2pts)
      if (ote && ote.inOTE) {
        if (ote.dir==='long') {bull+=2; factors.push('OTE Long (0.618-0.786)');}
        if (ote.dir==='short') {bear+=2; factors.push('OTE Short (0.618-0.786)');}
      }

      // 6. Order Blocks near price (2pts)
      const nearBullOB = obs.bullish.filter(ob=>last>=ob.low-priceRange&&last<=ob.high+priceRange);
      const nearBearOB = obs.bearish.filter(ob=>last>=ob.low-priceRange&&last<=ob.high+priceRange);
      if (nearBullOB.length>0) {bull+=2; factors.push('At Bullish OB ('+nearBullOB.length+')');}
      if (nearBearOB.length>0) {bear+=2; factors.push('At Bearish OB ('+nearBearOB.length+')');}

      // 7. FVGs near price (1pt)
      const rBullFVG = fvgs.bullish.filter(f=>f.i>=candles.length-20&&last>=f.bottom-priceRange&&last<=f.top+priceRange);
      const rBearFVG = fvgs.bearish.filter(f=>f.i>=candles.length-20&&last>=f.bottom-priceRange&&last<=f.top+priceRange);
      if (rBullFVG.length>0) {bull+=1; factors.push('Bullish FVG ('+rBullFVG.length+')');}
      if (rBearFVG.length>0) {bear+=1; factors.push('Bearish FVG ('+rBearFVG.length+')');}

      // 8. EMA alignment (2pts)
      if (last>ema50&&ema50>ema200) {bull+=2; factors.push('EMA 50>200 Bullish');}
      else if (last<ema50&&ema50<ema200) {bear+=2; factors.push('EMA 50<200 Bearish');}

      // 9. RSI (1pt)
      if (rsi<35) {bull+=1; factors.push('RSI Oversold ('+rsi.toFixed(0)+')');}
      else if (rsi>65) {bear+=1; factors.push('RSI Overbought ('+rsi.toFixed(0)+')');}

      // 10. Killzone (1pt)
      if (kz.active) {bull+=kz.weight; bear+=kz.weight; factors.push(kz.name+' Session');}

      // 11. Displacement (1pt)
      if (this.hasDisplacement(candles,'bullish')) {bull+=1; factors.push('Bullish Displacement');}
      if (this.hasDisplacement(candles,'bearish')) {bear+=1; factors.push('Bearish Displacement');}

      // ===== SIGNAL DETERMINATION =====
      const maxPts = 20;
      let signal, confidence, direction;
      const margin = Math.abs(bull-bear);

      if (bull>bear && bull>=7 && margin>=3) {
        signal='BUY'; confidence=Math.min(Math.round(bull/maxPts*100),95); direction='bullish';
      } else if (bear>bull && bear>=7 && margin>=3) {
        signal='SELL'; confidence=Math.min(Math.round(bear/maxPts*100),95); direction='bearish';
      } else {
        signal='NEUTRAL'; confidence=Math.round(Math.max(bull,bear)/maxPts*100); direction='neutral';
      }

      // ===== ENTRY/SL/TP with improved R:R =====
      let entry=last, sl, tp1, tp2, tp3, rr;
      if (signal==='BUY') {
        sl = nearBullOB.length>0 ? Math.min(...nearBullOB.map(o=>o.low)) - atr*0.3 : entry - atr*1.5;
        const risk = entry - sl;
        tp1=entry+risk*2; tp2=entry+risk*3; tp3=entry+risk*4.5;
        rr = ((tp1-entry)/risk).toFixed(1);
      } else if (signal==='SELL') {
        sl = nearBearOB.length>0 ? Math.max(...nearBearOB.map(o=>o.high)) + atr*0.3 : entry + atr*1.5;
        const risk = sl - entry;
        tp1=entry-risk*2; tp2=entry-risk*3; tp3=entry-risk*4.5;
        rr = ((entry-tp1)/risk).toFixed(1);
      } else {
        sl=entry-atr; tp1=entry+atr; tp2=entry+atr*2; tp3=entry+atr*3; rr='--';
      }

      return {
        signal, confidence, direction, entry,
        stopLoss:sl, tp1, tp2, tp3, riskReward:rr,
        structure:structure.trend, bos:structure.bos, choch:structure.choch,
        zone:pd.zone, ote, rsi:rsi.toFixed(1), killzone:kz,
        fvgs:{bullish:rBullFVG.length, bearish:rBearFVG.length, totalBull:fvgs.bullish.length, totalBear:fvgs.bearish.length},
        orderBlocks:{bullish:nearBullOB.length, bearish:nearBearOB.length, totalBull:obs.bullish.length, totalBear:obs.bearish.length},
        liquidity:liq, ema:{ema50:ema50.toFixed(5),ema200:ema200.toFixed(5)},
        factors, bullScore:bull, bearScore:bear,
        pair, timestamp:new Date().toISOString(),
        dataSource: src === 'Simulated' ? 'Simulated Data' : 'Real Market Data (' + src + ')'
      };
    } catch(err) {
      console.error('Analysis error:', err);
      return {signal:'NEUTRAL',confidence:0,reason:'Error: '+err.message,pair};
    }
  }
}
const ictAnalyzer = new ICTAnalyzer();
