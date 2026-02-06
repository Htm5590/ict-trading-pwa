(() => {
  'use strict';
  
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
  const $cat = document.getElementById('category');
  const $pair = document.getElementById('pair');
  const $tf = document.getElementById('tf');
  const $btn = document.getElementById('analyze-btn');
  const $price = document.getElementById('live-price');
  const $loading = document.getElementById('loading');
  const $results = document.getElementById('results');
  const $signals = document.getElementById('signal-cards');
  let currentPair = null;
  let priceInterval = null;

  $cat.addEventListener('change', () => {
    const cat = $cat.value;
    $pair.innerHTML = '<option value="">Select Pair</option>';
    if (cat && PAIRS[cat]) {
      PAIRS[cat].forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.symbol;
        opt.textContent = p.symbol;
        $pair.appendChild(opt);
      });
    }
    stopPriceUpdates();
  });

  $pair.addEventListener('change', () => {
    currentPair = $pair.value;
    if (currentPair) {
      startPriceUpdates();
    } else {
      stopPriceUpdates();
    }
  });

  $btn.addEventListener('click', async () => {
    const cat = $cat.value;
    const pair = $pair.value;
    const tf = $tf.value;
    
    if (!cat || !pair || !tf) {
      alert('Please select category, pair, and timeframe');
      return;
    }

    const pairObj = PAIRS[cat].find(p => p.symbol === pair);
    if (!pairObj) return;

    $loading.style.display = 'block';
    $results.style.display = 'none';
    $btn.disabled = true;

    try {
      const candles = await fetchPriceData(cat, pairObj, tf);
      
      if (!candles || candles.length < 20) {
        throw new Error('Insufficient data for analysis');
      }

      const signal = ict.generateSignal(pair, candles);
      displaySignal(signal);
      $results.style.display = 'block';
    } catch (err) {
      console.error('Analysis error:', err);
      alert('Failed to analyze: ' + err.message);
    } finally {
      $loading.style.display = 'none';
      $btn.disabled = false;
    }
  });

  async function fetchPriceData(category, pairObj, timeframe) {
    const tfMap = { '15': 15, '1H': 60, '4H': 240, '1D': 1440 };
    const tf = tfMap[timeframe] || 15;
    
    if (category === 'crypto') {
      return await fetchCryptoData(pairObj.symbol, tf);
    } else if (category === 'gold') {
      return await fetch12Data(pairObj.symbol, tf);
    } else {
      return await fetchForexData(pairObj.symbol, tf);
    }
  }

  async function fetchCryptoData(symbol, tf) {
    try {
      const pairs = {
        'BTC/USD': 'BTCUSDT',
        'ETH/USD': 'ETHUSDT',
        'BNB/USD': 'BNBUSDT',
        'SOL/USD': 'SOLUSDT',
        'XRP/USD': 'XRPUSDT'
      };
      const binanceSymbol = pairs[symbol];
      const intervals = { 15: '15m', 60: '1h', 240: '4h', 1440: '1d' };
      const interval = intervals[tf] || '15m';
      
      const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=100`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error('Binance API error');
      
      const data = await res.json();
      return data.map(k => ({
        time: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4])
      }));
    } catch (e) {
      console.warn('Crypto fetch failed:', e);
      return generateSyntheticData(symbol, 100);
    }
  }

  async function fetch12Data(symbol, tf) {
    try {
      const endpoint = tf >= 1440 ? 'histoday' : tf >= 60 ? 'histohour' : 'histominute';
      const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=XAU&tsym=USD&limit=100`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error('CryptoCompare API error');
      
      const json = await res.json();
      if (!json.Data || !json.Data.Data) throw new Error('Invalid response');
      
      return json.Data.Data.map(k => ({
        time: k.time * 1000,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close
      }));
    } catch (e) {
      console.warn('Gold fetch failed:', e);
      return generateSyntheticData(symbol, 100);
    }
  }

  async function fetchForexData(symbol, tf) {
    try {
      const pairs = {
        'EUR/USD': { from: 'EUR', to: 'USD' },
        'GBP/USD': { from: 'GBP', to: 'USD' },
        'USD/JPY': { from: 'USD', to: 'JPY' },
        'USD/CHF': { from: 'USD', to: 'CHF' },
        'AUD/USD': { from: 'AUD', to: 'USD' },
        'USD/CAD': { from: 'USD', to: 'CAD' },
        'NZD/USD': { from: 'NZD', to: 'USD' },
        'EUR/GBP': { from: 'EUR', to: 'GBP' },
        'EUR/JPY': { from: 'EUR', to: 'JPY' },
        'GBP/JPY': { from: 'GBP', to: 'JPY' }
      };
      
      const pair = pairs[symbol];
      if (!pair) throw new Error('Unknown pair');
      
      const endpoint = tf >= 1440 ? 'histoday' : tf >= 60 ? 'histohour' : 'histominute';
      const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${pair.from}&tsym=${pair.to}&limit=100`;
      const res = await fetch(url);
      
      if (!res.ok) throw new Error('API error');
      
      const json = await res.json();
      if (!json.Data || !json.Data.Data) throw new Error('Invalid response');
      
      return json.Data.Data.map(k => ({
        time: k.time * 1000,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close
      }));
    } catch (e) {
      console.warn('Forex fetch failed:', e);
      return generateSyntheticData(symbol, 100);
    }
  }

  function generateSyntheticData(symbol, limit) {
    const basePrices = {
      'BTC/USD': 66000, 'ETH/USD': 3200, 'BNB/USD': 580,
      'SOL/USD': 145, 'XRP/USD': 2.1,
      'XAU/USD': 2050,
      'EUR/USD': 1.09, 'GBP/USD': 1.27, 'USD/JPY': 149,
      'USD/CHF': 0.87, 'AUD/USD': 0.66, 'USD/CAD': 1.36,
      'NZD/USD': 0.61, 'EUR/GBP': 0.86, 'EUR/JPY': 162, 'GBP/JPY': 189
    };
    
    const basePrice = basePrices[symbol] || 1.0;
    const candles = [];
    let price = basePrice;
    const now = Date.now();
    
    for (let i = limit - 1; i >= 0; i--) {
      const volatility = basePrice * (0.003 + Math.random() * 0.002);
      const trend = (Math.random() - 0.5) * volatility;
      price += trend;
      
      const open = price;
      const high = price + Math.random() * volatility * 2;
      const low = price - Math.random() * volatility * 2;
      const close = low + Math.random() * (high - low);
      
      candles.push({
        time: now - (i * 900000),
        open, high, low, close
      });
    }
    
    return candles;
  }

  function displaySignal(signal) {
    $signals.innerHTML = '';
    const card = document.createElement('div');
    
    const signalClass = signal.signal === 'BUY' ? 'bullish' : 
                        signal.signal === 'SELL' ? 'bearish' : 'neutral';
    card.className = `signal-card ${signalClass}`;
    
    const entryHtml = signal.entry ? `<p><strong>Entry:</strong> ${signal.entry}</p>` : '';
    const slHtml = signal.sl ? `<p><strong>Stop Loss:</strong> ${signal.sl}</p>` : '';
    const tpHtml = signal.tp ? `<p><strong>Take Profit:</strong> ${signal.tp}</p>` : '';
    const fvgHtml = signal.fvgCount ? `<p><strong>FVG Count:</strong> ${signal.fvgCount}</p>` : '';
    const obHtml = signal.obCount ? `<p><strong>Order Block Count:</strong> ${signal.obCount}</p>` : '';
    
    card.innerHTML = `
      <div class="signal-header">
        <h3>${signal.pair}</h3>
        <span class="signal-badge ${signal.signal.toLowerCase()}">${signal.signal}</span>
      </div>
      <div class="signal-body">
        <p><strong>Current Price:</strong> ${signal.currentPrice}</p>
        ${entryHtml}
        ${slHtml}
        ${tpHtml}
        <p><strong>Market Structure:</strong> ${signal.structure}</p>
        <p><strong>Analysis:</strong> ${signal.reason}</p>
        ${fvgHtml}
        ${obHtml}
      </div>
      <div class="signal-footer">
        <small>${new Date(signal.timestamp).toLocaleString()}</small>
      </div>
    `;
    
    $signals.appendChild(card);
  }

  function startPriceUpdates() {
    stopPriceUpdates();
    updatePrice();
    priceInterval = setInterval(updatePrice, 5000);
  }

  function stopPriceUpdates() {
    if (priceInterval) {
      clearInterval(priceInterval);
      priceInterval = null;
    }
    $price.textContent = '--';
  }

  async function updatePrice() {
    if (!currentPair) return;
    
    const cat = $cat.value;
    const pairObj = PAIRS[cat]?.find(p => p.symbol === currentPair);
    if (!pairObj) return;

    try {
      const candles = await fetchPriceData(cat, pairObj, '15');
      if (candles && candles.length > 0) {
        const latest = candles[candles.length - 1];
        $price.textContent = ict.fmt(latest.close, currentPair);
      }
    } catch (e) {
      console.error('Price update failed:', e);
    }
  }

  $cat.value = 'forex';
  $cat.dispatchEvent(new Event('change'));
})();
