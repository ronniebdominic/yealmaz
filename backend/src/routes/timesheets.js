// Ye-Almaz — Timesheets
// Manual time-activity entries, HR-entered-authoritatively (same posture as
// LeaveRecord — no self-service submission flow in Phase 1). For LAB_TECH
// users, GET /lab-tech-enrichment supplements this (read-only, never
// merged in) with their existing CaseStage scan history — no invented
// duration/session concept, just discrete timestamped activity markers.
// scan.js/CaseStage are never written to from here.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { DEPT_SHORT_LABELS, SCAN_PATTERN } = require('../utils/scanAttribution');

const router = express.Router();
const prisma = new PrismaClient();

// Mirrors scan.js's DEPARTMENTS list conceptually — hardcoded here rather
// than a configurable table for Phase 1 (HR Settings-driven categories are
// a later-phase item).
const PRODUCTIVE = ['CAD', 'CAM', 'Milling', 'Printing', 'Finishing', 'QC', 'Packing', 'Production'];
const NON_PRODUCTIVE = ['Administration', 'Meeting', 'Training', 'Cleaning', 'Maintenance', 'Waiting', 'Machine Downtime', 'Material Shortage', 'Other'];

router.get('/categories', protect, restrict('HR_MANAGER', 'ADMIN'), (req, res) => {
  res.json({ productive: PRODUCTIVE, nonProductive: NON_PRODUCTIVE });
});

// ── GET /api/timesheets ──────────────────────────────────
router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to, category, productive } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (category) where.category = category;
    if (productive !== undefined) where.productive = productive === 'true';
    if (from) where.date = { ...(where.date || {}), gte: startOfDay(from) };
    if (to) where.date = { ...(where.date || {}), lte: endOfDay(to) };

    const entries = await prisma.timesheetEntry.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, recordedBy: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(entries);
  } catch (err) {
    console.error('[timesheets]', err);
    res.status(500).json({ error: 'Could not load timesheet entries.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, date, startTime, endTime, category, notes } = req.body || {};
    if (!userId || !date || !startTime || !endTime || !category) {
      return res.status(400).json({ error: 'userId, date, startTime, endTime and category are required.' });
    }
    const start = new Date(startTime), end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'startTime/endTime must be valid, with endTime after startTime.' });
    }
    const productive = PRODUCTIVE.includes(category);
    if (!productive && !NON_PRODUCTIVE.includes(category)) {
      return res.status(400).json({ error: `Unknown category "${category}".` });
    }

    const entry = await prisma.timesheetEntry.create({
      data: {
        userId, date: new Date(`${date}T00:00:00`), startTime: start, endTime: end,
        category, productive, notes: notes?.trim() || null, recordedById: req.user.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    await invalidate('timesheets:*');
    res.status(201).json(entry);
  } catch (err) {
    console.error('[timesheets create]', err);
    res.status(500).json({ error: 'Could not create timesheet entry.' });
  }
});

// Ordinary update (not append-only) — timesheets are correctable HR data
// entry, not a raw device ledger like AttendanceEvent, so no audit-trail
// mechanism is needed here.
router.patch('/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { date, startTime, endTime, category, notes, status } = req.body || {};
    const data = {};
    if (date !== undefined) data.date = new Date(`${date}T00:00:00`);
    if (startTime !== undefined) data.startTime = new Date(startTime);
    if (endTime !== undefined) data.endTime = new Date(endTime);
    if (category !== undefined) {
      data.category = category;
      data.productive = PRODUCTIVE.includes(category);
    }
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (status !== undefined) data.status = status;

    const entry = await prisma.timesheetEntry.update({ where: { id: req.params.id }, data });
    await invalidate('timesheets:*');
    res.json(entry);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Timesheet entry not found.' });
    console.error('[timesheets update]', err);
    res.status(500).json({ error: 'Could not update timesheet entry.' });
  }
});

// ── GET /api/timesheets/lab-tech-enrichment ──────────────
// Read-only view of a LAB_TECH's CaseStage scan activity, decorated with
// department labels — mirrors lab.js's GET /my-performance matching logic
// exactly (scannedBy startsWith "<name> ("). Discrete timestamped markers
// only; no duration is invented since scans have no start/end pairing.
router.get('/lab-tech-enrichment', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });
    if (user.role !== 'LAB_TECH') return res.json({ scans: [] }); // enrichment only applies to lab techs

    const where = { scannedBy: { startsWith: `${user.name} (` } };
    if (from) where.scannedAt = { ...(where.scannedAt || {}), gte: startOfDay(from) };
    if (to) where.scannedAt = { ...(where.scannedAt || {}), lte: endOfDay(to) };

    const stages = await prisma.caseStage.findMany({
      where,
      select: { id: true, caseId: true, scannedAt: true, scannedBy: true },
      orderBy: { scannedAt: 'desc' },
      take: 500,
    });

    const scans = stages.map(s => {
      const m = SCAN_PATTERN.exec(s.scannedBy || '');
      const code = m?.[2];
      return { id: s.id, caseId: s.caseId, scannedAt: s.scannedAt, department: code ? (DEPT_SHORT_LABELS[code] || code) : null };
    });

    res.json({ scans });
  } catch (err) {
    console.error('[timesheets lab-tech-enrichment]', err);
    res.status(500).json({ error: 'Could not load scan activity.' });
  }
});

module.exports = router;
