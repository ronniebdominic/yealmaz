// Ye-Almaz — Lab Tech Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache } = require('../cache');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { DEPT_SHORT_LABELS, SCAN_PATTERN, localDayKey } = require('../utils/scanAttribution');

const router = express.Router();
const prisma = new PrismaClient();

// Internal lab-floor endpoints — includes full stage notes (incl. Milling/Margin
// tech comments), so these are never reachable by the CLINIC role.
// GET /api/lab/active — cases currently in production
router.get('/active', protect, restrict('ADMIN', 'LAB_TECH'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `lab:active:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = {
      status: { notIn: ['DELIVERED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'ON_HOLD', 'CANCELLED'] }
    };
    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: { clinic: { select: { name: true } }, stages: { orderBy: { scannedAt: 'desc' }, take: 1 } },
        orderBy: { createdAt: 'asc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.case.count({ where })
    ]);

    const result = { cases, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } };
    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch cases.' });
  }
});

// GET /api/lab/case/:caseId — case details for QR scan result
router.get('/case/:caseId', protect, restrict('ADMIN', 'LAB_TECH'), async (req, res) => {
  const cacheKey = `case:lab:${req.params.caseId}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const c = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: {
        clinic: { select: { name: true } },
        stages: { orderBy: { scannedAt: 'desc' } }
      }
    });
    if (!c) return res.status(404).json({ error: 'Case not found.' });
    await appCache.set(cacheKey, c);
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch case.' });
  }
});

// GET /api/lab/my-performance — the logged-in tech's own scan activity:
// summary stats plus a real, paginated scan-by-scan history (not just the
// in-session "Today's Scans" list on the lab dashboard, which resets on
// reload). Self-scoped by matching CaseStage.scannedBy against this
// account's own name — there's no way to query anyone else's data through
// this endpoint. See utils/scanAttribution.js for how a scan is matched
// back to an account; the roster-wide admin equivalent is
// GET /api/dashboard/lab-performance.
router.get('/my-performance', protect, restrict('ADMIN', 'LAB_TECH'), async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;
    const dateTo = to ? endOfDay(to) : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
    const defaultFrom = new Date(); defaultFrom.setDate(defaultFrom.getDate() - 29); defaultFrom.setHours(0, 0, 0, 0);
    const dateFrom = from ? startOfDay(from) : defaultFrom;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // The exact prefix a scan by this account is stamped with — see
    // scan.js: scannedBy = `${techName} (${dept.short})`.
    const where = { scannedAt: { gte: dateFrom, lte: dateTo }, scannedBy: { startsWith: `${req.user.name} (` } };

    const [scans, totalScans, allInRange, labWideScans] = await Promise.all([
      prisma.caseStage.findMany({
        where,
        include: { case: { select: { caseNumber: true, patientName: true, workType: true, clinic: { select: { name: true } } } } },
        orderBy: { scannedAt: 'desc' },
        skip, take: parseInt(limit),
      }),
      prisma.caseStage.count({ where }),
      // Full (unpaginated) set within range, for the summary stats below —
      // the list above is paginated, the stats aren't.
      prisma.caseStage.findMany({ where, select: { scannedAt: true, caseId: true, scannedBy: true } }),
      // Every lab tech's scans (not just this account's) in the same range,
      // for the "share of the lab's total" stat below — same SCAN_PATTERN
      // match GET /dashboard/lab-performance uses, so the two numbers are
      // computed the same way.
      prisma.caseStage.findMany({ where: { scannedAt: { gte: dateFrom, lte: dateTo }, scannedBy: { not: null } }, select: { scannedBy: true } }),
    ]);

    const cases = new Set();
    const deptCounts = {};
    const dailyCounts = {};
    let lastActiveAt = null;
    for (const s of allInRange) {
      cases.add(s.caseId);
      const m = /\(([A-Z0-9_]+)\)$/.exec(s.scannedBy || '');
      if (m) deptCounts[m[1]] = (deptCounts[m[1]] || 0) + 1;
      const day = localDayKey(s.scannedAt);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      if (!lastActiveAt || s.scannedAt > lastActiveAt) lastActiveAt = s.scannedAt;
    }
    const activeDays = Object.keys(dailyCounts).length;
    const departmentBreakdown = Object.entries(deptCounts)
      .map(([code, count]) => ({ code, label: DEPT_SHORT_LABELS[code] || code, count }))
      .sort((a, b) => b.count - a.count);

    const totalLabScans = labWideScans.filter(s => SCAN_PATTERN.test(s.scannedBy || '')).length;
    const shareOfTotalPercent = totalLabScans > 0 ? Math.round((allInRange.length / totalLabScans) * 1000) / 10 : null;

    res.json({
      range: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      summary: {
        totalScans: allInRange.length,
        uniqueCases: cases.size,
        activeDays,
        avgPerActiveDay: activeDays > 0 ? Math.round((allInRange.length / activeDays) * 10) / 10 : 0,
        totalLabScans,
        shareOfTotalPercent,
        departmentBreakdown,
        dailyCounts,
        lastActiveAt,
      },
      scans: scans.map(s => ({
        id: s.id,
        caseNumber: s.case?.caseNumber,
        patientName: s.case?.patientName,
        workType: s.case?.workType,
        clinicName: s.case?.clinic?.name,
        stageName: s.stageName,
        scannedAt: s.scannedAt,
        notes: s.notes,
      })),
      pagination: { total: totalScans, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(totalScans / parseInt(limit)) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your performance.' });
  }
});

module.exports = router;
