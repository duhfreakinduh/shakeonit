const CACHE_NAME = 'shakeonit-offline-v9';
const APP_FILES = [
  './', './index.html', './styles.css', './bonus.css', './ai-judge.css', './ai-vision.css', './judge-v3.css',
  './app-core.js', './app.js', './ai-judge.js', './ai-vision.js', './ai-runtime.js', './ai-recovery.js',
  './judge-v3.js', './judge-v4-hotfix.js', './manifest.webmanifest', './icon.svg'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' || /\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
    return response;
  })));
});
