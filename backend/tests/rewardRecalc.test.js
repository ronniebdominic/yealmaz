// Correcting reward points awarded before they were tied to acceptance (real local PostgreSQL; refuses non-local hosts).
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public node --test --test-concurrency=1 tests/rewardRecalc.test.js
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'rw-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('rewardRecalc: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const prisma = require('../src/db');
  const ids = {}; let server, base;
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const mkCase = (clinicId, extra) => prisma.case.create({ data: { patientName: 'P', workType: 'PFM', clinicId, ...extra } });
  const earn = (clinicId, caseId, points) => prisma.rewardTransaction.create({ data: { clinicId, caseId, type: 'EARN', points, description: `Case submitted — x (claimed)` } });
  const totals = async (clinicId) => prisma.clinicPoints.findUnique({ where: { clinicId } });

  test.before(async () => {
    await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS case_number_seq START 26000000');
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, clinics, clinic_points, reward_transactions CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    const rec = await prisma.user.create({ data: { name: 'Rec', email: 'r@t.local', password: 'x', role: 'RECEPTIONIST' } });
    ids.admin = jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
    ids.rec = jwt.sign({ id: rec.id, role: 'RECEPTIONIST', name: 'Rec' }, process.env.JWT_SECRET);

    const a = await prisma.clinic.create({ data: { name: 'Clinic A', password: 'x', email: 'a@c.local' } });
    const b = await prisma.clinic.create({ data: { name: 'Clinic B', password: 'x', email: 'b@c.local' } });
    Object.assign(ids, { a: a.id, b: b.id });

    // A: claimed 50 units, lab recorded 2 (earned 2500, should be 100)
    ids.c1 = (await mkCase(a.id, { status: 'CASE_ACCEPTED', caseNumber: 'YDL1', units: 2 })).id;
    // A: not accepted yet (earned 100 at submission)
    ids.c2 = (await mkCase(a.id, { status: 'PENDING_PICKUP', units: 2 })).id;
    // A: already right (4 units x 50)
    ids.c3 = (await mkCase(a.id, { status: 'DESIGNING', caseNumber: 'YDL3', units: 4 })).id;
    // B: claimed 100 units, lab recorded 1 (earned 5000, should be 50) - but B has already spent 4,900
    ids.c4 = (await mkCase(b.id, { status: 'CASE_ACCEPTED', caseNumber: 'YDL4', units: 1 })).id;
    await earn(a.id, ids.c1, 2500); await earn(a.id, ids.c2, 100); await earn(a.id, ids.c3, 200);
    await prisma.rewardTransaction.create({ data: { clinicId: a.id, type: 'EARN', points: 30, description: 'Refund: redemption rejected' } }); // no case: never touched
    await prisma.clinicPoints.create({ data: { clinicId: a.id, totalEarned: 2830, totalRedeemed: 0 } });
    await earn(b.id, ids.c4, 5000);
    await prisma.clinicPoints.create({ data: { clinicId: b.id, totalEarned: 5000, totalRedeemed: 4900 } });

    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/rewards', require('../src/routes/rewards'));
    app.use('/api/cases', require('../src/routes/cases'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('only an admin may run it', async () => {
    assert.equal((await call('/rewards/recalculate', { token: ids.rec, method: 'POST', body: {} })).status, 403);
  });

  test('a preview reports what would change and writes nothing', async () => {
    const r = await call('/rewards/recalculate', { token: ids.admin, method: 'POST', body: {} });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.applied, false);
    assert.equal(r.body.summary.casesChanged, 3, 'claimed-units case, not-yet-accepted case, and the clinic that already spent');
    assert.equal(r.body.summary.casesHeldUntilAccepted, 1);
    assert.equal(r.body.summary.pointsRemoved, (2500 - 100) + 100 + (5000 - 50));
    assert.equal(r.body.summary.clinicsWithShortfall, 1);
    assert.equal((await totals(ids.a)).totalEarned, 2830, 'nothing written by a preview');
    assert.equal(await prisma.rewardTransaction.count({ where: { type: 'PENDING' } }), 0);
  });

  test('applying corrects accepted cases to the lab\'s units, holds unaccepted ones, and never takes back points already spent', async () => {
    const r = await call('/rewards/recalculate', { token: ids.admin, method: 'POST', body: { apply: true } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.applied, true);

    // Clinic A: 100 (c1) + 0 held (c2) + 200 (c3) + 30 refund (untouched) = 330
    assert.equal((await totals(ids.a)).totalEarned, 330);
    const c1 = await prisma.rewardTransaction.findFirst({ where: { caseId: ids.c1 } });
    assert.equal(c1.points, 100);
    assert.match(c1.description, /corrected from 2500 to 100/);
    const c2 = await prisma.rewardTransaction.findFirst({ where: { caseId: ids.c2 } });
    assert.deepEqual([c2.type, c2.points], ['PENDING', 0]);
    assert.equal((await prisma.rewardTransaction.findFirst({ where: { caseId: ids.c3 } })).points, 200, 'an already-right case is left alone');
    assert.equal((await prisma.rewardTransaction.findFirst({ where: { clinicId: ids.a, caseId: null } })).points, 30, 'a refund is not a case award');

    // Clinic B has spent 4,900: its total is not pushed below that
    const b = await totals(ids.b);
    assert.equal(b.totalEarned, 4900);
    assert.equal(b.totalEarned - b.totalRedeemed, 0);
    const bClinic = r.body.clinics.find(c => c.clinicId === ids.b);
    assert.equal(bClinic.shortfall, 4850);
  });

  test('running it again changes nothing', async () => {
    const r = await call('/rewards/recalculate', { token: ids.admin, method: 'POST', body: { apply: true } });
    assert.equal(r.body.summary.casesChanged, 0);
    assert.equal((await totals(ids.a)).totalEarned, 330);
  });

  test('a held case earns its points when the lab accepts it, from the case as accepted', async () => {
    await prisma.case.update({ where: { id: ids.c2 }, data: { units: 3 } });
    const acc = await call(`/cases/${ids.c2}/status`, { token: ids.admin, method: 'PATCH', body: { status: 'CASE_ACCEPTED' } });
    assert.equal(acc.status, 200, JSON.stringify(acc.body));
    const t = await prisma.rewardTransaction.findFirst({ where: { caseId: ids.c2 } });
    assert.deepEqual([t.type, t.points], ['EARN', 150]);
    assert.equal((await totals(ids.a)).totalEarned, 330 + 150);
  });
}
