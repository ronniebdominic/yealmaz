// Ye-Almaz — Delivery Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');
const { buildAgentNameMaps, matchDeliveryAgent } = require('../utils/deliveryAttribution');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/delivery/assigned ───────────────────────────
router.get('/assigned', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  // DELIVERY role sees only their own assigned cases; ADMIN sees all
  const isDeliveryExec = req.user.role === 'DELIVERY';
  const cacheKey = `delivery:assigned:${isDeliveryExec ? req.user.id : 'admin'}:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // "Delivered today" used to be matched via DeliveryLog, but that table
    // is barely populated in practice (see utils/deliveryAttribution.js) —
    // attribute via today's CaseStage 'DELIVERED' rows instead, same as
    // the archive/performance endpoints. Note this can't just join onto
    // the `assignedDeliveryId` filter below: that column is cleared back
    // to null the moment a case is delivered, so it's resolved as its own
    // explicit case-ID list instead.
    const [agents, todayStages] = await Promise.all([
      prisma.user.findMany({ where: { role: 'DELIVERY' }, select: { id: true, name: true, isActive: true } }),
      prisma.caseStage.findMany({
        where: { stageName: 'DELIVERED', scannedAt: { gte: todayStart } },
        select: { scannedBy: true, notes: true, caseId: true },
      }),
    ]);
    const nameMaps = buildAgentNameMaps(agents);
    const todaysDeliveredCaseIds = [];
    for (const s of todayStages) {
      const agent = matchDeliveryAgent(s.scannedBy, s.notes, nameMaps);
      if (agent && (!isDeliveryExec || agent.id === req.user.id)) todaysDeliveredCaseIds.push(s.caseId);
    }

    const where = {
      OR: [
        {
          ...(isDeliveryExec ? { assignedDeliveryId: req.user.id } : {}),
          status: { in: ['PICKUP_ASSIGNED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] },
        },
        { status: 'DELIVERED', id: { in: todaysDeliveredCaseIds } },
      ],
    };

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic: { select: { code: true, name: true, station: true, address: true, phone: true } },
          payment: true,
          deliveryLogs: { orderBy: { deliveredAt: 'desc' }, take: 1 }
        },
        orderBy: { updatedAt: 'asc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.case.count({ where })
    ]);

    const result = { cases, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } };
    await appCache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch delivery cases.' });
  }
});

// ── GET /api/delivery/history ────────────────────────────
// A delivery agent's own full delivery archive — GET /assigned only ever
// shows today's completed deliveries (it's a live working board), so
// anything from a prior day is otherwise invisible to the person who
// delivered it. Matched via CaseStage, not DeliveryLog.deliveryById — see
// utils/deliveryAttribution.js for why. Case.deliveryDate (set on every
// DELIVERED case regardless of DeliveryLog) is used for the displayed/
// filtered date rather than the delivery log's own timestamp.
router.get('/history', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, from, to, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const isDeliveryExec = req.user.role === 'DELIVERY';
    const targetUserId = isDeliveryExec ? req.user.id : (userId || null);

    // Scoped to one agent (always true for a DELIVERY login; optional for
    // ADMIN via ?userId=) — resolve which case IDs have a 'DELIVERED'
    // stage attributable to them. Scanning every historical stage row is
    // the same cost /lab-performance and /delivery-performance already
    // pay; scoped by the same from/to the caller applied to the case list
    // (scannedAt tracks deliveryDate closely — both are written in the
    // same request) to keep it bounded for a narrow date filter.
    let attributedCaseIds = null;
    if (targetUserId) {
      const stageWhere = { stageName: 'DELIVERED', scannedBy: { not: null } };
      if (from || to) {
        stageWhere.scannedAt = {};
        if (from) stageWhere.scannedAt.gte = new Date(`${from}T00:00:00`);
        if (to) { const d = new Date(`${to}T00:00:00`); d.setHours(23, 59, 59, 999); stageWhere.scannedAt.lte = d; }
      }
      const [agents, stages] = await Promise.all([
        prisma.user.findMany({ where: { role: 'DELIVERY' }, select: { id: true, name: true, isActive: true } }),
        prisma.caseStage.findMany({ where: stageWhere, select: { scannedBy: true, notes: true, caseId: true } }),
      ]);
      const nameMaps = buildAgentNameMaps(agents);
      attributedCaseIds = [];
      for (const s of stages) {
        const agent = matchDeliveryAgent(s.scannedBy, s.notes, nameMaps);
        if (agent && agent.id === targetUserId) attributedCaseIds.push(s.caseId);
      }
    }

    const caseWhere = {
      status: 'DELIVERED',
      ...(attributedCaseIds ? { id: { in: attributedCaseIds } } : {}),
      ...(from || to ? {
        deliveryDate: {
          ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
          ...(to ? { lte: (() => { const d = new Date(`${to}T00:00:00`); d.setHours(23, 59, 59, 999); return d; })() } : {}),
        },
      } : {}),
      ...(search ? {
        OR: [
          { caseNumber: { contains: search, mode: 'insensitive' } },
          { patientName: { contains: search, mode: 'insensitive' } },
          { clinic: { name: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    };

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where: caseWhere,
        include: { clinic: { select: { name: true, station: true } } },
        orderBy: { deliveryDate: 'desc' },
        skip, take: parseInt(limit),
      }),
      prisma.case.count({ where: caseWhere }),
    ]);

    res.json({ cases, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('[delivery history]', err);
    res.status(500).json({ error: 'Could not load delivery history.' });
  }
});

// ── POST /api/delivery/:caseId/collect-impression ────────
// Delivery exec confirms impression collected from clinic → case enters production
router.post('/:caseId/collect-impression', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (caseData.status !== 'PICKUP_ASSIGNED') {
      return res.status(400).json({ error: 'Case is not in PICKUP_ASSIGNED status.' });
    }

    // Keep status as PICKUP_ASSIGNED but clear the driver so:
    // - Delivery staff no longer see it (they filter by assignedDeliveryId = me)
    // - Receptionist sees it in "Arrived at Lab" group (PICKUP_ASSIGNED + no driver)
    // - Receptionist must explicitly Accept / Reject / Under Review before it enters production
    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { assignedDeliveryId: null }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'PICKUP_ASSIGNED',
        scannedBy: req.user.name,
        notes: 'Impression arrived at lab — awaiting receptionist acceptance'
      }
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'delivery:*', 'dispatch:queue', 'dashboard:summary');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_arrived', {
      caseId: caseData.id, caseNumber: caseData.caseNumber,
      patientName: caseData.patientName, workType: caseData.workType,
      message: 'Impression arrived — awaiting receptionist acceptance'
    });

    res.json({ success: true, message: 'Impression arrived at lab. Receptionist will review and accept.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not confirm impression collection.' });
  }
});

// ── POST /api/delivery/:caseId/pickup ────────────────────
router.post('/:caseId/pickup', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    await prisma.case.update({ where: { id: req.params.caseId }, data: { status: 'OUT_FOR_DELIVERY' } });
    await prisma.deliveryLog.create({
      data: { caseId: req.params.caseId, deliveryById: req.user.id, pickedUpAt: new Date() }
    });
    await prisma.caseStage.create({
      data: { caseId: req.params.caseId, stageName: 'OUT_FOR_DELIVERY', scannedBy: req.user.name, notes: 'Picked up for delivery' }
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'delivery:*', 'dashboard:summary');

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinicId}`).emit('case_updated', {
      caseId: caseData.id, caseNumber: caseData.caseNumber,
      status: 'OUT_FOR_DELIVERY', message: 'Your case is out for delivery!'
    });

    res.json({ success: true, message: 'Pickup confirmed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not confirm pickup.' });
  }
});

// ── POST /api/delivery/:caseId/deliver ───────────────────
router.post('/:caseId/deliver', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { notes } = req.body;

    const now = new Date();
    await prisma.case.update({ where: { id: req.params.caseId }, data: { status: 'DELIVERED', deliveryDate: now } });
    await prisma.deliveryLog.updateMany({
      where: { caseId: req.params.caseId, deliveredAt: null },
      data: { deliveredAt: now, notes }
    });
    await prisma.caseStage.create({
      data: { caseId: req.params.caseId, stageName: 'DELIVERED', scannedBy: req.user.name, notes: notes || 'Delivered successfully' }
    });

    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'payments:*', 'delivery:*', 'dashboard:summary', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinicId}`).emit('case_updated', {
      caseId: caseData.id, caseNumber: caseData.caseNumber,
      status: 'DELIVERED', message: 'Your case has been delivered!'
    });
    io.to('lab_staff').emit('case_delivered', { caseId: caseData.id, caseNumber: caseData.caseNumber });

    // Push notification to the clinic
    sendPushToClinic(prisma, caseData.clinicId, {
      title: '✅ Case Delivered',
      body: `Case ${caseData.caseNumber} (${caseData.patientName}) has been delivered successfully.`,
      data: { caseId: caseData.id, caseNumber: caseData.caseNumber, screen: 'CaseDetail' },
    });

    res.json({ success: true, message: 'Delivery confirmed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not confirm delivery.' });
  }
});

// ── POST /api/delivery/:caseId/return-to-pickup-queue ───
// Delivery staff could not collect impression from clinic.
// Returns to PENDING_PICKUP + clears driver so dispatch can reassign.
router.post('/:caseId/return-to-pickup-queue', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { reason = 'Could not collect impression — returned to pickup queue' } = req.body;
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'PENDING_PICKUP', assignedDeliveryId: null },
    });

    await prisma.caseStage.create({
      data: { caseId: req.params.caseId, stageName: 'PENDING_PICKUP', scannedBy: req.user.name, notes: reason },
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'delivery:*', 'dispatch:queue', 'dashboard:summary');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_updated', {
      caseId: caseData.id, caseNumber: caseData.caseNumber, status: 'PENDING_PICKUP',
      message: 'Driver could not collect — case returned to pickup queue for reassignment',
    });

    res.json({ success: true, message: 'Case returned to pickup queue. Dispatch can reassign a driver.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not return case to pickup queue.' });
  }
});

// ── POST /api/delivery/:caseId/return-to-dispatch ───────
// Called when delivery staff cannot pick up or deliver a case.
// Returns case to READY_TO_DISPATCH and clears the assigned driver so
// dispatch can see it and reassign.
router.post('/:caseId/return-to-dispatch', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { reason = 'Returned to dispatch queue by delivery staff' } = req.body;
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'READY_TO_DISPATCH', assignedDeliveryId: null },
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'READY_TO_DISPATCH',
        scannedBy: req.user.name,
        notes: reason,
      },
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'delivery:*', 'dispatch:queue', 'dashboard:summary');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_updated', { caseId: caseData.id, caseNumber: caseData.caseNumber, status: 'READY_TO_DISPATCH' });

    res.json({ success: true, message: 'Case returned to dispatch queue.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not return case to dispatch.' });
  }
});

module.exports = router;
