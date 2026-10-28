// Part payments on a trusted-partner case, against a REAL local PostgreSQL (refuses non-local hosts).
//   docker run -d --name ya-pay-pg -e POSTGRES_PASSWORD=throwaway_test_pw -e POSTGRES_DB=yatest -p 127.0.0.1:54329:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public npx prisma db push
//   DATABASE_URL=... node --test --test-concurrency=1 tests/partialPayment.test.js
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'pay-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('partialPayment: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
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
  const newCase = (extra = {}) => prisma.case.create({ data: { caseNumber: `YDL${Math.floor(Math.random() * 1e9)}`, patientName: 'P', workType: 'PFM', units: 4, status: 'DELIVERED', clinicId: ids.trusted, totalAmount: 20000, deliveryDate: new Date(), ...extra } });
  const state = async (id) => {
    const c = await prisma.case.findUnique({ where: { id }, include: { payment: { include: { receipts: true } } } });
    return c;
  };

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, clinics CASCADE');
    const fin = await prisma.user.create({ data: { name: 'Fin', email: 'fin@t.local', password: 'x', role: 'FINANCE' } });
    const trusted = await prisma.clinic.create({ data: { name: 'Trusted Partner', password: 'x', email: 'tp@t.local', isExcluded: true } });
    Object.assign(ids, { fin: fin.id, trusted: trusted.id });
    ids.jwt = jwt.sign({ id: fin.id, role: 'FINANCE', name: 'Fin' }, process.env.JWT_SECRET);
    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/payments', require('../src/routes/payments'));
    app.use('/api/dashboard', require('../src/routes/dashboard'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  const summary = async () => (await call('/dashboard/trusted-partners-summary', { token: ids.jwt })).body.find(c => c.id === ids.trusted);

  test('Br 12,500 on a Br 20,000 case is a PART payment: invoice unchanged, paid and remaining shown separately', async () => {
    const c = await newCase();
    const r = await call(`/payments/${c.id}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 12500, notes: 'Bank transfer' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.complete, false);
    assert.equal(r.body.received, 12500);
    assert.equal(r.body.remaining, 7500);
    const after = await state(c.id);
    assert.equal(after.totalAmount, 20000, 'the invoice must not shrink to what was paid');
    assert.notEqual(after.paymentStatus, 'VERIFIED', 'the case is not settled yet');
    assert.equal(after.payment.amountReceived, 12500);
    assert.equal(after.payment.receipts.length, 1);
    ids.partial = c.id;

    const list = await call(`/payments/trusted?clinicId=${ids.trusted}&limit=50`, { token: ids.jwt });
    const row = list.body.cases.find(x => x.id === c.id);
    assert.ok(row, 'the part-paid case stays on the outstanding list');
    assert.deepEqual([row.billed, row.paid, row.remaining], [20000, 12500, 7500]);

    const s = await summary();
    assert.equal(s.paymentsReceived, 12500);
    assert.equal(s.outstanding, 7500);
    assert.equal(s.totalRevenue, 20000);
  });

  test('the balance can be paid later; the final payment settles the case with the invoice intact', async () => {
    const r = await call(`/payments/${ids.partial}/collect`, { token: ids.jwt, method: 'POST', body: {} }); // no amount = the whole balance
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.complete, true);
    const after = await state(ids.partial);
    assert.equal(after.paymentStatus, 'VERIFIED');
    assert.equal(after.totalAmount, 20000);
    assert.equal(after.payment.receipts.length, 2);
    const s = await summary();
    assert.equal(s.paymentsReceived, 20000);
    assert.equal(s.outstanding, 0);
  });

  test('paying more than is owed is refused, and nothing is recorded', async () => {
    const c = await newCase();
    const r = await call(`/payments/${c.id}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 25000 } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /more than/i);
    assert.equal((await state(c.id)).payment, null);
  });

  test('paying the full amount in one go still settles the case immediately', async () => {
    const c = await newCase();
    const r = await call(`/payments/${c.id}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 20000 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.complete, true);
    const after = await state(c.id);
    assert.equal(after.paymentStatus, 'VERIFIED'); assert.equal(after.totalAmount, 20000);
  });

  test('withheld tax counts towards the balance like cash and is recorded separately', async () => {
    const c = await newCase();
    const r = await call(`/payments/${c.id}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 10000, taxWithheld: 300 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.remaining, 10000);
    const after = await state(c.id);
    assert.equal(after.payment.taxWithheld, 300);
    assert.equal((await call(`/payments/${c.id}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 5000, taxWithheld: 6000 } })).status, 400, 'tax cannot exceed the amount');
  });

  test('an unpriced case still takes the typed amount as its price', async () => {
    const c = await newCase({ totalAmount: null });
    const r = await call(`/payments/${c.id}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 8000 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const after = await state(c.id);
    assert.equal(after.totalAmount, 8000); assert.equal(after.paymentStatus, 'VERIFIED');
    assert.equal((await call(`/payments/${(await newCase({ totalAmount: null })).id}/collect`, { token: ids.jwt, method: 'POST', body: {} })).status, 400);
  });

  test('a case with nothing left to collect is refused', async () => {
    const r = await call(`/payments/${ids.partial}/collect`, { token: ids.jwt, method: 'POST', body: { amount: 100 } });
    assert.equal(r.status, 409, 'a settled case is refused as already paid');
  });
}
