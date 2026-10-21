// Run: node --test tests/
process.env.TZ = 'Africa/Addis_Ababa';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { attributeScan, stageRuns, deriveHandoffs, employeeStatus, buildSnapshot, attendanceState } = require('../src/services/tvProjection');
const { sanitizeConfig, DEFAULT_CONFIG } = require('../src/services/tvConfig');
const { LAB_DEPARTMENTS } = require('../src/utils/labDepartments');

const H = 3600 * 1000;
const NOW = new Date('2026-10-22T09:00:00+03:00');
const DAY = new Date('2026-10-22T00:00:00+03:00');
const at = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * H);
const row = (caseId, stageName, hoursAgo, scannedBy) => ({ caseId, stageName, scannedAt: at(hoursAgo), scannedBy });
const cfg = sanitizeConfig({});

const caseRow = (id, status, extra = {}) => ({
  id, caseNumber: `YA-${id}`, workType: 'Zirconia', units: 2, status, dueDate: null, remake: false, redo: false, isRedo: false,
  remakeStatus: null, createdAt: at(48), updatedAt: at(1), patientName: 'SECRET PATIENT', clinicName: 'SECRET CLINIC', totalAmount: 999, ...extra,
});
const abebe = { id: 'u1', name: 'Abebe Tesfaye', departments: ['DESIGNING'] };
const clockedIn = new Map([['u1', [{ type: 'CLOCK_IN', timestamp: at(5) }]]]);
const base = (over) => ({
  now: NOW, dayStart: DAY, cases: [], stageRowsByCase: {}, employees: [abebe], attendanceByUser: new Map(),
  remadeCaseIds: new Set(), caseMetaById: new Map(), config: cfg, seq: 7, ...over,
});

test('department table matches scan.js', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/routes/scan.js'), 'utf8');
  for (const d of LAB_DEPARTMENTS) {
    assert.match(src, new RegExp(`${d.code}:\\s+\\{[^}]*short: '${d.short}'[^}]*stage: '${d.stage}'`), d.code);
  }
});

test('attributeScan only trusts department scans', () => {
  assert.deepEqual(attributeScan('Abebe Tesfaye (DES)'), { name: 'Abebe Tesfaye', short: 'DES' });
  assert.equal(attributeScan('System'), null);
  assert.equal(attributeScan('Receptionist Name'), null);
  assert.equal(attributeScan('Someone (XYZ)'), null);
});

test('stageRuns collapses re-scans and notes into one visit', () => {
  const runs = stageRuns([
    row('c', 'CASE_ACCEPTED', 10, 'Rec'), row('c', 'DESIGNING', 5, 'Abebe Tesfaye (DES)'),
    row('c', 'DESIGNING', 4, 'Corrector'), row('c', 'MILLING_SINTERING', 2, 'Kebede Alemu (MIL)'),
  ]);
  assert.deepEqual(runs.map(r => r.stage), ['CASE_ACCEPTED', 'DESIGNING', 'MILLING_SINTERING']);
  assert.equal(runs[1].completedAt.getTime(), at(2).getTime());
  assert.equal(runs[2].completedAt, null);
});

test('handoffs: finished work only, QC has no handling time', () => {
  const h = deriveHandoffs({ c: [row('c', 'DESIGNING', 5, 'Abebe Tesfaye (DES)'), row('c', 'QUALITY_CHECK', 3, 'Abebe Tesfaye (QC)'), row('c', 'READY_TO_DISPATCH', 3, 'System')] });
  assert.equal(h.length, 2);
  assert.equal(h.find(x => x.short === 'DES').handlingMs, 2 * H);
  assert.equal(h.find(x => x.short === 'QC').handlingMs, null);
});

test('employee status never treats assignment alone as work', () => {
  const clocked = { clockedIn: true, onBreak: false };
  const gone = { clockedIn: false, onBreak: false };
  assert.equal(employeeStatus({ attendance: clocked, currentCase: null, lastScanAt: null, now: NOW }), 'AVAILABLE');
  assert.equal(employeeStatus({ attendance: clocked, currentCase: { status: 'DESIGNING' }, lastScanAt: at(1), now: NOW }), 'WORKING');
  assert.equal(employeeStatus({ attendance: gone, currentCase: { status: 'DESIGNING' }, lastScanAt: at(9), now: NOW }), 'OFF_DUTY');
  assert.equal(employeeStatus({ attendance: gone, currentCase: { status: 'DESIGNING' }, lastScanAt: at(0.5), now: NOW }), 'WORKING');
  assert.equal(employeeStatus({ attendance: { clockedIn: true, onBreak: true }, currentCase: { status: 'DESIGNING' }, lastScanAt: at(1), now: NOW }), 'ON_BREAK');
  assert.equal(employeeStatus({ attendance: clocked, currentCase: { status: 'ON_HOLD' }, lastScanAt: at(1), now: NOW }), 'BLOCKED');
  assert.equal(employeeStatus({ attendance: clocked, currentCase: { status: 'DESIGNING', remakeStatus: 'PENDING_REVIEW' }, lastScanAt: at(1), now: NOW }), 'WAITING_FOR_APPROVAL');
});

test('attendance: last punch break-start means on break', () => {
  assert.equal(attendanceState([{ type: 'CLOCK_IN', timestamp: at(4) }, { type: 'BREAK_START', timestamp: at(1) }], NOW).onBreak, true);
  assert.equal(attendanceState([], NOW).clockedIn, false);
});

test('transfer moves the case off the old owner and shows no invented owner', () => {
  const before = buildSnapshot(base({
    cases: [caseRow('1', 'DESIGNING')], attendanceByUser: clockedIn,
    stageRowsByCase: { 1: [row('1', 'DESIGNING', 2, 'Abebe Tesfaye (DES)')] },
  }));
  assert.equal(before.employees[0].status, 'WORKING');
  assert.equal(before.employees[0].currentCase.caseNumber, 'YA-1');

  const after = buildSnapshot(base({
    cases: [caseRow('1', 'MILLING_SINTERING')], attendanceByUser: clockedIn,
    stageRowsByCase: { 1: [row('1', 'DESIGNING', 2, 'Abebe Tesfaye (DES)'), row('1', 'MILLING_SINTERING', 0.5, 'System')] },
  }));
  assert.equal(after.employees[0].status, 'AVAILABLE');
  assert.equal(after.employees[0].currentCase, null);
  assert.equal(after.employees[0].completedToday, 1);
  assert.equal(after.critical.unassigned.length, 1);
  assert.equal(after.critical.unassigned[0].owner, null);
});

test('several assigned cases: the latest is worked, the rest are counted', () => {
  const s = buildSnapshot(base({
    cases: [caseRow('1', 'DESIGNING'), caseRow('2', 'DESIGNING')], attendanceByUser: clockedIn,
    stageRowsByCase: { 1: [row('1', 'DESIGNING', 3, 'Abebe Tesfaye (DES)')], 2: [row('2', 'DESIGNING', 1, 'Abebe Tesfaye (DES)')] },
  }));
  assert.equal(s.employees[0].currentCase.caseNumber, 'YA-2');
  assert.equal(s.employees[0].otherAssigned, 1);
  assert.equal(s.employees[0].assignedCount, 2);
});

test('snapshot carries no patient, clinic or money data', () => {
  const s = buildSnapshot(base({
    cases: [caseRow('1', 'DESIGNING', { dueDate: at(2) })], attendanceByUser: clockedIn,
    stageRowsByCase: { 1: [row('1', 'DESIGNING', 2, 'Abebe Tesfaye (DES)')] },
  }));
  const text = JSON.stringify(s);
  for (const secret of ['SECRET PATIENT', 'SECRET CLINIC', 'totalAmount', 'patientName', 'clinicName']) assert.ok(!text.includes(secret), secret);
  assert.equal(s.critical.overdue.length, 1);
  assert.equal(s.critical.overdue[0].owner, 'Abebe');
});

test('performance shows "not enough data" and ranks only against configured targets', () => {
  const rows = {};
  for (let i = 0; i < 3; i++) rows[`d${i}`] = [row(`d${i}`, 'DESIGNING', 6, 'Abebe Tesfaye (DES)'), row(`d${i}`, 'MILLING_SINTERING', 4, 'Kebede (MIL)')];
  const s = buildSnapshot(base({ stageRowsByCase: rows }));
  const m = s.employees[0].metrics;
  assert.equal(s.employees[0].completedToday, 3);
  assert.equal(m.qualityRate, null);
  assert.equal(m.onTimeRate, null);
  assert.equal(m.targetPct, null);
  assert.equal(s.performance.ranked.length, 0);
  assert.equal(s.performance.unranked.length, 1);

  const withTarget = buildSnapshot(base({ stageRowsByCase: rows, config: sanitizeConfig({ performance: { dailyTargets: { DESIGNING: 1 }, minSample: 3 } }) }));
  assert.equal(withTarget.performance.ranked.length, 1);
  assert.equal(withTarget.employees[0].metrics.qualityRate, 100);
});

test('quality uses remakes of the cases a person finished', () => {
  const rows = {};
  for (let i = 0; i < 10; i++) rows[`q${i}`] = [row(`q${i}`, 'DESIGNING', 6, 'Abebe Tesfaye (DES)'), row(`q${i}`, 'MILLING_SINTERING', 4, 'K (MIL)')];
  const s = buildSnapshot(base({ stageRowsByCase: rows, remadeCaseIds: new Set(['q0']) }));
  assert.equal(s.employees[0].metrics.qualityRate, 90);
});

test('config sanitising clamps and never drops a screen', () => {
  const c = sanitizeConfig({ screens: [{ id: 'pipeline', seconds: 9999, enabled: false }, { id: 'bogus' }], transitionMs: -5, animationIntensity: 'wild' });
  assert.equal(c.screens.length, 6);
  assert.equal(c.screens[0].id, 'pipeline');
  assert.equal(c.screens[0].seconds, 300);
  assert.equal(c.screens[0].enabled, false);
  assert.equal(c.transitionMs, 0);
  assert.equal(c.animationIntensity, DEFAULT_CONFIG.animationIntensity);
  assert.equal(sanitizeConfig(null).screens.length, 6);
  assert.ok(sanitizeConfig(null).screens.every(s => s.enabled), 'first run: all screens on');
  const partial = sanitizeConfig({ screens: [{ id: 'command', enabled: true, seconds: 10 }] });
  assert.equal(partial.screens.filter(s => s.enabled).length, 1, 'omitted screens are kept but off');
  assert.equal(partial.screens.length, 6);
});

test('hidden employees are not shown', () => {
  const s = buildSnapshot(base({ config: sanitizeConfig({ hiddenEmployeeIds: ['u1'] }) }));
  assert.equal(s.employees.length, 0);
});
