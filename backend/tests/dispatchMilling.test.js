// The dispatch "In Milling" list: every case scanned at Milling / Sintering that is still in production, wherever it is now
// (real local PostgreSQL; refuses non-local hosts).
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public node --test --test-concurrency=1 tests/dispatchMilling.test.js
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'dm-secret';
process.env.ADMIN_REASON_RULE = 'off';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('dispatchMilling: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const prisma = require('../src/db');
  let server, base, token;

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, clinics CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    token = jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
    const clinic = await prisma.clinic.create({ data: { name: 'C', password: 'x', email: 'c@c.local' } });
    const mk = async (patientName, status, milled) => {
      const c = await prisma.case.create({ data: { patientName, workType: 'Zirconia', clinicId: clinic.id, status, caseNumber: `YDL-${patientName}` } });
      if (milled) await prisma.caseStage.create({ data: { caseId: c.id, stageName: 'MILLING_SINTERING', scannedBy: 'Tech (MIL)' } });
      return c;
    };
    await mk('AtMilling', 'MILLING_SINTERING', true);
    await mk('MovedOn', 'GLAZING', true);
    await mk('ReadyAlready', 'READY_TO_DISPATCH', true);
    await mk('Delivered', 'DELIVERED', true);
    await mk('NeverMilled', 'DESIGNING', false);
    const app = express();
    app.use(express.json());
    app.use('/api/dispatch', require('../src/routes/dispatch'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('lists every case scanned at milling that is still in production, including ones that moved on', async () => {
    const r = await fetch(`${base}/dispatch/milling`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200);
    const names = (await r.json()).map(c => c.patientName).sort();
    assert.deepEqual(names, ['AtMilling', 'MovedOn']);
  });
}
