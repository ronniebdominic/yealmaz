// Authorization of the TV API, with the database and service stubbed out (no real DB needed).
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

const stubFor = (rel, exports) => {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
const users = { admin: { role: 'ADMIN', isActive: true, departments: [] }, lab: { role: 'LAB_TECH', isActive: true, departments: [] } };
stubFor('src/db.js', { user: { findUnique: async ({ where }) => users[where.id] || null }, clinic: { findUnique: async () => null }, displaySession: { findMany: async () => [] } });
const calls = [];
stubFor('src/services/tvService.js', {
  verifyDisplayToken: async (t) => (t === 'tvd_good' ? { id: 'd1' } : null),
  getSnapshot: async () => ({ seq: 1, kpis: {}, employees: [] }),
  loadConfig: async () => ({ title: 'x' }),
  eventsAfter: async (n) => { calls.push(['events', n]); return []; },
  latestSeq: async () => 1,
  pairDisplay: async (code) => (code === 'GOOD1-CODE1' ? { token: 'tvd_new', id: 'd2', label: 'Wall' } : null),
  saveConfig: async (c) => c, createPairing: async () => ({ id: 'p', code: 'X', expiresAt: new Date() }), revokeDisplay: async () => {},
});

const app = express();
app.use(express.json());
app.use('/api/tv', require('../src/routes/tv'));
let server, base;
test.before(async () => { server = http.createServer(app); await new Promise(r => server.listen(0, r)); base = `http://127.0.0.1:${server.address().port}/api/tv`; });
test.after(() => server.close());

const bearer = (t) => ({ headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' } });
const adminJwt = () => jwt.sign({ id: 'admin', role: 'ADMIN', name: 'A' }, process.env.JWT_SECRET);
const labJwt = () => jwt.sign({ id: 'lab', role: 'LAB_TECH', name: 'L' }, process.env.JWT_SECRET);

test('no credentials -> 401', async () => {
  assert.equal((await fetch(`${base}/snapshot`)).status, 401);
});
test('unknown or revoked display token -> 401 with a code the TV understands', async () => {
  const r = await fetch(`${base}/snapshot`, bearer('tvd_revoked'));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'DISPLAY_REVOKED');
});
test('paired display can read the snapshot, config and events', async () => {
  for (const p of ['/snapshot', '/config', '/events?after=0']) assert.equal((await fetch(base + p, bearer('tvd_good'))).status, 200, p);
});
test('a display token cannot change settings or manage displays', async () => {
  assert.equal((await fetch(`${base}/config`, { method: 'PUT', ...bearer('tvd_good'), body: '{}' })).status, 401);
  assert.equal((await fetch(`${base}/displays`, bearer('tvd_good'))).status, 401);
  assert.equal((await fetch(`${base}/displays`, { method: 'POST', ...bearer('tvd_good'), body: '{"label":"x"}' })).status, 401);
});
test('only admins may read as a user or manage the TV', async () => {
  assert.equal((await fetch(`${base}/snapshot`, bearer(labJwt()))).status, 403);
  assert.equal((await fetch(`${base}/snapshot`, bearer(adminJwt()))).status, 200);
  assert.equal((await fetch(`${base}/displays`, bearer(labJwt()))).status, 403);
  assert.equal((await fetch(`${base}/config`, { method: 'PUT', ...bearer(adminJwt()), body: '{}' })).status, 200);
});
test('pairing: bad code -> 400, good code returns the token once', async () => {
  const post = (code) => fetch(`${base}/pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  assert.equal((await post('WRONG')).status, 400);
  const ok = await post('GOOD1-CODE1');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).token, 'tvd_new');
});
test('events needs a valid cursor', async () => {
  assert.equal((await fetch(`${base}/events?after=abc`, bearer('tvd_good'))).status, 400);
  assert.equal((await fetch(`${base}/events?after=-1`, bearer('tvd_good'))).status, 400);
});
