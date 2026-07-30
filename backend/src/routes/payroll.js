// Ye-Almaz — Payroll Routes
// Gross pay + manual adjustments only — no automatic tax/pension/attendance
// deduction is ever computed here. netPay is always baseSalarySnapshot plus
// the sum of manually entered PayrollAdjustment rows, rounded to 2dp at
// every write (stricter than Payment.amount elsewhere in this codebase,
// which has no such guard — this is the most financially sensitive part of
// the app, so it gets the extra rigor).
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── POST /api/payroll/runs ─────────────────────────────────
router.post('/runs', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { periodMonth, periodYear } = req.body || {};
    const month = parseInt(periodMonth), year = parseInt(periodYear);
    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({ error: 'A valid periodMonth (1-12) and periodYear are required.' });
    }

    const existing = await prisma.payrollRun.findUnique({ where: { periodMonth_periodYear: { periodMonth: month, periodYear: year } } });
    if (existing) return res.status(409).json({ error: `A payroll run already exists for ${month}/${year}.` });

    const employees = await prisma.user.findMany({
      where: { isActive: true, employeeProfile: { employmentStatus: 'ACTIVE' } },
      include: { employeeProfile: true },
    });

    let missingSalaryCount = 0;
    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({
        data: { periodMonth: month, periodYear: year, createdById: req.user.id },
      });
      for (const emp of employees) {
        const salary = emp.employeeProfile.baseSalary;
        if (salary == null) missingSalaryCount++;
        const baseSalarySnapshot = round2(salary || 0);
        await tx.payrollEntry.create({
          data: { runId: created.id, userId: emp.id, baseSalarySnapshot, netPay: baseSalarySnapshot },
        });
      }
      return created;
    });

    await invalidate('payroll:runs*', 'dashboard:hr-summary');
    res.status(201).json({ run, employeeCount: employees.length, missingSalaryCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create payroll run.' });
  }
});

// ── GET /api/payroll/runs ──────────────────────────────────
router.get('/runs', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const runs = await prisma.payrollRun.findMany({
      include: { createdBy: { select: { name: true } }, _count: { select: { entries: true } } },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: 'Could not load payroll runs.' });
  }
});

// ── GET /api/payroll/runs/:id ───────────────────────────────
router.get('/runs/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { name: true } },
        entries: {
          include: { user: { select: { id: true, name: true, email: true } }, adjustments: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: 'Could not load payroll run.' });
  }
});

// ── POST /api/payroll/entries/:id/adjustments ───────────────
router.post('/entries/:id/adjustments', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { label, amount } = req.body || {};
    if (!label || !label.trim() || amount == null || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'label and amount are required.' });
    }
    const entry = await prisma.payrollEntry.findUnique({ where: { id: req.params.id }, include: { run: true, adjustments: true } });
    if (!entry) return res.status(404).json({ error: 'Payroll entry not found.' });
    if (entry.run.status !== 'DRAFT') return res.status(400).json({ error: 'This payroll run has already been finalized.' });

    const signedAmount = round2(parseFloat(amount));
    const [, updated] = await prisma.$transaction([
      prisma.payrollAdjustment.create({
        data: { entryId: entry.id, label: label.trim(), amount: signedAmount, addedById: req.user.id },
      }),
      prisma.payrollEntry.update({
        where: { id: entry.id },
        data: { netPay: round2(entry.baseSalarySnapshot + entry.adjustments.reduce((s, a) => s + a.amount, 0) + signedAmount) },
        include: { adjustments: true },
      }),
    ]);

    await invalidate('payroll:runs*', 'payroll:entries*');
    res.status(201).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add adjustment.' });
  }
});

// ── PATCH /api/payroll/runs/:id/finalize ────────────────────
router.patch('/runs/:id/finalize', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
    if (!run) return res.status(404).json({ error: 'Payroll run not found.' });
    if (run.status === 'FINALIZED') return res.status(400).json({ error: 'This run is already finalized.' });

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'FINALIZED', finalizedAt: new Date() },
    });
    await invalidate('payroll:runs*', 'payroll:entries*', 'dashboard:hr-summary');
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not finalize payroll run.' });
  }
});

// ── GET /api/payroll/summary ────────────────────────────────
// Shared by AdminHR.jsx's own KPIs and AdminDashboard.jsx's HR section,
// same "one endpoint feeds both" trick as dashboard:inventory-summary.
router.get('/summary', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  const cacheKey = 'dashboard:hr-summary';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [missingProfileCount, currentRun] = await Promise.all([
      prisma.user.count({ where: { isActive: true, OR: [{ employeeProfile: null }, { employeeProfile: { baseSalary: null } }] } }),
      prisma.payrollRun.findFirst({ orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] }),
    ]);
    const result = {
      missingProfileCount,
      currentRunStatus: currentRun?.status || null,
      currentRunPeriod: currentRun ? `${currentRun.periodMonth}/${currentRun.periodYear}` : null,
    };
    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load payroll summary.' });
  }
});

module.exports = router;
