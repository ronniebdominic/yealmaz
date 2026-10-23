// Test harness: serves the real TV API + /tv socket on a LOCAL throwaway database, seeded with synthetic staff
// and cases, so the television UI can be exercised end to end (screenshots, rotation, live updates).
//   DATABASE_URL=postgresql://postgres:throwaway_test_pw@127.0.0.1:54329/yatest?schema=public \
//     node tests/tools/tvDemo.js [--simulate] [--employees=26] [--port=5099]
// Everything it writes is test data in the local database; it refuses to run against a non-local host.
process.env.TZ = 'Africa/Addis_Ababa';
process.env.JWT_SECRET = 'demo-secret';
const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ''; } })();
if (!['localhost', '127.0.0.1', '::1'].includes(host)) { console.error('Refusing to run: DATABASE_URL is not a local database.'); process.exit(1); }

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const prisma = require('../../src/db');
const tv = require('../../src/services/tvService');
const { LAB_DEPARTMENTS } = require('../../src/utils/labDepartments');

const arg = (n, d) => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const EMP = Number(arg('employees', 26));
const PORT = Number(arg('port', 5099));
const SIM = process.argv.includes('--simulate');
const EMPTY = process.argv.includes('--empty'); // no staff, no cases: the "nothing has happened yet" state

const FIRST = ['Abebe', 'Kebede', 'Almaz', 'Tigist', 'Dawit', 'Selam', 'Henok', 'Meron', 'Yonas', 'Hana', 'Biniam', 'Rahel', 'Samson', 'Liya', 'Mulugeta', 'Saron', 'Fikru', 'Betty', 'Natnael', 'Eden', 'Tesfaye', 'Mahlet', 'Robel', 'Winta', 'Bereket', 'Kidist', 'Elias', 'Zelalem', 'Ruth', 'Amanuel'];
const LAST = ['Tesfaye', 'Alemu', 'Bekele', 'Girma', 'Hailu', 'Mengistu', 'Wolde', 'Assefa', 'Negash', 'Desta'];
const pick = (a, i) => a[i % a.length];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const minsAgo = (m) => new Date(Date.now() - m * 60000);
const midnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const sinceMidnightMin = Math.max(10, Math.floor((Date.now() - midnight.getTime()) / 60000) - 5);

async function seed() {
  await prisma.$executeRawUnsafe('TRUNCATE production_events, display_sessions, tv_config RESTART IDENTITY');
  await prisma.$executeRawUnsafe('TRUNCATE case_stages, cases, attendance_events, users, clinics, staff_roles, shifts, holidays CASCADE');
  const clinic = await prisma.clinic.create({ data: { name: 'Test Clinic', password: 'x', email: 'c@test.local' } });
  const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@test.local', password: 'x', role: 'ADMIN' } });
  if (EMPTY) { await tv.saveConfig({}, admin.id); return { admin, techs: [], present: [] }; }
  const depts = LAB_DEPARTMENTS.filter(d => d.code !== 'QC');
  const techs = [];
  for (let i = 0; i < EMP; i++) {
    const d = depts[i % depts.length];
    const name = `${pick(FIRST, i)} ${pick(LAST, i * 3 + 1)}`;
    const u = await prisma.user.create({ data: { name, email: `t${i}@test.local`, password: 'x', role: 'LAB_TECH', departments: [d.code] } });
    techs.push({ ...u, dept: d });
  }
  let n = 1000;
  const mk = async (status, extra = {}) => prisma.case.create({ data: { caseNumber: `YA-${n++}`, patientName: 'Test Patient', workType: pick(['Zirconia', 'PFM', 'E.max', 'Crown', 'Bridge'], n), units: rnd(1, 6), status, clinicId: clinic.id, totalAmount: 1000, ...extra } });
  const stage = (caseId, stageName, scannedBy, at) => ({ caseId, stageName, scannedBy, scannedAt: at });
  const rows = [];

  // finished work over the last 7 days (today's clamped to after midnight)
  for (const t of techs) {
    const done = rnd(6, 28);
    for (let k = 0; k < done; k++) {
      const c = await mk('DELIVERED');
      const dayOffset = k % 7;
      const at = dayOffset === 0 ? minsAgo(rnd(10, sinceMidnightMin)) : minsAgo(dayOffset * 1440 + rnd(60, 600));
      rows.push(stage(c.id, 'CASE_ACCEPTED', 'Receptionist', new Date(at - 3 * 3600e3)));
      rows.push(stage(c.id, t.dept.stage, `${t.name} (${t.dept.short})`, at));
      rows.push(stage(c.id, 'QUALITY_CHECK', `QC Tech (QC)`, new Date(at.getTime() + rnd(20, 90) * 60000)));
      if (Math.random() < 0.06) await prisma.case.create({ data: { caseNumber: `YA-${n++}`, patientName: 'Test Patient', workType: 'Crown', status: 'REMAKE', clinicId: clinic.id, originalCaseId: c.id, remake: true } });
    }
  }
  // live work: each clocked-in tech holds 0-2 cases
  const present = techs.filter((_, i) => i % 7 !== 3);
  const onBreak = new Set([techs[2].id, techs[9].id]);
  for (const t of present) {
    const held = rnd(0, 2);
    for (let k = 0; k < held; k++) {
      const c = await mk(t.dept.stage, { dueDate: new Date(Date.now() + rnd(-6, 72) * 3600e3) });
      rows.push(stage(c.id, 'CASE_ACCEPTED', 'Receptionist', minsAgo(600)));
      rows.push(stage(c.id, t.dept.stage, `${t.name} (${t.dept.short})`, minsAgo(rnd(5, 180) + k * 60)));
    }
  }
  for (let k = 0; k < 6; k++) { // moved on, nobody has scanned it in yet
    const d = depts[(k * 3) % depts.length];
    const c = await mk(d.stage);
    rows.push(stage(c.id, 'CASE_ACCEPTED', 'Receptionist', minsAgo(500)));
    rows.push(stage(c.id, d.stage, 'System', minsAgo(rnd(10, 300))));
  }
  for (let k = 0; k < 4; k++) { const c = await mk('ON_HOLD'); rows.push(stage(c.id, 'ON_HOLD', 'Receptionist', minsAgo(900))); }
  for (let k = 0; k < 3; k++) { const c = await mk('CASE_ACCEPTED', { remake: true, remakeStatus: 'PENDING_REVIEW' }); rows.push(stage(c.id, 'CASE_ACCEPTED', 'Receptionist', minsAgo(120))); }
  for (let k = 0; k < 9; k++) { const c = await mk('CASE_ACCEPTED'); rows.push(stage(c.id, 'CASE_ACCEPTED', 'Receptionist', minsAgo(rnd(5, 400)))); }
  for (let k = 0; k < 5; k++) { const c = await mk('READY_TO_DISPATCH'); rows.push(stage(c.id, 'READY_TO_DISPATCH', 'System', minsAgo(rnd(5, 200)))); }
  await prisma.caseStage.createMany({ data: rows });

  const clock = (u) => ({ userId: u.id, timestamp: new Date(Math.max(midnight.getTime() + 60000, Date.now() - rnd(60, 200) * 60000)), type: 'CLOCK_IN', source: 'BIOMETRIC' });
  const att = present.map(clock);
  for (const t of present.filter(t => onBreak.has(t.id))) att.push({ userId: t.id, timestamp: minsAgo(5), type: 'BREAK_START', source: 'BIOMETRIC' });
  await prisma.attendanceEvent.createMany({ data: att });


  // ── operations extras for the dispatch / HR / delivery / scan screens (synthetic test data)
  const nowMin = Math.floor((Date.now() - midnight.getTime()) / 60000);
  const startMin = Math.max(1, nowMin - 180);
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const shift = await prisma.shift.create({ data: { name: 'Office Hour', startTime: hhmm(startMin), endTime: '23:59', gracePeriodMinutes: 10, lateThresholdMinutes: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] } });
  const trusted = await prisma.clinic.create({ data: { name: 'Trusted Test Clinic', password: 'x', email: 'trusted@test.local', isExcluded: true } });
  const supportRole = await prisma.staffRole.create({ data: { department: 'Support Staff', name: 'Janitor', baseRole: 'DELIVERY' } });
  const chefRole = await prisma.staffRole.create({ data: { department: 'Support Staff', name: 'Chef', baseRole: 'DELIVERY' } });
  const person = (name, role, extra = {}) => prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}@test.local`, password: 'x', role, ...extra } });
  const drivers = [];
  for (const n of ['Yared Driver', 'Samuel Rider', 'Abenezer Courier', 'Tomas Driver', 'Mekdes Rider', 'Girma Courier']) drivers.push(await person(n, 'DELIVERY'));
  const office = [];
  for (const n of ['Sara Reception', 'Hanna Reception', 'Mulu Dispatch', 'Fitsum Finance', 'Liya HR']) office.push(await person(n, n.includes('Dispatch') ? 'DISPATCH' : n.includes('Finance') ? 'FINANCE' : n.includes('HR') ? 'HR_MANAGER' : 'RECEPTIONIST'));
  const support = [await person('Almaz Janitor', 'DELIVERY', { staffRoleId: supportRole.id }), await person('Chaltu Chef', 'DELIVERY', { staffRoleId: chefRole.id }), await person('Zewdu Janitor', 'DELIVERY', { staffRoleId: supportRole.id })];

  const everyone = [...techs, ...drivers, ...office, ...support];
  await prisma.shiftAssignment.createMany({ data: everyone.map(u => ({ userId: u.id, shiftId: shift.id, effectiveFrom: new Date(midnight.getTime() - 86400000), createdById: admin.id })) });
  const punch = (u, minOfDay) => ({ userId: u.id, timestamp: new Date(midnight.getTime() + Math.min(minOfDay, nowMin - 1) * 60000), type: 'CLOCK_IN', source: 'BIOMETRIC' });
  const more = [];
  drivers.slice(0, 5).forEach((u, i) => more.push(punch(u, startMin + 2 + i)));
  office.forEach((u, i) => more.push(punch(u, i === 1 ? startMin + 55 : startMin + 3 + i))); // one late
  support.slice(0, 2).forEach((u, i) => more.push(punch(u, startMin + 6 + i)));
  await prisma.attendanceEvent.createMany({ data: more });
  const onLeave = techs.filter((_, i) => i % 7 === 3).slice(0, 2);
  for (const u of [...onLeave, drivers[5]]) await prisma.leaveRecord.create({ data: { userId: u.id, fromDate: new Date(midnight.getTime() - 86400000), toDate: new Date(midnight.getTime() + 86400000), status: 'APPROVED', recordedById: admin.id } });

  const drow = (caseId, stageName, by, at, notes) => ({ caseId, stageName, scannedBy: by, scannedAt: at, notes });
  const extra = [];
  for (let k = 0; k < 3; k++) { const c = await mk('PENDING_PICKUP'); extra.push(drow(c.id, 'PENDING_PICKUP', 'Reception', minsAgo(rnd(30, 300)), 'Awaiting pickup')); }
  for (let k = 0; k < 3; k++) { const c = await mk('PICKUP_ASSIGNED', k === 2 ? {} : { assignedDeliveryId: drivers[k].id }); extra.push(drow(c.id, 'PICKUP_ASSIGNED', 'Dispatch', minsAgo(rnd(10, 120)), 'Pickup assigned')); }
  for (let k = 0; k < 4; k++) {
    const d = drivers[k % 4];
    const c = await mk('OUT_FOR_DELIVERY', { assignedDeliveryId: d.id });
    extra.push(drow(c.id, 'OUT_FOR_DELIVERY', 'Dispatcher', minsAgo(rnd(10, 150)), `Dispatched to ${d.name} for delivery`));
  }
  for (let k = 0; k < 3; k++) { const c = await mk('READY_TO_DISPATCH', { paymentStatus: 'VERIFIED' }); extra.push(drow(c.id, 'READY_TO_DISPATCH', 'System', minsAgo(rnd(10, 200)), 'QC passed')); }
  for (let k = 0; k < 2; k++) { const c = await mk('READY_TO_DISPATCH'); extra.push(drow(c.id, 'READY_TO_DISPATCH', 'System', minsAgo(rnd(10, 200)), 'QC passed')); }
  { const c = await prisma.case.create({ data: { caseNumber: `YA-${n++}`, patientName: 'Test Patient', workType: 'Crown', units: 2, status: 'READY_TO_DISPATCH', clinicId: trusted.id } }); extra.push(drow(c.id, 'READY_TO_DISPATCH', 'System', minsAgo(40), 'QC passed')); }
  for (let k = 0; k < 9; k++) {
    const d = drivers[k % 5];
    const c = await mk('DELIVERED');
    extra.push(drow(c.id, 'OUT_FOR_DELIVERY', 'Dispatcher', minsAgo(rnd(60, Math.max(61, sinceMidnightMin))), `Dispatched to ${d.name} for delivery`));
    extra.push(drow(c.id, 'DELIVERED', d.name, minsAgo(rnd(5, 55)), 'Delivered successfully'));
  }
  await prisma.caseStage.createMany({ data: extra });

  await tv.saveConfig({
    interstitialEvery: 1,
    performance: { dailyTargets: { DESIGNING: 6, MILLING: 5, CERAMIC: 4, SCANNING: 8, GLAZING: 6, PLASTER: 7 }, handlingTargetMinutes: { DESIGNING: 90, MILLING: 60, CERAMIC: 120 }, minSample: 8 },
    achievements: { milestones: [3, 5, 10], recognitions: [{ text: 'Thank you to everyone for a strong week' }] },
  }, admin.id);
  return { admin, techs, present };
}

let outageUntil = 0;
async function main() {
  const { admin, techs } = await seed();
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', '*'); res.header('Access-Control-Allow-Methods', '*'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  const ns = io.of('/tv'); tv.setNamespace(ns);
  ns.use(async (socket, next) => {
    if (Date.now() < outageUntil) return next(new Error('demo outage'));
    const t = socket.handshake.auth?.token;
    try { const disp = await tv.verifyDisplayToken(t); if (disp) { socket.display = disp; return next(); } const u = t ? jwt.verify(t, process.env.JWT_SECRET) : null; if (u?.role === 'ADMIN') return next(); } catch { /* no */ }
    next(new Error('unauthorised'));
  });
  ns.on('connection', (s) => { s.join(tv.TV_ROOM); if (s.display) s.join(`display_${s.display.id}`); s.on('tv:ping', (ack) => typeof ack === 'function' && ack({ serverTime: new Date().toISOString() })); });
  app.get('/demo/sockets', (req, res) => res.json({ count: ns.sockets.size })); // how many TVs are connected right now
  app.post('/demo/outage', (req, res) => { outageUntil = Date.now() + Number(req.query.ms || 15000); ns.disconnectSockets(true); res.json({ until: outageUntil }); });
  app.use('/api/tv', (req, res, next) => (Date.now() < outageUntil ? res.status(503).json({ error: 'demo outage' }) : next()));
  app.use('/api/tv', require('../../src/routes/tv'));
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const { code } = await tv.createPairing('Demo wall TV', admin.id);
  const { token } = await tv.pairDisplay(code);
  const out = path.join(__dirname, '..', '..', '.tv-demo.json'); // git-ignored via .env* ? no — keep outside git below
  fs.writeFileSync(process.env.TV_DEMO_OUT || out, JSON.stringify({ port: PORT, displayToken: token, adminJwt: jwt.sign({ id: admin.id, role: 'ADMIN', name: 'Admin' }, process.env.JWT_SECRET), employees: techs.length }));
  console.log(`TV demo API on http://127.0.0.1:${PORT}/api/tv  (${techs.length} test employees)`);

  // a real write: a technician passes a case on to the next department (DB rows + event log + live push)
  const next = (stage) => { const i = LAB_DEPARTMENTS.findIndex(d => d.stage === stage); return LAB_DEPARTMENTS[Math.min(i + 1, LAB_DEPARTMENTS.length - 1)]; };
  const moveOne = async () => {
    const cases = await prisma.case.findMany({ where: { status: { in: LAB_DEPARTMENTS.filter(d => d.code !== 'QC').map(d => d.stage) } }, take: 40 });
    const c = cases[Math.floor(Math.random() * cases.length)];
    if (!c) return null;
    const nd = next(c.status);
    const tech = techs.find(t => t.dept.code === nd.code) || techs[0];
    await prisma.case.update({ where: { id: c.id }, data: { status: nd.stage } });
    await prisma.caseStage.create({ data: { caseId: c.id, stageName: nd.stage, scannedBy: `${tech.name} (${nd.short})` } });
    await tv.recordEvent({ type: 'STAGE_ENTERED', caseId: c.id, caseNumber: c.caseNumber, stage: nd.stage, fromStage: c.status, department: nd.code, actorName: tech.name });
    return c.caseNumber;
  };
  app.post('/demo/move', async (req, res) => res.json({ caseNumber: await moveOne() }));
  if (SIM) setInterval(() => moveOne().catch(e => console.error('sim', e.message)), 4000);
}
main().catch(e => { console.error(e); process.exit(1); });
