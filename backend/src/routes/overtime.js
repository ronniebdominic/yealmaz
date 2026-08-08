// Ye-Almaz — Overtime
// Phase 1 tracks hours + an approval workflow only — payrollStatus stays
// UNPAID with no automatic PayrollAdjustment creation until Phase 2 wires
// in Salary Structures (an hourly/overtime rate doesn't exist yet).
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { resolveShiftForUserDate, computeDaySummary } = require('../services/attendanceDaySummary');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to, approvalStatus } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (from) where.date = { ...(where.date || {}), gte: startOfDay(from) };
    if (to) where.date = { ...(where.date || {}), lte: endOfDay(to) };

    const records = await prisma.overtimeRecord.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        shift: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });
    res.json(records);
  } catch (err) {
    console.error('[overtime]', err);
    res.status(500).json({ error: 'Could not load overtime records.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, date, shiftId, regularHours, overtimeHours, reason } = req.body || {};
    if (!userId || !date || overtimeHours == null) return res.status(400).json({ error: 'userId, date and overtimeHours are required.' });
    const day = new Date(`${date}T00:00:00`);
    if (isNaN(day.getTime())) return res.status(400).json({ error: 'Invalid date.' });

    const record = await prisma.overtimeRecord.upsert({
      where: { userId_date: { userId, date: day } },
      create: {
        userId, date: day, shiftId: shiftId || null,
        regularHours: parseFloat(regularHours) || 0, overtimeHours: parseFloat(overtimeHours),
        reason: reason?.trim() || null, source: 'MANUAL',
      },
      update: {
        shiftId: shiftId || null,
        regularHours: parseFloat(regularHours) || 0, overtimeHours: parseFloat(overtimeHours),
        reason: reason?.trim() || null,
      },
    });
    await invalidate('overtime:*');
    res.status(201).json(record);
  } catch (err) {
    console.error('[overtime create]', err);
    res.status(500).json({ error: 'Could not create overtime record.' });
  }
});

// ── POST /api/overtime/detect ────────────────────────────
// Runs computeDaySummary for one date (one user, or the whole active
// roster if userId is omitted) and upserts an OvertimeRecord for every
// result with overtimeHours > 0. Idempotent via the @@unique([userId,
// date]) constraint — safe to re-run for the same date after new punches
// come in.
router.post('/detect', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { date, userId } = req.body || {};
    if (!date) return res.status(400).json({ error: 'date is required.' });
    const day = new Date(`${date}T00:00:00`);
    if (isNaN(day.getTime())) return res.status(400).json({ error: 'Invalid date.' });
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

    const employees = userId
      ? await prisma.user.findMany({ where: { id: userId }, select: { id: true, name: true } })
      : await prisma.user.findMany({ where: { isSharedAccount: false, isActive: true }, select: { id: true, name: true } });

    const [events, leaveRecords, holiday] = await Promise.all([
      prisma.attendanceEvent.findMany({ where: { timestamp: { gte: day, lte: dayEnd }, ...(userId ? { userId } : {}) } }),
      prisma.leaveRecord.findMany({ where: { status: 'APPROVED', fromDate: { lte: dayEnd }, toDate: { gte: day }, ...(userId ? { userId } : {}) } }),
      prisma.holiday.findUnique({ where: { date: day } }).catch(() => null),
    ]);
    const eventsByUser = new Map();
    for (const e of events) { if (!eventsByUser.has(e.userId)) eventsByUser.set(e.userId, []); eventsByUser.get(e.userId).push(e); }
    const leaveByUser = new Map(leaveRecords.map(l => [l.userId, l]));

    const detected = [];
    for (const emp of employees) {
      const shift = await resolveShiftForUserDate(prisma, emp.id, day);
      const summary = computeDaySummary({
        date: day, events: eventsByUser.get(emp.id) || [], shift, holiday,
        leaveRecord: leaveByUser.get(emp.id) || null, correction: null,
      });
      if (summary.overtimeHours > 0) {
        const record = await prisma.overtimeRecord.upsert({
          where: { userId_date: { userId: emp.id, date: day } },
          create: {
            userId: emp.id, date: day, shiftId: shift?.id || null,
            regularHours: summary.regularHours, overtimeHours: summary.overtimeHours,
            source: 'AUTO_DETECTED',
          },
          // Only refresh the hours on an existing PENDING auto-detected row —
          // never silently overwrite something HR already approved/rejected.
          update: { regularHours: summary.regularHours, overtimeHours: summary.overtimeHours },
        });
        if (record.approvalStatus === 'PENDING' || record.source === 'AUTO_DETECTED') detected.push(record);
      }
    }

    await invalidate('overtime:*');
    res.json({ detected: detected.length, records: detected });
  } catch (err) {
    console.error('[overtime detect]', err);
    res.status(500).json({ error: 'Could not run overtime detection.' });
  }
});

router.patch('/:id/approve', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const record = await prisma.overtimeRecord.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() },
    });
    await invalidate('overtime:*');
    res.json(record);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Overtime record not found.' });
    console.error('[overtime approve]', err);
    res.status(500).json({ error: 'Could not approve overtime record.' });
  }
});

router.patch('/:id/reject', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const record = await prisma.overtimeRecord.update({
      where: { id: req.params.id },
      data: { approvalStatus: 'REJECTED', approvedById: req.user.id, approvedAt: new Date() },
    });
    await invalidate('overtime:*');
    res.json(record);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Overtime record not found.' });
    console.error('[overtime reject]', err);
    res.status(500).json({ error: 'Could not reject overtime record.' });
  }
});

module.exports = router;
