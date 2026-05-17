// Ye-Almaz — Dashboard / Analytics Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/dashboard/summary ───────────────────────────
// Admin overview stats
router.get('/summary', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    const [
      totalCases,
      pendingCases,
      completedCases,
      activeCases,
      pendingPayments,
      thisMonthRevenue,
      lastMonthRevenue,
      recentCases
    ] = await Promise.all([
      prisma.case.count(),
      prisma.case.count({ where: { status: { notIn: ['DELIVERED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'ON_HOLD', 'CANCELLED'] } } }),
      prisma.case.count({ where: { status: 'DELIVERED' } }),
      prisma.case.count({ where: { status: { in: ['READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] } } }),
      prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
      prisma.payment.aggregate({
        where: { status: 'VERIFIED', verifiedAt: { gte: startOfMonth } },
        _sum: { amount: true }
      }),
      prisma.payment.aggregate({
        where: { status: 'VERIFIED', verifiedAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        _sum: { amount: true }
      }),
      prisma.case.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { clinic: { select: { name: true } }, payment: true }
      })
    ]);

    const thisMonthAmt = thisMonthRevenue._sum.amount || 0;
    const lastMonthAmt = lastMonthRevenue._sum.amount || 0;
    const revenueGrowth = lastMonthAmt > 0
      ? (((thisMonthAmt - lastMonthAmt) / lastMonthAmt) * 100).toFixed(1)
      : null;

    res.json({
      stats: {
        totalCases,
        pendingCases,
        completedCases,
        activeCases,
        pendingPayments,
        thisMonthRevenue: thisMonthAmt,
        lastMonthRevenue: lastMonthAmt,
        revenueGrowth
      },
      recentCases
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

// ── GET /api/dashboard/revenue ───────────────────────────
// Monthly revenue for chart (last 6 months)
router.get('/revenue', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const result = await prisma.payment.aggregate({
        where: { status: 'VERIFIED', verifiedAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true
      });

      months.push({
        month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: result._sum.amount || 0,
        cases: result._count
      });
    }

    res.json(months);
  } catch (err) {
    res.status(500).json({ error: 'Could not load revenue data.' });
  }
});

// ── GET /api/dashboard/cases-by-status ──────────────────
router.get('/cases-by-status', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
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

    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Could not load case stats.' });
  }
});

// ── GET /api/dashboard/admin-analytics ──────────────────
// Full analytics for the admin dashboard
// Query params: from, to (ISO date strings), clinicId
router.get('/admin-analytics', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { from, to, clinicId } = req.query;
    const dateFrom = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1); // default: start of year
    const dateTo   = to   ? new Date(to)   : new Date();

    const paymentWhere = {
      status: 'VERIFIED',
      verifiedAt: { gte: dateFrom, lte: dateTo },
    };

    const caseWhere = {
      ...(clinicId ? { clinicId } : {}),
    };

    // ── Overall KPIs ────────────────────────────────────────
    const [totalRevenue, totalCases, activeCases, deliveredCases, pendingPayments] = await Promise.all([
      prisma.payment.aggregate({
        where: { ...paymentWhere, ...(clinicId ? { case: { clinicId } } : {}) },
        _sum: { amount: true },
      }),
      prisma.case.count({ where: caseWhere }),
      prisma.case.count({ where: { ...caseWhere, status: { notIn: ['DELIVERED', 'ON_HOLD', 'CANCELLED'] } } }),
      prisma.case.count({ where: { ...caseWhere, status: 'DELIVERED' } }),
      prisma.payment.count({ where: { status: 'SCREENSHOT_UPLOADED' } }),
    ]);

    // ── Monthly revenue trend (12 months ending at dateTo) ──
    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(dateTo);
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const agg = await prisma.payment.aggregate({
        where: {
          status: 'VERIFIED',
          verifiedAt: { gte: start, lte: end },
          ...(clinicId ? { case: { clinicId } } : {}),
        },
        _sum: { amount: true },
        _count: true,
      });
      monthlyTrend.push({
        month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: agg._sum.amount || 0,
        cases: agg._count,
      });
    }

    // ── Revenue by clinic ────────────────────────────────────
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const revenueByClinic = await Promise.all(
      clinics.map(async (c) => {
        const agg = await prisma.payment.aggregate({
          where: {
            ...paymentWhere,
            case: { clinicId: c.id },
          },
          _sum: { amount: true },
          _count: true,
        });
        const caseCount = await prisma.case.count({ where: { clinicId: c.id } });
        return {
          id: c.id,
          name: c.name,
          revenue: agg._sum.amount || 0,
          paidCases: agg._count,
          totalCases: caseCount,
        };
      })
    );

    // ── Revenue by work type (product category) ─────────────
    const allCases = await prisma.case.findMany({
      where: caseWhere,
      select: { workType: true, totalAmount: true, payment: { select: { status: true, amount: true } } },
    });

    const workTypeMap = {};
    for (const c of allCases) {
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

    // ── Top performing clinics (by revenue) ──────────────────
    const topClinics = [...revenueByClinic]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    res.json({
      kpi: {
        totalRevenue: totalRevenue._sum.amount || 0,
        totalCases,
        activeCases,
        deliveredCases,
        pendingPayments,
      },
      monthlyTrend,
      revenueByClinic: revenueByClinic.sort((a, b) => b.revenue - a.revenue),
      revenueByWorkType,
      topClinics,
      clinicList: clinics,
    });
  } catch (err) {
    console.error('[admin-analytics]', err);
    res.status(500).json({ error: 'Could not load analytics.' });
  }
});

module.exports = router;
