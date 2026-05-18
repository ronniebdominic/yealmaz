// Ye-Almaz — Dashboard / Analytics Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/dashboard/summary ───────────────────────────
router.get('/summary', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  const cacheKey = 'dashboard:summary';
  const cached = appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const [
      totalCases, pendingCases, completedCases, activeCases,
      pendingPayments, thisMonthRevenue, lastMonthRevenue, recentCases
    ] = await Promise.all([
      prisma.case.count(),
      prisma.case.count({ where: { status: { notIn: ['DELIVERED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'ON_HOLD', 'CANCELLED'] } } }),
      prisma.case.count({ where: { status: 'DELIVERED' } }),
      prisma.case.count({ where: { status: { in: ['READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] } } }),
      prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { amount: true } }),
      prisma.case.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { clinic: { select: { name: true } }, payment: true } })
    ]);

    const thisMonthAmt = thisMonthRevenue._sum.amount || 0;
    const lastMonthAmt = lastMonthRevenue._sum.amount || 0;
    const revenueGrowth = lastMonthAmt > 0
      ? (((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 100).toFixed(1)
      : null;

    const result = {
      stats: { totalCases, pendingCases, completedCases, activeCases, pendingPayments, thisMonthRevenue: thisMonthAmt, lastMonthRevenue: lastMonthAmt, revenueGrowth },
      recentCases
    };

    appCache.set(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

// ── GET /api/dashboard/revenue ───────────────────────────
router.get('/revenue', protect, restrict('ADMIN'), async (req, res) => {
  const cacheKey = 'dashboard:revenue';
  const cached = appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
        label: new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      };
    });

    const results = await Promise.all(
      buckets.map(b =>
        prisma.payment.aggregate({
          where: { status: 'VERIFIED', verifiedAt: { gte: b.start, lte: b.end } },
          _sum: { amount: true },
          _count: true
        })
      )
    );

    const months = buckets.map((b, i) => ({
      month: b.label,
      revenue: results[i]._sum.amount || 0,
      cases: results[i]._count,
    }));

    appCache.set(cacheKey, months, 3600);
    res.json(months);
  } catch (err) {
    res.status(500).json({ error: 'Could not load revenue data.' });
  }
});

// ── GET /api/dashboard/cases-by-status ──────────────────
router.get('/cases-by-status', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  const cacheKey = 'dashboard:cases-by-status';
  const cached = appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const statuses = [
      'CASE_ACCEPTED', 'PLASTER_DEPARTMENT', 'MARGIN_DEPARTMENT',
      'SCANNING', 'DESIGNING',
      'MILLING_SINTERING', 'RESIN_3D_PRINTING', 'METAL_3D_PRINTING',
      'METAL_FINISHING', 'OPAQUE_APPLICATION', 'CERAMIC_LAYERING',
      'ZIRCONIA_FITTING_FINISHING', 'GLAZING', 'THERMO_PRESS', 'TRIMMING',
      'QUALITY_CHECK', 'PAYMENT_INVOICING',
      'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'ON_HOLD', 'REMAKE', 'CANCELLED'
    ];

    const counts = await Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await prisma.case.count({ where: { status } })
      }))
    );

    appCache.set(cacheKey, counts, 120);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Could not load case stats.' });
  }
});

// ── GET /api/dashboard/admin-analytics ──────────────────
router.get('/admin-analytics', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { from, to, clinicId } = req.query;
    const cacheKey = `dashboard:analytics:${from || ''}:${to || ''}:${clinicId || ''}`;
    const cached = appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const dateTo = to ? new Date(to) : new Date();
    dateTo.setHours(23, 59, 59, 999);
    const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);

    const trendBuckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(dateTo);
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      trendBuckets.push({
        start, end,
        label: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: 0, cases: 0,
      });
    }
    const trendStart = trendBuckets[0].start;
    const caseFilter = clinicId ? { clinicId } : {};

    const [
      [totalCases, activeCases, deliveredCases],
      pendingPayments,
      trendPayments,
      allClinics,
      casesPerClinic,
      casesByWorkType,
    ] = await Promise.all([
      Promise.all([
        prisma.case.count({ where: caseFilter }),
        prisma.case.count({ where: { ...caseFilter, status: { notIn: ['DELIVERED', 'ON_HOLD', 'CANCELLED'] } } }),
        prisma.case.count({ where: { ...caseFilter, status: 'DELIVERED' } }),
      ]),
      prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
      prisma.payment.findMany({
        where: {
          status: 'VERIFIED',
          verifiedAt: { gte: trendStart, lte: dateTo },
          ...(clinicId ? { case: { clinicId } } : {}),
        },
        select: { amount: true, verifiedAt: true, case: { select: { clinicId: true } } },
      }),
      prisma.clinic.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.case.groupBy({ by: ['clinicId'], _count: { id: true } }),
      prisma.case.findMany({
        where: caseFilter,
        select: { workType: true, payment: { select: { status: true, amount: true } } },
      }),
    ]);

    const filteredPayments = trendPayments.filter(
      p => new Date(p.verifiedAt) >= dateFrom && new Date(p.verifiedAt) <= dateTo
    );
    const totalRevenue = filteredPayments.reduce((s, p) => s + (p.amount || 0), 0);

    for (const p of trendPayments) {
      const d = new Date(p.verifiedAt);
      const bucket = trendBuckets.find(b => d >= b.start && d <= b.end);
      if (bucket) { bucket.revenue += p.amount || 0; bucket.cases += 1; }
    }
    const monthlyTrend = trendBuckets.map(({ label, revenue, cases }) => ({ month: label, revenue, cases }));

    const caseCountMap = Object.fromEntries(casesPerClinic.map(r => [r.clinicId, r._count.id]));
    const clinicRevMap = {};
    for (const p of filteredPayments) {
      const cid = p.case?.clinicId;
      if (!cid) continue;
      if (!clinicRevMap[cid]) clinicRevMap[cid] = { revenue: 0, paidCases: 0 };
      clinicRevMap[cid].revenue   += p.amount || 0;
      clinicRevMap[cid].paidCases += 1;
    }
    const revenueByClinic = allClinics.map(c => ({
      id: c.id, name: c.name,
      revenue:    clinicRevMap[c.id]?.revenue    || 0,
      paidCases:  clinicRevMap[c.id]?.paidCases  || 0,
      totalCases: caseCountMap[c.id]             || 0,
    })).sort((a, b) => b.revenue - a.revenue);

    const workTypeMap = {};
    for (const c of casesByWorkType) {
      const wt = c.workType || 'Other';
      if (!workTypeMap[wt]) workTypeMap[wt] = { count: 0, revenue: 0 };
      workTypeMap[wt].count += 1;
      if (c.payment?.status === 'VERIFIED' && c.payment?.amount) {
        workTypeMap[wt].revenue += c.payment.amount;
      }
    }
    const revenueByWorkType = Object.entries(workTypeMap)
      .map(([workType, d]) => ({ workType, count: d.count, revenue: d.revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    const result = {
      kpi: { totalRevenue, totalCases, activeCases, deliveredCases, pendingPayments },
      monthlyTrend,
      revenueByClinic,
      revenueByWorkType,
      clinicList: allClinics,
    };

    appCache.set(cacheKey, result, 1800);
    res.json(result);
  } catch (err) {
    console.error('[admin-analytics]', err);
    res.status(500).json({ error: 'Could not load analytics.' });
  }
});

module.exports = router;
