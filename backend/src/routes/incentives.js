// Ye-Almaz — Incentives (Phase 2)
// Rules are configurable (metric + target + reward) — "do not hard-code
// incentive rules." Auto-compute is only offered for metrics this system
// can measure reliably today (production scans, cases, attendance %);
// everything else (quality/QC/remake/revenue/custom) needs a manually
// entered actual value rather than a fabricated number.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { SCAN_PATTERN } = require('../utils/scanAttribution');
const { resolveShiftForUserDate, computeDaySummary } = require('../services/attendanceDaySummary');

const router = express.Router();
const prisma = new PrismaClient();
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

const AUTO_METRICS = ['PRODUCTION_UNITS', 'CASES', 'ATTENDANCE'];

// ── Rules ─────────────────────────────────────────────────
router.get('/rules', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const rules = await prisma.incentiveRule.findMany({ orderBy: { name: 'asc' } });
    res.json(rules);
  } catch (err) {
    console.error('[incentive rules]', err);
    res.status(500).json({ error: 'Could not load incentive rules.' });
  }
});

router.post('/rules', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, metric, targetValue, rewardType, rewardAmount } = req.body || {};
    if (!name?.trim() || !metric || targetValue == null || rewardAmount == null) {
      return res.status(400).json({ error: 'name, metric, targetValue and rewardAmount are required.' });
    }
    const rule = await prisma.incentiveRule.create({
      data: { name: name.trim(), metric, targetValue: parseFloat(targetValue), rewardType: rewardType || 'FIXED', rewardAmount: parseFloat(rewardAmount) },
    });
    await invalidate('incentives:*');
    res.status(201).json(rule);
  } catch (err) {
    console.error('[incentive rules create]', err);
    res.status(500).json({ error: 'Could not create incentive rule.' });
  }
});

router.patch('/rules/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, metric, targetValue, rewardType, rewardAmount, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (metric !== undefined) data.metric = metric;
    if (targetValue !== undefined) data.targetValue = parseFloat(targetValue);
    if (rewardType !== undefined) data.rewardType = rewardType;
    if (rewardAmount !== undefined) data.rewardAmount = parseFloat(rewardAmount);
    if (isActive !== undefined) data.isActive = isActive;
    const rule = await prisma.incentiveRule.update({ where: { id: req.params.id }, data });
    await invalidate('incentives:*');
    res.json(rule);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Rule not found.' });
    console.error('[incentive rules update]', err);
    res.status(500).json({ error: 'Could not update incentive rule.' });
  }
});

function computeAward(rule, actualValue, baseSalary = 0) {
  if (rule.rewardType === 'FIXED') return actualValue >= rule.targetValue ? rule.rewardAmount : 0;
  if (rule.rewardType === 'PER_UNIT_OVER_TARGET') return Math.max(0, actualValue - rule.targetValue) * rule.rewardAmount;
  if (rule.rewardType === 'PERCENTAGE') return actualValue >= rule.targetValue ? baseSalary * (rule.rewardAmount / 100) : 0;
  return 0;
}

async function autoActualValue(metric, userId, userName, from, to) {
  if (metric === 'PRODUCTION_UNITS' || metric === 'CASES') {
    const stages = await prisma.caseStage.findMany({
      where: { scannedAt: { gte: from, lte: to }, scannedBy: { startsWith: `${userName} (` } },
      select: { caseId: true, scannedBy: true },
    });
    const matched = stages.filter(s => SCAN_PATTERN.test(s.scannedBy || ''));
    return metric === 'CASES' ? new Set(matched.map(s => s.caseId)).size : matched.length;
  }
  if (metric === 'ATTENDANCE') {
    let presentDays = 0, totalWorkingDays = 0;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const shift = await resolveShiftForUserDate(prisma, userId, dayStart);
      const events = await prisma.attendanceEvent.findMany({ where: { userId, timestamp: { gte: dayStart, lte: dayEnd } } });
      const summary = computeDaySummary({ date: dayStart, events, shift, holiday: null, leaveRecord: null, correction: null });
      if (['OFF', 'HOLIDAY'].includes(summary.status)) continue;
      totalWorkingDays++;
      if (summary.status === 'PRESENT' || summary.status === 'IN_PROGRESS') presentDays++;
    }
    return totalWorkingDays > 0 ? round2((presentDays / totalWorkingDays) * 100) : 0;
  }
  return null; // not auto-computable
}

// ── Compute/award for a period ───────────────────────────
// Auto-computes actualValue for AUTO_METRICS rules across the active
// roster; other metrics must be entered via POST /awards manually.
router.post('/compute', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { periodMonth, periodYear, ruleId } = req.body || {};
    if (!periodMonth || !periodYear) return res.status(400).json({ error: 'periodMonth and periodYear are required.' });
    const from = new Date(periodYear, periodMonth - 1, 1);
    const to = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);

    const rules = await prisma.incentiveRule.findMany({ where: { isActive: true, metric: { in: AUTO_METRICS }, ...(ruleId ? { id: ruleId } : {}) } });
    if (rules.length === 0) return res.json({ awarded: 0, awards: [] });

    const employees = await prisma.user.findMany({ where: { isSharedAccount: false, isActive: true }, include: { employeeProfile: true } });
    const created = [];
    for (const rule of rules) {
      for (const emp of employees) {
        const actualValue = await autoActualValue(rule.metric, emp.id, emp.name, from, to);
        if (actualValue == null) continue;
        const awardedAmount = round2(computeAward(rule, actualValue, emp.employeeProfile?.baseSalary || 0));
        const award = await prisma.incentiveAward.upsert({
          where: { userId_ruleId_periodMonth_periodYear: { userId: emp.id, ruleId: rule.id, periodMonth, periodYear } },
          create: { userId: emp.id, ruleId: rule.id, periodMonth, periodYear, actualValue, targetValue: rule.targetValue, awardedAmount },
          update: { actualValue, targetValue: rule.targetValue, awardedAmount },
        });
        if (awardedAmount > 0) created.push(award);
      }
    }
    await invalidate('incentives:*');
    res.json({ awarded: created.length, awards: created });
  } catch (err) {
    console.error('[incentives compute]', err);
    res.status(500).json({ error: 'Could not compute incentives.' });
  }
});

// Manual award — for metrics that can't be auto-computed (quality/QC/
// remake rate/revenue/custom), HR enters the actual value themselves.
router.post('/awards', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, ruleId, periodMonth, periodYear, actualValue } = req.body || {};
    if (!userId || !ruleId || !periodMonth || !periodYear || actualValue == null) {
      return res.status(400).json({ error: 'userId, ruleId, periodMonth, periodYear and actualValue are required.' });
    }
    const rule = await prisma.incentiveRule.findUnique({ where: { id: ruleId } });
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });
    const profile = await prisma.employeeProfile.findUnique({ where: { userId } });
    const awardedAmount = round2(computeAward(rule, parseFloat(actualValue), profile?.baseSalary || 0));

    const award = await prisma.incentiveAward.upsert({
      where: { userId_ruleId_periodMonth_periodYear: { userId, ruleId, periodMonth, periodYear } },
      create: { userId, ruleId, periodMonth, periodYear, actualValue: parseFloat(actualValue), targetValue: rule.targetValue, awardedAmount },
      update: { actualValue: parseFloat(actualValue), targetValue: rule.targetValue, awardedAmount },
    });
    await invalidate('incentives:*');
    res.status(201).json(award);
  } catch (err) {
    console.error('[incentives award]', err);
    res.status(500).json({ error: 'Could not record incentive award.' });
  }
});

router.get('/awards', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, periodMonth, periodYear, status } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (periodMonth) where.periodMonth = parseInt(periodMonth);
    if (periodYear) where.periodYear = parseInt(periodYear);
    if (status) where.status = status;
    const awards = await prisma.incentiveAward.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, rule: true },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
    res.json(awards);
  } catch (err) {
    console.error('[incentives awards list]', err);
    res.status(500).json({ error: 'Could not load incentive awards.' });
  }
});

router.patch('/awards/:id/approve', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const award = await prisma.incentiveAward.update({
      where: { id: req.params.id }, data: { status: 'APPROVED', approvedById: req.user.id },
    });
    await invalidate('incentives:*');
    res.json(award);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Award not found.' });
    console.error('[incentives approve]', err);
    res.status(500).json({ error: 'Could not approve award.' });
  }
});

module.exports = router;
