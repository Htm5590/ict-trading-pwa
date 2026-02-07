(()=>{
'use strict';
const PAIRS={
forex:[
{symbol:'EUR/USD',tv:'FX:EURUSD',binance:null},
{symbol:'GBP/USD',tv:'FX:GBPUSD',binance:null},
{symbol:'USD/JPY',tv:'FX:USDJPY',binance:null},
{symbol:'AUD/USD',tv:'FX:AUDUSD',binance:null},
{symbol:'USD/CAD',tv:'FX:USDCAD',binance:null},
{symbol:'XAU/USD',tv:'TVC:GOLD',binance:null}
],
indices:[
{symbol:'US30',tv:'CAPITALCOM:US30',binance:null},
{symbol:'US100',tv:'CAPITALCOM:US100',binance:null},
{symbol:'US500',tv:'CAPITALCOM:US500',binance:null}
],
crypto:[
{symbol:'BTC/USD',tv:'COINBASE:BTCUSD',binance:'BTCUSDT'},
{symbol:'ETH/USD',tv:'COINBASE:ETHUSD',binance:'ETHUSDT'},
{symbol:'XRP/USD',tv:'COINBASE:XRPUSD',binance:'XRPUSDT'}
]
};
let currentCategory='forex';
let currentSymbol=PAIRS.forex[0];
let widget=null;

function formatPrice(p,sym) {
if(!p&&p!==0) return '--';
if(sym.includes('JPY')) return p.toFixed(3);
if(sym==='XAU/USD') return p.toFixed(2);
if(sym.includes('BTC')) return p.toFixed(1);
if(['US30','US100','US500'].includes(sym)) return p.toFixed(1);
return p.toFixed(5);
}

function createWidget(sym) {
const c=document.getElementById('tradingview_chart');
if(!c) return;
c.innerHTML='';
try {
widget=new TradingView.widget({
autosize:true,symbol:sym.tv,interval:'15',timezone:'exchange',
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
if(c) c.innerHTML='<div class="signal-card"><div class="signal-header"><span>Select a pair and click Analyze</span></div><p style="color:#9ca3af;text-align:center;padding:20px;">ICT Smart Money analysis with Order Blocks, FVGs & Liquidity</p></div>';
}

function saveToHistory(result) {
if(!result||result.signal==='NEUTRAL') return;
const history=JSON.parse(localStorage.getItem('ict_signal_history')||'[]');
const signal={
id:Date.now().toString(),
timestamp:result.timestamp||new Date().toISOString(),
pair:result.pair,
signal:result.signal,
entry:result.entry,
tp1:result.tp1, tp2:result.tp2, tp3:result.tp3,
sl:result.stopLoss,
confidence:result.confidence,
structure:result.structure,
zone:result.zone,
factors:result.factors,
outcome:null
};
history.unshift(signal);
if(history.length>100) history.pop();
localStorage.setItem('ict_signal_history',JSON.stringify(history));
updateHistoryBadge();
}

function updateHistoryBadge() {
const history=JSON.parse(localStorage.getItem('ict_signal_history')||'[]');
const pending=history.filter(s=>!s.outcome).length;
const badge=document.getElementById('history-badge');
const badgeTop=document.getElementById('history-count-top');
if(badge) badge.textContent=pending>0?pending:'';
if(badgeTop) badgeTop.textContent=pending>0?pending:'';
}

async function runAnalysis() {
const btn=document.getElementById('analyze-btn');
const container=document.getElementById('signals-container');
if(!btn||!container) return;
btn.disabled=true;
btn.classList.add('loading');
container.innerHTML='<div class="signal-card"><div class="loading-indicator"><div class="spinner"></div><p>Running ICT analysis...</p></div></div>';

try {
await new Promise(r=>setTimeout(r,300));
const result=await ictAnalyzer.analyze(currentSymbol.symbol,currentCategory);
if(result) {
saveToHistory(result);
renderSignal(result);
}
} catch(err) {
console.error('Analysis error:',err);
container.innerHTML='<div class="signal-card"><p style="color:#ef4444;text-align:center;">Analysis error. Please try again.</p></div>';
}
btn.disabled=false;
btn.classList.remove('loading');
}

function renderSignal(r) {
const c=document.getElementById('signals-container');
if(!c) return;
const sym=r.pair||currentSymbol.symbol;
const fp=(v)=>formatPrice(v,sym);

if(r.signal==='NEUTRAL') {
c.innerHTML=`<div class="signal-card">
<div class="signal-header"><span class="pair-name">${sym}</span><span class="signal-badge neutral">NEUTRAL</span></div>
<div class="signal-row"><span>Structure</span><span>${r.structure||'--'}</span></div>
<div class="signal-row"><span>Zone</span><span>${r.zone||'--'}</span></div>
<div class="signal-row"><span>RSI</span><span>${r.rsi||'--'}</span></div>
<div class="signal-row"><span>Session</span><span>${r.killzone?r.killzone.name:'--'}</span></div>
<div class="signal-row"><span>Bull / Bear Score</span><span>${r.bullScore||0} / ${r.bearScore||0}</span></div>
<p style="color:#9ca3af;text-align:center;margin-top:12px;">Insufficient confluence for a signal (need 5+ points)</p>
<p style="color:#6b7280;text-align:center;font-size:11px;margin-top:8px;">Not financial advice.</p>
</div>`;
return;
}

const isBuy=r.signal==='BUY';
const signalClass=isBuy?'buy':'sell';
const arrow=isBuy?'\u2191':'\u2193';

let factorsHtml='';
if(r.factors&&r.factors.length>0) {
factorsHtml='<div class="factors-list" style="margin-top:10px;">';
r.factors.forEach(f=>{
factorsHtml+=`<span class="factor-tag" style="display:inline-block;background:#1f2937;color:#d1d5db;padding:3px 8px;margin:2px;border-radius:4px;font-size:11px;">${f}</span>`;
});
factorsHtml+='</div>';
}

c.innerHTML=`<div class="signal-card ${signalClass}">
<div class="signal-header"><span class="pair-name">${sym}</span><span class="signal-badge ${signalClass}">${arrow} ${r.signal}</span></div>
<div class="signal-row"><span>Confidence</span><span>${r.confidence}%</span></div>
<div class="signal-row"><span>Entry</span><span>${fp(r.entry)}</span></div>
<div class="signal-row"><span>Stop Loss</span><span style="color:#ef4444">${fp(r.stopLoss)}</span></div>
<div class="signal-row"><span>TP 1</span><span style="color:#10b981">${fp(r.tp1)}</span></div>
<div class="signal-row"><span>TP 2</span><span style="color:#10b981">${fp(r.tp2)}</span></div>
<div class="signal-row"><span>TP 3</span><span style="color:#10b981">${fp(r.tp3)}</span></div>
<div class="signal-row"><span>Structure</span><span>${r.structure||'--'}</span></div>
<div class="signal-row"><span>Zone</span><span>${r.zone||'--'}</span></div>
<div class="signal-row"><span>FVGs (Bull/Bear)</span><span>${r.fvgs?r.fvgs.bullish:0} / ${r.fvgs?r.fvgs.bearish:0}</span></div>
<div class="signal-row"><span>Order Blocks</span><span>${r.orderBlocks?r.orderBlocks.bullish:0} / ${r.orderBlocks?r.orderBlocks.bearish:0}</span></div>
<div class="signal-row"><span>RSI</span><span>${r.rsi||'--'}</span></div>
<div class="signal-row"><span>Session</span><span>${r.killzone?r.killzone.name:'--'}</span></div>
<div class="signal-row"><span>Score</span><span>${r.bullScore||0} Bull / ${r.bearScore||0} Bear</span></div>
${factorsHtml}
<p style="color:#6b7280;text-align:center;font-size:11px;margin-top:12px;">Not financial advice.</p>
</div>`;

const card=c.querySelector('.signal-card');
if(card) { card.style.opacity='1'; card.style.transform='none'; }
}

function setupHamburger() {
const hamburger=document.querySelector('.hamburger');
const sidebar=document.querySelector('.sidebar');
const overlay=document.querySelector('.sidebar-overlay');
if(hamburger) {
hamburger.addEventListener('click',()=>{
if(sidebar) sidebar.classList.toggle('active');
if(overlay) overlay.classList.toggle('active');
});
}
if(overlay) {
overlay.addEventListener('click',()=>{
if(sidebar) sidebar.classList.remove('active');
overlay.classList.remove('active');
});
}
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
