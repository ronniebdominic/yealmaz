// Ye-Almaz — Leave Types / Balance Ledger / Holiday Calendar
// Kept separate from attendance.js's existing POST/GET /leave (which stay
// the LeaveRecord CRUD) to avoid bloating that file further — this file
// owns the configuration (LeaveType, Holiday) and the balance ledger
// (LeaveLedgerEntry). Balance is always sum(days) for a user+type, never a
// single stored number, so entitlement/usage/carry-forward/adjustment stay
// individually auditable.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// ── Leave Types ───────────────────────────────────────────
router.get('/types', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'leave:types';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);
    const types = await prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
    await appCache.set(cacheKey, types);
    res.json(types);
  } catch (err) {
    console.error('[leave types]', err);
    res.status(500).json({ error: 'Could not load leave types.' });
  }
});

router.post('/types', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, defaultAnnualDays, requiresApproval, isPaid } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const type = await prisma.leaveType.create({
      data: {
        name: name.trim(),
        defaultAnnualDays: defaultAnnualDays === '' || defaultAnnualDays == null ? null : parseFloat(defaultAnnualDays),
        requiresApproval: requiresApproval ?? true,
        isPaid: isPaid ?? true,
      },
    });
    await invalidate('leave:types');
    res.status(201).json(type);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A leave type with that name already exists.' });
    console.error('[leave types create]', err);
    res.status(500).json({ error: 'Could not create leave type.' });
  }
});

router.patch('/types/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, defaultAnnualDays, requiresApproval, isPaid, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (defaultAnnualDays !== undefined) data.defaultAnnualDays = defaultAnnualDays === '' || defaultAnnualDays == null ? null : parseFloat(defaultAnnualDays);
    if (requiresApproval !== undefined) data.requiresApproval = requiresApproval;
    if (isPaid !== undefined) data.isPaid = isPaid;
    if (isActive !== undefined) data.isActive = isActive;
    const type = await prisma.leaveType.update({ where: { id: req.params.id }, data });
    await invalidate('leave:types');
    res.json(type);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Leave type not found.' });
    console.error('[leave types update]', err);
    res.status(500).json({ error: 'Could not update leave type.' });
  }
});

// ── Balance / Ledger ──────────────────────────────────────
router.get('/balance', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, leaveTypeId } = req.query;
    if (!userId || !leaveTypeId) return res.status(400).json({ error: 'userId and leaveTypeId are required.' });
    const entries = await prisma.leaveLedgerEntry.findMany({ where: { userId, leaveTypeId } });
    const available = Math.round(entries.reduce((sum, e) => sum + e.days, 0) * 100) / 100;
    res.json({ userId, leaveTypeId, available });
  } catch (err) {
    console.error('[leave balance]', err);
    res.status(500).json({ error: 'Could not load leave balance.' });
  }
});

// All-types balance summary for one employee, e.g. the Employee Profile
// Leave tab / Leave tab's top cards.
router.get('/balances', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const [types, entries] = await Promise.all([
      prisma.leaveType.findMany({ where: { isActive: true } }),
      prisma.leaveLedgerEntry.findMany({ where: { userId } }),
    ]);
    const byType = new Map();
    for (const e of entries) byType.set(e.leaveTypeId, (byType.get(e.leaveTypeId) || 0) + e.days);
    res.json(types.map(t => ({
      leaveTypeId: t.id, name: t.name, isPaid: t.isPaid,
      available: Math.round((byType.get(t.id) || 0) * 100) / 100,
    })));
  } catch (err) {
    console.error('[leave balances]', err);
    res.status(500).json({ error: 'Could not load leave balances.' });
  }
});

router.get('/ledger', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, leaveTypeId } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    const entries = await prisma.leaveLedgerEntry.findMany({
      where,
      include: {
        leaveType: true,
        recordedBy: { select: { id: true, name: true } },
        relatedLeaveRecord: { select: { id: true, fromDate: true, toDate: true } },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    res.json(entries);
  } catch (err) {
    console.error('[leave ledger]', err);
    res.status(500).json({ error: 'Could not load leave ledger.' });
  }
});

// Manual entitlement/carry-forward/adjustment entry — e.g. seeding an
// employee's annual entitlement, or a one-off correction. USED entries are
// normally written automatically by attendance.js's POST /leave, but HR can
// also record one manually here (e.g. backdating pre-system leave).
router.post('/ledger', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, leaveTypeId, transactionType, days, effectiveDate, note } = req.body || {};
    if (!userId || !leaveTypeId || !transactionType) return res.status(400).json({ error: 'userId, leaveTypeId and transactionType are required.' });
    const amount = parseFloat(days);
    if (!Number.isFinite(amount)) return res.status(400).json({ error: 'days must be a number.' });

    const entry = await prisma.leaveLedgerEntry.create({
      data: {
        userId, leaveTypeId, transactionType,
        days: amount,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        note: note?.trim() || null,
        recordedById: req.user.id,
      },
    });
    await invalidate('leave:*');
    res.status(201).json(entry);
  } catch (err) {
    console.error('[leave ledger create]', err);
    res.status(500).json({ error: 'Could not record ledger entry.' });
  }
});

// ── Holidays ──────────────────────────────────────────────
router.get('/holidays', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'leave:holidays';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);
    const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    await appCache.set(cacheKey, holidays);
    res.json(holidays);
  } catch (err) {
    console.error('[leave holidays]', err);
    res.status(500).json({ error: 'Could not load holidays.' });
  }
});

router.post('/holidays', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { date, name, type } = req.body || {};
    if (!date || !name?.trim()) return res.status(400).json({ error: 'date and name are required.' });
    const day = new Date(`${date}T00:00:00`);
    if (isNaN(day.getTime())) return res.status(400).json({ error: 'Invalid date.' });
    const holiday = await prisma.holiday.create({ data: { date: day, name: name.trim(), type: type === 'COMPANY' ? 'COMPANY' : 'PUBLIC' } });
    await invalidate('leave:holidays', 'attendance:*');
    res.status(201).json(holiday);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A holiday already exists on that date.' });
    console.error('[leave holidays create]', err);
    res.status(500).json({ error: 'Could not create holiday.' });
  }
});

router.patch('/holidays/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { date, name, type } = req.body || {};
    const data = {};
    if (date !== undefined) data.date = new Date(`${date}T00:00:00`);
    if (name !== undefined) data.name = name.trim();
    if (type !== undefined) data.type = type;
    const holiday = await prisma.holiday.update({ where: { id: req.params.id }, data });
    await invalidate('leave:holidays', 'attendance:*');
    res.json(holiday);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Holiday not found.' });
    console.error('[leave holidays update]', err);
    res.status(500).json({ error: 'Could not update holiday.' });
  }
});

router.delete('/holidays/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    await prisma.holiday.delete({ where: { id: req.params.id } });
    await invalidate('leave:holidays', 'attendance:*');
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Holiday not found.' });
    console.error('[leave holidays delete]', err);
    res.status(500).json({ error: 'Could not delete holiday.' });
  }
});

module.exports = router;
