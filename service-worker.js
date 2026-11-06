const CACHE_NAME = 'cornhill-shell-v23';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/assets/cornhill-icon.svg', '/assets/cornhill-school-crest.jpg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache authentication, database, storage, Edge Function or other cross-origin traffic.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await Promise.all([
            cache.put('/index.html', response.clone()),
            cache.put('/', response.clone())
          ]);
        }
        return response;
      } catch {
        return (await caches.match('/index.html')) ||
          (await caches.match('/')) ||
          Response.error();
      }
    })());
    return;
  }

  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
