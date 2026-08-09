// Ye-Almaz — Offboarding (Phase 4)
// Resignation → Notice → Asset Return → Access Revocation → Leave
// Settlement → Final Payroll → Exit Interview → Archived. Reaching
// ARCHIVED sets EmployeeProfile.employmentStatus=TERMINATED + endDate and
// User.isActive=false (both existing fields/flags) — never deletes the
// employee or their history.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const WORKFLOW = ['RESIGNATION', 'NOTICE', 'ASSET_RETURN', 'ACCESS_REVOCATION', 'LEAVE_SETTLEMENT', 'FINAL_PAYROLL', 'EXIT_INTERVIEW', 'ARCHIVED'];

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cases = await prisma.offboardingCase.findMany({
      include: { user: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(cases);
  } catch (err) {
    console.error('[offboarding]', err);
    res.status(500).json({ error: 'Could not load offboarding cases.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, resignationDate, lastWorkingDate, reason } = req.body || {};
    if (!userId || !resignationDate) return res.status(400).json({ error: 'userId and resignationDate are required.' });
    const offboardingCase = await prisma.offboardingCase.create({
      data: {
        userId, resignationDate: new Date(resignationDate),
        lastWorkingDate: lastWorkingDate ? new Date(lastWorkingDate) : null,
        reason: reason?.trim() || null, createdById: req.user.id,
      },
    });
    await invalidate('offboarding:*');
    res.status(201).json(offboardingCase);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'An offboarding case already exists for this employee.' });
    console.error('[offboarding create]', err);
    res.status(500).json({ error: 'Could not start offboarding.' });
  }
});

router.patch('/:id/advance', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { exitInterviewNotes } = req.body || {};
    const existing = await prisma.offboardingCase.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Offboarding case not found.' });
    const idx = WORKFLOW.indexOf(existing.status);
    if (idx === WORKFLOW.length - 1) return res.status(400).json({ error: 'This case is already archived.' });
    const next = WORKFLOW[idx + 1];

    const updated = await prisma.$transaction(async (tx) => {
      const data = { status: next };
      if (exitInterviewNotes !== undefined) data.exitInterviewNotes = exitInterviewNotes?.trim() || null;
      const result = await tx.offboardingCase.update({ where: { id: req.params.id }, data });

      if (next === 'ARCHIVED') {
        await tx.employeeProfile.upsert({
          where: { userId: existing.userId },
          create: { userId: existing.userId, employmentStatus: 'TERMINATED', endDate: existing.lastWorkingDate || new Date() },
          update: { employmentStatus: 'TERMINATED', endDate: existing.lastWorkingDate || new Date() },
        });
        await tx.user.update({ where: { id: existing.userId }, data: { isActive: false } });
      }
      return result;
    });

    await invalidate('offboarding:*', 'employees:all');
    res.json(updated);
  } catch (err) {
    console.error('[offboarding advance]', err);
    res.status(500).json({ error: 'Could not advance offboarding case.' });
  }
});

module.exports = router;
