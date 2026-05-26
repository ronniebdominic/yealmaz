// ── Ye-Almaz Clinic PWA Service Worker ──────────────────────────────────────
const CACHE_NAME = 'yealmaz-clinic-v1';
const SHELL_ASSETS = ['/', '/index.html'];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  // Take over immediately — no need to wait for old tabs to close
  self.skipWaiting();
});

// ── Activate: delete stale caches from old versions ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. API calls (Railway backend) — Network-first, never cache
  //    If offline, return a structured JSON error so the app can show a banner
  if (url.hostname.includes('railway.app') || url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You are offline. Please check your connection.' }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'X-Offline': 'true',
            },
          }
        )
      )
    );
    return;
  }

  // 2. Static assets (JS bundles, images, fonts) — Cache-first, update in background
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // 3. Navigation (page loads) — Network-first, fall back to cached shell
  //    This keeps the app launchable when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          // Offline: serve the cached index.html so React Navigation can render
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // 4. Everything else — network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ── Background sync: retry failed uploads when back online ──────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'retry-uploads') {
    event.waitUntil(
      self.clients.matchAll().then((clients) =>
        clients.forEach((client) =>
          client.postMessage({ type: 'RETRY_UPLOADS' })
        )
      )
    );
  }
});
