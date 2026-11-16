"use strict";

// Cache only public application-shell files. Never cache API responses,
// authenticated records, payment data, or any other private response.
const CACHE_NAME = "cornhill-public-shell-v2";
const STATIC_ASSETS = new Set([
  "/", "/offline-status.js", "/offline-status.css",
  "/", "/app", "/app.html", "/app.js", "/app.css",
  "/school", "/school.html", "/school.js", "/school.css",
  "/academics", "/academics.html", "/academics.js", "/academics.css",
  "/bursar", "/bursar.html", "/bursar.js", "/bursar.css",
  "/leadership", "/leadership.html", "/leadership.js", "/leadership.css",
  "/staff-operations", "/staff-operations.html", "/staff-operations.js", "/staff-operations.css",
  "/attendance-import", "/attendance-import.html", "/attendance-import.js", "/attendance-import.css",
  "/guardian", "/guardian.html", "/guardian.js", "/guardian.css"
]);

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([...STATIC_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("cornhill-public-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (!STATIC_ASSETS.has(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cacheKey = new Request(url.origin + url.pathname);
        await cache.put(cacheKey, response.clone());
      }
      return response;
    })
  );
});
