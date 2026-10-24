// A newly added delivery staff member shows on the Delivery Performance dashboard at once, and a role changed to Support
// Staff drops off it at once (real local PostgreSQL; refuses non-local hosts).
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'staff-lists-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('staffLists: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const prisma = require('../src/db');
  const ids = {}; let server, base;
  const call = async (path, { method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${ids.jwt}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const drivers = async () => (await call('/dashboard/delivery-performance')).body.agents?.map(a => a.name) ?? (await call('/dashboard/delivery-performance')).body;

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, users, staff_roles, clinics CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    await prisma.user.create({ data: { name: 'Existing Driver', email: 'd@t.local', password: 'x', role: 'DELIVERY' } });
    ids.jwt = jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET);
    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/users', require('../src/routes/users'));
    app.use('/api/staff-roles', require('../src/routes/staffRoles'));
    app.use('/api/dashboard', require('../src/routes/dashboard'));
    app.use('/api', (req, res, next) => next());
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  const names = (r) => (r.body.agents || r.body.drivers || r.body.rows || (Array.isArray(r.body) ? r.body : [])).map(a => a.name);

  test('a driver added now appears on Delivery Performance immediately (the page is cached for 30 minutes)', async () => {
    const first = await call('/dashboard/delivery-performance');
    assert.equal(first.status, 200);
    assert.ok(names(first).includes('Existing Driver'), JSON.stringify(first.body).slice(0, 200));
    const created = await call('/users', { method: 'POST', body: { name: 'Asfaw Atumo Yaya', email: 'asfawd@t.local', password: 'Passw0rd!', role: 'DELIVERY' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const second = await call('/dashboard/delivery-performance');
    assert.ok(names(second).includes('Asfaw Atumo Yaya'), 'new driver must be listed straight away');
  });

  test('moving a staff role to the Support Staff department takes that person off Delivery Performance at once', async () => {
    const role = await call('/staff-roles', { method: 'POST', body: { name: 'Machine Maintenance', department: 'Operation', baseRole: 'DELIVERY' } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const person = await call('/users', { method: 'POST', body: { name: 'Filimon Teklay', email: 'fil@t.local', password: 'Passw0rd!', staffRoleId: role.body.id } });
    assert.equal(person.status, 201, JSON.stringify(person.body));
    assert.ok(names(await call('/dashboard/delivery-performance')).includes('Filimon Teklay'), 'while the role carries delivery access he is listed');
    const moved = await call(`/staff-roles/${role.body.id}`, { method: 'PATCH', body: { department: 'Support Staff' } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.ok(!names(await call('/dashboard/delivery-performance')).includes('Filimon Teklay'), 'now attendance-only: off the delivery lists straight away');
  });
}
