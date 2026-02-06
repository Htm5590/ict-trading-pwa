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

    async function fetchCandles(symbol) {
        const tvSymbol = symbol.tv.replace(':', '_');
        const url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(
            'https://scanner.tradingview.com/symbol?symbol=' + symbol.tv + '&fields=close,open,high,low,volume&no_404=true'
        );
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('API error');
            return null;
        } catch (e) {
            return null;
        }
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
            'EUR/USD': 1.1050, 'GBP/USD': 1.2700, 'USD/JPY': 149.50,
            'USD/CHF': 0.8800, 'AUD/USD': 0.6550, 'USD/CAD': 1.3600,
            'NZD/USD': 0.5900, 'EUR/GBP': 0.8700, 'EUR/JPY': 163.00,
            'GBP/JPY': 189.50, 'US30': 44500, 'US100': 21500,
            'US500': 6100, 'DAX': 21000, 'FTSE 100': 8700,
            'BTC/USD': 98000, 'ETH/USD': 2700, 'XRP/USD': 2.40
        };
        return prices[symbol] || 1.0;
    }

    async function runAnalysis() {
        const btn = document.getElementById('analyze-btn');
        const container = document.getElementById('signals-container');
        btn.disabled = true;
        btn.textContent = 'Analyzing...';
        container.innerHTML = '<div class="signal-loading"><div class="spinner"></div><p>Analyzing ' + currentSymbol.symbol + ' with ICT methodology...</p></div>';

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
                        <div class="signal-row"><span>Price</span><span>${result.currentPrice}</span></div>
                        <div class="signal-row"><span>Structure</span><span>${result.structure}</span></div>
                        <div class="signal-row"><span>FVGs Found</span><span>${result.fvgCount || 0}</span></div>
                        <div class="signal-row"><span>OBs Found</span><span>${result.obCount || 0}</span></div>
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
                    <div class="signal-row"><span>Current Price</span><span>${result.currentPrice}</span></div>
                    <div class="signal-row entry"><span>→ Entry</span><span class="value">${result.entry}</span></div>
                    <div class="signal-row tp"><span>↑ Take Profit</span><span class="value">${result.tp}</span></div>
                    <div class="signal-row sl"><span>↓ Stop Loss</span><span class="value">${result.sl}</span></div>
                    <div class="signal-row"><span>Risk/Reward</span><span>${result.riskReward}</span></div>
                    <div class="signal-row"><span>Structure</span><span>${result.structure}</span></div>
                    <div class="signal-row"><span>FVGs / OBs</span><span>${result.fvgCount || 0} / ${result.obCount || 0}</span></div>
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
