// Ye-Almaz — Shift Management
// A Shift is a reusable schedule template (start/end time, break, grace/
// late/early-departure/overtime thresholds, working days). Assigning a
// shift to an employee NEVER overwrites a prior assignment — POST /assign
// closes out the currently-open row (effectiveTo) and inserts a new one,
// so "who was on what shift when" is always reconstructable. Shifts
// themselves are never deleted (isActive soft-disable only), since
// ShiftAssignment history references them by id.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateShiftBody(body, { partial = false } = {}) {
  const errors = [];
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) errors.push('name is required.');
  }
  if (!partial || body.startTime !== undefined) {
    if (!TIME_RE.test(body.startTime || '')) errors.push('startTime must be "HH:mm".');
  }
  if (!partial || body.endTime !== undefined) {
    if (!TIME_RE.test(body.endTime || '')) errors.push('endTime must be "HH:mm".');
  }
  if (body.workingDays !== undefined) {
    const days = Array.isArray(body.workingDays) ? body.workingDays : [];
    if (days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('workingDays must be integers 0-6.');
  }
  return errors;
}

// ── GET /api/shifts ──────────────────────────────────────
router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'shifts:all';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);
    const shifts = await prisma.shift.findMany({ orderBy: { name: 'asc' } });
    await appCache.set(cacheKey, shifts);
    res.json(shifts);
  } catch (err) {
    console.error('[shifts]', err);
    res.status(500).json({ error: 'Could not load shifts.' });
  }
});

// ── POST /api/shifts ─────────────────────────────────────
router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const errors = validateShiftBody(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const {
      name, startTime, endTime, breakMinutes, gracePeriodMinutes,
      lateThresholdMinutes, earlyDepartureThresholdMinutes, overtimeThresholdMinutes,
      workingDays, holidayHandling,
    } = req.body;

    const shift = await prisma.shift.create({
      data: {
        name: name.trim(), startTime, endTime,
        breakMinutes: breakMinutes ?? 0,
        gracePeriodMinutes: gracePeriodMinutes ?? 0,
        lateThresholdMinutes: lateThresholdMinutes ?? 0,
        earlyDepartureThresholdMinutes: earlyDepartureThresholdMinutes ?? 0,
        overtimeThresholdMinutes: overtimeThresholdMinutes ?? null,
        workingDays: workingDays?.length ? workingDays : [1, 2, 3, 4, 5],
        holidayHandling: holidayHandling || 'NO_WORK',
      },
    });
    await invalidate('shifts:all');
    res.status(201).json(shift);
  } catch (err) {
    console.error('[shifts create]', err);
    res.status(500).json({ error: 'Could not create shift.' });
  }
});

// ── PATCH /api/shifts/:id ────────────────────────────────
// Shifts are never deleted — only soft-disabled (isActive: false) — since
// ShiftAssignment rows reference them historically and must stay resolvable.
router.patch('/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const errors = validateShiftBody(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const {
      name, startTime, endTime, breakMinutes, gracePeriodMinutes,
      lateThresholdMinutes, earlyDepartureThresholdMinutes, overtimeThresholdMinutes,
      workingDays, holidayHandling, isActive,
    } = req.body;

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;
    if (breakMinutes !== undefined) data.breakMinutes = breakMinutes;
    if (gracePeriodMinutes !== undefined) data.gracePeriodMinutes = gracePeriodMinutes;
    if (lateThresholdMinutes !== undefined) data.lateThresholdMinutes = lateThresholdMinutes;
    if (earlyDepartureThresholdMinutes !== undefined) data.earlyDepartureThresholdMinutes = earlyDepartureThresholdMinutes;
    if (overtimeThresholdMinutes !== undefined) data.overtimeThresholdMinutes = overtimeThresholdMinutes;
    if (workingDays !== undefined) data.workingDays = workingDays;
    if (holidayHandling !== undefined) data.holidayHandling = holidayHandling;
    if (isActive !== undefined) data.isActive = isActive;

    const shift = await prisma.shift.update({ where: { id: req.params.id }, data });
    await invalidate('shifts:all');
    res.json(shift);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Shift not found.' });
    console.error('[shifts update]', err);
    res.status(500).json({ error: 'Could not update shift.' });
  }
});

// ── POST /api/shifts/assign ──────────────────────────────
// Closes out the employee's currently-open assignment (effectiveTo =
// effectiveFrom of the new one, exclusive-end so there's no overlap/gap)
// and inserts a new row — never updates an old assignment's shiftId.
router.post('/assign', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, shiftId, effectiveFrom, note } = req.body || {};
    if (!userId || !shiftId) return res.status(400).json({ error: 'userId and shiftId are required.' });

    const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
    if (!shift) return res.status(404).json({ error: 'Shift not found.' });

    const from = effectiveFrom ? new Date(effectiveFrom) : new Date();
    if (isNaN(from.getTime())) return res.status(400).json({ error: 'Invalid effectiveFrom.' });

    const assignment = await prisma.$transaction(async (tx) => {
      const open = await tx.shiftAssignment.findFirst({ where: { userId, effectiveTo: null } });
      if (open) await tx.shiftAssignment.update({ where: { id: open.id }, data: { effectiveTo: from } });
      return tx.shiftAssignment.create({
        data: { userId, shiftId, effectiveFrom: from, note: note?.trim() || null, createdById: req.user.id },
        include: { shift: true },
      });
    });

    await invalidate('attendance:*');
    res.status(201).json(assignment);
  } catch (err) {
    console.error('[shifts assign]', err);
    res.status(500).json({ error: 'Could not assign shift.' });
  }
});

// ── GET /api/shifts/assignments?userId= ──────────────────
router.get('/assignments', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.query;
    const where = userId ? { userId } : {};
    const assignments = await prisma.shiftAssignment.findMany({
      where,
      include: { shift: true, user: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    res.json(assignments);
  } catch (err) {
    console.error('[shifts assignments]', err);
    res.status(500).json({ error: 'Could not load shift assignments.' });
  }
});

module.exports = router;
