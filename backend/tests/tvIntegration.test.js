// Integration test against a REAL PostgreSQL database — never production.
//   docker run -d --name ya-tv-test-pg -e POSTGRES_PASSWORD=throwaway_test_pw -e POSTGRES_DB=yatest -p 127.0.0.1:54329:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public npx prisma db push
//   (then create the TV tables from prisma/sql/2026-10-22-tv-command-center.sql — what production will run)
//   DATABASE_URL=... node --test tests/tvIntegration.test.js
// Refuses to run unless the database host is local.
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'integration-secret';
const url = process.env.DATABASE_URL || '';
const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
const LOCAL = ['localhost', '127.0.0.1', '::1'].includes(host);

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

if (!LOCAL) {
  test('tvIntegration: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { Server } = require('socket.io');
  const { io: ioClient } = require('../../frontend/receptionist/node_modules/socket.io-client');
  const prisma = require('../src/db');
  const tv = require('../src/services/tvService');

  const adminJwt = () => jwt.sign({ id: ids.admin, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
  let server, base, root, ioServer;
  const ids = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const json = async (path, { token, method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const connect = (token) => new Promise((resolve, reject) => {
    const s = ioClient(`${root}/tv`, { auth: { token }, reconnection: false, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => { s.close(); reject(e); });
  });

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE production_events, display_sessions, tv_config RESTART IDENTITY');
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, attendance_events, users, clinics CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@test.local', password: 'x', role: 'ADMIN' } }); // the auth middleware re-reads the account
    ids.admin = admin.id;
    const clinic = await prisma.clinic.create({ data: { name: 'SECRET CLINIC NAME', password: 'x', email: 'c@test.local' } });
    const abebe = await prisma.user.create({ data: { name: 'Abebe Tesfaye', email: 'abebe@test.local', password: 'x', role: 'LAB_TECH', departments: ['DESIGNING'] } });
    const kebede = await prisma.user.create({ data: { name: 'Kebede Alemu', email: 'kebede@test.local', password: 'x', role: 'LAB_TECH', departments: ['MILLING'] } });
    const c = await prisma.case.create({ data: { caseNumber: 'YA-1042', patientName: 'SECRET PATIENT NAME', workType: 'Zirconia', units: 3, status: 'CASE_ACCEPTED', clinicId: clinic.id, totalAmount: 7777 } });
    await prisma.caseStage.create({ data: { caseId: c.id, stageName: 'CASE_ACCEPTED', scannedBy: 'Receptionist' } });
    // clock-in earlier today (clamped to after local midnight so the test is also valid just after 00:00)
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const clockIn = new Date(Math.max(midnight.getTime() + 1000, Date.now() - 3 * 3600e3));
    await prisma.attendanceEvent.createMany({ data: [
      { userId: abebe.id, timestamp: clockIn, type: 'CLOCK_IN', source: 'BIOMETRIC' },
      { userId: kebede.id, timestamp: clockIn, type: 'CLOCK_IN', source: 'BIOMETRIC' },
    ] });
    Object.assign(ids, { clinic: clinic.id, abebe: abebe.id, kebede: kebede.id, caseId: c.id });

    const app = express();
    app.use(express.json());
    const httpServer = http.createServer(app);
    ioServer = new Server(httpServer, { cors: { origin: '*' } });
    app.set('io', ioServer);
    // same /tv namespace wiring as src/index.js
    const tvNs = ioServer.of('/tv');
    tv.setNamespace(tvNs);
    tvNs.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      try {
        const display = await tv.verifyDisplayToken(token);
        if (display) { socket.display = display; return next(); }
        const user = token ? jwt.verify(token, process.env.JWT_SECRET) : null;
        if (user?.role === 'ADMIN') return next();
      } catch { /* unauthorised */ }
      next(new Error('unauthorised'));
    });
    tvNs.on('connection', (socket) => { socket.join(tv.TV_ROOM); if (socket.display) socket.join(`display_${socket.display.id}`); });
    app.use('/api/tv', require('../src/routes/tv'));
    app.use('/api/scan', require('../src/routes/scan'));
    server = httpServer;
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    root = `http://127.0.0.1:${server.address().port}`;
    base = `${root}/api`;
    // identity rows the auth middleware reads
    ids.abebeJwt = jwt.sign({ id: abebe.id, role: 'LAB_TECH', name: 'Abebe Tesfaye', departments: ['DESIGNING'] }, process.env.JWT_SECRET);
    ids.kebedeJwt = jwt.sign({ id: kebede.id, role: 'LAB_TECH', name: 'Kebede Alemu', departments: ['MILLING'] }, process.env.JWT_SECRET);
  });
  test.after(async () => { ioServer?.close(); await prisma.$disconnect(); });

  let displayToken, displayId;

  test('admin pairs a display; the code works once; the token is stored hashed', async () => {
    const created = await json('/tv/displays', { token: adminJwt(), method: 'POST', body: { label: 'Lab wall TV' } });
    assert.equal(created.status, 201);
    const paired = await json('/tv/pair', { method: 'POST', body: { code: created.body.code } });
    assert.equal(paired.status, 200);
    displayToken = paired.body.token; displayId = paired.body.id;
    assert.match(displayToken, /^tvd_/);
    assert.equal((await json('/tv/pair', { method: 'POST', body: { code: created.body.code } })).status, 400); // single use
    const row = await prisma.displaySession.findUnique({ where: { id: displayId } });
    assert.ok(row.tokenHash && row.tokenHash !== displayToken && !JSON.stringify(row).includes(displayToken));
  });

  test('snapshot from real tables: the tech is clocked in and available; no sensitive data', async () => {
    const r = await json('/tv/snapshot', { token: displayToken });
    assert.equal(r.status, 200);
    const abebe = r.body.employees.find(e => e.name === 'Abebe Tesfaye');
    assert.equal(abebe.status, 'AVAILABLE');
    const text = JSON.stringify(r.body);
    for (const s of ['SECRET PATIENT NAME', 'SECRET CLINIC NAME', '7777', 'totalAmount', 'patientName']) assert.ok(!text.includes(s), s);
    assert.equal(r.body.kpis.awaitingProcessing, 1);
  });

  test('a real scan writes an event, pushes it live, and the card changes owner', async () => {
    const live = await connect(displayToken);
    const got = new Promise(res => live.once('tv:event', res));
    const scan = await json(`/scan/${ids.caseId}`, { token: ids.abebeJwt, method: 'POST', body: { department: 'DESIGNING', techName: 'Abebe Tesfaye' } });
    assert.equal(scan.status, 200, JSON.stringify(scan.body));
    const evt = await Promise.race([got, sleep(4000).then(() => null)]);
    live.close();
    assert.ok(evt, 'no live event received');
    assert.equal(evt.caseNumber, 'YA-1042'); assert.equal(evt.stage, 'DESIGNING'); assert.equal(evt.actor, 'Abebe');
    assert.ok(!JSON.stringify(evt).includes('SECRET'));

    await sleep(3100); // let the 3 s snapshot cache lapse (a new event also clears it)
    const snap = (await json('/tv/snapshot', { token: displayToken })).body;
    const abebe = snap.employees.find(e => e.name === 'Abebe Tesfaye');
    assert.equal(abebe.status, 'WORKING');
    assert.equal(abebe.currentCase.caseNumber, 'YA-1042');
    assert.equal(abebe.currentCase.stage, 'DESIGNING');
  });

  test('transfer: after Kebede scans it into milling, Abebe is free and the case belongs to Kebede', async () => {
    const scan = await json(`/scan/${ids.caseId}`, { token: ids.kebedeJwt, method: 'POST', body: { department: 'MILLING', techName: 'Kebede Alemu' } });
    assert.equal(scan.status, 200, JSON.stringify(scan.body));
    const snap = (await json('/tv/snapshot', { token: displayToken })).body;
    const abebe = snap.employees.find(e => e.name === 'Abebe Tesfaye');
    const kebede = snap.employees.find(e => e.name === 'Kebede Alemu');
    assert.equal(abebe.currentCase, null);
    assert.equal(abebe.completedToday, 1);
    assert.equal(kebede.currentCase.caseNumber, 'YA-1042');
    assert.equal(kebede.currentCase.stage, 'MILLING_SINTERING');
    assert.equal(snap.critical.unassigned.length, 0);
  });

  test('gap recovery: events after a cursor come back in order, with no duplicates', async () => {
    const all = (await json('/tv/events?after=0', { token: displayToken })).body;
    assert.ok(all.events.length >= 2);
    const seqs = all.events.map(e => e.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
    assert.equal(new Set(seqs).size, seqs.length);
    const after = (await json(`/tv/events?after=${seqs[0]}`, { token: displayToken })).body;
    assert.equal(after.events.length, seqs.length - 1);
    assert.equal(after.latestSeq, seqs[seqs.length - 1]);
  });

  test('concurrent scans stay consistent: sequence numbers are unique and increasing', async () => {
    const rows = await Promise.all(Array.from({ length: 25 }, (_, i) => tv.recordEvent({ type: 'STATUS_CHANGED', caseNumber: `YA-C${i}`, stage: 'GLAZING' })));
    const seqs = rows.map(r => Number(r.seq));
    assert.equal(new Set(seqs).size, 25);
    const db = await prisma.productionEvent.count();
    assert.ok(db >= 27);
  });

  test('config saves, is clamped, and reaches a connected TV live', async () => {
    const live = await connect(displayToken);
    const got = new Promise(res => live.once('tv:config', res));
    const saved = await json('/tv/config', { token: adminJwt(), method: 'PUT', body: { title: 'Lab TV', transitionMs: 99999, performance: { dailyTargets: { DESIGNING: 8 } } } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.config.transitionMs, 3000);
    const pushed = await Promise.race([got, sleep(3000).then(() => null)]);
    live.close();
    assert.equal(pushed?.title, 'Lab TV');
    assert.equal((await json('/tv/config', { token: displayToken })).body.config.performance.dailyTargets.DESIGNING, 8);
  });

  test('a display token cannot reach staff or admin endpoints', async () => {
    assert.equal((await json('/tv/config', { token: displayToken, method: 'PUT', body: {} })).status, 401);
    assert.equal((await json('/tv/displays', { token: displayToken })).status, 401);
  });

  test('revoking drops the live connection and blocks every request', async () => {
    const live = await connect(displayToken);
    const revoked = new Promise(res => live.once('tv:revoked', () => res(true)));
    const r = await json(`/tv/displays/${displayId}`, { token: adminJwt(), method: 'DELETE' });
    assert.equal(r.status, 200);
    assert.equal(await Promise.race([revoked, sleep(3000).then(() => false)]), true);
    live.close();
    await sleep(10100); // the 10 s verification cache
    assert.equal((await json('/tv/snapshot', { token: displayToken })).status, 401);
    await assert.rejects(connect(displayToken));
  });

  test('a stranger and a staff (non-admin) token cannot connect to the TV socket', async () => {
    await assert.rejects(connect('nonsense'));
    await assert.rejects(connect(ids.abebeJwt));
  });
}
