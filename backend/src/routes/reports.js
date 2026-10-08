// Ye-Almaz — HR Reports (Phase 2/4 pulled forward)
// One flexible endpoint (GET /api/reports/:type) rather than a dozen
// near-identical route handlers — each report is a {label, columns,
// rows(prisma, params)} entry in REPORTS, streamed as .xlsx via the
// existing buildWorkbookBuffer/sendXlsx helper (same infrastructure
// payments.js/cases.js already use for exports).
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { localDayKey } = require('../utils/scanAttribution');
const { buildWorkbookBuffer, sendXlsx } = require('../utils/excel');
const { resolveShiftForUserDate, computeDaySummary } = require('../services/attendanceDaySummary');

const router = express.Router();
const prisma = new PrismaClient();
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const money = n => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Shared per-employee/per-day attendance aggregation, batched (one query
// per data source for the whole range, not per day) — backs the
// attendance/late/absence reports.
async function computeAttendanceRollup(from, to, employeeFilter = {}) {
  const employees = await prisma.user.findMany({ where: { isSharedAccount: false, isActive: true, ...employeeFilter }, select: { id: true, name: true } });
  const [events, leaveRecords, holidays, assignments] = await Promise.all([
    prisma.attendanceEvent.findMany({ where: { timestamp: { gte: from, lte: to } } }),
    prisma.leaveRecord.findMany({ where: { status: 'APPROVED', fromDate: { lte: to }, toDate: { gte: from } } }),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
    prisma.shiftAssignment.findMany({ where: { effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] }, include: { shift: true }, orderBy: { effectiveFrom: 'asc' } }),
  ]);
  const eventsByUser = new Map();
  for (const e of events) { if (!eventsByUser.has(e.userId)) eventsByUser.set(e.userId, []); eventsByUser.get(e.userId).push(e); }
  const holidayByDay = new Map(holidays.map(h => [localDayKey(h.date), h]));
  const assignmentsByUser = new Map();
  for (const a of assignments) { if (!assignmentsByUser.has(a.userId)) assignmentsByUser.set(a.userId, []); assignmentsByUser.get(a.userId).push(a); }

  const rollup = [];
  for (const emp of employees) {
    let present = 0, absent = 0, late = 0, lateMinutesTotal = 0, missingPunch = 0, overtimeHours = 0, onLeave = 0;
    const empEvents = eventsByUser.get(emp.id) || [];
    const empAssignments = assignmentsByUser.get(emp.id) || [];
    const empLeave = leaveRecords.filter(l => l.userId === emp.id);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const dayEvents = empEvents.filter(e => e.timestamp >= dayStart && e.timestamp <= dayEnd);
      const shift = [...empAssignments].reverse().find(a => a.effectiveFrom <= dayEnd && (!a.effectiveTo || a.effectiveTo >= dayStart))?.shift || null;
      const leave = empLeave.find(l => l.fromDate <= dayEnd && l.toDate >= dayStart) || null;
      const summary = computeDaySummary({ date: dayStart, events: dayEvents, shift, holiday: holidayByDay.get(localDayKey(dayStart)) || null, leaveRecord: leave, correction: null });
      if (summary.status === 'PRESENT' || summary.status === 'IN_PROGRESS') present++;
      if (summary.status === 'ABSENT') absent++;
      if (summary.status === 'MISSING_PUNCH') missingPunch++;
      if (summary.status === 'ON_LEAVE' || summary.status === 'HALF_DAY_LEAVE') onLeave++;
      if (summary.late) { late++; lateMinutesTotal += summary.lateMinutes; }
      overtimeHours += summary.overtimeHours;
    }
    rollup.push({ user: emp, present, absent, late, lateMinutesTotal, missingPunch, overtimeHours: round2(overtimeHours), onLeave });
  }
  return rollup;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (d) => d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

// Per-employee, per-day attendance detail — one row per working day, not a
// rolled-up count. Shares computeAttendanceRollup's batched fetch (one query
// per data source for the whole range, not per day/employee) so adding this
// didn't cost a second round of N+1 queries.
//
// "Hours Present" is the raw clock-in-to-clock-out span minus only explicitly
// punched breaks (BREAK_START/BREAK_END) — what the gate actually saw.
// "Regular Hours"/"Overtime Hours" are the POLICY figures HR actually pays
// against: capped at the shift's expected hours (end − start − the shift's
// configured breakMinutes), so the company-wide rule — a 9-hour shift span
// with a 1-hour lunch provided at the office, netting 8 paid hours — is
// applied whether or not someone separately punches a lunch break. Getting
// that policy right is a Shift row's startTime/endTime/breakMinutes setting
// (HR > Shifts), not something this report can fix on its own; see this
// report's own 'note' column below if a shift's expected hours look wrong.
async function computeAttendanceDetailRows(from, to, employeeFilter = {}) {
  const employees = await prisma.user.findMany({ where: { isSharedAccount: false, isActive: true, ...employeeFilter }, select: { id: true, name: true } });
  const [events, leaveRecords, holidays, assignments] = await Promise.all([
    prisma.attendanceEvent.findMany({ where: { timestamp: { gte: from, lte: to } } }),
    prisma.leaveRecord.findMany({ where: { status: 'APPROVED', fromDate: { lte: to }, toDate: { gte: from } } }),
    prisma.holiday.findMany({ where: { date: { gte: from, lte: to } } }),
    prisma.shiftAssignment.findMany({ where: { effectiveFrom: { lte: to }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] }, include: { shift: true }, orderBy: { effectiveFrom: 'asc' } }),
  ]);
  const eventsByUser = new Map();
  for (const e of events) { if (!eventsByUser.has(e.userId)) eventsByUser.set(e.userId, []); eventsByUser.get(e.userId).push(e); }
  const holidayByDay = new Map(holidays.map(h => [localDayKey(h.date), h]));
  const assignmentsByUser = new Map();
  for (const a of assignments) { if (!assignmentsByUser.has(a.userId)) assignmentsByUser.set(a.userId, []); assignmentsByUser.get(a.userId).push(a); }

  const rows = [];
  for (const emp of employees) {
    const empEvents = eventsByUser.get(emp.id) || [];
    const empAssignments = assignmentsByUser.get(emp.id) || [];
    const empLeave = leaveRecords.filter(l => l.userId === emp.id);

    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const dayEvents = empEvents.filter(e => e.timestamp >= dayStart && e.timestamp <= dayEnd);
      const shift = [...empAssignments].reverse().find(a => a.effectiveFrom <= dayEnd && (!a.effectiveTo || a.effectiveTo >= dayStart))?.shift || null;
      const leave = empLeave.find(l => l.fromDate <= dayEnd && l.toDate >= dayStart) || null;
      const summary = computeDaySummary({ date: dayStart, events: dayEvents, shift, holiday: holidayByDay.get(localDayKey(dayStart)) || null, leaveRecord: leave, correction: null });

      // Skip days with nothing to report for an unassigned/non-working day —
      // keeps the sheet to actual working days, leave, holidays and absences
      // rather than padding it with blank weekends for every employee.
      if (summary.status === 'OFF') continue;

      // Mirrors computeDaySummary's own expectedMinutes exactly (see
      // attendanceDaySummary.js): a shift's configured span IS the expected
      // hours, lunch included in it, not subtracted — a 9-hour shift
      // (e.g. 09:00-18:00) shows 9 here.
      const expectedHours = shift
        ? round2(Math.max(0, (shift.overtimeThresholdMinutes ??
            (new Date(`1970-01-01T${shift.endTime}:00`) - new Date(`1970-01-01T${shift.startTime}:00`)) / 60000)) / 60)
        : null;

      rows.push({
        employee: emp.name,
        date: localDayKey(dayStart),
        day: WEEKDAY_SHORT[dayStart.getDay()],
        status: summary.status,
        shift: shift?.name || '—',
        clockIn: hhmm(summary.clockIn),
        clockOut: hhmm(summary.clockOut),
        breakMinutes: summary.breakMinutes,
        hoursPresent: summary.workingHours,
        expectedHours,
        regularHours: summary.regularHours,
        overtimeHours: summary.overtimeHours,
        late: summary.late ? 'Yes' : 'No',
        lateMinutes: summary.lateMinutes,
        earlyDepartureMinutes: summary.earlyDepartureMinutes,
        corrected: summary.hasCorrection ? 'Yes' : 'No',
        source: [summary.clockInSource, summary.clockOutSource].filter(Boolean).join(' / ') || '—',
      });
    }
  }
  // Employee, then chronological — reads like a per-person timesheet.
  rows.sort((a, b) => a.employee.localeCompare(b.employee) || a.date.localeCompare(b.date));
  return rows;
}

const REPORTS = {
  'attendance-detail': {
    label: 'Attendance Detail (per day)',
    columns: [
      { header: 'Employee', value: r => r.employee },
      { header: 'Date', value: r => r.date },
      { header: 'Day', value: r => r.day },
      { header: 'Status', value: r => r.status },
      { header: 'Shift', value: r => r.shift },
      { header: 'Clock In', value: r => r.clockIn },
      { header: 'Clock Out', value: r => r.clockOut },
      { header: 'Break (min)', value: r => r.breakMinutes },
      { header: 'Hours Present', value: r => r.hoursPresent },
      { header: 'Expected Hours', value: r => r.expectedHours ?? '—' },
      { header: 'Regular Hours', value: r => r.regularHours },
      { header: 'Overtime Hours', value: r => r.overtimeHours },
      { header: 'Late', value: r => r.late },
      { header: 'Late (min)', value: r => r.lateMinutes },
      { header: 'Early Departure (min)', value: r => r.earlyDepartureMinutes },
      { header: 'Corrected', value: r => r.corrected },
      { header: 'Source', value: r => r.source },
    ],
    rows: async ({ from, to }) => computeAttendanceDetailRows(from, to),
  },
  attendance: {
    label: 'Attendance Summary',
    columns: [
      { header: 'Employee', value: r => r.user.name },
      { header: 'Present Days', value: r => r.present },
      { header: 'Absent Days', value: r => r.absent },
      { header: 'On Leave Days', value: r => r.onLeave },
      { header: 'Late Days', value: r => r.late },
      { header: 'Missing Punch Days', value: r => r.missingPunch },
      { header: 'Overtime Hours', value: r => r.overtimeHours },
    ],
    rows: async ({ from, to }) => computeAttendanceRollup(from, to),
  },
  late: {
    label: 'Late Report',
    columns: [
      { header: 'Employee', value: r => r.user.name },
      { header: 'Late Days', value: r => r.late },
      { header: 'Total Late Minutes', value: r => r.lateMinutesTotal },
    ],
    rows: async ({ from, to }) => (await computeAttendanceRollup(from, to)).filter(r => r.late > 0),
  },
  absence: {
    label: 'Absence Report',
    columns: [
      { header: 'Employee', value: r => r.user.name },
      { header: 'Absent Days', value: r => r.absent },
      { header: 'Missing Punch Days', value: r => r.missingPunch },
    ],
    rows: async ({ from, to }) => (await computeAttendanceRollup(from, to)).filter(r => r.absent > 0 || r.missingPunch > 0),
  },
  overtime: {
    label: 'Overtime Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Date', value: r => localDayKey(r.date) },
      { header: 'Regular Hours', value: r => r.regularHours }, { header: 'Overtime Hours', value: r => r.overtimeHours },
      { header: 'Source', value: r => r.source }, { header: 'Approval Status', value: r => r.approvalStatus },
      { header: 'Payroll Status', value: r => r.payrollStatus },
    ],
    rows: async ({ from, to }) => prisma.overtimeRecord.findMany({ where: { date: { gte: from, lte: to } }, include: { user: { select: { name: true } } }, orderBy: { date: 'asc' } }),
  },
  timesheet: {
    label: 'Timesheet Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Date', value: r => localDayKey(r.date) },
      { header: 'Category', value: r => r.category }, { header: 'Productive', value: r => r.productive ? 'Yes' : 'No' },
      { header: 'Notes', value: r => r.notes || '' },
    ],
    rows: async ({ from, to }) => prisma.timesheetEntry.findMany({ where: { date: { gte: from, lte: to } }, include: { user: { select: { name: true } } }, orderBy: { date: 'asc' } }),
  },
  leave: {
    label: 'Leave Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Type', value: r => r.leaveType?.name || '' },
      { header: 'From', value: r => localDayKey(r.fromDate) }, { header: 'To', value: r => localDayKey(r.toDate) },
      { header: 'Portion', value: r => r.dayPortion }, { header: 'Status', value: r => r.status }, { header: 'Reason', value: r => r.reason || '' },
    ],
    rows: async ({ from, to }) => prisma.leaveRecord.findMany({ where: { fromDate: { lte: to }, toDate: { gte: from } }, include: { user: { select: { name: true } }, leaveType: true }, orderBy: { fromDate: 'asc' } }),
  },
  payroll: {
    label: 'Payroll Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Period', value: r => `${r.run.periodMonth}/${r.run.periodYear}` },
      { header: 'Base Salary', value: r => money(r.baseSalarySnapshot) }, { header: 'Adjustments', value: r => money(r.adjustments.reduce((s, a) => s + a.amount, 0)) },
      { header: 'Net Pay', value: r => money(r.netPay) }, { header: 'Run Status', value: r => r.run.status },
    ],
    rows: async ({ from, to }) => prisma.payrollEntry.findMany({
      where: { run: { createdAt: { gte: from, lte: to } } },
      include: { user: { select: { name: true } }, run: true, adjustments: true },
      orderBy: { createdAt: 'asc' },
    }),
  },
  salary: {
    label: 'Salary Report',
    columns: [
      { header: 'Employee', value: r => r.name }, { header: 'Position', value: r => r.employeeProfile?.position || '' },
      { header: 'Base Salary', value: r => money(r.employeeProfile?.baseSalary) }, { header: 'Structure', value: r => r._structure || '—' },
    ],
    rows: async () => {
      const employees = await prisma.user.findMany({ where: { isSharedAccount: false, isActive: true }, include: { employeeProfile: true } });
      const assignments = await prisma.employeeSalaryAssignment.findMany({ where: { effectiveTo: null }, include: { structure: true } });
      const structureByUser = new Map(assignments.map(a => [a.userId, a.structure.name]));
      return employees.map(e => ({ ...e, _structure: structureByUser.get(e.id) }));
    },
  },
  incentives: {
    label: 'Incentives Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Rule', value: r => r.rule?.name },
      { header: 'Period', value: r => `${r.periodMonth}/${r.periodYear}` }, { header: 'Actual', value: r => r.actualValue },
      { header: 'Target', value: r => r.targetValue }, { header: 'Amount', value: r => money(r.awardedAmount) }, { header: 'Status', value: r => r.status },
    ],
    rows: async ({ from, to }) => prisma.incentiveAward.findMany({
      where: { createdAt: { gte: from, lte: to } }, include: { user: { select: { name: true } }, rule: true }, orderBy: { createdAt: 'asc' },
    }),
  },
  expenses: {
    label: 'Expenses Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Category', value: r => r.category },
      { header: 'Date', value: r => localDayKey(r.date) }, { header: 'Amount', value: r => money(r.amount) }, { header: 'Status', value: r => r.status },
    ],
    rows: async ({ from, to }) => prisma.expenseClaim.findMany({ where: { date: { gte: from, lte: to } }, include: { user: { select: { name: true } } }, orderBy: { date: 'asc' } }),
  },
  advances: {
    label: 'Advances & Loans Report',
    columns: [
      { header: 'Employee', value: r => r.user?.name }, { header: 'Type', value: r => r.type },
      { header: 'Amount', value: r => money(r.amount) }, { header: 'Installment', value: r => money(r.installmentAmount) },
      { header: 'Outstanding', value: r => money(r.outstandingBalance) }, { header: 'Status', value: r => r.status },
    ],
    rows: async ({ from, to }) => prisma.employeeAdvance.findMany({ where: { requestedAt: { gte: from, lte: to } }, include: { user: { select: { name: true } } }, orderBy: { requestedAt: 'asc' } }),
  },
  'employee-cost': {
    label: 'Employee Cost Report',
    columns: [
      { header: 'Employee', value: r => r.name }, { header: 'Base Salary (total across runs)', value: r => money(r.base) },
      { header: 'Allowances', value: r => money(r.allowances) }, { header: 'Overtime', value: r => money(r.overtime) },
      { header: 'Incentives', value: r => money(r.incentives) }, { header: 'Deductions', value: r => money(r.deductions) },
      { header: 'Total Net Cost', value: r => money(r.net) },
    ],
    rows: async ({ from, to }) => {
      const entries = await prisma.payrollEntry.findMany({
        where: { run: { createdAt: { gte: from, lte: to } } },
        include: { user: { select: { id: true, name: true } }, adjustments: true },
      });
      const byUser = new Map();
      for (const e of entries) {
        if (!byUser.has(e.userId)) byUser.set(e.userId, { name: e.user.name, base: 0, allowances: 0, overtime: 0, incentives: 0, deductions: 0, net: 0 });
        const agg = byUser.get(e.userId);
        agg.base += e.baseSalarySnapshot;
        agg.net += e.netPay;
        for (const a of e.adjustments) {
          if (a.type === 'ALLOWANCE') agg.allowances += a.amount;
          else if (a.type === 'OVERTIME') agg.overtime += a.amount;
          else if (a.type === 'INCENTIVE') agg.incentives += a.amount;
          else if (a.amount < 0) agg.deductions += a.amount;
        }
      }
      return [...byUser.values()];
    },
  },
};

router.get('/types', protect, restrict('HR_MANAGER', 'ADMIN'), (req, res) => {
  res.json(Object.entries(REPORTS).map(([key, r]) => ({ key, label: r.label })));
});

router.get('/:type', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const report = REPORTS[req.params.type];
    if (!report) return res.status(404).json({ error: 'Unknown report type.' });
    const { from, to, format: fmt } = req.query;
    const fromDate = from ? startOfDay(from) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = to ? endOfDay(to) : new Date();

    const rows = await report.rows({ from: fromDate, to: toDate, userId: req.query.userId });

    if (fmt === 'json') return res.json(rows);
    const buffer = buildWorkbookBuffer(rows, report.columns, report.label);
    sendXlsx(res, buffer, `${req.params.type}-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error('[reports]', err);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

module.exports = router;
