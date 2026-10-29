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
// Points scale with the work (rate x units) for the work types in rewardRates.js; anything else earns the flat per-case
// amount. Remakes/redos are free re-work, so they earn nothing extra.
function computePoints(caseInfo, flat) {
  const work = (caseInfo.remake || caseInfo.isRedo) ? null : pointsForWork(caseInfo.workType, caseInfo.units);
  return work ? { pts: work.points, work } : { pts: flat, work: null };
}

async function awardCasePoints(clinicId, caseId, caseNumber, caseInfo = {}) {
  const setting = await prisma.rewardSetting.findFirst();
  const { pts, work } = computePoints(caseInfo, setting?.pointsPerCase ?? 10);
  const description = work
    ? `Case submitted — ${caseNumber} (${work.qty} ${work.perUnit}${work.qty > 1 ? 's' : ''} × ${work.rate} pts, ${work.label})`
    : `Case submitted — ${caseNumber}`;
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

// ── POST /api/rewards/recalculate ─────────────────────────
// Brings points awarded BEFORE points were tied to acceptance in line with the rule: a case earns its points once the lab has
// accepted it, worked out from the case as accepted. Earlier, points were paid on submission from whatever units the clinic
// typed. Each past case-earning is compared with what the case earns now:
//   - not yet accepted by the lab -> its points are taken back and held (they are awarded when it is accepted)
//   - accepted, but the clinic's units/work type differ from what the lab recorded -> corrected to the lab's figures
// Body { apply: true } writes it; anything else only previews. Points a clinic has already redeemed are never taken back:
// a clinic's total is not reduced below what it has spent, and the shortfall is reported instead. Running it again changes nothing.
const HELD_STATUSES = new Set(['PENDING_PICKUP', 'PICKUP_ASSIGNED', 'UNDER_REVIEW', 'REJECTED']);
router.post('/recalculate', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const apply = req.body?.apply === true;
    const setting = await prisma.rewardSetting.findFirst();
    const flat = setting?.pointsPerCase ?? 10;

    const txns = await prisma.rewardTransaction.findMany({
      where: { type: 'EARN', caseId: { not: null } },
      include: {
        case: { select: { caseNumber: true, status: true, workType: true, units: true, remake: true, isRedo: true } },
        clinic: { select: { name: true } },
      },
    });

    const changes = [];
    for (const t of txns) {
      const c = t.case;
      if (!c) continue;
      const held = (HELD_STATUSES.has(c.status) && !c.caseNumber) || c.status === 'CANCELLED';
      const after = held ? 0 : computePoints(c, flat).pts;
      if (!held && after === t.points) continue;
      changes.push({ txn: t, clinicId: t.clinicId, clinicName: t.clinic?.name || '', caseNumber: c.caseNumber, status: c.status, workType: c.workType, units: c.units, before: t.points, after, held });
    }

    const byClinic = new Map();
    for (const ch of changes) {
      if (!byClinic.has(ch.clinicId)) byClinic.set(ch.clinicId, { clinicId: ch.clinicId, clinicName: ch.clinicName, cases: [], delta: 0 });
      const g = byClinic.get(ch.clinicId);
      g.cases.push(ch); g.delta += ch.after - ch.before;
    }
    const pointRows = await prisma.clinicPoints.findMany({ where: { clinicId: { in: [...byClinic.keys()] } } });
    const pointsOf = new Map(pointRows.map(r => [r.clinicId, r]));

    const clinics = [];
    for (const g of byClinic.values()) {
      const row = pointsOf.get(g.clinicId) || { totalEarned: 0, totalRedeemed: 0 };
      const wanted = row.totalEarned + g.delta;
      const newEarned = Math.max(wanted, row.totalRedeemed); // never below what the clinic has already spent
      clinics.push({
        clinicId: g.clinicId, clinicName: g.clinicName, cases: g.cases.length,
        earnedBefore: row.totalEarned, earnedAfter: newEarned, redeemed: row.totalRedeemed,
        availableBefore: row.totalEarned - row.totalRedeemed, availableAfter: newEarned - row.totalRedeemed,
        shortfall: Math.max(row.totalRedeemed - wanted, 0),
      });
    }

    if (apply) {
      for (const g of byClinic.values()) {
        const k = clinics.find(x => x.clinicId === g.clinicId);
        await prisma.$transaction(async (tx) => {
          for (const ch of g.cases) {
            await tx.rewardTransaction.update({
              where: { id: ch.txn.id },
              data: ch.held
                ? { type: 'PENDING', points: 0, description: `Case submitted${ch.caseNumber ? ` — ${ch.caseNumber}` : ''} (points are added when the lab accepts it)` }
                : { points: ch.after, description: `${ch.txn.description} — corrected from ${ch.before} to ${ch.after} pts to match the case as the lab accepted it` },
            });
          }
          await tx.clinicPoints.upsert({ where: { clinicId: g.clinicId }, update: { totalEarned: k.earnedAfter }, create: { clinicId: g.clinicId, totalEarned: k.earnedAfter, totalRedeemed: 0 } });
        }, { timeout: 60_000 });
      }
      await invalidate('rewards:clinic:*');
    }

    const removed = changes.filter(c => c.after < c.before).reduce((n, c) => n + (c.before - c.after), 0);
    const added = changes.filter(c => c.after > c.before).reduce((n, c) => n + (c.after - c.before), 0);
    res.json({
      applied: apply,
      summary: {
        casesChecked: txns.length, casesChanged: changes.length,
        casesHeldUntilAccepted: changes.filter(c => c.held).length,
        pointsRemoved: removed, pointsAdded: added,
        clinicsAffected: clinics.length, clinicsWithShortfall: clinics.filter(c => c.shortfall > 0).length,
      },
      clinics: clinics.sort((a, b) => (a.earnedAfter - a.earnedBefore) - (b.earnedAfter - b.earnedBefore)),
      cases: changes
        .sort((a, b) => (a.after - a.before) - (b.after - b.before))
        .slice(0, 300)
        .map(({ txn, ...c }) => c),
    });
  } catch (err) {
    console.error('[rewards recalculate]', err);
    res.status(500).json({ error: 'Could not recalculate the points. Nothing further was changed.' });
  }
});

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
module.exports.computePoints = computePoints;
