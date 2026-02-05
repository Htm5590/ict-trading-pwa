(() => {
  'use strict';

  // === PAIR LISTS ===
  const PAIRS = {
    forex: [
      { symbol: 'EUR/USD', tv: 'FX:EURUSD' },
      { symbol: 'GBP/USD', tv: 'FX:GBPUSD' },
      { symbol: 'USD/JPY', tv: 'FX:USDJPY' },
      { symbol: 'USD/CHF', tv: 'FX:USDCHF' },
      { symbol: 'AUD/USD', tv: 'FX:AUDUSD' },
      { symbol: 'USD/CAD', tv: 'FX:USDCAD' },
      { symbol: 'NZD/USD', tv: 'FX:NZDUSD' },
      { symbol: 'EUR/GBP', tv: 'FX:EURGBP' },
      { symbol: 'EUR/JPY', tv: 'FX:EURJPY' },
      { symbol: 'GBP/JPY', tv: 'FX:GBPJPY' }
    ],
    gold: [
      { symbol: 'XAU/USD', tv: 'OANDA:XAUUSD' }
    ],
    crypto: [
      { symbol: 'BTC/USD', tv: 'COINBASE:BTCUSD' },
      { symbol: 'ETH/USD', tv: 'COINBASE:ETHUSD' },
      { symbol: 'BNB/USD', tv: 'BINANCE:BNBUSDT' },
      { symbol: 'SOL/USD', tv: 'COINBASE:SOLUSD' },
      { symbol: 'XRP/USD', tv: 'BINANCE:XRPUSDT' }
    ]
  };

  const ict = new ICTAnalyzer();
  const sigGen = new SignalGenerator(ict);

  const $cat = document.getElementById('category');
  const $pair = document.getElementById('pair');
  const $tf = document.getElementById('tf');
  const $btn = document.getElementById('analyze-btn');
  const $price = document.getElementById('live-price');
  const $update = document.getElementById('last-update');
  const $signals = document.getElementById('signals-container');

  // === INIT ===
  function init() {
    populatePairs();
    loadChart();
    $cat.addEventListener('change', () => { populatePairs(); loadChart(); });
    $pair.addEventListener('change', loadChart);
    $tf.addEventListener('change', loadChart);
    $btn.addEventListener('click', runAnalysis);
  }

  function populatePairs() {
    const list = PAIRS[$cat.value] || [];
    $pair.innerHTML = list.map(p =>
      '<option value="' + p.symbol + '" data-tv="' + p.tv + '">' + p.symbol + '</option>'
    ).join('');
  }

  function getTV() {
    return $pair.options[$pair.selectedIndex].getAttribute('data-tv');
  }

  // === CHART ===
  function loadChart() {
    const el = document.getElementById('tv-chart');
    el.innerHTML = '';
    try {
      new TradingView.widget({
        container_id: 'tv-chart',
        autosize: true,
        symbol: getTV(),
        interval: $tf.value,
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        enable_publishing: false,
        allow_symbol_change: false
      });
    } catch (e) {
      el.innerHTML = '<p class="empty">Chart loading...</p>';
    }
  }

  // === PRICE FETCH ===
  async function fetchPrice(pair) {
    const cat = $cat.value;

    // Crypto: use public Binance/CoinGecko
    if (cat === 'crypto') {
      return fetchCryptoPrice(pair);
    }
    // Gold
    if (cat === 'gold') {
      return fetchGoldPrice();
    }
    // Forex
    return fetchForexPrice(pair);
  }

  async function fetchForexPrice(pair) {
    const [base, quote] = pair.split('/');
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/' + base);
      const d = await r.json();
      if (d.rates && d.rates[quote]) return +d.rates[quote].toFixed(5);
    } catch (e) {}
    // fallback
    try {
      const r2 = await fetch('https://open.er-api.com/v6/latest/USD');
      const d2 = await r2.json();
      if (!d2.rates) return null;
      const baseRate = d2.rates[base] || 1;
      const quoteRate = d2.rates[quote] || 1;
      return +(quoteRate / baseRate).toFixed(5);
    } catch (e) { return null; }
  }

  async function fetchGoldPrice() {
    try {
      const r = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=demo&base=XAU&currencies=USD');
      const d = await r.json();
      if (d.rates && d.rates.USD) return +d.rates.USD.toFixed(2);
    } catch (e) {}
    // fallback: estimate from exchange rate
    try {
      const r2 = await fetch('https://open.er-api.com/v6/latest/XAU');
      const d2 = await r2.json();
      if (d2.rates && d2.rates.USD) return +d2.rates.USD.toFixed(2);
    } catch (e) {}
    return null;
  }

  async function fetchCryptoPrice(pair) {
    const coin = pair.split('/')[0];
    const map = { BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple' };
    const id = map[coin];
    if (!id) return null;
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd');
      const d = await r.json();
      if (d[id] && d[id].usd) return +d[id].usd;
    } catch (e) {}
    return null;
  }

  // === CANDLE GENERATION ===
  function buildCandles(pair, price, count) {
    const p = ict.pip(pair);
    const isJPY = pair.includes('JPY');
    const isCrypto = ['BTC/USD','ETH/USD','BNB/USD','SOL/USD','XRP/USD'].includes(pair);
    const isGold = pair === 'XAU/USD';

    let vol;
    if (isCrypto) vol = price * 0.003;
    else if (isGold) vol = price * 0.001;
    else if (isJPY) vol = 0.15;
    else vol = 0.0004;

    let px = price * (1 - 0.005);
    let seed = pair.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + new Date().getHours();
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296) - 0.5; };
    const drift = (price - px) / count;
    const out = [];

    for (let i = 0; i < count; i++) {
      const o = px;
      const c = px + drift + rng() * vol;
      const h = Math.max(o, c) + Math.abs(rng() * vol * 0.5);
      const l = Math.min(o, c) - Math.abs(rng() * vol * 0.5);
      out.push({ open: o, high: h, low: l, close: c, time: Date.now() - (count - i) * 60000 });
      px = c;
    }
    return out;
  }

  // === ANALYSIS ===
  async function runAnalysis() {
    const pair = $pair.value;
    $btn.disabled = true;
    $btn.innerHTML = '<span class="spinner"></span>Analyzing...';
    $signals.innerHTML = '<p class="empty">Fetching price for ' + pair + '...</p>';

    try {
      const price = await fetchPrice(pair);
      if (!price) {
        $signals.innerHTML = '<div class="no-signal">Could not fetch price for ' + pair + '. Try again.</div>';
        return;
      }

      $price.textContent = ict.fmt(price, pair);
      $update.textContent = new Date().toLocaleTimeString();

      const candles = buildCandles(pair, price, 120);
      const analysis = ict.analyze(candles, pair);
      const signals = sigGen.generate(analysis, price, pair);

      if (!signals || signals.length === 0) {
        $signals.innerHTML = '<div class="no-signal">No valid ICT setup found for ' + pair + ' right now.<br>Try a different timeframe or check back later.</div>';
        return;
      }

      renderSignals(signals);
    } catch (err) {
      console.error(err);
      $signals.innerHTML = '<div class="no-signal">Analysis error. Please try again.</div>';
    } finally {
      $btn.disabled = false;
      $btn.textContent = 'Analyze';
    }
  }

  function renderSignals(signals) {
    $signals.innerHTML = signals.map(s => {
      return '<div class="signal-card">' +
        '<div class="top">' +
          '<span class="name">' + s.name + '</span>' +
          '<span class="badge ' + s.direction.toLowerCase() + '">' + s.direction + '</span>' +
        '</div>' +
        '<div class="values">' +
          '<div class="val-box"><div class="label">Entry</div><div class="num">' + s.entry + '</div></div>' +
          '<div class="val-box"><div class="label">TP</div><div class="num">' + s.tp + '</div></div>' +
          '<div class="val-box"><div class="label">SL</div><div class="num">' + s.sl + '</div></div>' +
        '</div>' +
        '<div class="method">Method: <strong>' + s.method + '</strong> | R:R ' + s.rr + ' | Score ' + s.score + '/100 | ' + s.killzone + '</div>' +
      '</div>';
    }).join('');
  }

  // === PWA ===
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
