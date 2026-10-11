const CACHE_NAME = 'bmm-challenge-v14';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/app.css',
  '/js/firebase-config.js',
  '/js/privacy.js',
  '/js/aggregates.js',
  '/js/auth.js',
  '/js/challenge.js',
  '/js/margin.js',
  '/js/roadmap.js',
  '/js/checkin.js',
  '/js/progress.js',
  '/js/breathing-timer.js',
  '/js/peace-of-mind.js',
  '/js/survey.js',
  '/js/app.js',
  '/content/days.json',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/bitsy.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Fonts: cache-first (they rarely change) — must run before the
  // generic googleapis/gstatic passthrough below, which also matches font hosts
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Let Firebase handle its own requests
  if (url.hostname.includes('firestore') ||
      url.hostname.includes('identitytoolkit') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    return;
  }

  // App assets: network-first with cache fallback (ensures fresh deploys work).
  // Navigations (incl. manifest shortcuts like /?view=breathing) fall back to
  // the cached shell so an unvisited query URL still opens offline.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then(hit => {
        if (hit) return hit;
        if (event.request.mode === 'navigate') return caches.match('/index.html');
        return undefined;
      }))
  );
});
