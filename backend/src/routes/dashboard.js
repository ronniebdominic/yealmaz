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
      prisma.case.count({ where: { status: { in: ['RECEIVED', 'IMPRESSION', 'CASTING', 'FABRICATION', 'QUALITY_CHECK'] } } }),
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
      'RECEIVED', 'IMPRESSION', 'CASTING', 'FABRICATION',
      'QUALITY_CHECK', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'
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

module.exports = router;
