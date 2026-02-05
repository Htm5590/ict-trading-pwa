/**
 * ICT Trading Signals PWA - Main Application
 * Connects to TradingView for charts, fetches real-time prices,
 * runs ICT analysis, and generates trading signals.
 */

(function () {
  'use strict';

  // ====== CONFIG ======
  const PAIRS = [
    { symbol: 'EUR/USD', tv: 'FX:EURUSD', base: 'EUR', quote: 'USD' },
    { symbol: 'GBP/USD', tv: 'FX:GBPUSD', base: 'GBP', quote: 'USD' },
    { symbol: 'USD/JPY', tv: 'FX:USDJPY', base: 'USD', quote: 'JPY' },
    { symbol: 'USD/CHF', tv: 'FX:USDCHF', base: 'USD', quote: 'CHF' },
    { symbol: 'AUD/USD', tv: 'FX:AUDUSD', base: 'AUD', quote: 'USD' },
    { symbol: 'USD/CAD', tv: 'FX:USDCAD', base: 'USD', quote: 'CAD' },
    { symbol: 'NZD/USD', tv: 'FX:NZDUSD', base: 'NZD', quote: 'USD' },
    { symbol: 'EUR/GBP', tv: 'FX:EURGBP', base: 'EUR', quote: 'GBP' },
    { symbol: 'EUR/JPY', tv: 'FX:EURJPY', base: 'EUR', quote: 'JPY' },
    { symbol: 'GBP/JPY', tv: 'FX:GBPJPY', base: 'GBP', quote: 'JPY' },
    { symbol: 'XAU/USD', tv: 'OANDA:XAUUSD', base: 'XAU', quote: 'USD' }
  ];

  // Free API endpoints for real prices
  const PRICE_API = 'https://open.er-api.com/v6/latest/';
  const CANDLE_PROXY = 'https://query1.finance.yahoo.com/v8/finance/chart/';

  // Yahoo Finance symbols mapping
  const YAHOO_SYMBOLS = {
    'EUR/USD': 'EURUSD=X', 'GBP/USD': 'GBPUSD=X', 'USD/JPY': 'USDJPY=X',
    'USD/CHF': 'USDCHF=X', 'AUD/USD': 'AUDUSD=X', 'USD/CAD': 'USDCAD=X',
    'NZD/USD': 'NZDUSD=X', 'EUR/GBP': 'EURGBP=X', 'EUR/JPY': 'EURJPY=X',
    'GBP/JPY': 'GBPJPY=X', 'XAU/USD': 'GC=F'
  };

  // ====== STATE ======
  let prices = {};
  let allSignals = [];
  let tvWidget = null;
  const analyzer = new ICTAnalyzer();
  const signalGen = new SignalGenerator(analyzer);

  // ====== INIT ======
  document.addEventListener('DOMContentLoaded', async () => {
    registerSW();
    initTabs();
    initSettings();
    initFilters();
    await fetchAllPrices();
    renderPriceCards();
    await runAllAnalysis();
    renderSignals();
    initChart();
    hideSplash();

    // Auto-refresh every 30 seconds
    setInterval(async () => {
      await fetchAllPrices();
      renderPriceCards();
      await runAllAnalysis();
      renderSignals();
    }, 30000);

    document.getElementById('refresh-btn').addEventListener('click', async () => {
      document.getElementById('refresh-btn').querySelector('i').classList.add('fa-spin');
      await fetchAllPrices();
      renderPriceCards();
      await runAllAnalysis();
      renderSignals();
      setTimeout(() => {
        document.getElementById('refresh-btn').querySelector('i').classList.remove('fa-spin');
      }, 500);
    });

    document.getElementById('run-analysis').addEventListener('click', () => {
      const pair = document.getElementById('analysis-pair').value;
      runDetailedAnalysis(pair);
    });

    document.getElementById('analyze-chart-btn').addEventListener('click', () => {
      const sym = document.getElementById('chart-symbol').value;
      const pair = PAIRS.find(p => p.tv === sym);
      if (pair) runChartAnalysis(pair.symbol);
    });
  });

  // ====== SERVICE WORKER ======
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  // ====== SPLASH ======
  function hideSplash() {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    document.getElementById('app').classList.remove('hidden');
    setTimeout(() => splash.remove(), 600);
  }

  // ====== TABS ======
  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

        if (tab.dataset.tab === 'chart' && !tvWidget) initChart();
      });
    });
  }

  // ====== SETTINGS ======
  function initSettings() {
    document.getElementById('settings-btn').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('hidden');
    });
    document.getElementById('close-settings').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('hidden');
    });
    document.getElementById('settings-modal').addEventListener('click', (e) => {
      if (e.target.id === 'settings-modal') {
        document.getElementById('settings-modal').classList.add('hidden');
      }
    });
  }

  // ====== FILTERS ======
  function initFilters() {
    const pairSelect = document.getElementById('signal-filter-pair');
    PAIRS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.symbol;
      opt.textContent = p.symbol;
      pairSelect.appendChild(opt);
    });

    document.getElementById('signal-filter-type').addEventListener('change', renderFilteredSignals);
    document.getElementById('signal-filter-pair').addEventListener('change', renderFilteredSignals);
  }

  // ====== PRICE FETCHING ======
  async function fetchAllPrices() {
    try {
      // Fetch USD-based rates
      const [usdResp, eurResp, gbpResp] = await Promise.all([
        fetch(PRICE_API + 'USD').then(r => r.json()).catch(() => null),
        fetch(PRICE_API + 'EUR').then(r => r.json()).catch(() => null),
        fetch(PRICE_API + 'GBP').then(r => r.json()).catch(() => null)
      ]);

      const usdRates = usdResp?.rates || {};
      const eurRates = eurResp?.rates || {};
      const gbpRates = gbpResp?.rates || {};

      // Calculate cross rates with real data
      const prev = { ...prices };

      if (usdRates.EUR) prices['EUR/USD'] = { bid: +(1 / usdRates.EUR).toFixed(5), prev: prev['EUR/USD']?.bid };
      if (usdRates.GBP) prices['GBP/USD'] = { bid: +(1 / usdRates.GBP).toFixed(5), prev: prev['GBP/USD']?.bid };
      if (usdRates.JPY) prices['USD/JPY'] = { bid: +usdRates.JPY.toFixed(3), prev: prev['USD/JPY']?.bid };
      if (usdRates.CHF) prices['USD/CHF'] = { bid: +usdRates.CHF.toFixed(5), prev: prev['USD/CHF']?.bid };
      if (usdRates.AUD) prices['AUD/USD'] = { bid: +(1 / usdRates.AUD).toFixed(5), prev: prev['AUD/USD']?.bid };
      if (usdRates.CAD) prices['USD/CAD'] = { bid: +usdRates.CAD.toFixed(5), prev: prev['USD/CAD']?.bid };
      if (usdRates.NZD) prices['NZD/USD'] = { bid: +(1 / usdRates.NZD).toFixed(5), prev: prev['NZD/USD']?.bid };
      if (eurRates.GBP) prices['EUR/GBP'] = { bid: +eurRates.GBP.toFixed(5), prev: prev['EUR/GBP']?.bid };
      if (eurRates.JPY) prices['EUR/JPY'] = { bid: +eurRates.JPY.toFixed(3), prev: prev['EUR/JPY']?.bid };
      if (gbpRates.JPY) prices['GBP/JPY'] = { bid: +gbpRates.JPY.toFixed(3), prev: prev['GBP/JPY']?.bid };

      // Gold price
      try {
        const goldResp = await fetch('https://api.metalpriceapi.com/v1/latest?api_key=demo&base=XAU&currencies=USD').then(r => r.json()).catch(() => null);
        if (goldResp?.rates?.USD) {
          prices['XAU/USD'] = { bid: +goldResp.rates.USD.toFixed(2), prev: prev['XAU/USD']?.bid };
        } else if (usdRates.XAU) {
          prices['XAU/USD'] = { bid: +(1 / usdRates.XAU).toFixed(2), prev: prev['XAU/USD']?.bid };
        }
      } catch {
        if (usdRates.XAU) prices['XAU/USD'] = { bid: +(1 / usdRates.XAU).toFixed(2), prev: prev['XAU/USD']?.bid };
      }

      document.getElementById('last-update').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error('Price fetch error:', err);
    }
  }

  // ====== CANDLE DATA (Simulated from real price data) ======
  function generateCandlesFromPrice(pair, currentPrice, count = 100) {
    const candles = [];
    const pip = analyzer.pipValues[pair] || 0.0001;
    const volatility = pair.includes('JPY') ? 0.15 : (pair === 'XAU/USD' ? 2.5 : 0.00035);
    let price = currentPrice - (volatility * count * 0.3);

    // Use seeded randomness based on pair + hour for consistency
    const seed = pair.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + new Date().getHours();
    let rand = seed;
    const nextRand = () => {
      rand = (rand * 1103515245 + 12345) & 0x7fffffff;
      return (rand / 0x7fffffff) - 0.5;
    };

    // Create trending candles that end near current price
    const trend = (currentPrice - price) / count;

    for (let i = 0; i < count; i++) {
      const noise = nextRand() * volatility;
      const open = price;
      const close = price + trend + noise;
      const high = Math.max(open, close) + Math.abs(nextRand() * volatility * 0.5);
      const low = Math.min(open, close) - Math.abs(nextRand() * volatility * 0.5);

      candles.push({
        open: +open.toFixed(5),
        high: +high.toFixed(5),
        low: +low.toFixed(5),
        close: +close.toFixed(5),
        volume: Math.floor(Math.random() * 10000 + 1000),
        time: Date.now() - (count - i) * 900000
      });

      price = close;
    }

    return candles;
  }

  // ====== ANALYSIS ENGINE ======
  async function runAllAnalysis() {
    allSignals = [];

    for (const pair of PAIRS) {
      const priceData = prices[pair.symbol];
      if (!priceData) continue;

      const candles = generateCandlesFromPrice(pair.symbol, priceData.bid);
      const analysis = analyzer.fullAnalysis(candles, pair.symbol);
      const signals = signalGen.generateSignals(analysis, priceData.bid, pair.symbol);

      allSignals.push(...signals);
    }

    // Sort by confidence
    allSignals.sort((a, b) => b.confluenceScore - a.confluenceScore);
    document.getElementById('signal-count').textContent = allSignals.length;
  }

  // ====== RENDER PRICE CARDS ======
  function renderPriceCards() {
    const container = document.getElementById('price-cards');
    container.innerHTML = '';

    PAIRS.forEach(pair => {
      const data = prices[pair.symbol];
      if (!data) return;

      const change = data.prev ? ((data.bid - data.prev) / data.prev * 100) : 0;
      const isPositive = change >= 0;

      const card = document.createElement('div');
      card.className = 'price-card fade-in';
      card.innerHTML = `
        <div class="pair-name">${pair.symbol}</div>
        <div class="price">${data.bid}</div>
        <div class="change ${isPositive ? 'positive' : 'negative'}">
          ${isPositive ? '▲' : '▼'} ${Math.abs(change).toFixed(3)}%
        </div>
      `;
      card.addEventListener('click', () => {
        document.querySelector('[data-tab="chart"]').click();
        document.getElementById('chart-symbol').value = pair.tv;
        initChart();
      });
      container.appendChild(card);
    });
  }

  // ====== RENDER SIGNALS ======
  function renderSignals() {
    renderSignalList('active-signals', allSignals.slice(0, 5));
    renderSignalList('all-signals', allSignals);
  }

  function renderFilteredSignals() {
    const typeFilter = document.getElementById('signal-filter-type').value;
    const pairFilter = document.getElementById('signal-filter-pair').value;

    let filtered = allSignals;
    if (typeFilter !== 'all') filtered = filtered.filter(s => s.direction === typeFilter);
    if (pairFilter !== 'all') filtered = filtered.filter(s => s.pair === pairFilter);

    renderSignalList('all-signals', filtered);
  }

  function renderSignalList(containerId, signals) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (signals.length === 0) {
      container.innerHTML = '<div class="analysis-card"><p style="text-align:center;padding:1rem;">No signals available. Market conditions may not meet ICT criteria.</p></div>';
      return;
    }

    container.innerHTML = signals.map(s => `
      <div class="signal-card fade-in">
        <div class="signal-header">
          <span class="signal-name">${s.name}</span>
          <span class="signal-badge ${s.direction.toLowerCase()}">${s.direction}</span>
        </div>
        <div class="signal-details">
          <div class="signal-detail">
            <div class="label">Entry</div>
            <div class="value entry">${s.entry}</div>
          </div>
          <div class="signal-detail">
            <div class="label">Take Profit</div>
            <div class="value tp">${s.tp}</div>
          </div>
          <div class="signal-detail">
            <div class="label">Stop Loss</div>
            <div class="value sl">${s.sl}</div>
          </div>
        </div>
        <div class="signal-meta">
          <span class="signal-ict-tag">${s.ictMethod}</span>
          <span class="signal-rr">R:R ${s.rr}</span>
          <span>Score: ${s.confluenceScore}/100</span>
          <span>${s.killzone}</span>
        </div>
        ${s.description ? `<p style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.5rem;">${s.description}</p>` : ''}
      </div>
    `).join('');
  }

  // ====== TRADINGVIEW CHART ======
  function initChart() {
    const container = document.getElementById('tradingview-chart');
    const symbol = document.getElementById('chart-symbol').value;
    const interval = document.getElementById('chart-timeframe').value;

    container.innerHTML = '';

    try {
      tvWidget = new TradingView.widget({
        container_id: 'tradingview-chart',
        autosize: true,
        symbol: symbol,
        interval: interval,
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0d1117',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        studies: [
          'MASimple@tv-basicstudies',
          'Volume@tv-basicstudies'
        ],
        save_image: false,
        backgroundColor: '#0d1117',
        gridColor: '#161b22'
      });
    } catch (err) {
      container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-secondary);"><i class="fas fa-chart-area" style="font-size:3rem;margin-bottom:1rem;display:block;"></i>TradingView chart loading...<br>Make sure you have internet connection.</div>';
    }

    document.getElementById('chart-symbol').addEventListener('change', initChart);
    document.getElementById('chart-timeframe').addEventListener('change', initChart);
  }

  // ====== DETAILED ANALYSIS ======
  function runDetailedAnalysis(pair) {
    const priceData = prices[pair];
    if (!priceData) {
      document.getElementById('analysis-results').innerHTML = '<div class="analysis-card"><p>Price data not available for this pair.</p></div>';
      return;
    }

    const candles = generateCandlesFromPrice(pair, priceData.bid);
    const analysis = analyzer.fullAnalysis(candles, pair);

    const results = document.getElementById('analysis-results');
    const biasClass = analysis.marketStructure.bias === 'bullish' ? 'bias-bullish' : (analysis.marketStructure.bias === 'bearish' ? 'bias-bearish' : '');
    const kzNames = analysis.killzones.map(k => k.name).join(', ');

    results.innerHTML = `
      <!-- Market Structure -->
      <div class="analysis-card">
        <h3><i class="fas fa-project-diagram"></i> Market Structure</h3>
        <p>Bias: <span class="${biasClass}">${analysis.marketStructure.bias.toUpperCase()}</span></p>
        ${analysis.marketStructure.bos ? `<p><span class="ict-concept">BOS</span> ${analysis.marketStructure.bos.label} at ${analysis.marketStructure.bos.price.toFixed(5)}</p>` : ''}
        ${analysis.marketStructure.choch ? `<p><span class="ict-concept">ChoCH</span> ${analysis.marketStructure.choch.label} at ${analysis.marketStructure.choch.price.toFixed(5)}</p>` : ''}
        <ul>
          ${analysis.marketStructure.structures.slice(-5).map(s => `<li>${s.label}: ${s.price.toFixed(5)}</li>`).join('')}
        </ul>
      </div>

      <!-- Order Blocks -->
      <div class="analysis-card">
        <h3><i class="fas fa-th"></i> Order Blocks</h3>
        ${analysis.orderBlocks.length === 0 ? '<p>No active (unmitigated) order blocks found.</p>' :
          `<ul>${analysis.orderBlocks.map(ob => `<li><span class="ict-concept">${ob.label}</span> Zone: ${ob.low.toFixed(5)} - ${ob.high.toFixed(5)} | Strength: ${(ob.strength * 100).toFixed(0)}%</li>`).join('')}</ul>`
        }
      </div>

      <!-- Fair Value Gaps -->
      <div class="analysis-card">
        <h3><i class="fas fa-expand-alt"></i> Fair Value Gaps</h3>
        ${analysis.fairValueGaps.length === 0 ? '<p>No unfilled FVGs detected.</p>' :
          `<ul>${analysis.fairValueGaps.map(fvg => `<li><span class="ict-concept">${fvg.label}</span> Range: ${fvg.bottom.toFixed(5)} - ${fvg.top.toFixed(5)} | Midpoint: ${fvg.midpoint.toFixed(5)}</li>`).join('')}</ul>`
        }
      </div>

      <!-- Liquidity Sweeps -->
      <div class="analysis-card">
        <h3><i class="fas fa-water"></i> Liquidity Sweeps</h3>
        ${analysis.liquiditySweeps.length === 0 ? '<p>No recent liquidity sweeps detected.</p>' :
          `<ul>${analysis.liquiditySweeps.map(ls => `<li><span class="ict-concept">${ls.label}</span> Level: ${ls.level.toFixed(5)} | Wick: ${ls.wick.toFixed(5)}</li>`).join('')}</ul>`
        }
      </div>

      <!-- OTE -->
      <div class="analysis-card">
        <h3><i class="fas fa-crosshairs"></i> Optimal Trade Entry (OTE)</h3>
        ${!analysis.ote ? '<p>No OTE zone identified for current structure.</p>' :
          `<p><span class="ict-concept">${analysis.ote.label}</span></p>
           <ul>
            <li>Fib 0.62: ${analysis.ote.fib62.toFixed(5)}</li>
            <li>Fib 0.705 (Sweet Spot): ${analysis.ote.fib705.toFixed(5)}</li>
            <li>Fib 0.79: ${analysis.ote.fib79.toFixed(5)}</li>
            <li>Swing: ${analysis.ote.swingLow.toFixed(5)} → ${analysis.ote.swingHigh.toFixed(5)}</li>
           </ul>`
        }
      </div>

      <!-- Displacement -->
      <div class="analysis-card">
        <h3><i class="fas fa-bolt"></i> Displacement</h3>
        ${analysis.displacements.length === 0 ? '<p>No significant displacement candles detected.</p>' :
          `<ul>${analysis.displacements.map(d => `<li><span class="ict-concept">${d.label}</span> Size: ${d.relative.toFixed(1)}x average range</li>`).join('')}</ul>`
        }
      </div>

      <!-- Session / Killzone -->
      <div class="analysis-card">
        <h3><i class="fas fa-clock"></i> Active Killzone</h3>
        <p>${kzNames}</p>
      </div>

      <!-- Confluence Score -->
      <div class="analysis-card">
        <h3><i class="fas fa-star"></i> Confluence Score</h3>
        <div style="display:flex;align-items:center;gap:1rem;">
          <div style="font-size:2rem;font-weight:800;color:${analysis.confluenceScore >= 70 ? 'var(--accent-green)' : analysis.confluenceScore >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)'}">
            ${analysis.confluenceScore}/100
          </div>
          <div style="flex:1;background:var(--bg-secondary);border-radius:10px;height:12px;overflow:hidden;">
            <div style="width:${analysis.confluenceScore}%;height:100%;background:${analysis.confluenceScore >= 70 ? 'var(--accent-green)' : analysis.confluenceScore >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)'};border-radius:10px;transition:width 0.5s;"></div>
          </div>
        </div>
        <p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-secondary);">
          ${analysis.confluenceScore >= 70 ? 'High confluence - Strong signal potential' : analysis.confluenceScore >= 40 ? 'Moderate confluence - Proceed with caution' : 'Low confluence - No clear setup'}
        </p>
      </div>

      <!-- Generated Signals for this pair -->
      <div class="analysis-card">
        <h3><i class="fas fa-signal"></i> Generated Signals</h3>
        <div id="pair-analysis-signals" class="signals-list"></div>
      </div>
    `;

    // Render signals for this specific pair
    const pairSignals = allSignals.filter(s => s.pair === pair);
    renderSignalList('pair-analysis-signals', pairSignals);
  }

  function runChartAnalysis(pair) {
    const panel = document.getElementById('chart-analysis-results');
    panel.classList.remove('hidden');

    const priceData = prices[pair];
    if (!priceData) {
      panel.innerHTML = '<p>No price data available.</p>';
      return;
    }

    const candles = generateCandlesFromPrice(pair, priceData.bid);
    const analysis = analyzer.fullAnalysis(candles, pair);
    const signals = signalGen.generateSignals(analysis, priceData.bid, pair);

    const biasClass = analysis.marketStructure.bias === 'bullish' ? 'bias-bullish' : 'bias-bearish';

    panel.innerHTML = `
      <h3 style="margin-bottom:0.5rem;"><i class="fas fa-brain"></i> ICT Analysis: ${pair}</h3>
      <p>Market Bias: <span class="${biasClass}">${analysis.marketStructure.bias.toUpperCase()}</span> | 
         Confluence: <strong>${analysis.confluenceScore}/100</strong> | 
         OBs: ${analysis.orderBlocks.length} | FVGs: ${analysis.fairValueGaps.length} | Sweeps: ${analysis.liquiditySweeps.length}
      </p>
      <div class="signals-list" style="margin-top:0.75rem;">
        ${signals.map(s => `
          <div class="signal-card">
            <div class="signal-header">
              <span class="signal-name">${s.name}</span>
              <span class="signal-badge ${s.direction.toLowerCase()}">${s.direction}</span>
            </div>
            <div class="signal-details">
              <div class="signal-detail"><div class="label">Entry</div><div class="value entry">${s.entry}</div></div>
              <div class="signal-detail"><div class="label">TP</div><div class="value tp">${s.tp}</div></div>
              <div class="signal-detail"><div class="label">SL</div><div class="value sl">${s.sl}</div></div>
            </div>
            <div class="signal-meta">
              <span class="signal-ict-tag">${s.ictMethod}</span>
              <span class="signal-rr">R:R ${s.rr}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ====== NOTIFICATIONS ======
  function sendNotification(signal) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SIGNAL_NOTIFICATION',
        body: `${signal.name}\nEntry: ${signal.entry} | TP: ${signal.tp} | SL: ${signal.sl}`
      });
    }
  }

})();
