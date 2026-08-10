const CACHE_NAME = 'wargame-v12.39';

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/AIRF.png',
  '/images/BeVe.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
