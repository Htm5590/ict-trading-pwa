const CACHE_NAME = 'ict-trading-v8';
const ASSETS = [
  '/ict-trading-pwa/',
  '/ict-trading-pwa/index.html',
  '/ict-trading-pwa/css/style.css',
  '/ict-trading-pwa/js/app.js',
  '/ict-trading-pwa/js/ict-analyzer.js',
  '/ict-trading-pwa/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
