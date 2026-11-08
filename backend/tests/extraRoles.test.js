// Extra access on top of a user's main role: a lab tech given "Inventory" can run the inventory desk, and nobody can be
// granted anything outside the allowed list (real local PostgreSQL; refuses non-local hosts).
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public node --test --test-concurrency=1 tests/extraRoles.test.js
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'xr-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('extraRoles: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
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
  const tok = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET);

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE inventory_transactions, inventory_requests, inventory_items, users, staff_roles CASCADE');
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'a@t.local', password: 'x', role: 'ADMIN' } });
    const shewaye = await prisma.user.create({ data: { name: 'Shewaye', email: 's@t.local', password: 'x', role: 'LAB_TECH' } });
    const other = await prisma.user.create({ data: { name: 'Other Tech', email: 'o@t.local', password: 'x', role: 'LAB_TECH' } });
    Object.assign(ids, { admin: tok(admin), shewaye: tok(shewaye), other: tok(other), shewayeId: shewaye.id, otherId: other.id });
    ids.item = (await prisma.inventoryItem.create({ data: { name: 'Glaze', unit: 'bottle', quantityOnHand: 10 } })).id;
    await prisma.inventoryRequest.create({ data: { itemId: ids.item, requestedById: other.id, department: 'GLAZING', quantityRequested: 2 } });
    ids.req = (await prisma.inventoryRequest.findFirst()).id;

    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/inventory', require('../src/routes/inventory'));
    app.use('/api/users', require('../src/routes/users'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('a lab tech without extra access cannot run the inventory desk and sees only their own requests', async () => {
    assert.equal((await call(`/inventory/requests/${ids.req}`, { token: ids.shewaye, method: 'PATCH', body: { action: 'ACCEPT' } })).status, 403);
    assert.equal((await call('/inventory/requests', { token: ids.shewaye })).body.length, 0, 'sees only her own (none yet)');
  });

  test('only an admin can grant extra access, and only from the allowed list', async () => {
    assert.equal((await call(`/users/${ids.shewayeId}`, { token: ids.shewaye, method: 'PATCH', body: { extraRoles: ['INVENTORY_MANAGER'] } })).status, 403, 'a user cannot grant themselves access');
    for (const bad of ['ADMIN', 'FINANCE', 'LEADER']) {
      const r = await call(`/users/${ids.shewayeId}`, { token: ids.admin, method: 'PATCH', body: { extraRoles: [bad] } });
      assert.equal(r.status, 400, `${bad} must be refused`);
    }
    const ok = await call(`/users/${ids.shewayeId}`, { token: ids.admin, method: 'PATCH', body: { extraRoles: ['INVENTORY_MANAGER'] } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.extraRoles, ['INVENTORY_MANAGER']);
    assert.equal(ok.body.role, 'LAB_TECH', 'her main role is untouched');
  });

  test('with Inventory extra access she sees the whole queue and can approve a request (within seconds, no re-login)', async () => {
    // the identity lookup is cached for a few seconds in production; a fresh process-level cache is cleared here by waiting it out
    await new Promise(r => setTimeout(r, 16000));
    const queue = await call('/inventory/requests', { token: ids.shewaye });
    assert.equal(queue.body.length, 1, 'full queue, not just her own');
    const done = await call(`/inventory/requests/${ids.req}`, { token: ids.shewaye, method: 'PATCH', body: { action: 'ACCEPT' } });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal((await prisma.inventoryItem.findUnique({ where: { id: ids.item } })).quantityOnHand, 8);
  });

  test('the other lab tech is unaffected and still cannot approve', async () => {
    assert.equal((await call(`/inventory/requests/${ids.req}`, { token: ids.other, method: 'PATCH', body: { action: 'ACCEPT' } })).status, 403);
  });

  test('taking the access away removes it again', async () => {
    await call(`/users/${ids.shewayeId}`, { token: ids.admin, method: 'PATCH', body: { extraRoles: [] } });
    await new Promise(r => setTimeout(r, 16000));
    assert.equal((await call('/inventory/items/' + ids.item + '/adjust', { token: ids.shewaye, method: 'POST', body: { type: 'ADD', quantity: 1 } })).status, 403);
  });
}
