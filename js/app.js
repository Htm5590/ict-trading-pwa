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
            { symbol: 'GBP/JPY', tv: 'FX:GBPJPY' },
            { symbol: 'XAU/USD', tv: 'TVC:GOLD' }
        ],
        indices: [
            { symbol: 'US30', tv: 'CAPITALCOM:US30' },
            { symbol: 'US100', tv: 'CAPITALCOM:US100' },
            { symbol: 'US500', tv: 'CAPITALCOM:US500' },
            { symbol: 'DAX', tv: 'CAPITALCOM:DE40' },
            { symbol: 'FTSE 100', tv: 'CAPITALCOM:UK100' }
        ],
        crypto: [
            { symbol: 'BTC/USD', tv: 'COINBASE:BTCUSD' },
            { symbol: 'ETH/USD', tv: 'COINBASE:ETHUSD' },
            { symbol: 'XRP/USD', tv: 'COINBASE:XRPUSD' }
        ]
    };

    let currentCategory = 'forex';
    let currentSymbol = PAIRS.forex[0];
    let widget = null;
    const ict = new ICTAnalyzer();

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

    function generateMockCandles(price) {
        const candles = [];
        let p = price || 1.1000;
        for (let i = 0; i < 100; i++) {
            const change = (Math.random() - 0.48) * p * 0.003;
            const o = p;
            const c = p + change;
            const h = Math.max(o, c) + Math.random() * p * 0.001;
            const l = Math.min(o, c) - Math.random() * p * 0.001;
            candles.push({ open: o, high: h, low: l, close: c, time: Date.now() - (100 - i) * 900000 });
            p = c;
        }
        return candles;
    }

    function getBasePrice(symbol) {
        const prices = {
            'EUR/USD': 1.1780,
            'GBP/USD': 1.3540,
            'USD/JPY': 156.55,
            'USD/CHF': 0.7760,
            'AUD/USD': 0.6950,
            'USD/CAD': 1.3710,
            'NZD/USD': 0.5990,
            'EUR/GBP': 0.8690,
            'EUR/JPY': 184.50,
            'GBP/JPY': 212.00,
            'XAU/USD': 4870.00,
            'US30': 48900,
            'US100': 24800,
            'US500': 6800,
            'DAX': 24600,
            'FTSE 100': 10320,
            'BTC/USD': 63000,
            'ETH/USD': 1880,
            'XRP/USD': 1.25
        };
        return prices[symbol] || 1.0;
    }

    async function runAnalysis() {
        const btn = document.getElementById('analyze-btn');
        const container = document.getElementById('signals-container');
        btn.disabled = true;
        btn.textContent = 'Analyzing...';
        container.innerHTML = '<div class="signal-loading"><div class="spinner"></div><span>Analyzing ' + currentSymbol.symbol + ' with ICT methodology...</span></div>';

        await new Promise(r => setTimeout(r, 800));

        const basePrice = getBasePrice(currentSymbol.symbol);
        const candles = generateMockCandles(basePrice);
        const result = ict.generateSignal(currentSymbol.symbol, candles);
        renderSignal(result);
        btn.disabled = false;
        btn.textContent = 'Analyze';
    }

    function renderSignal(result) {
        const container = document.getElementById('signals-container');
        if (result.signal === 'NO SIGNAL') {
            container.innerHTML = `
                <div class="signal-card no-signal">
                    <div class="signal-card-header">
                        <span class="signal-pair">${result.pair}</span>
                        <span class="signal-badge neutral">NO SIGNAL</span>
                    </div>
                    <div class="signal-card-body">
                        <div class="signal-row"><span>Price</span><span class="value">${result.currentPrice}</span></div>
                        <div class="signal-row"><span>Structure</span><span class="value">${result.structure}</span></div>
                        <div class="signal-row"><span>FVGs Found</span><span class="value">${result.fvgCount || 0}</span></div>
                        <div class="signal-row"><span>OBs Found</span><span class="value">${result.obCount || 0}</span></div>
                    </div>
                    <div class="signal-reason">${result.reason}</div>
                </div>`;
            return;
        }
        const isBuy = result.signal === 'BUY';
        container.innerHTML = `
            <div class="signal-card ${isBuy ? 'buy' : 'sell'}">
                <div class="signal-card-header">
                    <span class="signal-pair">${result.pair}</span>
                    <span class="signal-badge ${isBuy ? 'buy' : 'sell'}">${result.signal}</span>
                </div>
                <div class="signal-card-body">
                    <div class="signal-row"><span>Current Price</span><span class="value">${result.currentPrice}</span></div>
                    <div class="signal-row entry"><span>→ Entry</span><span class="value">${result.entry}</span></div>
                    <div class="signal-row tp"><span>↑ Take Profit</span><span class="value">${result.tp}</span></div>
                    <div class="signal-row sl"><span>↓ Stop Loss</span><span class="value">${result.sl}</span></div>
                    <div class="signal-row"><span>Risk/Reward</span><span class="value">${result.riskReward}</span></div>
                    <div class="signal-row"><span>Structure</span><span class="value">${result.structure}</span></div>
                    <div class="signal-row"><span>FVGs / OBs</span><span class="value">${result.fvgCount || 0} / ${result.obCount || 0}</span></div>
                </div>
                <div class="signal-reason">${result.reason}</div>
                <div class="signal-disclaimer">⚠️ Educational only. Not financial advice.</div>
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
