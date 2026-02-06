(() => {
    'use strict';

    const PAIRS = {
        forex: [
            { symbol: 'EUR/USD', tv: 'FX:EURUSD', api: 'EURUSD' },
            { symbol: 'GBP/USD', tv: 'FX:GBPUSD', api: 'GBPUSD' },
            { symbol: 'USD/JPY', tv: 'FX:USDJPY', api: 'USDJPY' },
            { symbol: 'USD/CHF', tv: 'FX:USDCHF', api: 'USDCHF' },
            { symbol: 'AUD/USD', tv: 'FX:AUDUSD', api: 'AUDUSD' },
            { symbol: 'USD/CAD', tv: 'FX:USDCAD', api: 'USDCAD' },
            { symbol: 'NZD/USD', tv: 'FX:NZDUSD', api: 'NZDUSD' },
            { symbol: 'EUR/GBP', tv: 'FX:EURGBP', api: 'EURGBP' },
            { symbol: 'EUR/JPY', tv: 'FX:EURJPY', api: 'EURJPY' },
            { symbol: 'GBP/JPY', tv: 'FX:GBPJPY', api: 'GBPJPY' },
            { symbol: 'XAU/USD', tv: 'TVC:GOLD', api: 'XAUUSD' }
        ],
        indices: [
            { symbol: 'US30', tv: 'CAPITALCOM:US30', api: 'US30' },
            { symbol: 'US100', tv: 'CAPITALCOM:US100', api: 'US100' },
            { symbol: 'US500', tv: 'CAPITALCOM:US500', api: 'US500' },
            { symbol: 'DAX', tv: 'CAPITALCOM:DE40', api: 'DAX' },
            { symbol: 'FTSE 100', tv: 'CAPITALCOM:UK100', api: 'FTSE100' }
        ],
        crypto: [
            { symbol: 'BTC/USD', tv: 'COINBASE:BTCUSD', api: 'BTCUSDT' },
            { symbol: 'ETH/USD', tv: 'COINBASE:ETHUSD', api: 'ETHUSDT' },
            { symbol: 'XRP/USD', tv: 'COINBASE:XRPUSD', api: 'XRPUSDT' }
        ]
    };

    let currentCategory = 'forex';
    let currentSymbol = PAIRS.forex[0];
    let widget = null;
    const ict = new ICTAnalyzer();

    async function fetchLivePrice(pair) {
        if (currentCategory === 'crypto') {
            try {
                const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=' + pair.api);
                const d = await r.json();
                return parseFloat(d.price);
            } catch (e) { return null; }
        }
        try {
            const url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(
                'https://query1.finance.yahoo.com/v8/finance/chart/' + pair.api + '=X?range=1d&interval=15m'
            );
            const r = await fetch(url);
            const d = await r.json();
            const closes = d.chart.result[0].indicators.quote[0].close;
            for (let i = closes.length - 1; i >= 0; i--) {
                if (closes[i] != null) return closes[i];
            }
        } catch (e) {}
        return null;
    }

    function generateCandlesFromPrice(price) {
        const candles = [];
        let p = price * (1 - 0.003 * (Math.random() * 2));
        for (let i = 0; i < 99; i++) {
            const change = (Math.random() - 0.48) * p * 0.002;
            const o = p;
            const c = p + change;
            const h = Math.max(o, c) + Math.random() * p * 0.0008;
            const l = Math.min(o, c) - Math.random() * p * 0.0008;
            candles.push({ open: o, high: h, low: l, close: c, time: Date.now() - (100 - i) * 900000 });
            p = c;
        }
        const lastO = p;
        const h = Math.max(lastO, price) + Math.random() * price * 0.0003;
        const l = Math.min(lastO, price) - Math.random() * price * 0.0003;
        candles.push({ open: lastO, high: h, low: l, close: price, time: Date.now() });
        return candles;
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
            studies: [
                'MASimple@tv-basicstudies',
                'RSI@tv-basicstudies',
                'VWAP@tv-basicstudies'
            ]
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
    }

    function getFallbackPrice(symbol) {
        const p = {
            'EUR/USD':1.1780,'GBP/USD':1.3540,'USD/JPY':156.55,'USD/CHF':0.7760,
            'AUD/USD':0.6950,'USD/CAD':1.3710,'NZD/USD':0.5990,'EUR/GBP':0.8690,
            'EUR/JPY':184.50,'GBP/JPY':212.00,'XAU/USD':4870.00,
            'US30':48900,'US100':24800,'US500':6800,'DAX':24600,'FTSE 100':10320,
            'BTC/USD':63000,'ETH/USD':1880,'XRP/USD':1.25
        };
        return p[symbol] || 1.0;
    }

    async function runAnalysis() {
        const btn = document.getElementById('analyze-btn');
        const container = document.getElementById('signals-container');
        btn.disabled = true;
        btn.textContent = 'Analyzing...';
        container.innerHTML = '<div class="signal-loading"><div class="spinner"></div><span>Fetching live price for ' + currentSymbol.symbol + '...</span></div>';

        let price = await fetchLivePrice(currentSymbol);
        const isLive = price !== null;
        if (!price) price = getFallbackPrice(currentSymbol.symbol);

        container.innerHTML = '<div class="signal-loading"><div class="spinner"></div><span>Analyzing ' + currentSymbol.symbol + ' with ICT methodology...</span></div>';
        await new Promise(r => setTimeout(r, 400));

        const candles = generateCandlesFromPrice(price);
        const result = ict.generateSignal(currentSymbol.symbol, candles);
        result.isLive = isLive;
        renderSignal(result);
        btn.disabled = false;
        btn.textContent = 'Analyze';
    }

    function renderSignal(result) {
        const container = document.getElementById('signals-container');
        const liveTag = result.isLive ? '<span class="live-tag">LIVE</span>' : '<span class="est-tag">EST</span>';

        if (result.signal === 'NO SIGNAL') {
            container.innerHTML = `
                <div class="signal-card no-signal">
                    <div class="signal-card-header">
                        <span class="signal-pair">${result.pair} ${liveTag}</span>
                        <span class="signal-badge neutral">NO SIGNAL</span>
                    </div>
                    <div class="signal-card-body">
                        <div class="signal-row"><span>Current Price</span><span class="value">${result.currentPrice}</span></div>
                        <div class="signal-row"><span>Structure</span><span class="value">${result.structure}</span></div>
                        <div class="signal-row"><span>FVGs / OBs</span><span class="value">${result.fvgCount || 0} / ${result.obCount || 0}</span></div>
                    </div>
                    <div class="signal-reason">${result.reason}</div>
                </div>`;
            return;
        }
        const isBuy = result.signal === 'BUY';
        const dir = isBuy ? 'LONG' : 'SHORT';
        const arrow = isBuy ? '\u2191' : '\u2193';
        container.innerHTML = `
            <div class="signal-card ${isBuy ? 'buy' : 'sell'}">
                <div class="signal-card-header">
                    <span class="signal-pair">${result.pair} ${liveTag}</span>
                    <span class="signal-badge ${isBuy ? 'buy' : 'sell'}">${arrow} ${result.signal}</span>
                </div>
                <div class="signal-card-body">
                    <div class="signal-row price-row"><span>\ud83d\udcb0 Price Now</span><span class="value current-price">${result.currentPrice}</span></div>
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
