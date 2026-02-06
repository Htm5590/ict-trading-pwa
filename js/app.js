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
const ict=new ICTAnalyzer();

// Fetch candle data from Binance (for crypto pairs)
async function fetchBinanceCandles(symbol, interval='15m', limit=100) {
try {
const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
const data=await r.json();
return data.map(k=>({
open:parseFloat(k[1]),
high:parseFloat(k[2]),
low:parseFloat(k[3]),
close:parseFloat(k[4]),
time:k[0]
}));
} catch(e) { console.log('Binance candles error',e); return null; }
}

// Fetch live price
async function fetchLivePrice(pair) {
if(pair.binance) {
try {
const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair.binance}`);
const d=await r.json();
return {price:parseFloat(d.price),live:true};
} catch(e) { console.log('Binance error',e); }
}
if(currentCategory==='forex') {
try {
const parts=pair.symbol.split('/');
const r=await fetch(`https://open.er-api.com/v6/latest/${parts[0]}`);
const d=await r.json();
if(d.rates&&d.rates[parts[1]]) return {price:d.rates[parts[1]],live:true};
} catch(e) { console.log('Forex API error',e); }
}
return {price:null,live:false};
}

// Fetch candle data - tries Binance first, then generates synthetic
async function fetchCandles(pair) {
if(pair.binance) {
const candles=await fetchBinanceCandles(pair.binance);
if(candles && candles.length>0) return candles;
}
return null; // Will use synthetic candles from analyzer
}

function formatPrice(p,sym) {
if(!p) return '--';
if(sym.includes('JPY')) return p.toFixed(3);
if(sym==='XAU/USD') return p.toFixed(2);
if(sym.includes('BTC')) return p.toFixed(1);
if(['US30','US100','US500'].includes(sym)) return p.toFixed(1);
return p.toFixed(5);
}

function createWidget(sym) {
const c=document.getElementById('tradingview_chart');
c.innerHTML='';
widget=new TradingView.widget({
autosize:true,symbol:sym.tv,interval:'15',timezone:'exchange',
theme:'dark',style:'1',locale:'en',toolbar_bg:'#111827',
enable_publishing:false,allow_symbol_change:false,
container_id:'tradingview_chart',
studies:['MASimple@tv-basicstudies','RSI@tv-basicstudies']
});
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
document.getElementById('signals-container').innerHTML=`<div class="signal-placeholder"><div class="placeholder-icon">🎯</div><p>Select a pair and click <strong>Analyze</strong></p><p class="sub">ICT Smart Money analysis with Order Blocks, FVGs & Liquidity</p></div>`;
}

function saveToHistory(result) {
if(result.signal==='NO SIGNAL') return;
const history=JSON.parse(localStorage.getItem('ict_signal_history')||'[]');
const signal={
id:Date.now().toString(),
timestamp:new Date().toISOString(),
pair:result.pair,
signal:result.signal,
entry:result.entry,
tp:result.tp,
sl:result.sl,
riskReward:result.riskReward,
structure:result.structure,
currentPrice:result.currentPrice,
confluenceScore:result.confluenceScore||0,
premiumDiscount:result.premiumDiscount||'',
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
btn.disabled=true;
btn.classList.add('loading');
container.innerHTML=`<div class="signal-loading"><div class="spinner"></div><span>Fetching live price...</span></div>`;
const {price,live}=await fetchLivePrice(currentSymbol);
container.innerHTML=`<div class="signal-loading"><div class="spinner"></div><span>Fetching candle data...</span></div>`;
const candles=await fetchCandles(currentSymbol);
container.innerHTML=`<div class="signal-loading"><div class="spinner"></div><span>Running ICT analysis (structure, FVGs, OBs, liquidity)...</span></div>`;
await new Promise(r=>setTimeout(r,300));
let result;
if(candles && candles.length>=30) {
// Use real candle data for analysis
result=ict.analyzeWithCandles(currentSymbol.symbol,candles,price,live);
} else {
// Fallback to synthetic candle generation
result=ict.analyze(currentSymbol.symbol,price,live);
}
saveToHistory(result);
renderSignal(result);
btn.disabled=false;
btn.classList.remove('loading');
}

function renderSignal(r) {
const c=document.getElementById('signals-container');
const liveTag=r.isLive?'<span class="live-tag">LIVE</span>':'';
const fvgOb=`${r.fvgCount||0} / ${r.obCount||0}`;
const pdZone=r.premiumDiscount||'';
const score=r.confluenceScore||'';
if(r.signal==='NO SIGNAL') {
c.innerHTML=`<div class="signal-card no-signal" style="opacity:1;transform:none"><div class="signal-card-header"><span class="signal-pair">${r.pair} ${liveTag}</span><span class="signal-badge neutral">NO SIGNAL</span></div><div class="signal-card-body"><div class="signal-row"><span>💰 Price Now</span><span class="value">${r.currentPrice}</span></div><div class="signal-row"><span>📊 Structure</span><span class="value">${r.structure}</span></div><div class="signal-row"><span>🔍 FVGs / OBs</span><span class="value">${fvgOb}</span></div><div class="signal-row"><span>📍 Zone</span><span class="value">${pdZone}</span></div></div><div class="signal-reason">${r.reason}</div></div>`;
return;
}
const isBuy=r.signal==='BUY';
c.innerHTML=`<div class="signal-card ${isBuy?'buy':'sell'}"><div class="signal-card-header"><span class="signal-pair">${r.pair} ${liveTag}</span><span class="signal-badge ${isBuy?'buy':'sell'}">${isBuy?'↑':'↓'} ${r.signal}</span></div><div class="signal-card-body"><div class="signal-row"><span>💰 Price Now</span><span class="value">${r.currentPrice}</span></div><div class="signal-row entry"><span>➡️ Entry Zone</span><span class="value">${r.entry}</span></div><div class="signal-row tp"><span>✅ Take Profit</span><span class="value">${r.tp}</span></div><div class="signal-row sl"><span>❌ Stop Loss</span><span class="value">${r.sl}</span></div><div class="signal-row"><span>🎯 Risk : Reward</span><span class="value">${r.riskReward}</span></div><div class="signal-row"><span>📊 Structure</span><span class="value">${r.structure}</span></div><div class="signal-row"><span>📍 Zone</span><span class="value">${pdZone}</span></div><div class="signal-row"><span>🔍 FVGs / OBs</span><span class="value">${fvgOb}</span></div>${score?`<div class="signal-row"><span>⭐ Confluence</span><span class="value">${score}/13</span></div>`:''}</div><div class="signal-reason">${r.reason}</div><div class="signal-disclaimer">⚠️ Educational only. Not financial advice.</div></div>`;
const card=c.querySelector('.signal-card');
if(window.gsap){gsap.fromTo(card,{opacity:0,y:30},{opacity:1,y:0,duration:0.5,ease:'power2.out'});}
else{card.style.opacity='1';card.style.transform='none';}
}

function setupHamburger() {
const hamburger=document.querySelector('.hamburger');
const sidebar=document.querySelector('.sidebar');
const overlay=document.querySelector('.sidebar-overlay');
if(hamburger) {
hamburger.addEventListener('click',()=>{
sidebar.classList.toggle('active');
overlay.classList.toggle('active');
});
}
if(overlay) {
overlay.addEventListener('click',()=>{
sidebar.classList.remove('active');
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
if('serviceWorker'in navigator) {
navigator.serviceWorker.register('/ict-trading-pwa/sw.js').catch(e=>console.log('SW error',e));
}
});
})();
