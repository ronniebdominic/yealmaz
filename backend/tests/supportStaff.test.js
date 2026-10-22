// Attendance-only support staff, against a REAL local PostgreSQL (refuses non-local hosts). See tvIntegration.test.js for setup.
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'support-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
const test = require('node:test');
const assert = require('node:assert/strict');

if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  test('supportStaff: skipped — DATABASE_URL is not a local database', { skip: true }, () => {});
} else {
  const http = require('node:http');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcryptjs');
  const prisma = require('../src/db');
  let server, base; const ids = {};
  const call = async (path, { token, method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  test.before(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, attendance_events, users, staff_roles, clinics CASCADE');
    const pw = await bcrypt.hash('Passw0rd!', 4);
    const hr = await prisma.user.create({ data: { name: 'HR Manager', email: 'hr@test.local', password: pw, role: 'HR_MANAGER' } });
    const driver = await prisma.user.create({ data: { name: 'Real Driver', email: 'driver@test.local', password: pw, role: 'DELIVERY' } });
    const support = await prisma.staffRole.create({ data: { department: 'Support Staff', name: 'Janitor', baseRole: 'DELIVERY' } });
    const frontDelivery = await prisma.staffRole.create({ data: { department: 'Front Office', name: 'Delivery', baseRole: 'DELIVERY' } });
    const oldJanitor = await prisma.user.create({ data: { name: 'Old Janitor', email: 'janitor@test.local', password: pw, role: 'DELIVERY', staffRoleId: support.id } });
    const frontDriver = await prisma.user.create({ data: { name: 'Front Office Driver', email: 'fo@test.local', password: pw, role: 'DELIVERY', staffRoleId: frontDelivery.id } });
    Object.assign(ids, { hr: hr.id, driver: driver.id, support: support.id, oldJanitor: oldJanitor.id, frontDriver: frontDriver.id });
    ids.hrJwt = jwt.sign({ id: hr.id, role: 'HR_MANAGER', name: 'HR' }, process.env.JWT_SECRET);
    ids.janitorJwt = jwt.sign({ id: oldJanitor.id, role: 'DELIVERY', name: 'Old Janitor' }, process.env.JWT_SECRET);

    const app = express();
    app.use(express.json());
    app.set('io', { to: () => ({ emit() {} }) });
    app.use('/api/auth', require('../src/routes/auth'));
    app.use('/api/users', require('../src/routes/users'));
    app.use('/api/employees', require('../src/routes/employees'));
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  test.after(async () => { server?.close(); await prisma.$disconnect(); });

  test('HR creates a support-staff employee with only a name: no email, no password, no login', async () => {
    const r = await call('/users', { token: ids.hrJwt, method: 'POST', body: { name: 'Meaza Chef', staffRoleId: ids.support } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.role, 'DELIVERY');
    assert.match(r.body.email, /@yealmaz\.invalid$/);
    ids.newSupport = r.body.id;
  });

  test('ordinary staff still need an email and password', async () => {
    assert.equal((await call('/users', { token: ids.hrJwt, method: 'POST', body: { name: 'No Email', role: 'RECEPTIONIST' } })).status, 400);
    assert.equal((await call('/users', { token: ids.hrJwt, method: 'POST', body: { name: 'No Pw', email: 'x@test.local', role: 'RECEPTIONIST' } })).status, 400);
    assert.equal((await call('/users', { token: ids.hrJwt, method: 'POST', body: { name: 'Front Driver 2', email: 'fd2@test.local', password: 'Passw0rd!', staffRoleId: ids.support === 'x' ? '' : undefined, role: 'DELIVERY' } })).status, 201);
  });

  test('support staff cannot log in, even an existing one with a real password', async () => {
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'janitor@test.local', password: 'Passw0rd!' } })).status, 401);
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'driver@test.local', password: 'Passw0rd!' } })).status, 200, 'a real driver still logs in');
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'fo@test.local', password: 'Passw0rd!' } })).status, 200, 'a Front Office delivery role still logs in');
  });

  test('an already-issued token of a support-staff account stops working', async () => {
    const r = await call('/users', { token: ids.janitorJwt });
    assert.equal(r.status, 401);
  });

  test('delivery executive list excludes support staff but keeps real delivery staff', async () => {
    const adminJwt = jwt.sign({ id: ids.hr, role: 'HR_MANAGER' }, process.env.JWT_SECRET);
    const probe = await prisma.user.findMany({ where: { role: 'DELIVERY', ...require('../src/utils/attendanceOnly').NOT_ATTENDANCE_ONLY }, select: { name: true } });
    const names = probe.map(u => u.name).sort();
    assert.ok(names.includes('Real Driver'), 'user with no staff role stays in');
    assert.ok(names.includes('Front Office Driver'), 'a delivery role in another department stays in');
    assert.ok(!names.includes('Old Janitor') && !names.includes('Meaza Chef'), 'support staff are out');
    void adminJwt;
  });

  test('support staff remain visible to HR (users list) so their attendance can be tracked', async () => {
    const r = await call('/employees', { token: ids.hrJwt });
    assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
    const list = Array.isArray(r.body) ? r.body : (r.body.employees || r.body.data || []);
    const names = list.map(u => u.name);
    assert.ok(names.includes('Meaza Chef') && names.includes('Old Janitor'));
  });
}
