// Ye-Almaz — Performance (Phase 3)
// "Do not reduce performance to one arbitrary score — show actual
// metrics." GET /:userId aggregates from data that already exists
// elsewhere (CaseStage scans, TimesheetEntry, Attendance, Goals,
// IncentiveAward) rather than duplicating any of it into a new tracking
// system. PerformanceReview stores only the qualitative manager note.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { SCAN_PATTERN } = require('../utils/scanAttribution');
const { resolveShiftForUserDate, computeDaySummary } = require('../services/attendanceDaySummary');

const router = express.Router();
const prisma = new PrismaClient();
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

router.get('/:userId', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? startOfDay(from) : new Date(new Date().getFullYear(), 0, 1);
    const toDate = to ? endOfDay(to) : new Date();

    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, name: true, role: true } });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });

    // Cases handled — only meaningful for LAB_TECH (scan-attributed work).
    let casesHandled = null, scans = null;
    if (user.role === 'LAB_TECH') {
      const stages = await prisma.caseStage.findMany({
        where: { scannedAt: { gte: fromDate, lte: toDate }, scannedBy: { startsWith: `${user.name} (` } },
        select: { caseId: true, scannedBy: true },
      });
      const matched = stages.filter(s => SCAN_PATTERN.test(s.scannedBy || ''));
      scans = matched.length;
      casesHandled = new Set(matched.map(s => s.caseId)).size;
    }

    // Productive hours / utilization — from Timesheets.
    const timesheetEntries = await prisma.timesheetEntry.findMany({ where: { userId: user.id, date: { gte: fromDate, lte: toDate } } });
    let totalHours = 0, productiveHours = 0;
    for (const e of timesheetEntries) {
      const hrs = (new Date(e.endTime) - new Date(e.startTime)) / 3600000;
      totalHours += hrs;
      if (e.productive) productiveHours += hrs;
    }
    const utilizationPct = totalHours > 0 ? round2((productiveHours / totalHours) * 100) : null;

    // Attendance % — reuses the same day-by-day computation as everywhere else.
    const [events, leaveRecords, assignments] = await Promise.all([
      prisma.attendanceEvent.findMany({ where: { userId: user.id, timestamp: { gte: fromDate, lte: toDate } } }),
      prisma.leaveRecord.findMany({ where: { userId: user.id, status: 'APPROVED', fromDate: { lte: toDate }, toDate: { gte: fromDate } } }),
      prisma.shiftAssignment.findMany({ where: { userId: user.id, effectiveFrom: { lte: toDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }] }, include: { shift: true }, orderBy: { effectiveFrom: 'asc' } }),
    ]);
    let presentDays = 0, workingDays = 0;
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const dayEvents = events.filter(e => e.timestamp >= dayStart && e.timestamp <= dayEnd);
      const shift = [...assignments].reverse().find(a => a.effectiveFrom <= dayEnd && (!a.effectiveTo || a.effectiveTo >= dayStart))?.shift || null;
      const leave = leaveRecords.find(l => l.fromDate <= dayEnd && l.toDate >= dayStart) || null;
      const summary = computeDaySummary({ date: dayStart, events: dayEvents, shift, holiday: null, leaveRecord: leave, correction: null });
      if (['OFF', 'HOLIDAY'].includes(summary.status)) continue;
      workingDays++;
      if (summary.status === 'PRESENT' || summary.status === 'IN_PROGRESS') presentDays++;
    }
    const attendancePct = workingDays > 0 ? round2((presentDays / workingDays) * 100) : null;

    const [goals, incentiveAwards, reviews] = await Promise.all([
      prisma.goal.findMany({ where: { userId: user.id }, orderBy: { dueDate: 'asc' } }),
      prisma.incentiveAward.findMany({ where: { userId: user.id }, include: { rule: true }, orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }], take: 12 }),
      prisma.performanceReview.findMany({ where: { userId: user.id }, include: { reviewer: { select: { id: true, name: true } } }, orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] }),
    ]);

    res.json({
      user, range: { from: fromDate, to: toDate },
      metrics: { casesHandled, scans, productiveHours: round2(productiveHours), totalHours: round2(totalHours), utilizationPct, attendancePct, presentDays, workingDays },
      goals, incentiveAwards, reviews,
    });
  } catch (err) {
    console.error('[performance]', err);
    res.status(500).json({ error: 'Could not load performance data.' });
  }
});

router.post('/:userId/reviews', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { periodMonth, periodYear, rating, notes } = req.body || {};
    if (!periodMonth || !periodYear) return res.status(400).json({ error: 'periodMonth and periodYear are required.' });
    const review = await prisma.performanceReview.upsert({
      where: { userId_periodMonth_periodYear: { userId: req.params.userId, periodMonth, periodYear } },
      create: { userId: req.params.userId, reviewerId: req.user.id, periodMonth, periodYear, rating: rating || null, notes: notes?.trim() || null },
      update: { reviewerId: req.user.id, rating: rating || null, notes: notes?.trim() || null },
    });
    res.status(201).json(review);
  } catch (err) {
    console.error('[performance review]', err);
    res.status(500).json({ error: 'Could not save performance review.' });
  }
});

module.exports = router;
