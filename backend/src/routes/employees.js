// Ye-Almaz — Employee Profile Routes
// Identity/HR-record data, kept separate from attendance and payroll since
// it's conceptually distinct (who someone is, not when they worked or what
// they were paid). EmployeeProfile is 1:1 with User but never merged into
// it, so existing broad User queries elsewhere in the app never touch or
// risk exposing salary/bank data.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/employees ────────────────────────────────────
router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  const cacheKey = 'employees:all';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true, phone: true, isActive: true,
        employeeProfile: true,
      },
      orderBy: { name: 'asc' },
    });
    await appCache.set(cacheKey, users);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

// ── PATCH /api/employees/:userId/profile ──────────────────
router.patch('/:userId/profile', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ error: 'Employee not found.' });

    const { employeeCode, position, hireDate, baseSalary, bankName, bankAccount, employmentStatus } = req.body;
    const data = {};
    if (employeeCode !== undefined) data.employeeCode = employeeCode?.trim() || null;
    if (position !== undefined) data.position = position?.trim() || null;
    if (hireDate !== undefined) data.hireDate = hireDate ? new Date(hireDate) : null;
    if (baseSalary !== undefined) data.baseSalary = baseSalary === '' || baseSalary == null ? null : parseFloat(baseSalary);
    if (bankName !== undefined) data.bankName = bankName?.trim() || null;
    if (bankAccount !== undefined) data.bankAccount = bankAccount?.trim() || null;
    if (employmentStatus !== undefined) data.employmentStatus = employmentStatus;

    const profile = await prisma.employeeProfile.upsert({
      where: { userId: req.params.userId },
      create: { userId: req.params.userId, ...data },
      update: data,
    });

    await invalidate('employees:all', 'dashboard:hr-summary');
    res.json(profile);
  } catch (err) {
    console.error(err);
    if (err.code === 'P2002') return res.status(409).json({ error: 'That employee code is already in use.' });
    res.status(500).json({ error: 'Could not save employee profile.' });
  }
});

module.exports = router;
