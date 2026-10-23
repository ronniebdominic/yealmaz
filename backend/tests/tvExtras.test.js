// Run: node --test tests/tvExtras.test.js
process.env.TZ = 'Africa/Addis_Ababa';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDispatchBoard, buildStatusBoard, buildHrBoard, buildDeliveryBoard, buildLabScans, isPaymentClear } = require('../src/services/tvExtras');
const { buildAgentNameMaps } = require('../src/utils/deliveryAttribution');
const { sanitizeConfig } = require('../src/services/tvConfig');

const H = 3600e3;
const NOW = new Date('2026-10-22T11:00:00+03:00');
const DAY = new Date('2026-10-22T00:00:00+03:00');
const ago = (h) => new Date(NOW.getTime() - h * H);
const row = (caseId, stageName, h, scannedBy) => ({ caseId, stageName, scannedAt: ago(h), scannedBy });
const kase = (id, status, extra = {}) => ({ id, caseNumber: `YA-${id}`, status, updatedAt: ago(1), paymentStatus: 'PENDING', isTrustedPartner: false, remake: false, remakeStatus: null, assignedDeliveryId: null, ...extra });
const cfg = sanitizeConfig({});

test('dispatch buckets follow the Dispatch dashboard rules, in the lab\'s order', () => {
  const cases = [
    kase('1', 'PENDING_PICKUP'), kase('2', 'PICKUP_ASSIGNED', { assignedDeliveryId: 'd1' }), kase('3', 'PICKUP_ASSIGNED'),
    kase('4', 'OUT_FOR_DELIVERY', { assignedDeliveryId: 'd1' }),
    kase('5', 'READY_TO_DISPATCH', { paymentStatus: 'VERIFIED' }), kase('6', 'READY_TO_DISPATCH', { isTrustedPartner: true }),
    kase('7', 'READY_TO_DISPATCH'), kase('8', 'READY_TO_DISPATCH', { remakeStatus: 'PENDING_REVIEW', remake: true }),
    kase('9', 'READY_TO_DISPATCH', { remakeStatus: 'REMAKE_FREE', remake: true }), kase('10', 'DESIGNING'),
  ];
  const stageRowsByCase = { d1: [row('d1', 'DELIVERED', 2, 'Driver')], d2: [row('d2', 'DELIVERED', 30, 'Driver')] };
  const b = buildDispatchBoard({ cases, stageRowsByCase, dayStart: DAY, now: NOW });
  const n = Object.fromEntries(b.tiles.map(t => [t.key, t.count]));
  assert.deepEqual(b.tiles.map(t => t.key), ['pendingPickup', 'pickupInProgress', 'outForDelivery', 'readyForDispatch', 'readyForDelivery', 'deliveredToday']);
  assert.equal(n.pendingPickup, 2);        // waiting + assigned-without-driver
  assert.equal(n.pickupInProgress, 1);
  assert.equal(n.outForDelivery, 1);
  assert.equal(n.readyForDispatch, 3);     // verified, trusted partner, free remake
  assert.equal(n.readyForDelivery, 2);     // unpaid + remake still under review
  assert.equal(n.deliveredToday, 1);       // yesterday's delivery does not count
  assert.equal(b.openTotal, 9);
  assert.equal(isPaymentClear(kase('x', 'READY_TO_DISPATCH', { remake: true })), true, 'legacy remake counts as clear');
});

test('status board: per-department scans reconcile to the day total', () => {
  const stageRowsByCase = {
    a: [row('a', 'DESIGNING', 3, 'Abebe (DES)'), row('a', 'MILLING_SINTERING', 2, 'Kebede (MIL)')],
    b: [row('b', 'DESIGNING', 1, 'Abebe (DES)')],
    c: [row('c', 'DESIGNING', 30, 'Abebe (DES)')], // yesterday
    d: [row('d', 'CASE_ACCEPTED', 2, 'Reception')], // not a department scan
  };
  const sb = buildStatusBoard({ cases: [kase('a', 'MILLING_SINTERING'), kase('b', 'DESIGNING')], stageRowsByCase, dayStart: DAY, config: cfg });
  const get = (c) => sb.departments.find(d => d.code === c);
  assert.equal(get('DESIGNING').scannedToday, 2);
  assert.equal(get('MILLING').scannedToday, 1);
  assert.equal(sb.totalScansToday, 3);
  assert.equal(sb.totalScansToday, sb.departments.reduce((s, d) => s + d.scannedToday, 0));
  assert.equal(sb.casesInOperationToday, 2);
  assert.equal(sb.inDepartmentsNow, 2);
});

const shift = { id: 's', name: 'Office Hour', startTime: '08:30', endTime: '17:30', gracePeriodMinutes: 10, lateThresholdMinutes: 0, earlyDepartureThresholdMinutes: 0, workingDays: [0, 1, 2, 3, 4, 5, 6], holidayHandling: 'NO_WORK' };
const emp = (id, name, extra = {}) => ({ id, name, role: 'LAB_TECH', staffRole: null, ...extra });
const punch = (hAgo) => [{ type: 'CLOCK_IN', timestamp: ago(hAgo), source: 'BIOMETRIC' }];

test('HR lists: present, late, absent, on leave — and nobody is absent before their shift starts', () => {
  const employees = [emp('1', 'On Time'), emp('2', 'Late Larry'), emp('3', 'Gone Gina'), emp('4', 'Leave Lulu'), emp('5', 'Chef Chaltu', { role: 'DELIVERY', staffRole: { name: 'Chef', department: 'Support Staff' } })];
  const eventsByUser = new Map([['1', punch(2.7)], ['2', punch(1.2)]]); // 08:18 and 09:48 against an 08:30 shift
  const leaveByUser = new Map([['4', { dayPortion: 'FULL' }]]);
  const shiftByUser = new Map(employees.map(e => [e.id, shift]));
  const hr = buildHrBoard({ day: DAY, now: NOW, employees, eventsByUser, leaveByUser, shiftByUser, correctionByUser: new Map(), holiday: null });
  assert.deepEqual(hr.present.map(p => p.name).sort(), ['Late Larry', 'On Time']);
  assert.deepEqual(hr.late.map(p => p.name), ['Late Larry']);
  assert.ok(hr.late[0].lateMinutes > 60);
  assert.deepEqual(hr.absent.map(p => p.name).sort(), ['Chef Chaltu', 'Gone Gina']);
  assert.equal(hr.absent.find(p => p.name === 'Chef Chaltu').title, 'Chef'); // support staff are tracked too
  assert.deepEqual(hr.onLeave.map(p => p.name), ['Leave Lulu']);

  const early = buildHrBoard({ day: DAY, now: new Date('2026-10-22T07:00:00+03:00'), employees, eventsByUser: new Map(), leaveByUser, shiftByUser, correctionByUser: new Map(), holiday: null });
  assert.equal(early.absent.length, 0, 'before shift start: not absent');
  assert.equal(early.notYetIn, 4);
});

test('HR lists leave out people on a day off or a public holiday', () => {
  const offShift = { ...shift, workingDays: [1] }; // Thursday 22 Oct 2026 is not Monday
  const hr = buildHrBoard({ day: DAY, now: NOW, employees: [emp('1', 'Off Olga')], eventsByUser: new Map(), leaveByUser: new Map(), shiftByUser: new Map([['1', offShift]]), correctionByUser: new Map(), holiday: null });
  assert.equal(hr.absent.length + hr.present.length + hr.onLeave.length, 0);
});

test('delivery board counts today\'s pickups and deliveries per driver and their live load', () => {
  const agents = [{ id: 'd1', name: 'Dawit Driver', isActive: true }, { id: 'd2', name: 'Eden Rider', isActive: true }];
  const events = [
    { stageName: 'DELIVERED', scannedBy: 'Dawit Driver', notes: 'Delivered successfully', scannedAt: ago(2) },
    { stageName: 'DELIVERED', scannedBy: 'Dawit Driver', notes: 'Delivered successfully', scannedAt: ago(1) },
    { stageName: 'DELIVERED', scannedBy: 'Receptionist', notes: 'Self pickup by patient', scannedAt: ago(1) },
    { stageName: 'OUT_FOR_DELIVERY', scannedBy: 'Dispatcher', notes: 'Dispatched to Eden Rider for delivery', scannedAt: ago(3) },
  ];
  const activeCases = [kase('1', 'OUT_FOR_DELIVERY', { assignedDeliveryId: 'd1' }), kase('2', 'PICKUP_ASSIGNED', { assignedDeliveryId: 'd1' }), kase('3', 'DESIGNING', { assignedDeliveryId: 'd1' })];
  const b = buildDeliveryBoard({ agents, events, maps: buildAgentNameMaps(agents), activeCases });
  const d1 = b.drivers.find(d => d.id === 'd1'), d2 = b.drivers.find(d => d.id === 'd2');
  assert.equal(d1.deliveriesToday, 2);
  assert.equal(d1.outNow, 1); assert.equal(d1.pickingUpNow, 1); assert.equal(d1.activeNow, 2);
  assert.equal(d2.pickupsToday, 1);
  assert.equal(b.totals.deliveriesToday, 2);
  assert.equal(b.drivers[0].id, 'd1', 'busiest driver first');
});

test('lab scans: per technician counts, share of the day\'s scans and ratio to cases in process', () => {
  const stageRowsByCase = {
    a: [row('a', 'DESIGNING', 3, 'Abebe Tesfaye (DES)'), row('a', 'MILLING_SINTERING', 2, 'Kebede Alemu (MIL)')],
    b: [row('b', 'DESIGNING', 1, 'Abebe Tesfaye (DES)')],
    c: [row('c', 'DESIGNING', 30, 'Abebe Tesfaye (DES)')],
    d: [row('d', 'GLAZING', 1, 'Ex Employee (GLZ)'), row('d', 'CASE_ACCEPTED', 5, 'Receptionist')],
  };
  const employees = [{ id: '1', name: 'Abebe Tesfaye' }, { id: '2', name: 'Kebede Alemu' }, { id: '3', name: 'Idle Ida' }];
  const r = buildLabScans({ stageRowsByCase, employees, dayStart: DAY, inProcess: 10 });
  const by = Object.fromEntries(r.rows.map(x => [x.name, x]));
  assert.equal(by['Abebe Tesfaye'].scansToday, 2);
  assert.equal(by['Kebede Alemu'].scansToday, 1);
  assert.equal(by['Idle Ida'].scansToday, 0);
  assert.equal(r.totalScans, 4);          // includes the ex-employee's scan
  assert.equal(r.otherScans, 1);
  assert.equal(by['Abebe Tesfaye'].shareOfScansPct, 50);
  assert.equal(by['Abebe Tesfaye'].vsInProcessPct, 20);
  assert.equal(by['Abebe Tesfaye'].department, 'Designing');
  assert.equal(r.rows[0].name, 'Abebe Tesfaye');
  const none = buildLabScans({ stageRowsByCase: {}, employees, dayStart: DAY, inProcess: 0 });
  assert.equal(none.rows[0].shareOfScansPct, null);
  assert.equal(none.rows[0].vsInProcessPct, null);
});

test('hidden employees are left out of the HR and scan boards', () => {
  const hr = buildHrBoard({ day: DAY, now: NOW, employees: [emp('1', 'Hidden Hana')], eventsByUser: new Map(), leaveByUser: new Map(), shiftByUser: new Map(), correctionByUser: new Map(), holiday: null, hiddenIds: ['1'] });
  assert.equal(hr.total, 0);
  assert.equal(buildLabScans({ stageRowsByCase: {}, employees: [{ id: '1', name: 'Hidden Hana' }], dayStart: DAY, inProcess: 1, hiddenIds: ['1'] }).rows.length, 0);
});

test('no sensitive field names appear in any new board', () => {
  const out = JSON.stringify([
    buildDispatchBoard({ cases: [kase('1', 'READY_TO_DISPATCH', { paymentStatus: 'VERIFIED', patientName: 'SECRET', totalAmount: 5555 })], stageRowsByCase: {}, dayStart: DAY, now: NOW }),
    buildHrBoard({ day: DAY, now: NOW, employees: [emp('1', 'A B', { email: 'secret@x.com', salary: 9999 })], eventsByUser: new Map(), leaveByUser: new Map(), shiftByUser: new Map(), correctionByUser: new Map(), holiday: null }),
  ]);
  for (const s of ['SECRET', '5555', 'secret@x.com', '9999', 'paymentStatus', 'email', 'salary']) assert.ok(!out.includes(s), s);
});
