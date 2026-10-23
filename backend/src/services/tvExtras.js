// Ye-Almaz — extra TV read models: dispatch segment, live department status board, HR attendance lists,
// delivery performance and per-technician scan counts. Pure functions over rows already loaded by tvService, so
// every rule here is unit-tested without a database. Output carries counts, names, titles, times — never patient,
// clinic or money fields (payment state is used only to choose a bucket, then discarded).
const { computeDaySummary } = require('./attendanceDaySummary');
const { LAB_DEPARTMENTS, BY_STAGE, BY_SHORT } = require('../utils/labDepartments');
const { attributeScan, stageRuns } = require('./tvProjection');
const { matchDeliveryAgent, classifyDeliveryEvent } = require('../utils/deliveryAttribution');

const MIN = 60000;

// ── 1. Dispatch segment — the same buckets as the Dispatch dashboard (DispatchDashboard.jsx "FINAL DEFINITION")
const isPaymentClear = (c) =>
  c.paymentStatus === 'VERIFIED' || c.isTrustedPartner || c.remakeStatus === 'REMAKE_FREE' || (c.remake === true && c.remakeStatus == null);

function buildDispatchBoard({ cases, stageRowsByCase, dayStart, now }) {
  const since = (c) => {
    const runs = stageRuns(stageRowsByCase[c.id] || []);
    const run = runs[runs.length - 1];
    return run && run.stage === c.status ? run.enteredAt : c.updatedAt;
  };
  const buckets = { pendingPickup: [], pickupInProgress: [], outForDelivery: [], readyForDispatch: [], readyForDelivery: [] };
  for (const c of cases) {
    if (c.status === 'PENDING_PICKUP' || (c.status === 'PICKUP_ASSIGNED' && !c.assignedDeliveryId)) buckets.pendingPickup.push(c);
    else if (c.status === 'PICKUP_ASSIGNED') buckets.pickupInProgress.push(c);
    else if (c.status === 'OUT_FOR_DELIVERY') buckets.outForDelivery.push(c);
    else if (c.status === 'READY_TO_DISPATCH') (isPaymentClear(c) ? buckets.readyForDispatch : buckets.readyForDelivery).push(c);
  }
  const delivered = new Set();
  for (const [caseId, rows] of Object.entries(stageRowsByCase)) {
    if (rows.some(r => r.stageName === 'DELIVERED' && r.scannedAt >= dayStart)) delivered.add(caseId);
  }
  const tile = (key, label, hint, list) => {
    const oldest = list.reduce((m, c) => { const s = since(c); return !m || s < m ? s : m; }, null);
    return { key, label, hint, count: list.length, oldestMs: oldest ? now - oldest : null };
  };
  // order and wording follow the lab's own description of the flow
  const tiles = [
    tile('pendingPickup', 'Pending pick up', 'waiting for a driver', buckets.pendingPickup),
    tile('pickupInProgress', 'Pick up in progress', 'driver on the way', buckets.pickupInProgress),
    tile('outForDelivery', 'Out for delivery', 'with the driver', buckets.outForDelivery),
    tile('readyForDispatch', 'Ready for dispatch', 'cleared · assign a driver', buckets.readyForDispatch),
    tile('readyForDelivery', 'Ready for delivery', 'QC done · awaiting payment', buckets.readyForDelivery),
    { key: 'deliveredToday', label: 'Delivered', hint: 'today', count: delivered.size, oldestMs: null },
  ];
  return { tiles, openTotal: tiles.slice(0, 5).reduce((s, t) => s + t.count, 0) };
}

// ── 2. Live case status board — scans per department today, reconciled to the day's total
function buildStatusBoard({ cases, stageRowsByCase, dayStart, config }) {
  const visible = config.visibleDepartments.length ? new Set(config.visibleDepartments) : null;
  const scanned = new Map(LAB_DEPARTMENTS.map(d => [d.short, new Set()]));
  const touched = new Set();
  for (const [caseId, rows] of Object.entries(stageRowsByCase)) {
    for (const r of rows) {
      if (r.scannedAt < dayStart) continue;
      const a = attributeScan(r.scannedBy);
      if (!a) continue;
      scanned.get(a.short)?.add(caseId);
      touched.add(caseId);
    }
  }
  const nowIn = {};
  for (const c of cases) { const d = BY_STAGE[c.status]; if (d) nowIn[d.code] = (nowIn[d.code] || 0) + 1; }
  const departments = LAB_DEPARTMENTS.filter(d => !visible || visible.has(d.code)).map(d => ({
    code: d.code, label: d.label, scannedToday: scanned.get(d.short).size, inDepartmentNow: nowIn[d.code] || 0,
  }));
  return {
    departments,
    // each department's count is cases scanned there today; a case that passed through three departments
    // appears in three rows, so the sum is "scans" and the distinct figure is "cases in operation today"
    totalScansToday: departments.reduce((s, d) => s + d.scannedToday, 0),
    casesInOperationToday: touched.size,
    inDepartmentsNow: departments.reduce((s, d) => s + d.inDepartmentNow, 0),
  };
}

// ── 3. HR lists — present / late / absent / on leave, using the same day rules as HR's attendance summary
const ROLE_TITLE = {
  ADMIN: 'Administrator', RECEPTIONIST: 'Reception', LAB_TECH: 'Lab technician', DELIVERY: 'Delivery', DISPATCH: 'Dispatch',
  FINANCE: 'Finance', FINANCE_AP: 'Finance', FINANCE_CASHIER: 'Cashier', INVENTORY_MANAGER: 'Inventory', HR_MANAGER: 'HR', LEADER: 'Operation lead',
};
const DEFAULT_EXPECTED_START = '09:00';
const at = (day, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d; };

function buildHrBoard({ day, now, employees, eventsByUser, leaveByUser, shiftByUser, correctionByUser, holiday, hiddenIds = [] }) {
  const out = { present: [], late: [], absent: [], onLeave: [], notYetIn: 0, total: 0, holiday: !!holiday };
  for (const emp of employees) {
    if (hiddenIds.includes(emp.id)) continue;
    const shift = shiftByUser.get(emp.id) || null;
    const s = computeDaySummary({
      date: day, events: eventsByUser.get(emp.id) || [], shift, holiday: holiday || null,
      leaveRecord: leaveByUser.get(emp.id) || null, correction: correctionByUser.get(emp.id) || null,
    });
    const person = {
      id: emp.id, name: emp.name, title: emp.staffRole?.name || ROLE_TITLE[emp.role] || '', department: emp.staffRole?.department || '',
      shift: shift?.name || null,
    };
    if (['OFF', 'HOLIDAY'].includes(s.status)) continue; // not a working day for them: on no list
    out.total += 1;
    if (s.status === 'ON_LEAVE' || s.status === 'HALF_DAY_LEAVE') { out.onLeave.push({ ...person, half: s.status === 'HALF_DAY_LEAVE' }); continue; }
    if (s.status === 'ABSENT') {
      // nobody is "absent" before their shift has even started
      const due = shift ? new Date(at(day, shift.startTime).getTime() + ((shift.gracePeriodMinutes || 0) + (shift.lateThresholdMinutes || 0)) * MIN) : at(day, DEFAULT_EXPECTED_START);
      if (now >= due) out.absent.push(person); else out.notYetIn += 1;
      continue;
    }
    const row = { ...person, clockIn: s.clockIn, lateMinutes: s.lateMinutes };
    out.present.push(row);
    if (s.late) out.late.push(row);
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  out.present.sort((a, b) => (a.clockIn || 0) - (b.clockIn || 0));
  out.late.sort((a, b) => b.lateMinutes - a.lateMinutes);
  out.absent.sort(byName); out.onLeave.sort(byName);
  return out;
}

// ── 4. Delivery performance today (same attribution rules as the admin Delivery Performance page)
function buildDeliveryBoard({ agents, events, maps, activeCases }) {
  const per = new Map(agents.map(a => [a.id, { id: a.id, name: a.name, pickupsToday: 0, deliveriesToday: 0, pickingUpNow: 0, outNow: 0, lastActiveAt: null }]));
  let unattributed = 0;
  for (const e of events) {
    const agent = matchDeliveryAgent(e.scannedBy, e.notes, maps);
    const kind = classifyDeliveryEvent(e.stageName);
    if (!agent || !kind || !per.has(agent.id)) { unattributed += 1; continue; }
    const p = per.get(agent.id);
    if (kind.type === 'PICKUP') p.pickupsToday += 1; else p.deliveriesToday += 1;
    if (!p.lastActiveAt || e.scannedAt > p.lastActiveAt) p.lastActiveAt = e.scannedAt;
  }
  for (const c of activeCases) {
    const p = c.assignedDeliveryId && per.get(c.assignedDeliveryId);
    if (!p) continue;
    if (c.status === 'OUT_FOR_DELIVERY') p.outNow += 1;
    else if (c.status === 'PICKUP_ASSIGNED') p.pickingUpNow += 1;
  }
  const drivers = [...per.values()].map(p => ({ ...p, completedToday: p.pickupsToday + p.deliveriesToday, activeNow: p.pickingUpNow + p.outNow }))
    .sort((a, b) => b.completedToday - a.completedToday || b.activeNow - a.activeNow || a.name.localeCompare(b.name));
  return {
    drivers,
    totals: {
      pickupsToday: drivers.reduce((s, d) => s + d.pickupsToday, 0),
      deliveriesToday: drivers.reduce((s, d) => s + d.deliveriesToday, 0),
      activeNow: drivers.reduce((s, d) => s + d.activeNow, 0),
      unattributed,
    },
  };
}

// ── 5. Lab performance by individual scan count, in relation to the cases in process (plain counts for now)
function buildLabScans({ stageRowsByCase, employees, dayStart, inProcess, hiddenIds = [] }) {
  const key = (n) => n.trim().toLowerCase();
  const byName = new Map(employees.filter(e => !hiddenIds.includes(e.id)).map(e => [key(e.name), { id: e.id, name: e.name, scansToday: 0, byDept: {} }]));
  let totalScans = 0, otherScans = 0;
  for (const rows of Object.values(stageRowsByCase)) {
    for (const r of rows) {
      if (r.scannedAt < dayStart) continue;
      const a = attributeScan(r.scannedBy);
      if (!a) continue;
      totalScans += 1;
      const p = byName.get(key(a.name));
      if (!p) { otherScans += 1; continue; }
      p.scansToday += 1;
      p.byDept[a.short] = (p.byDept[a.short] || 0) + 1;
    }
  }
  const rows = [...byName.values()].map(p => {
    const top = Object.entries(p.byDept).sort((x, y) => y[1] - x[1])[0];
    return {
      id: p.id, name: p.name, department: top ? BY_SHORT[top[0]]?.label || null : null, scansToday: p.scansToday,
      // plain ratios of counts, shown as percentages; the formula can be refined later
      shareOfScansPct: totalScans > 0 ? Math.round((p.scansToday / totalScans) * 1000) / 10 : null,
      vsInProcessPct: inProcess > 0 ? Math.round((p.scansToday / inProcess) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.scansToday - a.scansToday || a.name.localeCompare(b.name));
  return { rows, totalScans, otherScans, casesInProcess: inProcess };
}

module.exports = { isPaymentClear, buildDispatchBoard, buildStatusBoard, buildHrBoard, buildDeliveryBoard, buildLabScans };
