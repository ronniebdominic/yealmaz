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
    await prisma.user.create({ data: { name: 'Hana Tadesse Gebre', email: 'h@t.local', password: 'x', role: 'DELIVERY' } });
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
    // New cases arriving: two impressions confirmed by Hana, one assigned but never confirmed, one clinic self drop-off, one with no pickup step
    const mkNew = (n) => prisma.case.create({ data: { caseNumber: `YDLN${n}`, patientName: 'P', workType: 'PFM', status: 'PICKUP_ASSIGNED', clinicId: clinic.id } });
    const IMPRESSION = 'Impression arrived at lab — awaiting receptionist acceptance';
    const n1 = await mkNew(1); stage(n1.id, 'PICKUP_ASSIGNED', 'Hana Tadesse Gebre', IMPRESSION);
    const n2 = await mkNew(2); stage(n2.id, 'PICKUP_ASSIGNED', 'Mulu Dispatch', 'Pickup assigned to Hana Tadesse Gebre by dispatch'); stage(n2.id, 'PICKUP_ASSIGNED', 'Hana Tadesse Gebre', IMPRESSION);
    const n3 = await mkNew(3); stage(n3.id, 'PICKUP_ASSIGNED', 'Mulu Dispatch', 'Pickup assigned to Dawit Haile Bafa by dispatch');
    const n4 = await mkNew(4); stage(n4.id, 'PICKUP_ASSIGNED', 'Mulu Dispatch', 'Self drop-off by C1 — no delivery partner assigned');
    await mkNew(5);
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
    assert.deepEqual([e.totalPickups, e.totalDeliveries, e.totalOrders, e.uniqueCases], [0, 3, 3, 3], 'dispatch sent 3 cases out and he delivered them: only the 3 deliveries count, not a pickup as well');
    const d = by['Dawit Haile Bafa'];
    assert.deepEqual([d.totalDeliveries, d.firstNameMatches], [1, 1], 'a bare first name is matched, and flagged');
    assert.equal(e.firstNameMatches, 0);
    const h = by['Hana Tadesse Gebre'];
    assert.equal(r.totalLabOrders, e.totalOrders + d.totalOrders + h.totalOrders + r.unattributedOrders);
    assert.equal(Math.round((e.shareOfTotalPercent + d.shareOfTotalPercent + h.shareOfTotalPercent) * 10) / 10 + Math.round((r.unattributedOrders / r.totalLabOrders) * 1000) / 10 > 99.8, true);
    const rc = r.deliveryReconciliation;
    assert.equal(rc.deliveredEntries, 8);
    assert.equal(rc.distinctCasesDelivered, 8);
    assert.deepEqual([rc.byDrivers, rc.selfPickup, rc.historicalEntry, rc.paymentNote, rc.unmatched], [4, 1, 1, 1, 1]);
    assert.equal(rc.byDrivers + rc.selfPickup + rc.historicalEntry + rc.paymentNote + rc.adminOrSystem + rc.unmatched, rc.deliveredEntries, 'every delivered entry is accounted for');
    assert.equal(e.totalDeliveries + d.totalDeliveries, rc.byDrivers, 'the drivers\' deliveries equal the reconciliation line');
  });

  test('Picked Up is clinic impressions only (a dispatch is not a pickup) and reconciles with the new cases of the range', async () => {
    const r = await (await fetch(`${base}/dashboard/delivery-performance?from=2020-01-01&to=2030-01-01`, { headers: { authorization: `Bearer ${jwtAdmin}` } })).json();
    const by = Object.fromEntries(r.agents.map(a => [a.name, a]));
    const e = by['Esrael Lemma Lemarro'], h = by['Hana Tadesse Gebre'];
    assert.equal(e.totalPickups, 0, 'cases dispatched out for delivery are not pickups');
    assert.deepEqual([h.totalPickups, h.totalDeliveries, h.totalOrders], [2, 0, 2], 'Hana collected two impressions');
    assert.equal(r.agents.reduce((n, a) => n + a.totalPickups, 0), 2, 'the lab-wide Picked Up is only the two impressions');

    const p = r.pickupReconciliation;
    assert.equal(p.impressionPickups, 2);
    assert.equal(p.impressionCases, 2);
    // every case in the fixture was created in range: 3 (E) + D1 + S1 + H1 + P1 + U1 + the five new ones = 13
    assert.equal(p.newCases, 13);
    assert.equal(p.newCasesPickedUpConfirmed, 2);
    assert.equal(p.newCasesSelfDropOff, 1);
    assert.equal(p.newCasesAssignedNotConfirmed, 1);
    assert.equal(p.newCasesOther, 13 - 2 - 1 - 1);
    assert.equal(p.newCasesPickedUpConfirmed + p.newCasesSelfDropOff + p.newCasesAssignedNotConfirmed + p.newCasesOther, p.newCases);
  });
}
