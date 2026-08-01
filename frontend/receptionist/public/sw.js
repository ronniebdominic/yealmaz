// Ye-Almaz Staff Frontend — Service Worker
// Bump CACHE version any time you want to force all clients to get fresh files
const CACHE = 'ya-staff-v4';

self.addEventListener('install', (e) => {
  // Take over immediately without waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Delete ALL old caches so stale JS bundles are never served
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Guard: skip non-http(s) schemes (chrome-extension://, data:, blob:, etc.)
  if (!e.request.url.startsWith('http')) return;

  const url = new URL(e.request.url);

  // 1. API calls — always go to network; return offline error only if unreachable
  if (url.hostname.includes('railway.app') || url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(
          JSON.stringify({ error: 'You are offline. Please check your connection.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 2. Navigation — always network-first so fresh HTML is always loaded
  //    Falls back to cached index.html only when truly offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/index.html').then(r => r || caches.match('/'))
      )
    );
    return;
  }

  // 3. Static assets — cache-first with network update in background
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('', { status: 503 }));
      return cached || networkFetch;
    })
  );
});

// ── Push notifications ───────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Ye-Almaz', body: event.data.text() };
  }

  const { title, body, icon = '/logo.png', data = {} } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: '/logo.png',
      vibrate: [200, 100, 200],
      data,
      requireInteraction: false,
    })
  );
});

// ── Notification click: open / focus the app ──────────────────
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
