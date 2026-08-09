// Ye-Almaz — HR Analytics Dashboard (Phase 4)
// One aggregation endpoint feeding the HR Analytics view: today's
// headcount snapshot, short trends, and an alerts feed (missing punches,
// expiring certifications, probation ending, contract expiry, pending
// approvals) — all read from data that already exists elsewhere.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { localDayKey } = require('../utils/scanAttribution');
const { resolveShiftForUserDate, computeDaySummary } = require('../services/attendanceDaySummary');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'hr-analytics:summary';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999);
    const soon = new Date(); soon.setDate(soon.getDate() + 30);
    const in14 = new Date(); in14.setDate(in14.getDate() + 14);

    const [
      employees, activeEmployees, pendingLeave, pendingPayrollRun, pendingOvertime,
      pendingExpenses, pendingAdvances, pendingIncentives, expiringCerts, todayEvents,
      todayLeave, assignmentsToday,
    ] = await Promise.all([
      prisma.user.findMany({ where: { isSharedAccount: false }, select: { id: true, name: true, departments: true, isActive: true, createdAt: true } }),
      prisma.user.count({ where: { isSharedAccount: false, isActive: true } }),
      prisma.leaveRecord.count({ where: { status: 'PENDING' } }),
      prisma.payrollRun.findFirst({ orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] }),
      prisma.overtimeRecord.count({ where: { approvalStatus: 'PENDING' } }),
      prisma.expenseClaim.count({ where: { status: { in: ['SUBMITTED', 'MANAGER_APPROVED'] } } }),
      prisma.employeeAdvance.count({ where: { status: 'PENDING' } }),
      prisma.incentiveAward.count({ where: { status: 'PENDING' } }),
      prisma.certification.findMany({ where: { expiryDate: { lte: soon } }, include: { user: { select: { id: true, name: true } } } }),
      prisma.attendanceEvent.findMany({ where: { timestamp: { gte: today, lte: todayEnd } } }),
      prisma.leaveRecord.findMany({ where: { status: 'APPROVED', fromDate: { lte: todayEnd }, toDate: { gte: today } } }),
      prisma.shiftAssignment.findMany({ where: { effectiveFrom: { lte: todayEnd }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, include: { shift: true }, orderBy: { effectiveFrom: 'desc' } }),
    ]);

    // Today's snapshot — reuses computeDaySummary per active employee.
    const eventsByUser = new Map();
    for (const e of todayEvents) { if (!eventsByUser.has(e.userId)) eventsByUser.set(e.userId, []); eventsByUser.get(e.userId).push(e); }
    const assignmentByUser = new Map();
    for (const a of assignmentsToday) if (!assignmentByUser.has(a.userId)) assignmentByUser.set(a.userId, a.shift);
    let presentToday = 0, absentToday = 0, lateToday = 0, onLeaveToday = 0, overtimeToday = 0;
    const missingPunches = [];
    for (const emp of employees.filter(e => e.isActive)) {
      const leave = todayLeave.find(l => l.userId === emp.id) || null;
      const summary = computeDaySummary({
        date: today, events: eventsByUser.get(emp.id) || [], shift: assignmentByUser.get(emp.id) || null,
        holiday: null, leaveRecord: leave, correction: null,
      });
      if (summary.status === 'PRESENT' || summary.status === 'IN_PROGRESS') presentToday++;
      if (summary.status === 'ABSENT') absentToday++;
      if (summary.status === 'ON_LEAVE' || summary.status === 'HALF_DAY_LEAVE') onLeaveToday++;
      if (summary.status === 'MISSING_PUNCH') missingPunches.push({ id: emp.id, name: emp.name });
      if (summary.late) lateToday++;
      if (summary.overtimeHours > 0) overtimeToday++;
    }

    // Probation ending soon / contract (endDate) expiring soon.
    const profiles = await prisma.employeeProfile.findMany({
      where: { OR: [{ probationEndDate: { lte: in14, gte: today } }, { endDate: { lte: soon, gte: today } }] },
      include: { user: { select: { id: true, name: true } } },
    });
    const probationEnding = profiles.filter(p => p.probationEndDate && p.probationEndDate <= in14 && p.probationEndDate >= today);
    const contractExpiring = profiles.filter(p => p.endDate && p.endDate <= soon && p.endDate >= today);

    // 14-day attendance trend (org-wide present count per day).
    const trendFrom = new Date(); trendFrom.setDate(trendFrom.getDate() - 13); trendFrom.setHours(0, 0, 0, 0);
    const trendEvents = await prisma.attendanceEvent.findMany({ where: { timestamp: { gte: trendFrom, lte: todayEnd } } });
    const trendEventsByUser = new Map();
    for (const e of trendEvents) { if (!trendEventsByUser.has(e.userId)) trendEventsByUser.set(e.userId, []); trendEventsByUser.get(e.userId).push(e); }
    const attendanceTrend = [];
    for (let d = new Date(trendFrom); d <= today; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      let present = 0;
      for (const emp of employees.filter(e => e.isActive)) {
        const dayEvents = (trendEventsByUser.get(emp.id) || []).filter(e => e.timestamp >= dayStart && e.timestamp <= dayEnd);
        const shift = assignmentByUser.get(emp.id) || null;
        const summary = computeDaySummary({ date: dayStart, events: dayEvents, shift, holiday: null, leaveRecord: null, correction: null });
        if (summary.status === 'PRESENT' || summary.status === 'IN_PROGRESS') present++;
      }
      attendanceTrend.push({ date: localDayKey(dayStart), present });
    }

    // Department headcount.
    const deptCounts = {};
    for (const e of employees.filter(x => x.isActive)) {
      const depts = e.departments?.length ? e.departments : ['Unassigned'];
      for (const d of depts) deptCounts[d] = (deptCounts[d] || 0) + 1;
    }

    // Payroll trend — last 6 runs.
    const payrollRuns = await prisma.payrollRun.findMany({
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }], take: 6,
      include: { entries: { select: { netPay: true } } },
    });
    const payrollTrend = payrollRuns.reverse().map(r => ({ period: `${r.periodMonth}/${r.periodYear}`, total: Math.round(r.entries.reduce((s, e) => s + e.netPay, 0)) }));

    const result = {
      counts: {
        totalEmployees: employees.length, active: activeEmployees, onLeaveToday, absentToday, lateToday, overtimeToday, presentToday,
        pendingLeave, pendingPayroll: pendingPayrollRun?.status && pendingPayrollRun.status !== 'FINALIZED' ? 1 : 0,
      },
      charts: { attendanceTrend, departmentHeadcount: Object.entries(deptCounts).map(([name, count]) => ({ name, count })), payrollTrend },
      alerts: {
        missingPunches, expiringCertifications: expiringCerts, probationEnding, contractExpiring,
        pendingApprovals: { leave: pendingLeave, overtime: pendingOvertime, expenses: pendingExpenses, advances: pendingAdvances, incentives: pendingIncentives },
      },
    };

    await appCache.set(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    console.error('[hr-analytics]', err);
    res.status(500).json({ error: 'Could not load HR analytics.' });
  }
});

module.exports = router;
