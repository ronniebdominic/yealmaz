// Ye-Almaz — Lab Tech Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/lab/active — cases currently in production
router.get('/active', protect, async (req, res) => {
  try {
    const cases = await prisma.case.findMany({
      where: {
        status: {
          notIn: ['DELIVERED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'ON_HOLD', 'CANCELLED']
        }
      },
      include: {
        clinic: { select: { name: true } },
        stages: { orderBy: { scannedAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch cases.' });
  }
});

// GET /api/lab/case/:caseId — case details for QR scan result
router.get('/case/:caseId', protect, async (req, res) => {
  try {
    const c = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: {
        clinic: { select: { name: true } },
        stages: { orderBy: { scannedAt: 'desc' } }
      }
    });
    if (!c) return res.status(404).json({ error: 'Case not found.' });
    res.json(c);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch case.' });
  }
});

module.exports = router;
