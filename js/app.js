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
            });
            list.appendChild(btn);
        });
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

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/ict-trading-pwa/sw.js')
                .then(reg => console.log('Service Worker registered', reg))
                .catch(err => console.log('Service Worker registration failed', err));
        }
    });
})();
