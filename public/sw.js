/* Athave AI V14 cache refresh: public static files only.
   Never cache API results, authenticated pages, sessions, uploads or payment data. */
const CACHE = 'athave-static-v16-manual-20261012';
const STATIC = [
  '/offline.html', '/favicon.png', '/favicon-48.png', '/favicon.ico',
  '/styles.css', '/app.js', '/admin.js', '/manual.css', '/manual-app.js', '/manual-admin.css', '/manual-admin.js', '/pwa.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png', '/assets/unicorn-transparent.webp',
  '/assets/athave-logo.webp'
];
const ASSETS = new Set(STATIC);
// Recheck core code and styles online, rather than trapping users on an old UI.
const REVALIDATE = new Set(['/styles.css', '/app.js', '/admin.js', '/manual.css', '/manual-app.js', '/manual-admin.css', '/manual-admin.js', '/pwa.js']);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(STATIC.map((path) => new Request(path, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('athave-static-') && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.cache === 'no-store') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // HTML navigations always go to the network: never cache dynamic account pages.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      await caches.match('/offline.html') || Response.error()));
    return;
  }

  if (!ASSETS.has(url.pathname)) return;
  event.respondWith((async () => {
    if (REVALIDATE.has(url.pathname)) {
      try {
        const response = await fetch(new Request(request, { cache: 'no-cache' }));
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          await cache.put(url.pathname, response.clone());
        }
        return response;
      } catch {
        return await caches.match(url.pathname) || Response.error();
      }
    }

    const cached = await caches.match(url.pathname);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  })());
});
