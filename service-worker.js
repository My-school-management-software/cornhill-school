/* CORNHILL offline application shell and safe static-asset cache.
   Never cache Supabase API/auth traffic, Edge Functions, guardian data, or payments. */
const CACHE_NAME = 'cornhill-shell-v65';
const SHELL = [
  '/',
  '/index.html',
  '/parents.html',
  '/evidence.html',
  '/banking.html',
  '/evidence.webmanifest',
  '/admissions.webmanifest',
  '/school-services.webmanifest',
  '/banking.webmanifest',
  '/manifest.webmanifest',
  '/service-worker.js',
  '/assets/cornhill-school-badge.png',
  '/assets/cornhill-design-system.css',
  '/assets/cornhill-appearance.js',
  '/assets/main-school-workspace-bridge.js',
  '/school-services.html',
  '/assets/school-services-collaboration.js',
  '/school-communications.html',
  '/school.html',
  '/admissions.html'
];
const STATIC_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];
const STATIC_CACHE = 'cornhill-static-v65';
const STATIC_HOSTS = new Set(['cdn.jsdelivr.net']);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE_NAME);
    await shell.addAll(SHELL);
    const assets = await caches.open(STATIC_CACHE);
    await Promise.all(STATIC_CDN.map(async url => {
      try {
        const request = new Request(url, { mode: 'no-cors', credentials: 'omit' });
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') await assets.put(request, response);
      } catch (error) {
        // A failed optional CDN precache must not prevent the school shell installing.
        console.warn('Optional offline library was not cached:', url, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('cornhill-shell-') || key.startsWith('cornhill-static-'))
      .filter(key => key !== CACHE_NAME && key !== STATIC_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    // Cache only known public JavaScript libraries. All Supabase/auth/API traffic
    // and all other cross-origin requests remain network-only.
    if (!STATIC_HOSTS.has(url.hostname) || !STATIC_CDN.some(asset => url.href.startsWith(asset))) return;
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    const isParentPortal = url.pathname === '/p' ||
      url.pathname === '/parents.html' ||
      url.pathname === '/parents';
    const isEvidencePortal = url.pathname === '/evidence.html' || url.pathname === '/evidence';
    const isBankingPortal = url.pathname === '/banking.html' || url.pathname === '/banking';
    const isServicesPortal = url.pathname === '/school-services.html';
    const isPublicSchoolSite = url.pathname === '/school.html';
    const isAdmissionsPortal = url.pathname === '/admissions.html';
    const isCommunicationsPortal = url.pathname === '/school-communications.html';
    const isMainApp = url.pathname === '/' || url.pathname === '/index.html';
    const routeCacheKey = isParentPortal ? '/parents.html' : isEvidencePortal ? '/evidence.html' : isBankingPortal ? '/banking.html' : isServicesPortal ? '/school-services.html' : isPublicSchoolSite ? '/school.html' : isAdmissionsPortal ? '/admissions.html' : isCommunicationsPortal ? '/school-communications.html' : '/index.html';
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          // Keep guardian, phone evidence, banking, and school-admin shells separate.
          await cache.put(routeCacheKey, response.clone());
          if (isMainApp) await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(routeCacheKey);
        if (cached) return cached;
        if (isParentPortal) {
          return new Response('The CORNHILL Parent Portal is offline. Reconnect to verify the guardian account and load learner records.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        if (isEvidencePortal) {
          return new Response('CORNHILL Evidence Capture is offline. Reconnect to receive requests, verify authorisation, and upload documents.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        if (isBankingPortal) {
          return new Response('CORNHILL Banking is offline. Reconnect before recording deposits, requesting withdrawals, or checking verified balances.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        if (isCommunicationsPortal) {
          return new Response('CORNHILL Staff Communications is offline. Reconnect to authenticate staff and refresh notices and events.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        if (isServicesPortal) {
          return new Response('CORNHILL School Services is offline. Reconnect to verify your staff account before opening leave, library, transport, welfare or property records.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        if (isAdmissionsPortal) {
          return new Response('CORNHILL Admissions is offline. Reconnect before submitting an enquiry; no offline form submission is stored.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        if (isPublicSchoolSite) {
          return new Response('The CORNHILL public school website is unavailable offline on this device. Reconnect to load current school information.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        return (await caches.match('/')) ||
          new Response('CORNHILL is offline and its saved app shell is unavailable on this device. Reconnect once to load the application.', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  // Same-origin app assets: cache-first so installed clients can start without internet.
  if (SHELL.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        fetch(request).then(async response => {
          if (response.ok) (await caches.open(CACHE_NAME)).put(request, response);
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});
