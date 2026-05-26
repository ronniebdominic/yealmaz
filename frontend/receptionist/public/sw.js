// Ye-Almaz Staff Frontend — Service Worker
const CACHE = 'ya-staff-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  // Guard: skip non-http(s) schemes (chrome-extension://, data:, blob:, etc.)
  // The Cache API only accepts http/https — calling cache.put() on anything
  // else throws, and fetch() on chrome-extension:// rejects.
  if (!e.request.url.startsWith('http')) return;

  const url = new URL(e.request.url);

  // 1. API calls — network-first, offline returns structured error
  if (url.pathname.includes('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(
            r => r || new Response(
              JSON.stringify({ error: 'You are offline.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
    );
    return;
  }

  // 2. Navigation — network-first, fall back to cached index.html for SPA routing
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/index.html').then(r => r || caches.match('/'))
      )
    );
    return;
  }

  // 3. Static assets — cache-first, always resolve to a real Response
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        new Response('', { status: 503, statusText: 'Service Unavailable' })
      );
    })
  );
});
