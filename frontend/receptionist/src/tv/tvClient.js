// Ye-Almaz — the TV's single live-state store. One socket, one snapshot, shared by all six screens.
//
// It deliberately does NOT use ../api.js or ../socket.js: those redirect to /login on a 401 and share the
// staff login, and a TV must never touch either. Data flow:
//   snapshot (authoritative) ── fetched on start, after every event (debounced), on reconnect, every minute
//   events (/tv socket)      ── numbered; used for animations and to know *when* to refetch
//   gap detection            ── an event whose number skips ahead triggers a catch-up fetch of what was missed
//   staleness                ── no successful contact for STALE_AFTER_MS => the screen says so
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const TV_TOKEN_KEY = 'ya_tv_token';
const HEARTBEAT_MS = 15000;
const RESYNC_MS = 60000;
const FALLBACK_POLL_MS = 5000;
const STALE_AFTER_MS = 45000;
const REFRESH_DEBOUNCE_MS = 500;
const HIGHLIGHT_MS = 2200;
const FEED_MAX = 8;

const safeStorage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

export function createTvStore({ preview = false } = {}) {
  let state = {
    phase: 'loading', // loading | pairing | ready
    conn: 'connecting', // connecting | live | reconnecting | stale
    config: null, snapshot: null, lastOkAt: 0, offsetMs: 0, error: null,
    feed: [], highlightEmployees: {}, celebration: null, criticalAlertAt: 0,
  };
  const listeners = new Set();
  const set = (patch) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };

  let socket = null, lastSeq = 0, started = false;
  let retryTimer = null, retryAttempt = 0, heartbeatTimer = null, resyncTimer = null, staleTimer = null, pollTimer = null, refreshTimer = null, refreshing = false, refreshAgain = false;
  let prevCriticalCount = null;

  const token = () => (preview ? safeStorage.get('ya_token') : safeStorage.get(TV_TOKEN_KEY));

  async function request(path, options = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(`${API_URL}/tv${path}`, {
        ...options, signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(options.headers || {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) { const e = new Error(body.error || 'Not authorised'); e.unauthorised = true; throw e; }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      if (body.serverTime) set({ offsetMs: new Date(body.serverTime).getTime() - Date.now() });
      return body;
    } finally { clearTimeout(t); }
  }

  const unauthorised = () => {
    if (!preview) safeStorage.del(TV_TOKEN_KEY);
    teardown();
    set({ phase: 'pairing', conn: 'connecting', snapshot: null, error: preview ? 'Sign in as an administrator to preview.' : 'This display is not paired, or its access was revoked.' });
  };

  function diffHighlights(prev, next) {
    if (!prev) return {};
    const key = (e) => `${e.currentCase?.caseNumber}|${e.currentCase?.stage}|${e.status}|${e.assignedCount}`;
    const before = new Map(prev.employees.map(e => [e.id, key(e)]));
    const out = { ...state.highlightEmployees };
    const until = Date.now() + HIGHLIGHT_MS;
    for (const e of next.employees) if (before.has(e.id) && before.get(e.id) !== key(e)) out[e.id] = until;
    for (const [id, t] of Object.entries(out)) if (t < Date.now()) delete out[id];
    return out;
  }

  async function refreshSnapshot() {
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    try {
      const snap = await request('/snapshot');
      const prev = state.snapshot;
      const crit = snap.kpis ? snap.kpis.delayed + snap.kpis.blocked : 0;
      const newlyCritical = prevCriticalCount != null && crit > prevCriticalCount;
      prevCriticalCount = crit;
      lastSeq = Math.max(lastSeq, snap.seq || 0);
      if (!state.config) request('/config').then(r => set({ config: r.config })).catch(() => {}); // the first settings request may have failed while the server was down
      set({ snapshot: snap, phase: 'ready', error: null, lastOkAt: Date.now(), highlightEmployees: diffHighlights(prev, snap), ...(newlyCritical ? { criticalAlertAt: Date.now() } : {}) });
      evaluateConn();
    } catch (err) {
      if (err.unauthorised) return unauthorised();
      set({ error: err.message });
    } finally {
      refreshing = false;
      if (refreshAgain) { refreshAgain = false; scheduleRefresh(); }
    }
  }
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; refreshSnapshot(); }, REFRESH_DEBOUNCE_MS);
  }

  function applyEvent(e) {
    if (e.seq <= lastSeq) return; // already accounted for (duplicate or covered by a snapshot)
    lastSeq = e.seq;
    const patch = { feed: [e, ...state.feed].slice(0, FEED_MAX) };
    if (e.type === 'READY_FOR_DISPATCH' || e.type === 'DELIVERED') patch.celebration = { at: Date.now(), caseNumber: e.caseNumber };
    set(patch);
    scheduleRefresh();
  }
  async function catchUp() {
    try {
      const { events } = await request(`/events?after=${lastSeq}`);
      for (const e of events) applyEvent(e);
    } catch (err) { if (err.unauthorised) unauthorised(); }
  }
  function onSocketEvent(e) {
    if (lastSeq > 0 && e.seq > lastSeq + 1) catchUp().then(() => applyEvent(e)); // numbers skipped: fetch what was missed first
    else applyEvent(e);
  }

  function evaluateConn() {
    if (!socket) return;
    const quiet = Date.now() - state.lastOkAt > STALE_AFTER_MS;
    const next = !socket.connected ? (quiet ? 'stale' : 'reconnecting') : (quiet ? 'stale' : 'live');
    if (next !== state.conn) set({ conn: next });
  }

  function scheduleReconnect() {
    if (retryTimer || !socket) return;
    const delay = Math.min(5000, 1000 * 2 ** retryAttempt++);
    retryTimer = setTimeout(() => { retryTimer = null; if (socket && !socket.connected) socket.connect(); }, delay);
  }

  function connectSocket() {
    socket = io(`${SOCKET_URL}/tv`, {
      auth: (cb) => cb({ token: token() }),
      reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, timeout: 8000,
    });
    socket.on('connect', () => { retryAttempt = 0; evaluateConn(); catchUp(); refreshSnapshot(); });
    socket.on('disconnect', (reason) => {
      evaluateConn();
      // socket.io only retries by itself after a network drop; when the *server* closes the connection (a restart,
      // a deploy, a forced disconnect) the client must ask again or the TV would stay dark until someone reloads it.
      if (reason === 'io server disconnect') scheduleReconnect();
    });
    socket.on('connect_error', (err) => {
      evaluateConn();
      if (err?.message === 'unauthorised') request('/config').catch(e => e.unauthorised && unauthorised()); // really revoked? the REST call decides
      // A connect refused by the server (as opposed to a network drop) is not retried by socket.io itself.
      if (socket && !socket.active) scheduleReconnect();
    });
    socket.on('tv:event', onSocketEvent);
    socket.on('tv:config', (config) => set({ config }));
    socket.on('tv:revoked', unauthorised);
    heartbeatTimer = setInterval(() => {
      if (!socket?.connected) return;
      socket.timeout(5000).emit('tv:ping', (err, res) => {
        if (err) return;
        set({ lastOkAt: Date.now(), offsetMs: res?.serverTime ? new Date(res.serverTime).getTime() - Date.now() : state.offsetMs });
        evaluateConn();
      });
    }, HEARTBEAT_MS);
    resyncTimer = setInterval(refreshSnapshot, RESYNC_MS);
    staleTimer = setInterval(evaluateConn, 5000);
    // While the socket is down, keep reading the authoritative snapshot so the screen heals even before it reconnects.
    pollTimer = setInterval(() => { if (!socket?.connected) refreshSnapshot(); }, FALLBACK_POLL_MS);
  }

  function teardown() {
    clearInterval(heartbeatTimer); clearInterval(resyncTimer); clearInterval(staleTimer); clearInterval(pollTimer); clearTimeout(refreshTimer); clearTimeout(retryTimer); retryTimer = null; retryAttempt = 0;
    heartbeatTimer = resyncTimer = staleTimer = pollTimer = refreshTimer = null;
    if (socket) { socket.removeAllListeners(); socket.disconnect(); socket = null; }
    started = false;
  }

  async function start() {
    if (started) return; // never open a second connection
    if (!token()) { set({ phase: 'pairing', error: preview ? 'Sign in as an administrator to preview.' : null }); return; }
    started = true;
    set({ phase: 'loading' });
    try {
      const { config } = await request('/config');
      set({ config });
    } catch (err) { if (err.unauthorised) return unauthorised(); set({ error: err.message }); }
    connectSocket();
    refreshSnapshot();
  }

  async function pair(code) {
    const res = await fetch(`${API_URL}/tv/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Pairing failed');
    safeStorage.set(TV_TOKEN_KEY, body.token);
    set({ error: null });
    await start();
  }

  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    start, pair, stop: teardown,
    // test hook: the number of live socket connections (must never exceed 1)
    _debug: () => ({ connected: !!socket, lastSeq }),
  };
}
