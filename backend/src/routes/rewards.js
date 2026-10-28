// Ye-Almaz — Rewards System Routes
const express = require('express');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { pointsForWork, listRates } = require('../services/rewardRates');

const router = express.Router();
const prisma = require('../db');

// ── Helper: upsert clinic points record ──────────────────
async function ensureClinicPoints(clinicId) {
  return prisma.clinicPoints.upsert({
    where: { clinicId },
    create: { clinicId, totalEarned: 0, totalRedeemed: 0 },
    update: {},
  });
}

// ── Helper: award points for a case ──────────────────────
async function awardCasePoints(clinicId, caseId, caseNumber, caseInfo = {}) {
  // Points scale with the work (rate x units) for the work types in rewardRates.js; anything else
  // earns the flat per-case amount. Remakes/redos are free re-work, so they earn nothing extra.
  const work = (caseInfo.remake || caseInfo.isRedo) ? null : pointsForWork(caseInfo.workType, caseInfo.units);
  let pts, description;
  if (work) {
    pts = work.points;
    description = `Case submitted — ${caseNumber} (${work.qty} ${work.perUnit}${work.qty > 1 ? 's' : ''} × ${work.rate} pts, ${work.label})`;
  } else {
    const setting = await prisma.rewardSetting.findFirst();
    pts = setting?.pointsPerCase ?? 10;
    description = `Case submitted — ${caseNumber}`;
  }
  if (pts <= 0) return;
  await ensureClinicPoints(clinicId);
  await prisma.clinicPoints.update({
    where: { clinicId },
    data: { totalEarned: { increment: pts } },
  });
  await prisma.rewardTransaction.create({
    data: {
      clinicId,
      caseId,
      type: 'EARN',
      points: pts,
      description,
    },
  });
  await invalidate(`rewards:clinic:${clinicId}`);
}

// Points are not earned when a clinic SUBMITS a case — the clinic types the units, so that let a clinic claim any number of
// units and be paid in points before anyone at the lab had looked at the case. A submission leaves a zero-point marker; the
// points are worked out from the case as the lab accepted it (its corrected work type and units) when it is accepted.
async function holdCasePoints(clinicId, caseId, caseNumber) {
  await prisma.rewardTransaction.create({
    data: { clinicId, caseId, type: 'PENDING', points: 0, description: `Case submitted${caseNumber ? ` — ${caseNumber}` : ''} (points are added when the lab accepts it)` },
  });
}

async function releaseCasePoints(caseId) {
  const held = await prisma.rewardTransaction.findFirst({ where: { caseId, type: 'PENDING' } });
  if (!held) return; // not a clinic submission, or already released
  const claimed = await prisma.rewardTransaction.deleteMany({ where: { id: held.id } }); // only one caller gets to release it
  if (claimed.count === 0) return;
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clinicId: true, caseNumber: true, workType: true, units: true, remake: true, isRedo: true } });
  if (c) await awardCasePoints(c.clinicId, caseId, c.caseNumber, c);
}

// ── GET /api/rewards/rates ────────────────────────────────
// How points are earned, for the clinic app and the admin Rewards page.
router.get('/rates', protect, async (req, res) => {
  try {
    const setting = await prisma.rewardSetting.findFirst();
    res.json({ rates: listRates(), flatPerCase: setting?.pointsPerCase ?? 10 });
  } catch (err) {
    res.status(500).json({ error: 'Could not load reward rates.' });
  }
});
// ── GET /api/rewards/settings ─────────────────────────────
router.get('/settings', protect, async (req, res) => {
  try {
    let s = await prisma.rewardSetting.findFirst();
    if (!s) s = await prisma.rewardSetting.create({ data: {} });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: 'Could not load settings.' });
  }
});

// ── PUT /api/rewards/settings ────────────────────────────
router.put('/settings', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { pointsPerCase } = req.body;
    if (pointsPerCase == null || parseInt(pointsPerCase) < 0)
      return res.status(400).json({ error: 'pointsPerCase must be ≥ 0.' });
    let s = await prisma.rewardSetting.findFirst();
    if (!s) {
      s = await prisma.rewardSetting.create({ data: { pointsPerCase: parseInt(pointsPerCase) } });
    } else {
      s = await prisma.rewardSetting.update({ where: { id: s.id }, data: { pointsPerCase: parseInt(pointsPerCase) } });
    }
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: 'Could not update settings.' });
  }
});

// ── GET /api/rewards/items ────────────────────────────────
router.get('/items', protect, async (req, res) => {
  try {
    const where = req.user.role === 'ADMIN' ? {} : { isActive: true };
    const items = await prisma.rewardItem.findMany({ where, orderBy: { pointsCost: 'asc' } });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Could not load reward items.' });
  }
});

// ── POST /api/rewards/items ───────────────────────────────
router.post('/items', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, description, pointsCost } = req.body;
    if (!name || !pointsCost) return res.status(400).json({ error: 'name and pointsCost are required.' });
    const item = await prisma.rewardItem.create({
      data: { name: name.trim(), description: description?.trim() || null, pointsCost: parseInt(pointsCost) },
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Could not create reward item.' });
  }
});

// ── PATCH /api/rewards/items/:id ──────────────────────────
router.patch('/items/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, description, pointsCost, isActive } = req.body;
    const data = {};
    if (name       !== undefined) data.name        = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (pointsCost  !== undefined) data.pointsCost  = parseInt(pointsCost);
    if (isActive    !== undefined) data.isActive    = isActive;
    const item = await prisma.rewardItem.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Could not update reward item.' });
  }
});

// ── DELETE /api/rewards/items/:id ─────────────────────────
router.delete('/items/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    await prisma.rewardItem.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete reward item.' });
  }
});

// ── GET /api/rewards/my ───────────────────────────────────
router.get('/my', protect, restrict('CLINIC'), async (req, res) => {
  const cacheKey = `rewards:clinic:${req.user.id}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    await ensureClinicPoints(req.user.id);
    const [points, transactions, redemptions] = await Promise.all([
      prisma.clinicPoints.findUnique({ where: { clinicId: req.user.id } }),
      prisma.rewardTransaction.findMany({
        where: { clinicId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.rewardRedemption.findMany({
        where: { clinicId: req.user.id },
        include: { rewardItem: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const result = {
      totalEarned:   points?.totalEarned   ?? 0,
      totalRedeemed: points?.totalRedeemed ?? 0,
      available:    (points?.totalEarned ?? 0) - (points?.totalRedeemed ?? 0),
      transactions,
      redemptions,
    };
    await appCache.set(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load rewards.' });
  }
});

// ── POST /api/rewards/redeem ──────────────────────────────
router.post('/redeem', protect, restrict('CLINIC'), async (req, res) => {
  try {
    const { rewardItemId } = req.body;
    if (!rewardItemId) return res.status(400).json({ error: 'rewardItemId is required.' });
    const item = await prisma.rewardItem.findUnique({ where: { id: rewardItemId } });
    if (!item || !item.isActive) return res.status(404).json({ error: 'Reward not found or inactive.' });
    await ensureClinicPoints(req.user.id);

    // The balance check and the deduction are ONE conditional update. Checking first and deducting afterwards let several
    // requests sent together all pass the check, so one balance bought the same reward several times over.
    const redemption = await prisma.$transaction(async (tx) => {
      const taken = await tx.$executeRaw`UPDATE clinic_points SET "totalRedeemed" = "totalRedeemed" + ${item.pointsCost}
        WHERE "clinicId" = ${req.user.id} AND "totalEarned" - "totalRedeemed" >= ${item.pointsCost}`;
      if (taken === 0) return null;
      const created = await tx.rewardRedemption.create({
        data: { clinicId: req.user.id, rewardItemId, pointsSpent: item.pointsCost, status: 'PENDING' },
        include: { rewardItem: { select: { name: true } } },
      });
      await tx.rewardTransaction.create({
        data: { clinicId: req.user.id, type: 'REDEEM', points: -item.pointsCost, description: `Redeemed: ${item.name}` },
      });
      return created;
    });
    if (!redemption) {
      const points = await prisma.clinicPoints.findUnique({ where: { clinicId: req.user.id } });
      const available = (points?.totalEarned ?? 0) - (points?.totalRedeemed ?? 0);
      return res.status(400).json({ error: `Not enough points. Need ${item.pointsCost}, have ${available}.` });
    }
    await invalidate(`rewards:clinic:${req.user.id}`);
    res.status(201).json(redemption);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not process redemption.' });
  }
});

// ── GET /api/rewards/leaderboard ──────────────────────────
router.get('/leaderboard', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const points = await prisma.clinicPoints.findMany({
      include: { clinic: { select: { id: true, name: true, code: true } } },
      orderBy: { totalEarned: 'desc' },
    });
    res.json(points);
  } catch (err) {
    res.status(500).json({ error: 'Could not load leaderboard.' });
  }
});

// ── GET /api/rewards/redemptions ──────────────────────────
router.get('/redemptions', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { status } = req.query;
    const redemptions = await prisma.rewardRedemption.findMany({
      where: status ? { status } : {},
      include: {
        clinic: { select: { id: true, name: true } },
        rewardItem: { select: { name: true, pointsCost: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(redemptions);
  } catch (err) {
    res.status(500).json({ error: 'Could not load redemptions.' });
  }
});

// ── PATCH /api/rewards/redemptions/:id ────────────────────
router.patch('/redemptions/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status))
      return res.status(400).json({ error: 'status must be APPROVED or REJECTED.' });

    const redemption = await prisma.rewardRedemption.findUnique({ where: { id: req.params.id } });
    if (!redemption) return res.status(404).json({ error: 'Redemption not found.' });
    if (redemption.status !== 'PENDING') return res.status(400).json({ error: 'Already processed.' });

    const updated = await prisma.rewardRedemption.update({
      where: { id: req.params.id },
      data: { status, adminNote: adminNote || null },
      include: { rewardItem: { select: { name: true } } },
    });

    // If rejected, refund points
    if (status === 'REJECTED') {
      await prisma.clinicPoints.update({
        where: { clinicId: redemption.clinicId },
        data: { totalRedeemed: { decrement: redemption.pointsSpent } },
      });
      await prisma.rewardTransaction.create({
        data: {
          clinicId:    redemption.clinicId,
          type:        'EARN',
          points:      redemption.pointsSpent,
          description: `Refund: redemption rejected`,
        },
      });
    }
    await invalidate(`rewards:clinic:${redemption.clinicId}`);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update redemption.' });
  }
});

module.exports = router;
module.exports.awardCasePoints = awardCasePoints;
module.exports.holdCasePoints = holdCasePoints;
module.exports.releaseCasePoints = releaseCasePoints;
