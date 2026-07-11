// Ye-Almaz — Lab Tech Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache } = require('../cache');

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

module.exports = router;
