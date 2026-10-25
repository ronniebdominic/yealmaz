// Delivery Performance numbers add up and say where they came from (real local PostgreSQL; refuses non-local hosts).
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'dp-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('deliveryPerformance: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const prisma = require('../src/db');
  let server, base, jwtAdmin;
  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, staff_roles, clinics CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin Dashboard', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    await prisma.user.create({ data: { name: 'Esrael Lemma Lemarro', email: 'e@t.local', password: 'x', role: 'DELIVERY' } });
    await prisma.user.create({ data: { name: 'Dawit Haile Bafa', email: 'd@t.local', password: 'x', role: 'DELIVERY' } });
    jwtAdmin = jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
    const clinic = await prisma.clinic.create({ data: { name: 'C1', password: 'x', email: 'c@t.local' } });
    const mk = (n) => prisma.case.create({ data: { caseNumber: `YDL${n}`, patientName: 'P', workType: 'PFM', status: 'DELIVERED', clinicId: clinic.id } });
    const rows = [];
    const stage = (caseId, stageName, scannedBy, notes) => rows.push({ caseId, stageName, scannedBy, notes });
    for (let i = 0; i < 3; i++) { // Esrael: picked up AND delivered the same 3 cases
      const c = await mk(`E${i}`);
      stage(c.id, 'OUT_FOR_DELIVERY', 'Mulu Dispatch', 'Dispatched to Esrael Lemma Lemarro for delivery');
      stage(c.id, 'DELIVERED', 'Esrael Lemma Lemarro', 'Delivered successfully');
    }
    const d1 = await mk('D1'); stage(d1.id, 'DELIVERED', 'Dawit', 'Delivered successfully');            // short name -> matched by first name
    const s1 = await mk('S1'); stage(s1.id, 'DELIVERED', 'Mulu Dispatch', 'Self pickup by clinic');
    const h1 = await mk('H1'); stage(h1.id, 'DELIVERED', 'Admin Dashboard', 'Case registered as historical/delivered');
    const p1 = await mk('P1'); stage(p1.id, 'DELIVERED', 'Fin User', 'Payment collected by Fin User — Br 100');
    const u1 = await mk('U1'); stage(u1.id, 'DELIVERED', 'Someone Gone', 'Delivered successfully');       // a driver who no longer exists
    await prisma.caseStage.createMany({ data: rows });
    const app = express();
    app.use(express.json());
    app.use('/api/dashboard', require('../src/routes/dashboard'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('totals, distinct cases, first-name matches and the delivered reconciliation all agree', async () => {
    const r = await (await fetch(`${base}/dashboard/delivery-performance?from=2020-01-01&to=2030-01-01`, { headers: { authorization: `Bearer ${jwtAdmin}` } })).json();
    const by = Object.fromEntries(r.agents.map(a => [a.name, a]));
    const e = by['Esrael Lemma Lemarro'];
    assert.deepEqual([e.totalPickups, e.totalDeliveries, e.totalOrders, e.uniqueCases], [3, 3, 6, 3], 'same 3 cases picked up and delivered = 6 orders over 3 distinct cases');
    const d = by['Dawit Haile Bafa'];
    assert.deepEqual([d.totalDeliveries, d.firstNameMatches], [1, 1], 'a bare first name is matched, and flagged');
    assert.equal(e.firstNameMatches, 0);
    assert.equal(r.totalLabOrders, e.totalOrders + d.totalOrders + r.unattributedOrders);
    assert.equal(Math.round((e.shareOfTotalPercent + d.shareOfTotalPercent) * 10) / 10 + Math.round((r.unattributedOrders / r.totalLabOrders) * 1000) / 10 > 99.8, true);
    const rc = r.deliveryReconciliation;
    assert.equal(rc.deliveredEntries, 8);
    assert.equal(rc.distinctCasesDelivered, 8);
    assert.deepEqual([rc.byDrivers, rc.selfPickup, rc.historicalEntry, rc.paymentNote, rc.unmatched], [4, 1, 1, 1, 1]);
    assert.equal(rc.byDrivers + rc.selfPickup + rc.historicalEntry + rc.paymentNote + rc.adminOrSystem + rc.unmatched, rc.deliveredEntries, 'every delivered entry is accounted for');
    assert.equal(e.totalDeliveries + d.totalDeliveries, rc.byDrivers, 'the drivers\' deliveries equal the reconciliation line');
  });
}
