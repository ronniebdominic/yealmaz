// Admin payment override: undoing a wrong payment returns the case to Pending with the right balance owed
// (real local PostgreSQL; refuses non-local hosts).
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public node --test --test-concurrency=1 tests/paymentOverride.test.js
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'ovr-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('paymentOverride: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const prisma = require('../src/db');
  const { outstandingOwed } = require('../src/services/financeRules');
  const ids = {}; let server, base;
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const newCase = (extra = {}) => prisma.case.create({ data: { caseNumber: `YDL${Math.floor(Math.random() * 1e9)}`, patientName: 'P', workType: 'PFM', units: 4, status: 'DELIVERED', clinicId: ids.trusted, totalAmount: 30000, deliveryDate: new Date(), ...extra } });
  const state = (id) => prisma.case.findUnique({ where: { id }, include: { payment: { include: { receipts: true } } } });
  const override = (id, body, token = ids.admin) => call(`/payments/${id}/override`, { token, method: 'POST', body });

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, clinics CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    const fin = await prisma.user.create({ data: { name: 'Fin', email: 'f@t.local', password: 'x', role: 'FINANCE' } });
    const trusted = await prisma.clinic.create({ data: { name: 'Trusted Partner', password: 'x', email: 'tp@t.local', isExcluded: true } });
    Object.assign(ids, { trusted: trusted.id });
    ids.admin = jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
    ids.fin = jwt.sign({ id: fin.id, role: 'FINANCE', name: 'Fin' }, process.env.JWT_SECRET);
    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/payments', require('../src/routes/payments'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('a case wrongly closed at Br 15,000 of 30,000: restore the invoice, keep Br 15,000 received -> Br 15,000 owed, not 30,000', async () => {
    // The state the old part-payment bug left behind: invoice shrunk to what was paid, case marked collected.
    const c = await newCase({ totalAmount: 15000, paymentStatus: 'VERIFIED' });
    await prisma.payment.create({ data: { caseId: c.id, amount: 15000, status: 'VERIFIED', invoiceNumber: `INV-${c.caseNumber}` } });
    const r = await override(c.id, { status: 'PENDING', amount: 30000, amountReceived: 15000, reason: 'Only 15,000 was really paid' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = await state(c.id);
    assert.equal(s.paymentStatus, 'PENDING');
    assert.equal(s.totalAmount, 30000);
    assert.equal(s.payment.status, 'PENDING');
    assert.equal(s.payment.amountReceived, 15000);
    assert.equal(outstandingOwed(s), 15000, 'the client owes the Br 15,000 that was not paid');
    assert.equal(s.payment.receipts.length, 1);
    assert.equal(s.payment.receipts[0].amount, 15000);
    const stage = await prisma.caseStage.findFirst({ where: { caseId: c.id, notes: { contains: 'PAYMENT OVERRIDE' } } });
    assert.match(stage.notes, /still owed Br 15,000/);
  });

  test('undoing a payment with nothing really received puts the whole invoice back as owed, and clears stale part payments', async () => {
    const c = await newCase({ totalAmount: 20000 });
    // Two real part payments recorded, then the case was completed.
    await call(`/payments/${c.id}/collect`, { token: ids.fin, method: 'POST', body: { amount: 5000 } });
    await call(`/payments/${c.id}/collect`, { token: ids.fin, method: 'POST', body: { amount: 15000 } });
    let s = await state(c.id);
    assert.equal(s.paymentStatus, 'VERIFIED');
    assert.equal(s.payment.receipts.length, 2);
    const r = await override(c.id, { status: 'PENDING', reason: 'Entered against the wrong case' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    s = await state(c.id);
    assert.equal(s.paymentStatus, 'PENDING');
    assert.equal(s.payment.amountReceived ?? 0, 0);
    assert.equal(s.payment.receipts.length, 0);
    assert.equal(outstandingOwed(s), 20000, 'a reverted case must show as fully owed, not as paid-up');
  });

  test('a received amount equal to the invoice is refused (that is Paid, not Pending), and nothing changes', async () => {
    const c = await newCase({ totalAmount: 1000 });
    const r = await override(c.id, { status: 'PENDING', amountReceived: 1000, reason: 'x' });
    assert.equal(r.status, 400);
    assert.equal((await state(c.id)).paymentStatus, 'PENDING');
    const r2 = await override(c.id, { status: 'PENDING', amountReceived: -5, reason: 'x' });
    assert.equal(r2.status, 400);
  });

  test('a reason is required and only an Admin may override', async () => {
    const c = await newCase();
    assert.equal((await override(c.id, { status: 'PENDING' })).status, 400);
    assert.equal((await override(c.id, { status: 'PENDING', reason: 'x' }, ids.fin)).status, 403);
  });
}
