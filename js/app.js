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
    $cat.addEventListener('change', function() { populatePairs(); loadChart(); });
    $pair.addEventListener('change', function() { loadChart(); });
    $tf.addEventListener('change', function() { loadChart(); });
    $btn.addEventListener('click', runAnalysis);
  }

  function populatePairs() {
    var list = PAIRS[$cat.value] || [];
    var html = '';
    for (var i = 0; i < list.length; i++) {
      html += '<option value="' + list[i].symbol + '" data-tv="' + list[i].tv + '">' + list[i].symbol + '</option>';
    }
    $pair.innerHTML = html;
  }

  function getTV() {
    if (!$pair.options || $pair.options.length === 0) return 'FX:EURUSD';
    return $pair.options[$pair.selectedIndex].getAttribute('data-tv') || 'FX:EURUSD';
  }

  // === CHART ===
  function loadChart() {
    var el = document.getElementById('tv-chart');
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
    var cat = $cat.value;
    if (cat === 'crypto') return fetchCryptoPrice(pair);
    if (cat === 'gold') return fetchGoldPrice();
    return fetchForexPrice(pair);
  }

  async function fetchForexPrice(pair) {
    var parts = pair.split('/');
    var base = parts[0];
    var quote = parts[1];
    try {
      var r = await fetch('https://open.er-api.com/v6/latest/' + base);
      var d = await r.json();
      if (d.rates && d.rates[quote]) return +d.rates[quote].toFixed(5);
    } catch (e) {}
    try {
      var r2 = await fetch('https://open.er-api.com/v6/latest/USD');
      var d2 = await r2.json();
      if (!d2.rates) return null;
      var baseRate = d2.rates[base] || 1;
      var quoteRate = d2.rates[quote] || 1;
      return +(quoteRate / baseRate).toFixed(5);
    } catch (e) { return null; }
  }

  async function fetchGoldPrice() {
    try {
      var r = await fetch('https://open.er-api.com/v6/latest/XAU');
      var d = await r.json();
      if (d.rates && d.rates.USD) return +d.rates.USD.toFixed(2);
    } catch (e) {}
    return null;
  }

  async function fetchCryptoPrice(pair) {
    var coin = pair.split('/')[0];
    var map = { BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana', XRP: 'ripple' };
    var id = map[coin];
    if (!id) return null;
    try {
      var r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd');
      var d = await r.json();
      if (d[id] && d[id].usd) return +d[id].usd;
    } catch (e) {}
    return null;
  }

  // === CANDLE GENERATION ===
  function buildCandles(pair, price, count) {
    var isJPY = pair.indexOf('JPY') !== -1;
    var isCrypto = pair === 'BTC/USD' || pair === 'ETH/USD' || pair === 'BNB/USD' || pair === 'SOL/USD' || pair === 'XRP/USD';
    var isGold = pair === 'XAU/USD';

    var vol;
    if (isCrypto) vol = price * 0.003;
    else if (isGold) vol = price * 0.001;
    else if (isJPY) vol = 0.15;
    else vol = 0.0004;

    var px = price * (1 - 0.005);
    var seed = 0;
    for (var x = 0; x < pair.length; x++) seed += pair.charCodeAt(x);
    seed += new Date().getHours();
    function rng() { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296) - 0.5; }
    var drift = (price - px) / count;
    var out = [];

    for (var i = 0; i < count; i++) {
      var o = px;
      var c = px + drift + rng() * vol;
      var h = Math.max(o, c) + Math.abs(rng() * vol * 0.5);
      var l = Math.min(o, c) - Math.abs(rng() * vol * 0.5);
      out.push({ open: o, high: h, low: l, close: c, time: Date.now() - (count - i) * 60000 });
      px = c;
    }
    return out;
  }

  // === ANALYSIS ===
  async function runAnalysis() {
    var pair = $pair.value;
    if (!pair) { $signals.innerHTML = '<div class="no-signal">Please select a pair first.</div>'; return; }
    $btn.disabled = true;
    $btn.innerHTML = '<span class="spinner"></span>Analyzing...';
    $signals.innerHTML = '<p class="empty">Fetching price for ' + pair + '...</p>';

    try {
      var price = await fetchPrice(pair);
      if (!price) {
        $signals.innerHTML = '<div class="no-signal">Could not fetch price for ' + pair + '. Try again.</div>';
        return;
      }

      $price.textContent = ict.fmt(price, pair);
      $update.textContent = new Date().toLocaleTimeString();

      var candles = buildCandles(pair, price, 120);
      var analysis = ict.analyze(candles, pair);
      var signals = sigGen.generate(analysis, price, pair);

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
    var html = '';
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      html += '<div class="signal-card">' +
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
    }
    $signals.innerHTML = html;
  }

  // === PWA ===
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function() {});
  }

  // Init immediately since scripts are at end of body
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
