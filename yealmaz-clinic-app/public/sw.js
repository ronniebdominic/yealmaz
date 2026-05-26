// ── Ye-Almaz Clinic PWA Service Worker ──────────────────────────────────────
const CACHE_NAME = 'yealmaz-clinic-v1';
const SHELL_ASSETS = ['/', '/index.html'];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
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

  // ── Guard: skip anything that isn't http/https ───────────────────────────
  // chrome-extension://, data:, blob:, etc. can't be cached and must be
  // handled by the browser natively.
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // 1. API calls (Railway backend) — let the browser handle them directly.
  //    We only intercept when offline to return a readable JSON error instead
  //    of a silent network failure.
  if (url.hostname.includes('railway.app') || url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request)
        .catch(() =>
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

  // 2. Static assets (JS bundles, images, fonts) — Cache-first, update in bg
  //    Only cache same-origin or CDN assets (http/https already guaranteed above)
  if (
    request.destination === 'script' ||
    request.destination === 'style'  ||
    request.destination === 'image'  ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          // Only cache successful same-origin responses
          if (response.ok && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached); // if network fails, cached is already the fallback
        return cached || networkFetch;
      })
    );
    return;
  }

  // 3. Navigation (page loads) — Network-first, fall back to cached shell
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
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // 4. Everything else — network with graceful cache fallback
  //    Always resolve to a real Response (never undefined).
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then(
        (cached) =>
          cached ||
          new Response('', {
            status: 503,
            statusText: 'Service Unavailable',
          })
      )
    )
  );
});

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Ye-Almaz Clinic', body: event.data.text() };
  }

  const { title, body, icon = '/assets/icon.png', data = {} } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/assets/icon.png',
      vibrate: [200, 100, 200],
      data,
      requireInteraction: false,
    })
  );
});

// ── Notification click: open / focus the app ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const caseId = event.notification.data?.caseId;
  const url = caseId ? `/?caseId=${caseId}` : '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'OPEN_CASE', caseId });
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ── Background sync: retry failed uploads when back online ──────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'retry-uploads') {
    event.waitUntil(
      self.clients.matchAll().then((clientList) =>
        clientList.forEach((client) =>
          client.postMessage({ type: 'RETRY_UPLOADS' })
        )
      )
    );
  }
});
