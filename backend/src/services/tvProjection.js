// Ye-Almaz — the TV's read model. Everything here is a pure function over rows already loaded from the
// database, so the rules are testable and the TV can only ever show what this file chooses to output:
// case number, work type, units, stage, times and employee first names are the whole vocabulary — no
// patient, clinic or money fields exist in the result.
//
// What "working" means (the lab has no start/pause button): a technician is WORKING when they are on duty
// and the case they most recently scanned into their department is still at that department. Cases they
// scanned earlier that are still there count as "assigned", not worked. Nothing is inferred from a case
// merely being in a department. Break/approval/blocked come only from real signals (see employeeStatus).
const { LAB_DEPARTMENTS, INTAKE_STAGES, DISPATCH_STAGES, FINISHED_STAGES, BY_STAGE, BY_SHORT } = require('../utils/labDepartments');
const { SCAN_PATTERN } = require('../utils/scanAttribution');

const MIN = 60 * 1000, HOUR = 60 * MIN;
const RECENT_ACTIVITY_MS = 2 * HOUR; // a scan this recent proves presence even if no attendance punch arrived

// "Name (DES)" -> { name, short } ; anything else (System, receptionist notes) is not lab-floor work.
function attributeScan(scannedBy) {
  const m = SCAN_PATTERN.exec(scannedBy || '');
  return m && BY_SHORT[m[2]] ? { name: m[1].trim(), short: m[2] } : null;
}

// Collapse a case's rows into the runs it spent at each stage. Rows are time-sorted; consecutive rows with the
// same stage are one visit (re-scans and correction notes don't restart the clock).
function stageRuns(rows) {
  const sorted = [...rows].sort((a, b) => a.scannedAt - b.scannedAt);
  const runs = [];
  for (const r of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.stage === r.stageName) {
      if (!last.owner) { const o = attributeScan(r.scannedBy); if (o) { last.owner = o; last.ownedAt = r.scannedAt; } }
      continue;
    }
    const o = attributeScan(r.scannedBy);
    runs.push({ stage: r.stageName, enteredAt: r.scannedAt, owner: o, ownedAt: o ? r.scannedAt : null, completedAt: null });
  }
  for (let i = 0; i < runs.length - 1; i++) runs[i].completedAt = runs[i + 1].enteredAt;
  return runs;
}

// Finished work: a technician's visit that ended because the case moved on. QC is excluded from handling
// time (the QC scan and the automatic move to dispatch land together, so there is no measurable duration).
function deriveHandoffs(stageRowsByCase) {
  const out = [];
  for (const [caseId, rows] of Object.entries(stageRowsByCase)) {
    for (const run of stageRuns(rows)) {
      if (!run.owner || !run.completedAt) continue;
      out.push({
        caseId, name: run.owner.name, short: run.owner.short, stage: run.stage,
        enteredAt: run.ownedAt || run.enteredAt, completedAt: run.completedAt,
        handlingMs: run.stage === 'QUALITY_CHECK' ? null : run.completedAt - (run.ownedAt || run.enteredAt),
      });
    }
  }
  return out;
}

function attendanceState(events, now) {
  if (!events?.length) return { clockedIn: false, onBreak: false, firstPunch: null };
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const last = sorted[sorted.length - 1];
  return { clockedIn: true, onBreak: last.type === 'BREAK_START', firstPunch: sorted[0].timestamp };
}

// state: WORKING | AVAILABLE | ON_BREAK | OFF_DUTY | BLOCKED | WAITING_FOR_APPROVAL
function employeeStatus({ attendance, currentCase, lastScanAt, now }) {
  const present = attendance.clockedIn || (lastScanAt && now - lastScanAt < RECENT_ACTIVITY_MS);
  if (!present) return 'OFF_DUTY';
  if (attendance.onBreak) return 'ON_BREAK';
  if (!currentCase) return 'AVAILABLE';
  if (currentCase.status === 'ON_HOLD') return 'BLOCKED';
  if (currentCase.remakeStatus === 'PENDING_REVIEW' || currentCase.status === 'UNDER_REVIEW') return 'WAITING_FOR_APPROVAL';
  return 'WORKING';
}

const pretty = (st) => (st || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const firstName = (full) => (full || '').trim().split(/\s+/)[0] || '';
const caseLabel = (c) => c.caseNumber || null;

// ownerOf: who holds each in-lab case right now (the owner of its current visit, if it was a technician scan).
function buildSnapshot(input) {
  const { now, dayStart, cases, stageRowsByCase, employees, attendanceByUser, remadeCaseIds, config, seq } = input;
  const cfg = config;
  const periodMs = cfg.performance.periodDays * 24 * HOUR;
  const periodStart = new Date(now - periodMs);
  const prevStart = new Date(now - 2 * periodMs);

  // ── where every active case is, and who holds it
  const caseById = new Map(cases.map(c => [c.id, c]));
  const held = []; // in a lab department, held by a technician scan
  const inLab = [];
  for (const c of cases) {
    const dept = BY_STAGE[c.status];
    const runs = stageRuns(stageRowsByCase[c.id] || []);
    const run = runs[runs.length - 1];
    const enteredAt = run && run.stage === c.status ? run.enteredAt : c.updatedAt;
    const owner = run && run.stage === c.status ? run.owner : null;
    const info = { ...c, dept, enteredAt, owner };
    if (!FINISHED_STAGES.includes(c.status)) inLab.push(info);
    if (dept && owner) held.push(info);
  }

  // ── employees
  const nameKey = (n) => n.trim().toLowerCase();
  const heldByName = new Map();
  for (const h of held) {
    const k = nameKey(h.owner.name);
    if (!heldByName.has(k)) heldByName.set(k, []);
    heldByName.get(k).push(h);
  }
  const handoffs = deriveHandoffs(stageRowsByCase);
  const handoffsByName = new Map();
  for (const h of handoffs) {
    const k = nameKey(h.name);
    if (!handoffsByName.has(k)) handoffsByName.set(k, []);
    handoffsByName.get(k).push(h);
  }
  const caseMeta = input.caseMetaById || new Map(); // units for finished cases too

  const w = (short) => cfg.performance.stageWeights[BY_SHORT[short]?.code] ?? 1;
  const unitsOf = (caseId) => Math.max(1, (caseMeta.get(caseId) || caseById.get(caseId) || {}).units || 1);

  const people = [];
  for (const e of employees) {
    if (cfg.hiddenEmployeeIds.includes(e.id)) continue;
    const k = nameKey(e.name);
    const mine = (heldByName.get(k) || []).sort((a, b) => b.enteredAt - a.enteredAt);
    const att = attendanceState(attendanceByUser.get(e.id) || [], now);
    const scansHere = handoffsByName.get(k) || [];
    const lastScanAt = [mine[0]?.enteredAt, ...scansHere.map(s => s.completedAt)].filter(Boolean).sort((a, b) => b - a)[0] || null;
    const current = mine[0] || null;
    const status = employeeStatus({ attendance: att, currentCase: current, lastScanAt, now });
    const working = status === 'WORKING' || status === 'WAITING_FOR_APPROVAL' || status === 'BLOCKED';

    const done = scansHere.filter(h => h.completedAt >= periodStart);
    const doneToday = done.filter(h => h.completedAt >= dayStart);
    const prev = scansHere.filter(h => h.completedAt >= prevStart && h.completedAt < periodStart);
    const weighted = (list) => list.reduce((s, h) => s + unitsOf(h.caseId) * w(h.short), 0);
    const shortCounts = {};
    for (const h of done) shortCounts[h.short] = (shortCounts[h.short] || 0) + 1;
    const primaryShort = Object.entries(shortCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
      || (mine[0]?.dept?.short) || null;
    const deptCode = primaryShort ? BY_SHORT[primaryShort]?.code : null;

    const caseIds = [...new Set(done.map(h => h.caseId))];
    const enough = caseIds.length >= cfg.performance.minSample;
    const reworkRate = enough ? caseIds.filter(id => remadeCaseIds.has(id)).length / caseIds.length : null;
    const handlingTarget = deptCode ? cfg.performance.handlingTargetMinutes[deptCode] : null;
    const timed = done.filter(h => h.handlingMs != null && h.handlingMs > 0 && h.handlingMs < 12 * HOUR);
    const avgHandlingMin = timed.length >= Math.min(3, cfg.performance.minSample) ? Math.round(timed.reduce((s, h) => s + h.handlingMs, 0) / timed.length / MIN) : null;
    const onTimeRate = handlingTarget && timed.length >= cfg.performance.minSample
      ? timed.filter(h => h.handlingMs <= handlingTarget * MIN).length / timed.length : null;
    const target = deptCode ? cfg.performance.dailyTargets[deptCode] : null;
    const days = cfg.performance.periodDays;
    const targetPct = target ? Math.round((weighted(done) / (target * days)) * 100) : null;
    const prevW = weighted(prev);
    const improvementPct = prev.length >= 3 && prevW > 0 ? Math.round(((weighted(done) - prevW) / prevW) * 100) : null;

    people.push({
      id: e.id,
      name: e.name,
      initials: e.name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join(''),
      department: deptCode ? BY_SHORT[primaryShort].label : (e.departments?.[0] ? (LAB_DEPARTMENTS.find(d => d.code === e.departments[0])?.label || null) : null),
      departmentCode: deptCode || e.departments?.[0] || null,
      status,
      currentCase: working && current ? {
        caseNumber: caseLabel(current), workType: current.workType, units: current.units ?? null,
        stage: current.status, stageLabel: current.dept?.label || current.status, since: current.enteredAt,
      } : null,
      assignedCount: mine.length,
      otherAssigned: working ? Math.max(0, mine.length - 1) : mine.length,
      completedToday: new Set(doneToday.map(h => h.caseId)).size,
      completedPeriod: caseIds.length,
      weightedPeriod: Math.round(weighted(done) * 10) / 10,
      metrics: {
        avgHandlingMinutes: avgHandlingMin,
        onTimeRate: onTimeRate == null ? null : Math.round(onTimeRate * 100),
        qualityRate: reworkRate == null ? null : Math.round((1 - reworkRate) * 100),
        targetPct,
        improvementPct,
        sampleCases: caseIds.length,
        minSample: cfg.performance.minSample,
      },
      lastActiveAt: lastScanAt,
    });
  }

  // ── department load
  const visibleCodes = cfg.visibleDepartments.length ? new Set(cfg.visibleDepartments) : null;
  const workedNow = new Set(people.filter(p => p.status === 'WORKING' && p.currentCase).map(p => p.currentCase.caseNumber));
  const onDutyByDept = {};
  for (const p of people) if (p.status !== 'OFF_DUTY' && p.departmentCode) onDutyByDept[p.departmentCode] = (onDutyByDept[p.departmentCode] || 0) + 1;
  const completedTodayByDept = {};
  for (const h of handoffs) if (h.completedAt >= dayStart) { const code = BY_SHORT[h.short].code; completedTodayByDept[code] = (completedTodayByDept[code] || 0) + 1; }

  const departments = LAB_DEPARTMENTS.filter(d => !visibleCodes || visibleCodes.has(d.code)).map(d => {
    const here = inLab.filter(c => c.dept?.code === d.code);
    const active = here.filter(c => workedNow.has(c.caseNumber)).length;
    const oldest = here.reduce((m, c) => (!m || c.enteredAt < m ? c.enteredAt : m), null);
    const overdue = here.filter(c => c.dueDate && c.dueDate < now).length;
    const waiting = here.length - active;
    return {
      code: d.code, label: d.label, stage: d.stage, inDepartment: here.length, active, waiting,
      employeesOnDuty: onDutyByDept[d.code] || 0,
      completedToday: completedTodayByDept[d.code] || 0,
      oldestWaitingMs: oldest ? now - oldest : null,
      delayed: overdue,
      bottleneck: waiting >= cfg.alerts.bottleneckWaiting,
    };
  });

  const countStages = (stages) => inLab.filter(c => stages.includes(c.status)).length;
  const pipeline = {
    intake: countStages(INTAKE_STAGES),
    departments,
    dispatch: countStages(DISPATCH_STAGES),
  };

  // ── critical cases
  const soon = now.getTime() + cfg.alerts.dueSoonHours * HOUR;
  const slim = (c, extra = {}) => ({
    caseNumber: caseLabel(c), workType: c.workType, units: c.units ?? null,
    stage: c.status, stageLabel: c.dept?.label || pretty(c.status),
    owner: c.owner ? firstName(c.owner.name) : null,
    awaitingAssignment: !!(c.dept && !c.owner), // only meaningful for cases sitting in a lab department
    since: c.enteredAt, dueDate: c.dueDate || null, ...extra,
  });
  const labFloor = inLab.filter(c => c.dept || ['PAYMENT_INVOICING', 'READY_TO_DISPATCH', 'ON_HOLD', 'REMAKE', 'CASE_ACCEPTED'].includes(c.status));
  const critical = {
    overdue: labFloor.filter(c => c.dueDate && c.dueDate < now && c.status !== 'OUT_FOR_DELIVERY').map(c => slim(c)),
    dueSoon: labFloor.filter(c => c.dueDate && c.dueDate >= now && c.dueDate.getTime() <= soon).map(c => slim(c)),
    unassigned: inLab.filter(c => c.dept && !c.owner).map(c => slim(c)),
    needsApproval: inLab.filter(c => c.remakeStatus === 'PENDING_REVIEW' || c.status === 'UNDER_REVIEW').map(c => slim(c)),
    redoRemake: inLab.filter(c => c.remake || c.redo || c.isRedo || c.status === 'REMAKE').map(c => slim(c)),
    blocked: inLab.filter(c => c.status === 'ON_HOLD').map(c => slim(c)),
    stale: inLab.filter(c => c.dept && now - c.enteredAt > cfg.alerts.staleStageHours * HOUR).map(c => slim(c)),
  };
  for (const k of Object.keys(critical)) critical[k].sort((a, b) => (a.dueDate ? a.dueDate : Infinity) - (b.dueDate ? b.dueDate : Infinity)).splice(60);

  // ── KPIs (counts of real events today, from the stage log)
  const todayRuns = { received: new Set(), readyToday: new Set(), dispatchedToday: new Set(), deliveredToday: new Set() };
  for (const [caseId, rows] of Object.entries(stageRowsByCase)) {
    for (const r of rows) {
      if (r.scannedAt < dayStart) continue;
      if (r.stageName === 'CASE_ACCEPTED') todayRuns.received.add(caseId);
      if (r.stageName === 'READY_TO_DISPATCH') todayRuns.readyToday.add(caseId);
      if (r.stageName === 'OUT_FOR_DELIVERY') todayRuns.dispatchedToday.add(caseId);
      if (r.stageName === 'DELIVERED') todayRuns.deliveredToday.add(caseId);
    }
  }
  const inProduction = inLab.filter(c => c.dept).length;
  const kpis = {
    inLaboratory: inLab.filter(c => !['PENDING_PICKUP', 'PICKUP_ASSIGNED', 'OUT_FOR_DELIVERY'].includes(c.status)).length,
    receivedToday: todayRuns.received.size,
    completedToday: todayRuns.readyToday.size,
    dispatchedToday: todayRuns.dispatchedToday.size,
    inProduction,
    awaitingProcessing: inLab.filter(c => c.status === 'CASE_ACCEPTED').length,
    awaitingApproval: critical.needsApproval.length,
    redoRemake: critical.redoRemake.length,
    delayed: critical.overdue.length,
    approachingDeadline: critical.dueSoon.length,
    blocked: critical.blocked.length,
    employeesWorking: people.filter(p => p.status === 'WORKING').length,
    employeesOnDuty: people.filter(p => p.status !== 'OFF_DUTY').length,
  };

  // ── performance board: ranked only where a department target exists (never by raw counts)
  const ranked = people.filter(p => p.metrics.targetPct != null).sort((a, b) => b.metrics.targetPct - a.metrics.targetPct);
  const unranked = people.filter(p => p.metrics.targetPct == null && p.completedPeriod > 0).sort((a, b) => b.weightedPeriod - a.weightedPeriod);

  // ── achievements: only things that actually happened
  const best = people.filter(p => p.metrics.qualityRate != null).sort((a, b) => b.metrics.qualityRate - a.metrics.qualityRate || b.completedPeriod - a.completedPeriod)[0] || null;
  const topDept = Object.entries(completedTodayByDept).sort((a, b) => b[1] - a[1])[0] || null;
  const achievements = {
    completedToday: kpis.completedToday,
    topDepartment: topDept ? { code: topDept[0], label: LAB_DEPARTMENTS.find(d => d.code === topDept[0])?.label, completed: topDept[1] } : null,
    bestQuality: best ? { name: best.name, department: best.department, qualityRate: best.metrics.qualityRate, sampleCases: best.metrics.sampleCases } : null,
    milestones: people.flatMap(p => {
      const hit = cfg.achievements.milestones.filter(m => p.completedToday >= m).pop();
      return hit ? [{ name: p.name, department: p.department, milestone: hit, completedToday: p.completedToday }] : [];
    }),
    improvers: people.filter(p => p.metrics.improvementPct != null && p.metrics.improvementPct >= 10)
      .sort((a, b) => b.metrics.improvementPct - a.metrics.improvementPct).slice(0, 5)
      .map(p => ({ name: p.name, department: p.department, improvementPct: p.metrics.improvementPct })),
    recognitions: cfg.achievements.recognitions,
  };

  return {
    seq, generatedAt: now, dayStart,
    kpis, pipeline,
    employees: people.sort((a, b) => a.name.localeCompare(b.name)),
    performance: { periodDays: cfg.performance.periodDays, minSample: cfg.performance.minSample, ranked, unranked },
    critical, achievements,
  };
}

module.exports = { attributeScan, stageRuns, deriveHandoffs, attendanceState, employeeStatus, buildSnapshot, RECENT_ACTIVITY_MS };
