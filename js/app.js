(()=>{
'use strict';
const PAIRS={
forex:[
// Major pairs
{symbol:'EUR/USD',tv:'FX:EURUSD'},
{symbol:'GBP/USD',tv:'FX:GBPUSD'},
{symbol:'USD/JPY',tv:'FX:USDJPY'},
{symbol:'USD/CHF',tv:'FX:USDCHF'},
{symbol:'AUD/USD',tv:'FX:AUDUSD'},
{symbol:'USD/CAD',tv:'FX:USDCAD'},
{symbol:'NZD/USD',tv:'FX:NZDUSD'},
// Cross pairs
{symbol:'EUR/GBP',tv:'FX:EURGBP'},
{symbol:'EUR/JPY',tv:'FX:EURJPY'},
{symbol:'GBP/JPY',tv:'FX:GBPJPY'},
{symbol:'EUR/AUD',tv:'FX:EURAUD'},
{symbol:'GBP/AUD',tv:'FX:GBPAUD'},
{symbol:'EUR/CAD',tv:'FX:EURCAD'},
{symbol:'GBP/CAD',tv:'FX:GBPCAD'},
{symbol:'EUR/CHF',tv:'FX:EURCHF'},
{symbol:'GBP/CHF',tv:'FX:GBPCHF'},
{symbol:'AUD/JPY',tv:'FX:AUDJPY'},
{symbol:'CAD/JPY',tv:'FX:CADJPY'},
{symbol:'CHF/JPY',tv:'FX:CHFJPY'},
{symbol:'NZD/JPY',tv:'FX:NZDJPY'},
{symbol:'AUD/NZD',tv:'FX:AUDNZD'},
{symbol:'AUD/CAD',tv:'FX:AUDCAD'},
{symbol:'EUR/NZD',tv:'FX:EURNZD'},
{symbol:'GBP/NZD',tv:'FX:GBPNZD'},
// Exotics
{symbol:'USD/MXN',tv:'FX:USDMXN'},
{symbol:'USD/ZAR',tv:'FX:USDZAR'},
{symbol:'USD/TRY',tv:'FX:USDTRY'},
{symbol:'USD/SGD',tv:'FX:USDSGD'},
// Metals
{symbol:'XAU/USD',tv:'TVC:GOLD'},
{symbol:'XAG/USD',tv:'TVC:SILVER'}
],
indices:[
{symbol:'US30',tv:'CAPITALCOM:US30'},
{symbol:'US100',tv:'CAPITALCOM:US100'},
{symbol:'US500',tv:'CAPITALCOM:US500'},
{symbol:'DAX',tv:'CAPITALCOM:DE40'},
{symbol:'FTSE',tv:'CAPITALCOM:UK100'},
{symbol:'NI225',tv:'TVC:NI225'}
],
crypto:[
{symbol:'BTC/USD',tv:'COINBASE:BTCUSD'},
{symbol:'ETH/USD',tv:'COINBASE:ETHUSD'},
{symbol:'XRP/USD',tv:'COINBASE:XRPUSD'},
{symbol:'BNB/USD',tv:'BINANCE:BNBUSDT'},
{symbol:'SOL/USD',tv:'COINBASE:SOLUSD'},
{symbol:'ADA/USD',tv:'COINBASE:ADAUSD'},
{symbol:'DOGE/USD',tv:'BINANCE:DOGEUSDT'},
{symbol:'DOT/USD',tv:'COINBASE:DOTUSD'},
{symbol:'AVAX/USD',tv:'COINBASE:AVAXUSD'},
{symbol:'LINK/USD',tv:'COINBASE:LINKUSD'},
{symbol:'LTC/USD',tv:'COINBASE:LTCUSD'}
]
};
let currentCategory='forex';
let currentSymbol=PAIRS.forex[0];
let widget=null;

function formatPrice(p,sym) {
if(p===null||p===undefined) return '--';
if(sym.includes('JPY')||sym==='NI225') return p.toFixed(3);
if(sym==='XAU/USD'||sym==='US30'||sym==='US100'||sym==='US500'||sym==='DAX'||sym==='FTSE') return p.toFixed(2);
if(sym.includes('BTC')) return p.toFixed(1);
if(sym.includes('ETH')||sym.includes('BNB')||sym.includes('SOL')) return p.toFixed(2);
if(sym.includes('MXN')||sym.includes('ZAR')||sym.includes('TRY')||sym==='XAG/USD') return p.toFixed(4);
return p.toFixed(5);
}

function createWidget(sym) {
const c=document.getElementById('tradingview_chart');
if(!c) return;
c.innerHTML='';
try {
widget=new TradingView.widget({
autosize:true,symbol:sym.tv,interval:'60',timezone:'exchange',
theme:'dark',style:'1',locale:'en',toolbar_bg:'#111827',
enable_publishing:false,allow_symbol_change:false,
container_id:'tradingview_chart',
studies:['MASimple@tv-basicstudies','RSI@tv-basicstudies']
});
} catch(e) { console.log('TradingView error',e); }
}

function setupCategories() {
document.querySelectorAll('.category-btn').forEach(btn=>{
btn.addEventListener('click',e=>{
document.querySelectorAll('.category-btn').forEach(b=>b.classList.remove('active'));
e.target.classList.add('active');
currentCategory=e.target.dataset.category;
updatePairsList();
currentSymbol=PAIRS[currentCategory][0];
createWidget(currentSymbol);
clearSignals();
});
});
}

function updatePairsList() {
const list=document.getElementById('pairs-list');
if(!list) return;
list.innerHTML='';
PAIRS[currentCategory].forEach((pair,i)=>{
const btn=document.createElement('button');
btn.className='pair-btn'+(i===0?' active':'');
btn.textContent=pair.symbol;
btn.addEventListener('click',()=>{
document.querySelectorAll('.pair-btn').forEach(b=>b.classList.remove('active'));
btn.classList.add('active');
currentSymbol=pair;
createWidget(pair);
clearSignals();
});
list.appendChild(btn);
});
}

function clearSignals() {
const c=document.getElementById('signals-container');
if(c) c.innerHTML='<div class="signal-card"><div class="signal-header"><span>Select a pair and click Analyze</span></div><p style="color:#9ca3af;text-align:center;padding:20px;">ICT Smart Money analysis with Order Blocks, FVGs, Liquidity & Structure</p></div>';
}

function saveToHistory(r) {
if(!r||r.signal==='NEUTRAL') return;
const h=JSON.parse(localStorage.getItem('ict_signal_history')||'[]');
h.unshift({id:Date.now().toString(),timestamp:r.timestamp,pair:r.pair,signal:r.signal,entry:r.entry,tp1:r.tp1,tp2:r.tp2,tp3:r.tp3,sl:r.stopLoss,confidence:r.confidence,structure:r.structure,zone:r.zone,rr:r.riskReward,factors:r.factors,outcome:null});
if(h.length>100) h.pop();
localStorage.setItem('ict_signal_history',JSON.stringify(h));
updateHistoryBadge();
}

function updateHistoryBadge() {
const h=JSON.parse(localStorage.getItem('ict_signal_history')||'[]');
const p=h.filter(s=>!s.outcome).length;
const badge=document.getElementById('history-badge');
const top=document.getElementById('history-count-top');
if(badge) badge.textContent=p>0?p:'';
if(top) top.textContent=p>0?p:'';
}

async function runAnalysis() {
const btn=document.getElementById('analyze-btn');
const c=document.getElementById('signals-container');
if(!btn||!c) return;
btn.disabled=true; btn.classList.add('loading');
c.innerHTML='<div class="signal-card"><div class="loading-indicator"><div class="spinner"></div><p>Fetching real market data & running ICT analysis...</p></div></div>';
try {
await new Promise(r=>setTimeout(r,200));
const result=await ictAnalyzer.analyze(currentSymbol.symbol,currentCategory);
if(result) { saveToHistory(result); renderSignal(result); }
} catch(err) {
console.error('Analysis error:',err);
c.innerHTML='<div class="signal-card"><p style="color:#ef4444;text-align:center;">Analysis error. Please try again.</p></div>';
}
btn.disabled=false; btn.classList.remove('loading');
}

function renderSignal(r) {
const c=document.getElementById('signals-container');
if(!c) return;
const sym=r.pair||currentSymbol.symbol;
const fp=(v)=>formatPrice(v,sym);
const ds=r.dataSource||'';

if(r.signal==='NEUTRAL') {
c.innerHTML=`<div class="signal-card">
<div class="signal-header"><span class="pair-name">${sym}</span><span class="signal-badge neutral">NEUTRAL</span></div>
${ds?`<div class="signal-row"><span>Data</span><span style="color:#60a5fa">${ds}</span></div>`:''}
<div class="signal-row"><span>Structure</span><span>${r.structure||'--'}</span></div>
<div class="signal-row"><span>Zone</span><span>${r.zone||'--'}</span></div>
<div class="signal-row"><span>RSI</span><span>${r.rsi||'--'}</span></div>
<div class="signal-row"><span>Session</span><span>${r.killzone?r.killzone.name:'--'}</span></div>
<div class="signal-row"><span>Bull / Bear</span><span>${r.bullScore||0} / ${r.bearScore||0} of 20</span></div>
<p style="color:#f59e0b;text-align:center;margin-top:12px;font-size:13px;">Insufficient confluence (need 7+ pts with 3+ margin)</p>
<p style="color:#6b7280;text-align:center;font-size:11px;margin-top:8px;">Not financial advice.</p>
</div>`;
return;
}

const isBuy=r.signal==='BUY';
const cls=isBuy?'buy':'sell';
const arr=isBuy?'\u2191':'\u2193';
let fHtml='';
if(r.factors&&r.factors.length>0) {
fHtml='<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px;">';
r.factors.forEach(f=>{
const col=f.includes('Bull')||f.includes('Discount')||f.includes('OTE Long')||f.includes('Oversold')?'#10b981':f.includes('Bear')||f.includes('Premium')||f.includes('OTE Short')||f.includes('Overbought')?'#ef4444':'#60a5fa';
fHtml+=`<span style="display:inline-block;background:${col}22;color:${col};border:1px solid ${col}44;padding:2px 8px;border-radius:4px;font-size:11px;">${f}</span>`;
});
fHtml+='</div>';
}

c.innerHTML=`<div class="signal-card ${cls}">
<div class="signal-header"><span class="pair-name">${sym}</span><span class="signal-badge ${cls}">${arr} ${r.signal}</span></div>
${ds?`<div class="signal-row"><span>Data Source</span><span style="color:#60a5fa">${ds}</span></div>`:''}
<div class="signal-row"><span>Confidence</span><span style="font-weight:bold;color:${r.confidence>=60?'#10b981':r.confidence>=40?'#f59e0b':'#ef4444'}">${r.confidence}%</span></div>
<div class="signal-row"><span>Entry</span><span>${fp(r.entry)}</span></div>
<div class="signal-row"><span>Stop Loss</span><span style="color:#ef4444">${fp(r.stopLoss)}</span></div>
<div class="signal-row"><span>TP 1</span><span style="color:#10b981">${fp(r.tp1)}</span></div>
<div class="signal-row"><span>TP 2</span><span style="color:#10b981">${fp(r.tp2)}</span></div>
<div class="signal-row"><span>TP 3</span><span style="color:#10b981">${fp(r.tp3)}</span></div>
<div class="signal-row"><span>Risk : Reward</span><span style="font-weight:bold">1 : ${r.riskReward||'--'}</span></div>
<div class="signal-row"><span>Structure</span><span>${r.structure||'--'}</span></div>
<div class="signal-row"><span>Zone</span><span>${r.zone||'--'}</span></div>
<div class="signal-row"><span>FVGs (Near)</span><span>${r.fvgs?r.fvgs.bullish:0}B / ${r.fvgs?r.fvgs.bearish:0}S</span></div>
<div class="signal-row"><span>Order Blocks</span><span>${r.orderBlocks?r.orderBlocks.bullish:0}B / ${r.orderBlocks?r.orderBlocks.bearish:0}S</span></div>
<div class="signal-row"><span>RSI</span><span>${r.rsi||'--'}</span></div>
<div class="signal-row"><span>Session</span><span>${r.killzone?r.killzone.name:'--'}</span></div>
<div class="signal-row"><span>Score</span><span style="font-weight:bold">${r.bullScore||0} Bull / ${r.bearScore||0} Bear (of 20)</span></div>
${fHtml}
<p style="color:#6b7280;text-align:center;font-size:11px;margin-top:12px;">Not financial advice.</p>
</div>`;
const card=c.querySelector('.signal-card');
if(card){card.style.opacity='1';card.style.transform='none';}
}

function setupHamburger() {
const h=document.querySelector('.hamburger');
const s=document.querySelector('.sidebar');
const o=document.querySelector('.sidebar-overlay');
if(h) h.addEventListener('click',()=>{if(s)s.classList.toggle('active');if(o)o.classList.toggle('active');});
if(o) o.addEventListener('click',()=>{if(s)s.classList.remove('active');o.classList.remove('active');});
}

document.addEventListener('DOMContentLoaded',()=>{
setupCategories();
setupHamburger();
updatePairsList();
createWidget(currentSymbol);
updateHistoryBadge();
const btn=document.getElementById('analyze-btn');
if(btn) btn.addEventListener('click',runAnalysis);
if('serviceWorker' in navigator) {
navigator.serviceWorker.register('/ict-trading-pwa/sw.js').catch(e=>console.log('SW error',e));
}
});
})();
