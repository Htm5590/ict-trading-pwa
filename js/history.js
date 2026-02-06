(() => {
    'use strict';

    const STORAGE_KEY = 'ict_signal_history';
    let currentFilter = 'all';

    function getHistory() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    function saveHistory(history) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }

    function clearHistory() {
        if (confirm('Are you sure you want to clear all signal history?')) {
            localStorage.removeItem(STORAGE_KEY);
            renderHistory();
            updateStats();
        }
    }

    function updateSignalOutcome(id, outcome) {
        const history = getHistory();
        const signal = history.find(s => s.id === id);
        if (signal) {
            signal.outcome = outcome;
            signal.outcomeTime = new Date().toISOString();
            saveHistory(history);
            renderHistory();
            updateStats();
        }
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function updateStats() {
        const history = getHistory();
        const total = history.length;
        const tp = history.filter(s => s.outcome === 'tp').length;
        const sl = history.filter(s => s.outcome === 'sl').length;
        const pending = history.filter(s => !s.outcome).length;
        const winRate = (tp + sl) > 0 ? Math.round((tp / (tp + sl)) * 100) : '-';

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-tp').textContent = tp;
        document.getElementById('stat-sl').textContent = sl;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-winrate').textContent = winRate === '-' ? '-' : winRate + '%';
    }

    function renderHistory() {
        const container = document.getElementById('history-container');
        let history = getHistory();
        
        // Sort by date, newest first
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply filter
        if (currentFilter !== 'all') {
            if (currentFilter === 'pending') {
                history = history.filter(s => !s.outcome);
            } else {
                history = history.filter(s => s.outcome === currentFilter);
            }
        }

        if (history.length === 0) {
            container.innerHTML = '<div class="history-placeholder">No signals found for this filter.</div>';
            return;
        }

        container.innerHTML = history.map(signal => {
            const isBuy = signal.signal === 'BUY';
            const outcomeClass = signal.outcome === 'tp' ? 'outcome-tp' : 
                                 signal.outcome === 'sl' ? 'outcome-sl' : 'outcome-pending';
            const outcomeText = signal.outcome === 'tp' ? '✅ TP Hit' : 
                                signal.outcome === 'sl' ? '❌ SL Hit' : '⏳ Pending';

            return `
                <div class="history-card ${isBuy ? 'buy' : 'sell'} ${outcomeClass}">
                    <div class="history-card-header">
                        <div class="history-pair-info">
                            <span class="history-pair">${signal.pair}</span>
                            <span class="history-signal ${isBuy ? 'buy' : 'sell'}">${isBuy ? '↑' : '↓'} ${signal.signal}</span>
                        </div>
                        <span class="history-date">${formatDate(signal.timestamp)}</span>
                    </div>
                    <div class="history-card-body">
                        <div class="history-row"><span>Entry</span><span>${signal.entry}</span></div>
                        <div class="history-row tp"><span>TP</span><span>${signal.tp}</span></div>
                        <div class="history-row sl"><span>SL</span><span>${signal.sl}</span></div>
                        <div class="history-row"><span>R:R</span><span>${signal.riskReward}</span></div>
                    </div>
                    <div class="history-card-footer">
                        <span class="outcome-badge ${outcomeClass}">${outcomeText}</span>
                        ${!signal.outcome ? `
                            <div class="outcome-buttons">
                                <button class="outcome-btn tp-btn" onclick="window.markOutcome('${signal.id}', 'tp')">✅ TP Hit</button>
                                <button class="outcome-btn sl-btn" onclick="window.markOutcome('${signal.id}', 'sl')">❌ SL Hit</button>
                            </div>
                        ` : `
                            <span class="outcome-time">Marked: ${formatDate(signal.outcomeTime)}</span>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    function setupFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.dataset.filter;
                renderHistory();
            });
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

    // Expose function globally for onclick handlers
    window.markOutcome = updateSignalOutcome;

    document.addEventListener('DOMContentLoaded', () => {
        setupFilterButtons();
        setupHamburgerMenu();
        renderHistory();
        updateStats();

        const clearBtn = document.getElementById('clear-history-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearHistory);
        }

        // Auto-check for TP/SL hits every 30 seconds
        setInterval(autoCheckOutcomes, 30000);
    });

    // Auto-check outcomes by comparing current prices
    async function autoCheckOutcomes() {
        const history = getHistory();
        const pending = history.filter(s => !s.outcome);
        
        if (pending.length === 0) return;

        for (const signal of pending) {
            try {
                const currentPrice = await fetchCurrentPrice(signal.pair);
                if (currentPrice === null) continue;

                const entry = parseFloat(signal.entry);
                const tp = parseFloat(signal.tp);
                const sl = parseFloat(signal.sl);
                const isBuy = signal.signal === 'BUY';

                if (isBuy) {
                    if (currentPrice >= tp) {
                        updateSignalOutcome(signal.id, 'tp');
                    } else if (currentPrice <= sl) {
                        updateSignalOutcome(signal.id, 'sl');
                    }
                } else {
                    if (currentPrice <= tp) {
                        updateSignalOutcome(signal.id, 'tp');
                    } else if (currentPrice >= sl) {
                        updateSignalOutcome(signal.id, 'sl');
                    }
                }
            } catch (e) {
                console.log('Auto-check failed for', signal.pair, e);
            }
        }
    }

    async function fetchCurrentPrice(pair) {
        // For crypto pairs
        if (pair.includes('BTC') || pair.includes('ETH') || pair.includes('XRP')) {
            const symbol = pair.replace('/', '') + 'T';
            try {
                const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
                const d = await r.json();
                return parseFloat(d.price);
            } catch (e) { return null; }
        }
        
        // For forex
        if (!pair.includes('US') && !pair.includes('DAX') && !pair.includes('FTSE') && pair !== 'XAU/USD') {
            try {
                const parts = pair.split('/');
                const r = await fetch(`https://open.er-api.com/v6/latest/${parts[0]}`);
                const d = await r.json();
                return d.rates ? d.rates[parts[1]] : null;
            } catch (e) { return null; }
        }

        return null; // Indices and gold - can't auto-check
    }
})();
