// Ye-Almaz — Milling Crown-Yield Bonus Routes
// Caseless by design: one sintering blank can yield crowns for several
// different cases in one firing, and the per-case scan flow (scan.js) has
// no batch/blank concept linking them. A lab tech logs blank -> crown
// yield as an independent event here, not tied to any case.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

async function getBonusSetting() {
  let s = await prisma.millingBonusSetting.findFirst();
  if (!s) s = await prisma.millingBonusSetting.create({ data: {} });
  return s;
}

// ── POST /api/milling/yield ───────────────────────────────
router.post('/yield', protect, restrict('LAB_TECH', 'ADMIN'), async (req, res) => {
  try {
    const { blanksUsed, crownsProduced } = req.body;
    const crowns = parseInt(crownsProduced);
    if (!crowns || crowns <= 0) return res.status(400).json({ error: 'crownsProduced is required and must be greater than zero.' });
    const blanks = blanksUsed ? parseInt(blanksUsed) : 1;

    const setting = await getBonusSetting();
    const bonusPoints = crowns > setting.minCrownsPerBlank
      ? (crowns - setting.minCrownsPerBlank) * setting.pointsPerExtraCrown
      : 0;

    const yieldRecord = await prisma.millingYield.create({
      data: { userId: req.user.id, blanksUsed: blanks, crownsProduced: crowns, bonusPoints },
    });

    if (bonusPoints > 0) {
      await prisma.staffPoints.upsert({
        where: { userId: req.user.id },
        create: { userId: req.user.id, totalEarned: bonusPoints },
        update: { totalEarned: { increment: bonusPoints } },
      });
      await prisma.staffRewardTransaction.create({
        data: {
          userId: req.user.id,
          points: bonusPoints,
          description: `Milling yield bonus — ${crowns} crowns from ${blanks} blank${blanks > 1 ? 's' : ''}`,
          sourceYieldId: yieldRecord.id,
        },
      });
      await invalidate('milling:leaderboard');
    }

    res.status(201).json({ yield: yieldRecord, bonusAwarded: bonusPoints > 0, bonusPoints });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not record milling yield.' });
  }
});

// ── GET /api/milling/settings ─────────────────────────────
router.get('/settings', protect, async (req, res) => {
  try {
    res.json(await getBonusSetting());
  } catch (err) {
    res.status(500).json({ error: 'Could not load milling bonus settings.' });
  }
});

// ── PUT /api/milling/settings ─────────────────────────────
router.put('/settings', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { minCrownsPerBlank, pointsPerExtraCrown } = req.body;
    const setting = await getBonusSetting();
    const updated = await prisma.millingBonusSetting.update({
      where: { id: setting.id },
      data: {
        minCrownsPerBlank: minCrownsPerBlank != null ? parseInt(minCrownsPerBlank) : setting.minCrownsPerBlank,
        pointsPerExtraCrown: pointsPerExtraCrown != null ? parseInt(pointsPerExtraCrown) : setting.pointsPerExtraCrown,
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update milling bonus settings.' });
  }
});

// ── GET /api/milling/leaderboard ──────────────────────────
router.get('/leaderboard', protect, restrict('ADMIN'), async (req, res) => {
  const cacheKey = 'milling:leaderboard';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const points = await prisma.staffPoints.findMany({
      include: { user: { select: { id: true, name: true } } },
      orderBy: { totalEarned: 'desc' },
    });
    await appCache.set(cacheKey, points);
    res.json(points);
  } catch (err) {
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

// ── GET /api/milling/yields ────────────────────────────────
router.get('/yields', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { from, to, userId } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); where.createdAt.lte = d; }
    }
    const yields = await prisma.millingYield.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(yields);
  } catch (err) {
    res.status(500).json({ error: 'Could not load yield history.' });
  }
});

module.exports = router;
