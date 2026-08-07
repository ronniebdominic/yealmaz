// Ye-Almaz — Dashboard / Analytics Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { DEPT_SHORT_LABELS, SCAN_PATTERN, localDayKey } = require('../utils/scanAttribution');

const router = express.Router();
const prisma = new PrismaClient();

// Active lab-production stages only — excludes intake (PENDING_PICKUP,
// PICKUP_ASSIGNED), dispatch/terminal (READY_TO_DISPATCH, OUT_FOR_DELIVERY,
// DELIVERED), and exception states (ON_HOLD, REMAKE, CANCELLED,
// UNDER_REVIEW, REJECTED). Mirrors AdminDashboard.jsx's PRODUCTION_STATUSES
// so the "Total Cases In Progress" KPI always matches what its own
// drill-down (which queries /cases with this same status list) shows.
const PRODUCTION_STATUSES = [
  'CASE_ACCEPTED', 'PLASTER_DEPARTMENT', 'MARGIN_DEPARTMENT', 'SCANNING', 'DESIGNING',
  'MILLING_SINTERING', 'RESIN_3D_PRINTING', 'METAL_3D_PRINTING', 'METAL_FINISHING',
  'OPAQUE_APPLICATION', 'CERAMIC_LAYERING', 'ZIRCONIA_FITTING_FINISHING', 'GLAZING',
  'THERMO_PRESS', 'TRIMMING', 'QUALITY_CHECK', 'PAYMENT_INVOICING',
];

// ── GET /api/dashboard/summary ───────────────────────────
router.get('/summary', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'DISPATCH'), async (req, res) => {
  const cacheKey = 'dashboard:summary';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const [
      totalCases, pendingCases, completedCases, activeCases, pendingPickups,
      pendingPayments, thisMonthRevenue, lastMonthRevenue, recentCases,
      todayCases, remakeCount, redoCases, deliveredToday, readyToDispatch
    ] = await Promise.all([
      prisma.case.count(),
      prisma.case.count({ where: { status: { notIn: ['PENDING_PICKUP', 'PICKUP_ASSIGNED', 'DELIVERED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'ON_HOLD', 'CANCELLED', 'UNDER_REVIEW', 'REJECTED', 'REMAKE'] } } }),
      prisma.case.count({ where: { status: 'DELIVERED' } }),
      prisma.case.count({ where: { status: { in: ['READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] } } }),
      prisma.case.count({ where: { status: { in: ['PENDING_PICKUP', 'PICKUP_ASSIGNED'] } } }),
      prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { amount: true } }),
      prisma.case.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { clinic: { select: { name: true } }, payment: true } }),
      prisma.case.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.case.count({ where: { remake: true, createdAt: { gte: startOfToday } } }),
      prisma.case.count({ where: { redo: true, createdAt: { gte: startOfToday } } }),
      prisma.case.count({ where: { deliveryDate: { gte: startOfToday } } }),
      prisma.case.count({ where: { status: 'READY_TO_DISPATCH' } }),
    ]);

    const thisMonthAmt = thisMonthRevenue._sum.amount || 0;
    const lastMonthAmt = lastMonthRevenue._sum.amount || 0;
    const revenueGrowth = lastMonthAmt > 0
      ? (((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 100).toFixed(1)
      : null;

    const result = {
      stats: {
        totalCases, pendingCases, completedCases, activeCases, pendingPickups, pendingPayments,
        thisMonthRevenue: thisMonthAmt, lastMonthRevenue: lastMonthAmt, revenueGrowth,
        todayCases, remakeCount, redoCases, deliveredToday, readyToDispatch,
      },
      recentCases
    };

    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

// ── GET /api/dashboard/revenue ───────────────────────────
router.get('/revenue', protect, restrict('ADMIN'), async (req, res) => {
  const cacheKey = 'dashboard:revenue';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
        label: new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
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

    await appCache.set(cacheKey, months);
    res.json(months);
  } catch (err) {
    res.status(500).json({ error: 'Could not load revenue data.' });
  }
});

// ── GET /api/dashboard/finance-report ───────────────────
// Returns revenue + pending summaries for Finance dashboard (daily/MTD/YTD)
router.get('/finance-report', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  try {
    const { from, to, search } = req.query;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear  = new Date(now.getFullYear(), 0, 1);

    const dateFrom = from ? startOfDay(from) : startOfYear;
    const dateTo   = to   ? endOfDay(to) : now;

    const searchWhere = search ? {
      OR: [
        { case: { clinic: { name: { contains: search, mode: 'insensitive' } } } },
        { case: { patientName: { contains: search, mode: 'insensitive' } } },
        { case: { caseNumber: { contains: search, mode: 'insensitive' } } },
      ]
    } : {};

    const [
      revenueDaily, revenueMTD, revenueYTD, revenueRange,
      unitsDaily, unitsMTD, unitsYTD,
      paidToday, pendingCount, pendingAmount,
      taxWithheldAgg,
      recentVerified, recentPending,
    ] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfToday }, ...searchWhere }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfMonth }, ...searchWhere }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfYear }, ...searchWhere }, _sum: { amount: true }, _count: true }),
      prisma.payment.aggregate({ where: { status: 'VERIFIED', verifiedAt: { gte: dateFrom, lte: dateTo }, ...searchWhere }, _sum: { amount: true }, _count: true }),
      prisma.case.aggregate({ where: { deliveryDate: { gte: startOfToday } }, _sum: { units: true } }),
      prisma.case.aggregate({ where: { deliveryDate: { gte: startOfMonth } }, _sum: { units: true } }),
      prisma.case.aggregate({ where: { deliveryDate: { gte: startOfYear } }, _sum: { units: true } }),
      prisma.payment.count({ where: { status: 'VERIFIED', verifiedAt: { gte: startOfToday } } }),
      // Only count payments that actually have a Br amount owed, so the count matches
      // the amount below (and the Clinic Balances view). Pending-but-unpriced payments
      // aren't billable outstanding, so they don't belong in this figure. Outstanding is
      // ALWAYS exclusive of in-progress cases — only money owed after delivery counts;
      // an unpaid case still in the lab isn't "outstanding" (nothing's been delivered yet).
      prisma.payment.count({ where: { status: { in: ['PENDING', 'PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED'] }, amount: { gt: 0 }, case: { status: 'DELIVERED' } } }),
      // Sum of amount still OWED (amount minus any partial amountReceived) — can't be
      // expressed as a Prisma aggregate (no cross-field subtraction), so sum in JS.
      prisma.payment.findMany({ where: { status: { in: ['PENDING', 'PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED'] }, amount: { gt: 0 }, case: { status: 'DELIVERED' } }, select: { amount: true, amountReceived: true } })
        .then(rows => rows.reduce((s, p) => s + (p.amount || 0) - (p.amountReceived || 0), 0)),
      // Reconciliation figure for Finance — total withheld by clinics for direct
      // government tax filing, for the selected period. These payments are
      // VERIFIED (fully settled), not outstanding — this is purely informational.
      prisma.payment.aggregate({
        where: { status: 'VERIFIED', taxWithheld: { not: null }, verifiedAt: { gte: dateFrom, lte: dateTo } },
        _sum: { taxWithheld: true }, _count: true,
      }),
      prisma.payment.findMany({
        where: { status: 'VERIFIED', verifiedAt: { gte: dateFrom, lte: dateTo }, ...searchWhere },
        include: { case: { include: { clinic: { select: { name: true } } } } },
        orderBy: { verifiedAt: 'desc' },
        take: 50,
      }),
      prisma.payment.findMany({
        where: { status: { in: ['PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED'] }, ...searchWhere },
        include: { case: { include: { clinic: { select: { name: true } } } } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    res.json({
      revenue: {
        daily:  { amount: revenueDaily._sum.amount || 0, count: revenueDaily._count },
        MTD:    { amount: revenueMTD._sum.amount   || 0, count: revenueMTD._count },
        YTD:    { amount: revenueYTD._sum.amount   || 0, count: revenueYTD._count },
        range:  { amount: revenueRange._sum.amount || 0, count: revenueRange._count },
      },
      units: {
        daily: unitsDaily._sum.units || 0,
        MTD:   unitsMTD._sum.units   || 0,
        YTD:   unitsYTD._sum.units   || 0,
      },
      paid: { today: paidToday },
      pending: { count: pendingCount, amount: pendingAmount },
      taxWithheld: { count: taxWithheldAgg._count, amount: taxWithheldAgg._sum.taxWithheld || 0 },
      recentVerified,
      recentPending,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load finance report.' });
  }
});

// ── GET /api/dashboard/cases-by-status ──────────────────
router.get('/cases-by-status', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  const cacheKey = 'dashboard:cases-by-status';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const statuses = [
      'PENDING_PICKUP', 'PICKUP_ASSIGNED',
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

    await appCache.set(cacheKey, counts);
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Could not load case stats.' });
  }
});

// ── GET /api/dashboard/admin-analytics ──────────────────
router.get('/admin-analytics', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { from, to, clinicId, search } = req.query;
    const cacheKey = `dashboard:analytics:${from || ''}:${to || ''}:${clinicId || ''}:${search || ''}`;
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);

    // Free-text filter across clinic name / patient name / case number —
    // applied everywhere caseFilter is used, plus mirrored into the Payment
    // queries below via their nested `case: {...}` clause.
    const searchOR = search ? [
      { clinic: { name: { contains: search, mode: 'insensitive' } } },
      { patientName: { contains: search, mode: 'insensitive' } },
      { caseNumber: { contains: search, mode: 'insensitive' } },
    ] : null;

    const dateTo = to ? endOfDay(to) : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
    const dateFrom = from ? startOfDay(from) : new Date(new Date().getFullYear(), 0, 1);

    // Trend spans the selected filter range (capped to 24 buckets so the chart stays readable)
    const monthsInRange = (dateTo.getFullYear() - dateFrom.getFullYear()) * 12
      + (dateTo.getMonth() - dateFrom.getMonth()) + 1;
    const bucketCount = Math.min(Math.max(monthsInRange, 1), 24);

    const trendBuckets = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
      const d = new Date(dateTo);
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      trendBuckets.push({
        start, end,
        label: start.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: 0, cases: 0,
      });
    }
    const trendStart = trendBuckets[0].start;

    // "Financial Projection" KPIs are filtered by case CREATION date — cases
    // ordered in this range, whatever stage they're at now.
    const caseFilter = {
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(clinicId ? { clinicId } : {}),
      ...(searchOR ? { OR: searchOR } : {}),
    };
    // "Revenue vs Volume" (and Turn Around Time / On Time %) KPIs are filtered
    // by DELIVERY date instead — cases that shipped in this range, regardless
    // of when they were originally created. A case created last week and
    // delivered today belongs to today's "Delivered" numbers, not last week's;
    // using caseFilter (createdAt) here made a single-day filter show 0
    // delivered even on a day with 30+ real deliveries, because almost none of
    // those cases were ALSO created that same day.
    const deliveredFilter = {
      status: 'DELIVERED',
      deliveryDate: { gte: dateFrom, lte: dateTo },
      ...(clinicId ? { clinicId } : {}),
      ...(searchOR ? { OR: searchOR } : {}),
    };

    const [
      [totalCases, activeCases, deliveredCases, otherCases, deliveredOfCreated],
      pendingPayments,
      trendPayments,
      cohortVerifiedPayments,
      allClinics,
      casesPerClinic,
      casesByWorkType,
      readyToDispatch,
      totalRemakes,
      remakeReasonGroups,
      deliveredCasesData,
      deliveredCohortCases,
      unitsDeliveredAgg,
    ] = await Promise.all([
      Promise.all([
        prisma.case.count({ where: caseFilter }),
        // "In Progress" = active lab-production stages only (PRODUCTION_STATUSES).
        // Previously this counted everything except DELIVERED/ON_HOLD/CANCELLED,
        // which silently included READY_TO_DISPATCH (already its own tile below —
        // those cases are DONE with production, just waiting on payment/dispatch)
        // plus OUT_FOR_DELIVERY/REMAKE/UNDER_REVIEW/REJECTED/intake states. That
        // made Total Cases In Progress + Ready for Delivery + Delivered overshoot
        // Total Cases, and made this tile disagree with its own drill-down (which
        // already only shows PRODUCTION_STATUSES).
        prisma.case.count({ where: { ...caseFilter, status: { in: PRODUCTION_STATUSES } } }),
        prisma.case.count({ where: deliveredFilter }),
        // Everything else created in this range — awaiting pickup, out for
        // delivery, on hold, in remake status, cancelled, under review, or
        // rejected. Not shown as its own tile anywhere else, so without this,
        // In Progress + Ready for Dispatch + Delivered silently undershoots
        // Total Cases and looks like a bug (it's ~40+ real cases sitting in
        // these states, not a miscount).
        prisma.case.count({ where: { ...caseFilter, status: { notIn: [...PRODUCTION_STATUSES, 'READY_TO_DISPATCH', 'DELIVERED'] } } }),
        // Of the cases ORDERED in this range, how many have since been
        // delivered (whenever that happened) — the piece needed to make
        // activeCases + readyToDispatch + deliveredOfCreated + otherCases
        // sum EXACTLY to totalCases. Deliberately distinct from `deliveredCases`
        // above, which is scoped by deliveryDate instead (Revenue vs Volume's
        // "what shipped in this period" cohort) — the two numbers will only
        // coincidentally be close, never guaranteed equal, so don't conflate them.
        prisma.case.count({ where: { ...caseFilter, status: 'DELIVERED' } }),
      ]),
      prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
      // Feeds the monthly trend chart only — deliberately spans back to trendStart
      // (many months) and buckets by verifiedAt, since the chart is "cash collected
      // per month" over time, not scoped to the selected case-creation cohort.
      prisma.payment.findMany({
        where: {
          status: 'VERIFIED',
          verifiedAt: { gte: trendStart, lte: dateTo },
          ...((clinicId || searchOR) ? { case: { ...(clinicId ? { clinicId } : {}), ...(searchOR ? { OR: searchOR } : {}) } } : {}),
        },
        select: { amount: true, verifiedAt: true, case: { select: { clinicId: true } } },
      }),
      // "Verified Payments" KPI + Revenue by Clinic — part of the Revenue vs
      // Volume section, so scoped like the rest of it: cases DELIVERED within
      // the selected range (deliveredFilter), not cases created in it.
      // Deliberately NOT the same query as trendPayments above — that one is
      // scoped by payment.verifiedAt for the trend chart, which can include
      // payments for cases delivered long before the selected range.
      prisma.payment.findMany({
        where: {
          status: 'VERIFIED',
          case: deliveredFilter,
        },
        select: { amount: true, case: { select: { clinicId: true } } },
      }),
      prisma.clinic.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.case.groupBy({ by: ['clinicId'], where: caseFilter, _count: { id: true } }),
      prisma.case.findMany({
        where: caseFilter,
        select: { workType: true, units: true, clinicId: true, totalAmount: true, payment: { select: { status: true, amount: true } } },
      }),
      // Scoped to the same date/clinic/search filters as the rest of this
      // endpoint's KPIs, so it moves with the filters like everything else
      // (was previously a global, unfiltered snapshot).
      prisma.case.count({ where: { ...caseFilter, status: 'READY_TO_DISPATCH' } }),
      prisma.case.count({ where: { remake: true, ...caseFilter } }),
      prisma.case.groupBy({
        by: ['remakeReason'],
        where: { remake: true, remakeReason: { not: null }, ...caseFilter },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      // Turn Around Time / % On Time Delivery — cases DELIVERED in this range
      // (deliveredFilter), same reasoning as everything else in this section.
      prisma.case.findMany({
        where: deliveredFilter,
        select: { createdAt: true, deliveryDate: true, dueDate: true },
      }),
      // Delivered cases in this cohort, with their billed amount and payment
      // status — feeds both Total Case Value and Outstanding below. A case's
      // billed amount is payment.amount if a request/invoice exists, falling
      // back to case.totalAmount otherwise (matching the fallback used
      // everywhere else in the UI) — a delivered case that hasn't had payment
      // requested yet ("No Request Yet") still has a known billed value and
      // must count as both billed (Total Case Value) and unpaid (Outstanding),
      // or those two KPIs silently exclude cases nobody has invoiced yet.
      prisma.case.findMany({
        where: deliveredFilter,
        select: { totalAmount: true, payment: { select: { status: true, amount: true, amountReceived: true } } },
      }),
      // Units delivered — distinct from totalUnits (all cases in range regardless
      // of status); this is specifically the "Revenue vs Volume" delivered figure.
      prisma.case.aggregate({ where: deliveredFilter, _sum: { units: true } }),
    ]);

    const totalRevenue = cohortVerifiedPayments.reduce((s, p) => s + (p.amount || 0), 0);

    // Delivered Case Value = billed amount for every DELIVERED case in the
    // cohort, paid or not. Outstanding = the subset still unpaid (net of any
    // partial amountReceived). Both derived from the same deliveredCohortCases
    // list so they can never drift apart from each other.
    const UNPAID_STATUSES = ['PENDING', 'PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED'];
    let deliveredCaseValue = 0;
    let outstandingNetAmount = 0;
    let outstandingCount = 0;
    for (const c of deliveredCohortCases) {
      const billed = c.payment?.amount ?? c.totalAmount ?? 0;
      deliveredCaseValue += billed;
      const payStatus = c.payment?.status || 'PENDING';
      if (billed > 0 && UNPAID_STATUSES.includes(payStatus)) {
        outstandingNetAmount += billed - (c.payment?.amountReceived || 0);
        outstandingCount += 1;
      }
    }

    for (const p of trendPayments) {
      const d = new Date(p.verifiedAt);
      const bucket = trendBuckets.find(b => d >= b.start && d <= b.end);
      if (bucket) { bucket.revenue += p.amount || 0; bucket.cases += 1; }
    }
    const monthlyTrend = trendBuckets.map(({ label, revenue, cases }) => ({ month: label, revenue, cases }));

    const caseCountMap = Object.fromEntries(casesPerClinic.map(r => [r.clinicId, r._count.id]));
    const clinicRevMap = {};
    for (const p of cohortVerifiedPayments) {
      const cid = p.case?.clinicId;
      if (!cid) continue;
      if (!clinicRevMap[cid]) clinicRevMap[cid] = { revenue: 0, paidCases: 0 };
      clinicRevMap[cid].revenue   += p.amount || 0;
      clinicRevMap[cid].paidCases += 1;
    }
    const clinicUnitsMap = {};
    for (const c of casesByWorkType) {
      if (!c.clinicId || !c.units) continue;
      clinicUnitsMap[c.clinicId] = (clinicUnitsMap[c.clinicId] || 0) + c.units;
    }
    const revenueByClinic = allClinics.map(c => ({
      id: c.id, name: c.name,
      revenue:    clinicRevMap[c.id]?.revenue    || 0,
      paidCases:  clinicRevMap[c.id]?.paidCases  || 0,
      totalCases: caseCountMap[c.id]             || 0,
      totalUnits: clinicUnitsMap[c.id]           || 0,
    })).sort((a, b) => b.revenue - a.revenue);

    const workTypeMap = {};
    let totalUnits = 0;
    // Total Case Value (Financial Projection) — expected/billed value across
    // EVERY case in the selected range regardless of status, unlike
    // deliveredCaseValue above which is delivered-only. Same billed-amount
    // fallback (payment.amount, else case.totalAmount) as everywhere else.
    let totalCaseValue = 0;
    for (const c of casesByWorkType) {
      const wt = c.workType || 'Other';
      if (!workTypeMap[wt]) workTypeMap[wt] = { count: 0, revenue: 0, units: 0 };
      workTypeMap[wt].count += 1;
      workTypeMap[wt].units += c.units || 0;
      totalUnits += c.units || 0;
      if (c.payment?.status === 'VERIFIED' && c.payment?.amount) {
        workTypeMap[wt].revenue += c.payment.amount;
      }
      totalCaseValue += c.payment?.amount ?? c.totalAmount ?? 0;
    }
    const revenueByWorkType = Object.entries(workTypeMap)
      .map(([workType, d]) => ({ workType, count: d.count, revenue: d.revenue, units: d.units }))
      .sort((a, b) => b.revenue - a.revenue);

    // Average turnaround days + on-time delivery %
    let avgTurnaroundDays = null;
    let onTimeDeliveryPct = null;
    if (deliveredCasesData.length > 0) {
      const turnarounds = deliveredCasesData.map(c => {
        const msPerDay = 1000 * 60 * 60 * 24;
        return (new Date(c.deliveryDate) - new Date(c.createdAt)) / msPerDay;
      });
      avgTurnaroundDays = Math.round(turnarounds.reduce((s, d) => s + d, 0) / turnarounds.length);

      const withDueDate = deliveredCasesData.filter(c => c.dueDate);
      if (withDueDate.length > 0) {
        const onTime = withDueDate.filter(c => new Date(c.deliveryDate) <= new Date(c.dueDate)).length;
        onTimeDeliveryPct = Math.round((onTime / withDueDate.length) * 100);
      }
    }

    const mostCommonRemakeReason = remakeReasonGroups.length > 0
      ? remakeReasonGroups[0].remakeReason
      : null;

    const result = {
      kpi: {
        totalRevenue, totalCases, totalUnits, activeCases, deliveredCases, otherCases, deliveredOfCreated, pendingPayments,
        readyToDispatch, totalRemakes, mostCommonRemakeReason,
        avgTurnaroundDays, onTimeDeliveryPct,
        totalCaseValue, deliveredCaseValue,
        outstandingCount: outstandingCount,
        outstandingAmount: outstandingNetAmount,
        unitsDelivered: unitsDeliveredAgg._sum.units || 0,
      },
      monthlyTrend,
      revenueByClinic,
      revenueByWorkType,
      clinicList: allClinics,
    };

    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[admin-analytics]', err);
    res.status(500).json({ error: 'Could not load analytics.' });
  }
});

// ── GET /api/dashboard/lab-performance ────────────────────
// Individual scan-activity metrics per lab technician, across the whole
// roster — see backend/src/utils/scanAttribution.js for how a scan is
// matched back to an account. Scans that don't match anyone (e.g. a
// renamed/removed employee) are counted separately rather than silently
// dropped. A tech's own self-service equivalent (their own data only, plus
// an actual scan-by-scan list) is GET /api/lab/my-performance.
router.get('/lab-performance', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { from, to } = req.query;
    const cacheKey = `dashboard:lab-performance:${from || ''}:${to || ''}`;
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const dateTo = to ? endOfDay(to) : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
    const dateFrom = from ? startOfDay(from) : new Date(new Date().getFullYear(), 0, 1);

    const [techs, stages] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'LAB_TECH' },
        select: { id: true, name: true, isActive: true, departments: true },
        orderBy: { name: 'asc' },
      }),
      prisma.caseStage.findMany({
        where: { scannedAt: { gte: dateFrom, lte: dateTo }, scannedBy: { not: null } },
        select: { scannedBy: true, scannedAt: true, caseId: true },
      }),
    ]);

    // Exact-name lookup — case-insensitive-trim, since a tech's display
    // name is what's embedded in the string and typed once at account setup.
    // Some accounts are shared/department-style logins (e.g. "Scanning")
    // that can get deactivated and recreated when staff changes — if two
    // accounts ever share a name, an inactive one must never win this slot
    // over an active one, or every historical scan for that name silently
    // collapses onto the wrong (often defunct) account.
    const byName = new Map();
    for (const t of techs) {
      const key = t.name.trim().toLowerCase();
      const existing = byName.get(key);
      if (!existing || (!existing.isActive && t.isActive)) byName.set(key, t);
    }

    const perTech = new Map(techs.map(t => [t.id, {
      id: t.id, name: t.name, isActive: t.isActive, departments: t.departments,
      totalScans: 0, cases: new Set(), deptCounts: {}, dailyCounts: {}, lastActiveAt: null,
    }]));
    let unattributedScans = 0;

    for (const s of stages) {
      const m = SCAN_PATTERN.exec(s.scannedBy || '');
      if (!m) continue; // not a department scan (status change, dispatch action, "System", etc.)
      const [, rawName, short] = m;
      const tech = byName.get(rawName.trim().toLowerCase());
      if (!tech) { unattributedScans++; continue; }

      const agg = perTech.get(tech.id);
      agg.totalScans++;
      agg.cases.add(s.caseId);
      agg.deptCounts[short] = (agg.deptCounts[short] || 0) + 1;
      const day = localDayKey(s.scannedAt);
      agg.dailyCounts[day] = (agg.dailyCounts[day] || 0) + 1;
      if (!agg.lastActiveAt || s.scannedAt > agg.lastActiveAt) agg.lastActiveAt = s.scannedAt;
    }

    const result = {
      range: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      unattributedScans,
      techs: [...perTech.values()].map(t => {
        const departmentBreakdown = Object.entries(t.deptCounts)
          .map(([code, count]) => ({ code, label: DEPT_SHORT_LABELS[code] || code, count }))
          .sort((a, b) => b.count - a.count);
        const activeDays = Object.keys(t.dailyCounts).length;
        return {
          id: t.id,
          name: t.name,
          isActive: t.isActive,
          departments: t.departments,
          totalScans: t.totalScans,
          uniqueCases: t.cases.size,
          departmentBreakdown,
          busiestDept: departmentBreakdown[0]?.label || null,
          activeDays,
          avgPerActiveDay: activeDays > 0 ? Math.round((t.totalScans / activeDays) * 10) / 10 : 0,
          dailyCounts: t.dailyCounts,
          lastActiveAt: t.lastActiveAt,
        };
      }).sort((a, b) => b.totalScans - a.totalScans),
    };

    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[lab-performance]', err);
    res.status(500).json({ error: 'Could not load lab performance.' });
  }
});

// ── GET /api/dashboard/clinic-balances ──────────────────
// Per-clinic outstanding payment totals for Finance dashboard
router.get('/clinic-balances', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  const cacheKey = 'payments:clinic-balances';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const payments = await prisma.payment.findMany({
      where: {
        status: { in: ['PENDING', 'PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED'] },
        amount: { gt: 0 },   // only include cases where a non-zero amount is set
        // Outstanding excludes in-progress cases — only unpaid balances on
        // DELIVERED cases count as outstanding.
        case: { status: 'DELIVERED' },
      },
      select: {
        id: true, status: true, amount: true, amountReceived: true, updatedAt: true,
        case: {
          select: {
            id: true, caseNumber: true, patientName: true, workType: true, units: true, dueDate: true, deliveryDate: true, createdAt: true,
            clinic: { select: { id: true, name: true, isExcluded: true } },
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
    });

    const clinicMap = {};
    for (const p of payments) {
      const clinic = p.case?.clinic;
      if (!clinic) continue;
      const remaining = (p.amount || 0) - (p.amountReceived || 0); // still owed, after any partial collection
      if (!clinicMap[clinic.id]) {
        clinicMap[clinic.id] = {
          id: clinic.id, name: clinic.name, isExcluded: clinic.isExcluded,
          pendingCount: 0, pendingAmount: 0, cases: [],
        };
      }
      clinicMap[clinic.id].pendingCount++;
      clinicMap[clinic.id].pendingAmount += remaining;
      clinicMap[clinic.id].cases.push({
        caseId: p.case.id, caseNumber: p.case.caseNumber,
        patientName: p.case.patientName, workType: p.case.workType,
        units: p.case.units, dueDate: p.case.dueDate,
        deliveryDate: p.case.deliveryDate, createdAt: p.case.createdAt,
        paymentStatus: p.status, amount: remaining, amountReceived: p.amountReceived || 0, updatedAt: p.updatedAt,
      });
    }

    const balances = Object.values(clinicMap)
      .sort((a, b) => b.pendingAmount - a.pendingAmount);

    await appCache.set(cacheKey, balances);
    res.json(balances);
  } catch (err) {
    console.error('[clinic-balances]', err);
    res.status(500).json({ error: 'Could not load clinic balances.' });
  }
});

// ── GET /api/dashboard/trusted-partners-summary ──────────
// Per-clinic aggregated stats for trusted partner (isExcluded) clinics
router.get('/trusted-partners-summary', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_AP'), async (req, res) => {
  const cacheKey = 'payments:trusted-summary';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const clinics = await prisma.clinic.findMany({
      where: { isExcluded: true, isActive: true },
      select: {
        id: true, name: true, phone: true, address: true,
        billingCycle: true, billingAnchor: true, lastBilledAt: true,
        cases: {
          select: {
            id: true, status: true, units: true, createdAt: true,
            payment: { select: { status: true, amount: true, amountReceived: true } }
          }
        }
      },
      orderBy: { name: 'asc' },
    });

    // Compute the next bill date from cycle + anchor + lastBilledAt (or createdAt baseline)
    const computeNextBill = (cycle, anchor, lastBilledAt) => {
      if (!cycle || cycle === 'NONE' || cycle === 'CUSTOM') return null;
      const base = lastBilledAt ? new Date(lastBilledAt) : new Date();
      const next = new Date(base);
      if (cycle === 'WEEKLY')      next.setDate(base.getDate() + 7);
      else if (cycle === 'FORTNIGHTLY') next.setDate(base.getDate() + 14);
      else if (cycle === 'MONTHLY') {
        next.setMonth(base.getMonth() + 1);
        if (anchor != null) next.setDate(Math.min(anchor, 28));
      }
      return next;
    };

    // "In Progress" = actively being worked in the lab (excludes pre-lab pickup
    // statuses and terminal states so the count is meaningful for clinic reports)
    const IN_PROGRESS_STATUSES = new Set([
      'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
      'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
      'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
      'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
      'READY_TO_DISPATCH','OUT_FOR_DELIVERY',
    ]);

    const summary = clinics.map(clinic => {
      const cases = clinic.cases;
      const totalOrders     = cases.length;
      const totalUnits      = cases.reduce((s, c) => s + (c.units || 0), 0);
      const deliveredOrders = cases.filter(c => c.status === 'DELIVERED').length;
      const inProgress      = cases.filter(c => IN_PROGRESS_STATUSES.has(c.status)).length;
      const totalRevenue    = cases.reduce((s, c) => s + (c.payment?.amount || 0), 0);
      // Paid so far = full amount for VERIFIED cases + any partial amountReceived
      // collected on cases still awaiting the rest of their balance.
      const paymentsReceived = cases.reduce((s, c) => {
        if (c.payment?.status === 'VERIFIED') return s + (c.payment?.amount || 0);
        return s + (c.payment?.amountReceived || 0);
      }, 0);
      // Only count outstanding where an amount has actually been set — cases
      // with no payment amount yet would inflate the count with Br 0 entries.
      // Outstanding = what's still owed (full amount minus any partial collected),
      // exclusive of in-progress cases — only unpaid balances on DELIVERED cases count.
      const outstandingCases = cases.filter(c => c.status === 'DELIVERED' && c.payment?.status !== 'VERIFIED' && c.payment?.amount);
      const outstanding      = outstandingCases.reduce((s, c) => s + (c.payment.amount - (c.payment.amountReceived || 0)), 0);
      const outstandingCount = outstandingCases.length;

      // Aging — days since the oldest unpaid case was created
      const oldestOutstanding = outstandingCases.reduce(
        (oldest, c) => (!oldest || new Date(c.createdAt) < new Date(oldest) ? c.createdAt : oldest), null);
      const oldestAgeDays = oldestOutstanding
        ? Math.floor((Date.now() - new Date(oldestOutstanding).getTime()) / 86_400_000)
        : 0;

      const nextBillDate = computeNextBill(clinic.billingCycle, clinic.billingAnchor, clinic.lastBilledAt);
      const billOverdue  = nextBillDate ? nextBillDate < new Date() : false;

      return {
        id: clinic.id, name: clinic.name, phone: clinic.phone, address: clinic.address,
        totalOrders, totalUnits, deliveredOrders, inProgress,
        totalRevenue, paymentsReceived, outstanding, outstandingCount, oldestAgeDays,
        billingCycle: clinic.billingCycle || 'NONE', billingAnchor: clinic.billingAnchor,
        lastBilledAt: clinic.lastBilledAt, nextBillDate, billOverdue,
      };
    }).filter(c => c.totalOrders > 0)
      .sort((a, b) => b.outstanding - a.outstanding);

    await appCache.set(cacheKey, summary);
    res.json(summary);
  } catch (err) {
    console.error('[trusted-partners-summary]', err);
    res.status(500).json({ error: 'Could not load trusted partners summary.' });
  }
});

// ── POST /api/dashboard/run-workflow-test ─────────────────
// End-to-end workflow test: creates a real test case, walks it through every
// stage, verifies status at each step, then cleans up. ADMIN only.
router.post('/run-workflow-test', protect, restrict('ADMIN'), async (req, res) => {
  const steps = [];
  let caseId = null;

  const pass = (step, detail = '') => steps.push({ step, status: 'PASS', detail });
  const fail = (step, detail)       => steps.push({ step, status: 'FAIL', detail });

  const check = async (step, fn) => {
    try {
      const result = await fn();
      pass(step, result || '');
      return true;
    } catch (err) {
      fail(step, err.message || String(err));
      return false;
    }
  };

  // Fixed IDs from real DB
  const CLINIC_ID   = '8928d9b4-01c2-44f3-87f8-7309294217b6';
  const DELIVERY_ID = '96399573-4007-4440-b24b-d480668914ff';
  const FINANCE_ID  = 'cf8068a4-58cf-4ead-b23b-0272087870ab';
  const WORK_TYPE   = 'Full Contoured Zirconia';

  try {

    // ── STEP 1: Create phone order (dispatch) ────────────────
    await check('1. Create phone order (PENDING_PICKUP)', async () => {
      const c = await prisma.case.create({
        data: {
          caseNumber:   null,
          patientName:  'TEST PATIENT - WORKFLOW',
          workType:     WORK_TYPE,
          clinicId:     CLINIC_ID,
          status:       'PENDING_PICKUP',
          deliveryType: 'NORMAL',
          dueDate:      new Date(Date.now() + 5 * 86400000),
        }
      });
      caseId = c.id;
      await prisma.payment.create({ data: { caseId, status: 'PENDING' } });
      await prisma.caseStage.create({ data: { caseId, stageName: 'PENDING_PICKUP', scannedBy: 'TEST', notes: 'Workflow test order' } });
      if (c.status !== 'PENDING_PICKUP') throw new Error(`Expected PENDING_PICKUP, got ${c.status}`);
      if (c.caseNumber !== null) throw new Error('caseNumber should be null before acceptance');
      return `Case created id=${caseId}`;
    });

    // ── STEP 2: Dispatch assigns pickup driver ───────────────
    await check('2. Assign pickup driver → PICKUP_ASSIGNED', async () => {
      await prisma.case.update({ where: { id: caseId }, data: { assignedDeliveryId: DELIVERY_ID, status: 'PICKUP_ASSIGNED' } });
      const c = await prisma.case.findUnique({ where: { id: caseId } });
      if (c.status !== 'PICKUP_ASSIGNED') throw new Error(`Expected PICKUP_ASSIGNED, got ${c.status}`);
      if (!c.assignedDeliveryId) throw new Error('assignedDeliveryId should be set');
      return 'Driver assigned';
    });

    // ── STEP 3: Driver marks impression collected (clears driver) ──
    await check('3. Driver collects impression → PICKUP_ASSIGNED + no driver (arrived at lab)', async () => {
      await prisma.case.update({ where: { id: caseId }, data: { assignedDeliveryId: null } });
      await prisma.caseStage.create({ data: { caseId, stageName: 'PICKUP_ASSIGNED', scannedBy: 'TEST_DRIVER', notes: 'Impression arrived at lab — awaiting receptionist acceptance' } });
      const c = await prisma.case.findUnique({ where: { id: caseId } });
      if (c.status !== 'PICKUP_ASSIGNED') throw new Error(`Status should stay PICKUP_ASSIGNED, got ${c.status}`);
      if (c.assignedDeliveryId !== null) throw new Error('assignedDeliveryId should be cleared (null)');
      return 'arrivedAtLab condition: PICKUP_ASSIGNED + assignedDeliveryId=null ✓';
    });

    // ── STEP 4: Receptionist accepts → CASE_ACCEPTED + scan number ──
    await check('4. Receptionist accepts → CASE_ACCEPTED + scan number generated', async () => {
      // Generate case number
      const yy = String(new Date().getFullYear()).slice(-2);
      const prefix = `YDL${yy}`;
      const last = await prisma.case.findFirst({ where: { caseNumber: { startsWith: prefix } }, orderBy: { caseNumber: 'desc' }, select: { caseNumber: true } });
      const lastNum = last ? parseInt(last.caseNumber.slice(prefix.length), 10) || 0 : 0;
      const caseNumber = `${prefix}${String(lastNum + 1).padStart(6, '0')}`;

      await prisma.case.update({
        where: { id: caseId },
        data: { status: 'CASE_ACCEPTED', caseNumber, shade: 'A2', doctorName: 'Dr. Test', doctorPhone: '+251 900 000 000', workType: WORK_TYPE, totalAmount: 2500, dueDate: new Date(Date.now() + 5 * 86400000) }
      });
      await prisma.caseStage.create({ data: { caseId, stageName: 'CASE_ACCEPTED', scannedBy: 'TEST_RECEPTION', notes: 'Accepted by receptionist' } });

      const c = await prisma.case.findUnique({ where: { id: caseId } });
      if (c.status !== 'CASE_ACCEPTED')    throw new Error(`Expected CASE_ACCEPTED, got ${c.status}`);
      if (!c.caseNumber)                   throw new Error('caseNumber should be assigned on acceptance');
      if (c.shade !== 'A2')                throw new Error('shade not saved');
      if (c.totalAmount !== 2500)          throw new Error('totalAmount not saved');
      return `caseNumber=${c.caseNumber}, shade=${c.shade}, amount=Br ${c.totalAmount}`;
    });

    // ── STEP 5: Lab stages (abbreviated — plaster → milling → QC) ──
    const labStages = ['PLASTER_DEPARTMENT', 'SCANNING', 'DESIGNING', 'MILLING_SINTERING', 'QUALITY_CHECK'];
    for (const stage of labStages) {
      await check(`5. Lab stage: ${stage}`, async () => {
        await prisma.case.update({ where: { id: caseId }, data: { status: stage } });
        await prisma.caseStage.create({ data: { caseId, stageName: stage, scannedBy: 'TEST_LAB', notes: `Test stage: ${stage}` } });
        const c = await prisma.case.findUnique({ where: { id: caseId } });
        if (c.status !== stage) throw new Error(`Expected ${stage}, got ${c.status}`);
        return `Status = ${stage}`;
      });
    }

    // ── STEP 6: QC → auto-advance to READY_TO_DISPATCH ─────
    await check('6. QC auto-advance → READY_TO_DISPATCH', async () => {
      // Simulate what scan.js does
      await prisma.case.update({ where: { id: caseId }, data: { status: 'READY_TO_DISPATCH' } });
      await prisma.caseStage.create({ data: { caseId, stageName: 'QUALITY_CHECK', scannedBy: 'TEST_QC', notes: 'QC passed' } });
      await prisma.caseStage.create({ data: { caseId, stageName: 'READY_TO_DISPATCH', scannedBy: 'System', notes: 'QC passed — moved to dispatch queue' } });
      const c = await prisma.case.findUnique({ where: { id: caseId }, include: { payment: true } });
      if (c.status !== 'READY_TO_DISPATCH') throw new Error(`Expected READY_TO_DISPATCH, got ${c.status}`);
      if (c.payment?.status === 'VERIFIED') throw new Error('Payment should NOT be verified yet — should be in Ready for Delivery tab');
      return `Status=READY_TO_DISPATCH, paymentStatus=${c.payment?.status} → appears in 'Ready for Delivery' (awaiting payment) ✓`;
    });

    // ── STEP 7: Finance requests payment ────────────────────
    await check('7. Finance requests payment → PAYMENT_REQUESTED', async () => {
      await prisma.payment.update({ where: { caseId }, data: { status: 'PAYMENT_REQUESTED', amount: 2500 } });
      await prisma.case.update({ where: { id: caseId }, data: { paymentStatus: 'PAYMENT_REQUESTED' } });
      const c = await prisma.case.findUnique({ where: { id: caseId } });
      if (c.paymentStatus !== 'PAYMENT_REQUESTED') throw new Error(`Expected PAYMENT_REQUESTED, got ${c.paymentStatus}`);
      return 'Payment requested, amount=Br 2500';
    });

    // ── STEP 8: Finance verifies payment → VERIFIED ─────────
    await check('8. Finance verifies payment → VERIFIED (moves to Ready for Dispatch)', async () => {
      await prisma.payment.update({ where: { caseId }, data: { status: 'VERIFIED', verifiedAt: new Date(), verifiedById: FINANCE_ID, invoiceNumber: `INV-${caseId.slice(0,8)}` } });
      await prisma.case.update({ where: { id: caseId }, data: { paymentStatus: 'VERIFIED' } });
      const c = await prisma.case.findUnique({ where: { id: caseId }, include: { payment: true } });
      if (c.paymentStatus !== 'VERIFIED')           throw new Error(`Case paymentStatus should be VERIFIED, got ${c.paymentStatus}`);
      if (c.payment?.status !== 'VERIFIED')         throw new Error(`Payment.status should be VERIFIED, got ${c.payment?.status}`);
      if (c.status !== 'READY_TO_DISPATCH')         throw new Error(`Status should stay READY_TO_DISPATCH, got ${c.status}`);
      return `paymentStatus=VERIFIED, invoiceNumber=${c.payment?.invoiceNumber} → now in 'Ready for Dispatch' ✓`;
    });

    // ── STEP 9: Dispatch assigns delivery driver → OUT_FOR_DELIVERY ──
    await check('9. Dispatch sends out → OUT_FOR_DELIVERY + driver assigned', async () => {
      await prisma.case.update({ where: { id: caseId }, data: { status: 'OUT_FOR_DELIVERY', assignedDeliveryId: DELIVERY_ID } });
      await prisma.caseStage.create({ data: { caseId, stageName: 'OUT_FOR_DELIVERY', scannedBy: 'TEST_DISPATCH', notes: 'Dispatched to delivery driver' } });
      const c = await prisma.case.findUnique({ where: { id: caseId } });
      if (c.status !== 'OUT_FOR_DELIVERY') throw new Error(`Expected OUT_FOR_DELIVERY, got ${c.status}`);
      if (!c.assignedDeliveryId) throw new Error('Driver should be assigned');
      return 'Case OUT_FOR_DELIVERY, driver assigned';
    });

    // ── STEP 10: Delivery driver marks delivered ─────────────
    await check('10. Delivery staff marks delivered → DELIVERED', async () => {
      const now = new Date();
      await prisma.case.update({ where: { id: caseId }, data: { status: 'DELIVERED', deliveryDate: now } });
      await prisma.caseStage.create({ data: { caseId, stageName: 'DELIVERED', scannedBy: 'TEST_DRIVER', notes: 'Delivered to clinic' } });
      try {
        await prisma.deliveryLog.create({ data: { caseId, deliveryById: DELIVERY_ID, deliveredAt: now } });
      } catch (_) {} // DeliveryLog may have pickedUpAt NOT NULL — ignore if schema requires it
      const c = await prisma.case.findUnique({ where: { id: caseId } });
      if (c.status !== 'DELIVERED') throw new Error(`Expected DELIVERED, got ${c.status}`);
      if (!c.deliveryDate) throw new Error('deliveryDate should be set');
      return `Status=DELIVERED, deliveryDate=${format(c.deliveryDate, 'dd MMM yyyy HH:mm')}`;
    });

    // ── STEP 11: Final state verification ───────────────────
    await check('11. Final state audit', async () => {
      const c = await prisma.case.findUnique({
        where: { id: caseId },
        include: { payment: true, stages: { orderBy: { scannedAt: 'asc' } } }
      });
      const checks = [
        ['status=DELIVERED',             c.status === 'DELIVERED'],
        ['caseNumber assigned',          !!c.caseNumber],
        ['shade set',                    !!c.shade],
        ['totalAmount set',              c.totalAmount === 2500],
        ['paymentStatus=VERIFIED',       c.paymentStatus === 'VERIFIED'],
        ['payment.status=VERIFIED',      c.payment?.status === 'VERIFIED'],
        ['deliveryDate set',             !!c.deliveryDate],
        ['stage count >= 10',            c.stages.length >= 10],
      ];
      const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
      if (failed.length) throw new Error(`Failed checks: ${failed.join(', ')}`);
      return `All ${checks.length} final checks passed. Stage history has ${c.stages.length} entries.`;
    });

  } finally {
    // ── CLEANUP: delete test case and related records ────────
    if (caseId) {
      try {
        await prisma.$transaction([
          prisma.caseStage.deleteMany({ where: { caseId } }),
          prisma.deliveryLog.deleteMany({ where: { caseId } }),
          prisma.payment.deleteMany({ where: { caseId } }),
          prisma.case.delete({ where: { id: caseId } }),
        ]);
        pass('12. Cleanup', 'Test case and all related records deleted');
      } catch (err) {
        fail('12. Cleanup', err.message);
      }
    }
  }

  const passed = steps.filter(s => s.status === 'PASS').length;
  const failed = steps.filter(s => s.status === 'FAIL').length;
  const allPassed = failed === 0;

  res.json({
    result: allPassed ? '✅ ALL TESTS PASSED' : `❌ ${failed} TEST(S) FAILED`,
    summary: `${passed} passed, ${failed} failed out of ${steps.length} steps`,
    steps,
  });
});

// helper used inside test
function format(date, fmt) {
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return fmt
    .replace('dd',   pad(d.getDate()))
    .replace('MMM',  ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()])
    .replace('yyyy', d.getFullYear())
    .replace('HH',   pad(d.getHours()))
    .replace('mm',   pad(d.getMinutes()));
}

module.exports = router;
