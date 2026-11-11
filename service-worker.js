/* CORNHILL preview refresh: Parent Portal Guardian PIN setting toggle and administrator controls. */
/* CORNHILL offline application shell.
   Only public app shells, static assets and approved public CDN libraries are cached.
   Supabase/auth/API traffic, learner records, guardian data and financial data stay network-only. */
const CACHE_NAME = 'cornhill-shell-v96';
const STATIC_CACHE = 'cornhill-static-v96';
const SHELL = [
  '/', '/index.html', '/school.html', '/admissions.html', '/parents.html',
  '/evidence.html', '/notifications.html', '/records.html', '/banking.html',
  '/school-services.html', '/school-communications.html',
  '/apps/school-management/', '/apps/school-management/manifest.webmanifest',
  '/apps/admissions/', '/apps/admissions/manifest.webmanifest',
  '/apps/parent-guardian/', '/apps/parent-guardian/manifest.webmanifest',
  '/apps/evidence-capture/', '/apps/evidence-capture/manifest.webmanifest',
  '/apps/notifications/', '/apps/notifications/manifest.webmanifest',
  '/apps/records/', '/apps/records/manifest.webmanifest',
  '/apps/banking/', '/apps/banking/manifest.webmanifest',
  '/apps/staff-communications/', '/apps/staff-communications/manifest.webmanifest',
  '/apps/school-website/', '/apps/school-website/manifest.webmanifest',
  '/apps/hr-payroll/', '/apps/hr-payroll/manifest.webmanifest',
  '/apps/learning-resources/', '/apps/learning-resources/manifest.webmanifest',
  '/apps/school-library/', '/apps/school-library/manifest.webmanifest',
  '/apps/school-transport/', '/apps/school-transport/manifest.webmanifest',
  '/apps/student-welfare/', '/apps/student-welfare/manifest.webmanifest',
  '/apps/provider-integrations/', '/apps/provider-integrations/manifest.webmanifest',
  '/apps/system-health/', '/apps/system-health/manifest.webmanifest',
  '/apps/asset-maintenance/', '/apps/asset-maintenance/manifest.webmanifest',
  '/apps/visitor-register/', '/apps/visitor-register/manifest.webmanifest',
  '/apps/notice-board/', '/apps/notice-board/manifest.webmanifest',
  '/apps/school-calendar/', '/apps/school-calendar/manifest.webmanifest',
  '/apps/staff-communications/', '/apps/staff-communications/manifest.webmanifest',
  '/manifest.webmanifest', '/school.webmanifest', '/admissions.webmanifest',
  '/parents.webmanifest', '/evidence.webmanifest', '/notifications.webmanifest',
  '/records.webmanifest', '/banking.webmanifest', '/school-services.webmanifest', '/staff-communications.webmanifest',
  '/service-worker.js', '/assets/cornhill-school-badge.png',
  '/assets/cornhill-school-pwa-192.svg', '/assets/cornhill-school-pwa-512.svg',
  '/assets/app-isolation-guard.js', '/assets/cornhill-design-system.css', '/assets/cornhill-navigation.js', '/assets/cornhill-document-template-studio.js', '/assets/cornhill-learner-details-sheet.js', '/assets/cornhill-appearance.js',
  '/assets/cornhill-mark-import-mapping.js', '/assets/cornhill-notification-routing.js',
  '/assets/cornhill-offline.js', '/assets/cornhill-draft-crypto.js', '/assets/main-school-workspace-bridge.js',
  '/assets/school-services-collaboration.js', '/assets/cornhill-document-pdf-ocr.js'
];
const STATIC_CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js',
  'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];
const STATIC_HOSTS = new Set(['cdn.jsdelivr.net', 'cdnjs.cloudflare.com']);

async function enhanceHtml(response, includeRecordsTools) {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) return response;
  let html = await response.clone().text();
  if (!html.toLowerCase().includes('</head>') || !html.toLowerCase().includes('</body>')) return response;

  const offlineScript = '/assets/cornhill-offline.js';
  if (!html.includes(offlineScript)) {
    html = html.replace(/<\/head>/i, '<script src="' + offlineScript + '"></script></head>');
  }
  const recordsScript = '/assets/cornhill-document-pdf-ocr.js';
  if (includeRecordsTools && !html.includes(recordsScript)) {
    html = html.replace(/<\/body>/i, '<script src="' + recordsScript + '"></script></body>');
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async path => {
      try {
        const request = new Request(new URL(path, self.location.origin), { cache: 'reload' });
        const response = await fetch(request);
        if (!response.ok) {
          console.warn('Offline shell file was not available during install:', path, response.status);
          return;
        }
        const enhanced = (path === '/' || path.endsWith('.html'))
          ? await enhanceHtml(response, path === '/' || path === '/index.html')
          : response;
        await shell.put(request, enhanced);
      } catch (error) {
        // One optional app page or asset must not cancel installation of the shared shell.
        console.warn('Offline shell entry could not be cached:', path, error);
      }
    }));

    const assets = await caches.open(STATIC_CACHE);
    await Promise.all(STATIC_CDN.map(async url => {
      try {
        const request = new Request(url, { mode: 'no-cors', credentials: 'omit' });
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') await assets.put(request, response);
      } catch (error) {
        // Optional libraries can be added after the app shell is installed.
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
    // Do not cache Supabase, authentication, uploads, payments or any unknown API.
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
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const path = url.pathname === '/' ? '/' : url.pathname;
      try {
        let response = await fetch(request);
        if (response.ok) {
          const includeRecordsTools = ['/', '/index.html', '/apps/school-management/', '/apps/school-management'].includes(path);
          response = await enhanceHtml(response, includeRecordsTools);
          await cache.put(path, response.clone());
          if (path === '/' || path === '/index.html') await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(path) || await cache.match(path === '/' ? '/index.html' : path);
        if (cached) return cached;
        const root = await cache.match('/');
        if (root) return root;
        return new Response(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CORNHILL offline</title><body style="font:16px system-ui;padding:28px;color:#173d27"><h1>CORNHILL</h1><p>This workspace has not yet been opened on this device. Connect once to save its offline version.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  // Cache-first for same-origin public files; revalidate in the background.
  if (SHELL.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(async response => {
          if (response.ok) await cache.put(request, response);
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});