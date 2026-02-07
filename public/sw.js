const CACHE_NAME = 'bmm-challenge-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/app.css',
  '/js/firebase-config.js',
  '/js/auth.js',
  '/js/challenge.js',
  '/js/checkin.js',
  '/js/progress.js',
  '/js/breathing-timer.js',
  '/js/peace-of-mind.js',
  '/js/survey.js',
  '/js/app.js',
  '/content/days.json',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
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

  // Let Firebase handle its own requests
  if (url.hostname.includes('firestore') ||
      url.hostname.includes('identitytoolkit') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    return;
  }

  // Google Fonts: cache-first (they rarely change)
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

  // App assets: network-first with cache fallback (ensures fresh deploys work)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
