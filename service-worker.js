const CACHE_NAME = 'wargame-v12.18'; 

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
  // '/images/terrain/grass.png',  
  // '/images/terrain/forest.png',
  // '/images/terrain/road.png',
  // '/images/terrain/hill.png',
  // '/images/terrain/water.png',
  // '/images/terrain/swamp_passable.png',
  // '/images/terrain/swamp_impassable.png',
  // '/images/terrain/bushes.png',
  // '/images/terrain/rocks.png',
  // '/images/terrain/trenches.png',
  // '/images/terrain/hill_slope_1.png',
  // '/images/terrain/hill_slope_2.png',
  // '/images/terrain/hill_slope_3.png'
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
