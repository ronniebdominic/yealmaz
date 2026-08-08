// Ye-Almaz — Employee Advances & Loans (Phase 2)
// Repayment connects to payroll automatically: payroll.js's run-creation
// deducts each ACTIVE advance's installmentAmount (capped at the
// remaining outstandingBalance) as an auto-generated PayrollAdjustment,
// and records a matching AdvanceRepayment.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, status } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    const advances = await prisma.employeeAdvance.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } }, repayments: true },
      orderBy: { requestedAt: 'desc' },
    });
    res.json(advances);
  } catch (err) {
    console.error('[advances]', err);
    res.status(500).json({ error: 'Could not load advances.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, type, amount, installmentAmount, reason } = req.body || {};
    if (!userId || !amount || !installmentAmount) return res.status(400).json({ error: 'userId, amount and installmentAmount are required.' });
    const amt = parseFloat(amount), inst = parseFloat(installmentAmount);
    if (inst > amt) return res.status(400).json({ error: 'installmentAmount cannot exceed the total amount.' });

    const advance = await prisma.employeeAdvance.create({
      data: { userId, type: type === 'LOAN' ? 'LOAN' : 'ADVANCE', amount: amt, installmentAmount: inst, outstandingBalance: amt, reason: reason?.trim() || null },
    });
    await invalidate('advances:*');
    res.status(201).json(advance);
  } catch (err) {
    console.error('[advances create]', err);
    res.status(500).json({ error: 'Could not create advance.' });
  }
});

router.patch('/:id/approve', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const advance = await prisma.employeeAdvance.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', approvedById: req.user.id, approvedAt: new Date() },
    });
    await invalidate('advances:*');
    res.json(advance);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Advance not found.' });
    console.error('[advances approve]', err);
    res.status(500).json({ error: 'Could not approve advance.' });
  }
});

router.patch('/:id/reject', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const advance = await prisma.employeeAdvance.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', approvedById: req.user.id, approvedAt: new Date() },
    });
    await invalidate('advances:*');
    res.json(advance);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Advance not found.' });
    console.error('[advances reject]', err);
    res.status(500).json({ error: 'Could not reject advance.' });
  }
});

router.get('/:id/repayments', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const repayments = await prisma.advanceRepayment.findMany({ where: { advanceId: req.params.id }, orderBy: { date: 'desc' } });
    res.json(repayments);
  } catch (err) {
    console.error('[advances repayments]', err);
    res.status(500).json({ error: 'Could not load repayments.' });
  }
});

module.exports = router;
