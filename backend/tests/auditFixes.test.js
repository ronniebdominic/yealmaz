// Money and access rules found in the security audit (real local PostgreSQL; refuses non-local hosts).
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public node --test --test-concurrency=1 tests/auditFixes.test.js
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'audit-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('auditFixes: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcryptjs');
  const prisma = require('../src/db');
  const ids = {}; let server, base;
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const mk = (extra = {}) => prisma.case.create({ data: { caseNumber: `YDL${Math.floor(Math.random() * 1e9)}`, patientName: 'P', workType: 'PFM', units: 4, status: 'DELIVERED', clinicId: ids.clinic, totalAmount: 30000, deliveryDate: new Date(), ...extra } });
  const st = (id) => prisma.case.findUnique({ where: { id }, include: { payment: { include: { receipts: true } } } });
  const sum = (rows) => rows.reduce((x, r) => x + r.amount, 0);

  test.before(async () => {
    await prisma.$executeRawUnsafe('CREATE SEQUENCE IF NOT EXISTS case_number_seq START 26000000');
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, clinics, clinic_points, reward_items, reward_transactions, reward_redemptions CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    const fin = await prisma.user.create({ data: { name: 'Fin', email: 'f@t.local', password: 'x', role: 'FINANCE' } });
    await prisma.user.create({ data: { name: 'Staff', email: 's@t.local', password: await bcrypt.hash('right-password', 4), role: 'RECEPTIONIST' } });
    const clinic = await prisma.clinic.create({ data: { name: 'Clinic A', password: 'x', email: 'c@t.local' } });
    ids.clinic = clinic.id;
    ids.admin = jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
    ids.fin = jwt.sign({ id: fin.id, role: 'FINANCE', name: 'Fin' }, process.env.JWT_SECRET);
    ids.clinicTok = jwt.sign({ id: clinic.id, role: 'CLINIC', name: 'Clinic A' }, process.env.JWT_SECRET);
    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/auth', require('../src/routes/auth'));
    app.use('/api/payments', require('../src/routes/payments'));
    app.use('/api/cases', require('../src/routes/cases'));
    app.use('/api/rewards', require('../src/routes/rewards'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('collecting on a case that is already paid is refused, and records nothing', async () => {
    const c = await mk({ paymentStatus: 'VERIFIED' });
    await prisma.payment.create({ data: { caseId: c.id, amount: 30000, status: 'VERIFIED', invoiceNumber: 'INV-X' } });
    const r = await call(`/payments/${c.id}/collect`, { token: ids.fin, method: 'POST', body: { amount: 30000 } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal((await st(c.id)).payment.receipts.length, 0);
  });

  test('two collections at the same moment cannot both be recorded: the receipts always add up to the amount received', async () => {
    const c = await mk({ totalAmount: 20000 });
    const rs = await Promise.all([1, 2].map(() => call(`/payments/${c.id}/collect`, { token: ids.fin, method: 'POST', body: { amount: 12000 } })));
    assert.deepEqual(rs.map(r => r.status).sort(), [200, 400], 'the second sees the balance the first left (Br 8,000) and is refused');
    const s = await st(c.id);
    assert.equal(s.payment.amountReceived, 12000);
    assert.equal(sum(s.payment.receipts), 12000);
  });

  test('a case with money on it cannot have its price edited into an unpayable state (invoice below what was received)', async () => {
    const c = await mk({ totalAmount: 30000 });
    await call(`/payments/${c.id}/collect`, { token: ids.fin, method: 'POST', body: { amount: 15000 } });
    const r = await call(`/cases/${c.id}`, { token: ids.admin, method: 'PATCH', body: { totalAmount: 10000 } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    const s = await st(c.id);
    assert.equal(s.totalAmount, 30000);
    assert.equal(s.payment.amountReceived, 15000);
  });

  test('a paid case keeps invoice and payment amount in step: its price is changed only through Override', async () => {
    const c = await mk({ totalAmount: 15000, paymentStatus: 'VERIFIED' });
    await prisma.payment.create({ data: { caseId: c.id, amount: 15000, status: 'VERIFIED' } });
    const r = await call(`/cases/${c.id}`, { token: ids.admin, method: 'PATCH', body: { totalAmount: 30000 } });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    const s = await st(c.id);
    assert.equal(s.totalAmount, 15000);
    assert.equal(s.payment.amount, 15000);
    // ...and an edit that does not touch the price still goes through
    const ok = await call(`/cases/${c.id}`, { token: ids.admin, method: 'PATCH', body: { totalAmount: 15000, shade: 'B2' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
  });

  test('a clinic cannot set its own price, discount or delivery date: the case waits for the lab, unpriced, earning nothing yet', async () => {
    const r = await call('/cases', { token: ids.clinicTok, method: 'POST', body: { patientName: 'X', workType: 'PFM', doctorName: 'D', doctorPhone: '1', shade: 'A1', units: 3, totalAmount: 1, discountType: 'PERCENT', discountValue: 100, deliveryDate: new Date(Date.now() - 86400000).toISOString() } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, 'PENDING_PICKUP', 'never DELIVERED on the clinic\'s say-so');
    assert.equal(r.body.totalAmount, null);
    assert.equal(r.body.deliveryDate, null);
    assert.equal(r.body.discountType, null);
    assert.equal(r.body.caseNumber, null, 'no scan number before the lab accepts it');
  });

  test('redeeming the same points several times at once spends them once', async () => {
    await prisma.clinicPoints.upsert({ where: { clinicId: ids.clinic }, update: { totalEarned: 100, totalRedeemed: 0 }, create: { clinicId: ids.clinic, totalEarned: 100, totalRedeemed: 0 } });
    const item = await prisma.rewardItem.create({ data: { name: 'Gift', pointsCost: 100, isActive: true } });
    const rs = await Promise.all([1, 2, 3].map(() => call('/rewards/redeem', { token: ids.clinicTok, method: 'POST', body: { rewardItemId: item.id } })));
    assert.deepEqual(rs.map(r => r.status).sort(), [201, 400, 400]);
    const p = await prisma.clinicPoints.findUnique({ where: { clinicId: ids.clinic } });
    assert.equal(p.totalRedeemed, 100);
    assert.equal(await prisma.rewardRedemption.count({ where: { clinicId: ids.clinic } }), 1);
  });

  test('repeated wrong passwords are throttled; a correct sign-in still works for everyone else', async () => {
    const attempt = (password) => call('/auth/login', { method: 'POST', body: { email: 's@t.local', password } });
    const first = await attempt('right-password');
    assert.equal(first.status, 200, 'a successful sign-in does not count against the limit');
    let last;
    for (let i = 0; i < 21; i++) last = await attempt('wrong');
    assert.equal(last.status, 429);
  });
}
