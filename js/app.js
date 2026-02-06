(() => {
    'use strict';

    const PAIRS = {
        forex: [
            { symbol: 'EUR/USD', tv: 'FX:EURUSD', base: 1.1800 },
            { symbol: 'GBP/USD', tv: 'FX:GBPUSD', base: 1.3540 },
            { symbol: 'USD/JPY', tv: 'FX:USDJPY', base: 156.50 },
            { symbol: 'USD/CHF', tv: 'FX:USDCHF', base: 0.7760 },
            { symbol: 'AUD/USD', tv: 'FX:AUDUSD', base: 0.6950 },
            { symbol: 'USD/CAD', tv: 'FX:USDCAD', base: 1.3710 },
            { symbol: 'NZD/USD', tv: 'FX:NZDUSD', base: 0.5990 },
            { symbol: 'EUR/GBP', tv: 'FX:EURGBP', base: 0.8690 },
            { symbol: 'EUR/JPY', tv: 'FX:EURJPY', base: 184.50 },
            { symbol: 'GBP/JPY', tv: 'FX:GBPJPY', base: 212.00 },
            { symbol: 'XAU/USD', tv: 'TVC:GOLD', base: 2870.00 }
        ],
        indices: [
            { symbol: 'US30', tv: 'CAPITALCOM:US30', base: 44500 },
            { symbol: 'US100', tv: 'CAPITALCOM:US100', base: 21800 },
            { symbol: 'US500', tv: 'CAPITALCOM:US500', base: 6100 },
            { symbol: 'DAX', tv: 'CAPITALCOM:DE40', base: 21600 },
            { symbol: 'FTSE 100', tv: 'CAPITALCOM:UK100', base: 8700 }
        ],
        crypto: [
            { symbol: 'BTC/USD', tv: 'COINBASE:BTCUSD', binance: 'BTCUSDT', base: 97500 },
            { symbol: 'ETH/USD', tv: 'COINBASE:ETHUSD', binance: 'ETHUSDT', base: 2750 },
            { symbol: 'XRP/USD', tv: 'COINBASE:XRPUSD', binance: 'XRPUSDT', base: 2.65 }
        ]
    };

    let currentCategory = 'forex';
    let currentSymbol = PAIRS.forex[0];
    let widget = null;
    let lastFetchedPrice = null;
    const ict = new ICTAnalyzer();

    async function fetchLivePrice(pair) {
        // For crypto, use Binance API (reliable, no CORS)
        if (currentCategory === 'crypto' && pair.binance) {
            try {
                const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair.binance}`);
                const d = await r.json();
                if (d.price) return { price: parseFloat(d.price), live: true };
            } catch (e) { console.log('Binance fetch failed:', e); }
        }
        
        // For forex, try exchangerate-api (free, CORS enabled)
        if (currentCategory === 'forex' && pair.symbol !== 'XAU/USD') {
            try {
                const parts = pair.symbol.split('/');
                const base = parts[0];
                const quote = parts[1];
                const r = await fetch(`https://open.er-api.com/v6/latest/${base}`);
                const d = await r.json();
                if (d.rates && d.rates[quote]) {
                    return { price: d.rates[quote], live: true };
                }
            } catch (e) { console.log('ExchangeRate fetch failed:', e); }
        }
        
        // For XAU/USD (gold), try metals API
        if (pair.symbol === 'XAU/USD') {
            try {
                const r = await fetch('https://api.gold-api.com/price/XAU');
                const d = await r.json();
                if (d.price) return { price: d.price, live: true };
            } catch (e) { console.log('Gold API fetch failed:', e); }
        }
        
        // Fallback: use base price with small random adjustment to simulate real-time
        const variance = pair.base * (Math.random() * 0.002 - 0.001);
        return { price: pair.base + variance, live: false };
    }

    function generateCandlesFromPrice(price) {
        const candles = [];
        let p = price * (1 - 0.002 * Math.random());
        
        for (let i = 0; i < 99; i++) {
            const change = (Math.random() - 0.48) * p * 0.0015;
            const o = p;
            const c = p + change;
            const h = Math.max(o, c) + Math.random() * p * 0.0006;
            const l = Math.min(o, c) - Math.random() * p * 0.0006;
            candles.push({ 
                open: o, high: h, low: l, close: c, 
                time: Date.now() - (100 - i) * 900000 
            });
            p = c;
        }
        
        // Last candle ends exactly at current price
        const lastO = p;
        const h = Math.max(lastO, price) + Math.random() * price * 0.0002;
        const l = Math.min(lastO, price) - Math.random() * price * 0.0002;
        candles.push({ open: lastO, high: h, low: l, close: price, time: Date.now() });
        
        return candles;
    }

    function formatPrice(price, symbol) {
        if (symbol.includes('JPY')) return price.toFixed(3);
        if (symbol === 'XAU/USD') return price.toFixed(2);
        if (symbol.includes('BTC')) return price.toFixed(1);
        if (['US30', 'US100', 'US500', 'DAX', 'FTSE 100'].includes(symbol)) return price.toFixed(1);
        return price.toFixed(5);
    }

    function createWidget(symbol) {
        const container = document.getElementById('tradingview_chart');
        container.innerHTML = '';
        widget = new TradingView.widget({
            autosize: true,
            symbol: symbol.tv,
            interval: '15',
            timezone: 'exchange',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#161b22',
            enable_publishing: false,
            allow_symbol_change: false,
            container_id: 'tradingview_chart',
            studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'VWAP@tv-basicstudies']
        });
    }

    function setupCategoryButtons() {
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentCategory = e.target.dataset.category;
                updatePairsList();
                currentSymbol = PAIRS[currentCategory][0];
                createWidget(currentSymbol);
                clearSignals();
            });
        });
    }

    function updatePairsList() {
        const list = document.getElementById('pairs-list');
        list.innerHTML = '';
        PAIRS[currentCategory].forEach((pair, index) => {
            const btn = document.createElement('button');
            btn.className = 'pair-btn' + (index === 0 ? ' active' : '');
            btn.textContent = pair.symbol;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pair-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSymbol = pair;
                createWidget(pair);
                clearSignals();
            });
            list.appendChild(btn);
        });
    }

    function clearSignals() {
        const container = document.getElementById('signals-container');
        container.innerHTML = '<div class="signal-placeholder">Select a pair and click <strong>Analyze</strong> to generate ICT signals</div>';
        lastFetchedPrice = null;
    }

    async function runAnalysis() {
        const btn = document.getElementById('analyze-btn');
        const container = document.getElementById('signals-container');
        
        btn.disabled = true;
        btn.textContent = 'Fetching...';
        container.innerHTML = `<div class="signal-loading"><div class="spinner"></div><span>Fetching price for ${currentSymbol.symbol}...</span></div>`;
        
        const { price, live } = await fetchLivePrice(currentSymbol);
        lastFetchedPrice = price;
        
        btn.textContent = 'Analyzing...';
        container.innerHTML = `<div class="signal-loading"><div class="spinner"></div><span>Analyzing ${currentSymbol.symbol}...</span></div>`;
        
        await new Promise(r => setTimeout(r, 300));
        
        const candles = generateCandlesFromPrice(price);
        const result = ict.generateSignal(currentSymbol.symbol, candles);
        result.isLive = live;
        result.formattedPrice = formatPrice(price, currentSymbol.symbol);
        
        renderSignal(result);
        btn.disabled = false;
        btn.textContent = 'Analyze';
    }

    function renderSignal(result) {
        const container = document.getElementById('signals-container');
        const liveTag = result.isLive 
            ? '<span class="live-tag">LIVE</span>' 
            : '<span class="est-tag">EST</span>';
        
        if (result.signal === 'NO SIGNAL') {
            container.innerHTML = `
                <div class="signal-card no-signal">
                    <div class="signal-card-header">
                        <span class="signal-pair">${result.pair} ${liveTag}</span>
                        <span class="signal-badge neutral">NO SIGNAL</span>
                    </div>
                    <div class="signal-card-body">
                        <div class="signal-row"><span>Price Now</span><span class="value">${result.formattedPrice || result.currentPrice}</span></div>
                        <div class="signal-row"><span>Structure</span><span class="value">${result.structure}</span></div>
                        <div class="signal-row"><span>FVGs / OBs</span><span class="value">${result.fvgCount || 0} / ${result.obCount || 0}</span></div>
                    </div>
                    <div class="signal-reason">${result.reason}</div>
                </div>`;
            return;
        }
        
        const isBuy = result.signal === 'BUY';
        const arrow = isBuy ? '\u2191' : '\u2193';
        
        container.innerHTML = `
            <div class="signal-card ${isBuy ? 'buy' : 'sell'}">
                <div class="signal-card-header">
                    <span class="signal-pair">${result.pair} ${liveTag}</span>
                    <span class="signal-badge ${isBuy ? 'buy' : 'sell'}">${arrow} ${result.signal}</span>
                </div>
                <div class="signal-card-body">
                    <div class="signal-row price-row"><span>\ud83d\udcb0 Price Now</span><span class="value current-price">${result.formattedPrice || result.currentPrice}</span></div>
                    <div class="signal-row entry"><span>\u27a1 Entry Zone</span><span class="value">${result.entry}</span></div>
                    <div class="signal-row tp"><span>\u2705 Take Profit</span><span class="value">${result.tp}</span></div>
                    <div class="signal-row sl"><span>\u274c Stop Loss</span><span class="value">${result.sl}</span></div>
                    <div class="signal-row rr"><span>\ud83c\udfaf Risk : Reward</span><span class="value">${result.riskReward}</span></div>
                    <div class="signal-row"><span>\ud83d\udcc8 Structure</span><span class="value">${result.structure}</span></div>
                    <div class="signal-row"><span>\ud83d\udd0d FVGs / OBs</span><span class="value">${result.fvgCount || 0} / ${result.obCount || 0}</span></div>
                </div>
                <div class="signal-reason">${result.reason}</div>
                <div class="signal-disclaimer">\u26a0\ufe0f Educational only. Not financial advice.</div>
            </div>`;
    }

    function setupHamburgerMenu() {
        const hamburger = document.querySelector('.hamburger');
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        
        if (hamburger) {
            hamburger.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
            });
        }
        if (overlay) {
            overlay.addEventListener('click', () => {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupCategoryButtons();
        setupHamburgerMenu();
        updatePairsList();
        createWidget(currentSymbol);
        
        const analyzeBtn = document.getElementById('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', runAnalysis);
        }
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/ict-trading-pwa/sw.js')
                .then(reg => console.log('SW registered', reg))
                .catch(err => console.log('SW error', err));
        }
    });
})();
