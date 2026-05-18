// Ye-Almaz — Lab Tech Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
const { appCache } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/lab/active — cases currently in production
router.get('/active', protect, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `lab:active:${page}:${limit}`;
  const cached = appCache.get(cacheKey);
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
    appCache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch cases.' });
  }
});

// GET /api/lab/case/:caseId — case details for QR scan result
router.get('/case/:caseId', protect, async (req, res) => {
  const cacheKey = `case:lab:${req.params.caseId}`;
  const cached = appCache.get(cacheKey);
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
    appCache.set(cacheKey, c, 30);
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch case.' });
  }
});

module.exports = router;
