// Ye-Almaz — Dispatch Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/dispatch/stations ───────────────────────────
// All active cases (not delivered/cancelled) grouped by clinic — for dispatch & delivery overview
router.get('/stations', protect, restrict('DISPATCH', 'ADMIN', 'DELIVERY'), async (req, res) => {
  const cacheKey = 'dispatch:stations';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const cases = await prisma.case.findMany({
      where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      include: {
        clinic: { select: { id: true, code: true, name: true, station: true, address: true, phone: true } },
        assignedDelivery: { select: { id: true, name: true } },
      },
      orderBy: [{ clinic: { name: 'asc' } }, { dueDate: 'asc' }]
    });

    await appCache.set(cacheKey, cases, 30);
    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch stations.' });
  }
});

// ── GET /api/dispatch/executives ─────────────────────────
// Returns all active DELIVERY role users + their current load
router.get('/executives', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  try {
    const executives = await prisma.user.findMany({
      where: { role: 'DELIVERY', isActive: true },
      select: {
        id: true, name: true, email: true, phone: true,
        assignedDeliveries: {
          where: { status: { in: ['PICKUP_ASSIGNED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] } },
          select: { id: true, caseNumber: true, status: true, patientName: true, clinic: { select: { name: true } } }
        }
      },
      orderBy: { name: 'asc' }
    });
    res.json(executives);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch delivery executives.' });
  }
});

// ── GET /api/dispatch/queue ───────────────────────────────
// All cases in READY_TO_DISPATCH or OUT_FOR_DELIVERY
router.get('/queue', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  const cacheKey = 'dispatch:queue';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const cases = await prisma.case.findMany({
      where: {
        OR: [
          { status: { in: ['PENDING_PICKUP', 'PICKUP_ASSIGNED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] } },
          { status: 'DELIVERED', updatedAt: { gte: todayStart } }
        ]
      },
      include: {
        clinic: { select: { id: true, code: true, name: true, station: true, address: true, phone: true } },
        payment: { select: { status: true, amount: true } },
        assignedDelivery: { select: { id: true, name: true, email: true } },
        deliveryLogs: { orderBy: { deliveredAt: 'desc' }, take: 1 }
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'asc' }]
    });

    await appCache.set(cacheKey, cases, 15); // 15-second cache
    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch dispatch queue.' });
  }
});

// ── POST /api/dispatch/:caseId/assign ────────────────────
// Assign a delivery executive to a case
router.post('/:caseId/assign', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  const { executiveId } = req.body;
  if (!executiveId) return res.status(400).json({ error: 'executiveId is required.' });

  try {
    const executive = await prisma.user.findUnique({ where: { id: executiveId } });
    if (!executive || executive.role !== 'DELIVERY') {
      return res.status(400).json({ error: 'Invalid delivery executive.' });
    }

    const updated = await prisma.case.update({
      where: { id: req.params.caseId },
      data: { assignedDeliveryId: executiveId },
      include: {
        clinic: { select: { name: true } },
        assignedDelivery: { select: { id: true, name: true } }
      }
    });

    // Audit trail
    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: updated.status,
        scannedBy: req.user.name,
        notes: `Assigned to ${executive.name} by dispatch`
      }
    });

    await invalidate('dispatch:queue', 'dispatch:stations', 'delivery:*', `case:${req.params.caseId}`);

    // Notify delivery executive via socket
    const io = req.app.get('io');
    io.to(`delivery_${executiveId}`).emit('case_assigned', {
      caseId: updated.id,
      caseNumber: updated.caseNumber,
      message: `New case assigned: ${updated.caseNumber} — ${updated.patientName}`
    });

    // Push notification to the clinic
    sendPushToClinic(prisma, updated.clinicId, {
      title: '🚚 Delivery Partner Assigned',
      body: `Case ${updated.caseNumber} (${updated.patientName}) has been assigned to a delivery partner.`,
      data: { caseId: updated.id, caseNumber: updated.caseNumber, screen: 'CaseDetail' },
    });

    res.json({ success: true, case: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not assign case.' });
  }
});

// ── POST /api/dispatch/:caseId/unassign ──────────────────
// Remove assignment from a case
router.post('/:caseId/unassign', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  try {
    const prev = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { assignedDelivery: { select: { name: true } } }
    });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { assignedDeliveryId: null }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: prev.status,
        scannedBy: req.user.name,
        notes: `Unassigned from ${prev.assignedDelivery?.name || 'executive'} by dispatch`
      }
    });

    await invalidate('dispatch:queue', 'dispatch:stations', 'delivery:*', `case:${req.params.caseId}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not unassign case.' });
  }
});

// ── POST /api/dispatch/:caseId/assign-pickup ─────────────
// Assign a delivery executive to collect the impression from the clinic
router.post('/:caseId/assign-pickup', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  const { executiveId } = req.body;
  if (!executiveId) return res.status(400).json({ error: 'executiveId is required.' });

  try {
    const executive = await prisma.user.findUnique({ where: { id: executiveId } });
    if (!executive || executive.role !== 'DELIVERY') {
      return res.status(400).json({ error: 'Invalid delivery executive.' });
    }

    const updated = await prisma.case.update({
      where: { id: req.params.caseId },
      data: { assignedDeliveryId: executiveId, status: 'PICKUP_ASSIGNED' },
      include: {
        clinic: { select: { name: true } },
        assignedDelivery: { select: { id: true, name: true } }
      }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'PICKUP_ASSIGNED',
        scannedBy: req.user.name,
        notes: `Pickup assigned to ${executive.name} by dispatch`
      }
    });

    await invalidate('dispatch:queue', 'dispatch:stations', 'delivery:*', `case:${req.params.caseId}`);

    const io = req.app.get('io');
    io.to(`delivery_${executiveId}`).emit('case_assigned', {
      caseId: updated.id,
      caseNumber: updated.caseNumber,
      message: `Pickup assigned: ${updated.caseNumber} — collect impression from ${updated.clinic?.name}`
    });

    sendPushToClinic(prisma, updated.clinicId, {
      title: '🛵 Pickup Partner on the Way',
      body: `A delivery partner has been assigned to collect the impression for case ${updated.caseNumber} (${updated.patientName}).`,
      data: { caseId: updated.id, caseNumber: updated.caseNumber, screen: 'CaseDetail' },
    });

    res.json({ success: true, case: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not assign pickup.' });
  }
});

// ── GET /api/dispatch/summary ─────────────────────────────
// Lightweight stat counts for the Dispatch dashboard header cards
router.get('/summary', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalToday, readyToDispatch, enRoute, pendingPickup, deliveredToday] = await Promise.all([
      prisma.case.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.case.count({ where: { status: 'READY_TO_DISPATCH' } }),
      prisma.case.count({ where: { status: 'OUT_FOR_DELIVERY' } }),
      prisma.case.count({ where: { status: { in: ['PENDING_PICKUP', 'PICKUP_ASSIGNED'] } } }),
      prisma.case.count({ where: { status: 'DELIVERED', updatedAt: { gte: todayStart } } }),
    ]);

    res.json({ totalToday, readyToDispatch, enRoute, pendingPickup, deliveredToday });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load dispatch summary.' });
  }
});

// ── POST /api/dispatch/:caseId/send-out ──────────────────
// Assign a delivery executive + move READY_TO_DISPATCH → OUT_FOR_DELIVERY
router.post('/:caseId/send-out', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  const { executiveId } = req.body;
  if (!executiveId) return res.status(400).json({ error: 'executiveId is required.' });

  try {
    const executive = await prisma.user.findUnique({ where: { id: executiveId } });
    if (!executive || executive.role !== 'DELIVERY') {
      return res.status(400).json({ error: 'Invalid delivery executive.' });
    }

    const updated = await prisma.case.update({
      where: { id: req.params.caseId },
      data: { assignedDeliveryId: executiveId, status: 'OUT_FOR_DELIVERY' },
      include: {
        clinic: { select: { name: true, id: true } },
        assignedDelivery: { select: { id: true, name: true } },
      },
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'OUT_FOR_DELIVERY',
        scannedBy: req.user.name,
        notes: `Dispatched to ${executive.name} for delivery`,
      },
    });

    await invalidate('dispatch:queue', 'dispatch:stations', 'delivery:*', `case:${req.params.caseId}`, 'dashboard:summary');

    const io = req.app.get('io');
    io.to(`delivery_${executiveId}`).emit('case_assigned', {
      caseId: updated.id,
      caseNumber: updated.caseNumber,
      message: `Delivery assigned: ${updated.caseNumber} — deliver to ${updated.clinic?.name}`,
    });

    sendPushToClinic(prisma, updated.clinicId, {
      title: '🚚 Out for Delivery',
      body: `Case ${updated.caseNumber} (${updated.patientName}) is on its way to you.`,
      data: { caseId: updated.id, caseNumber: updated.caseNumber, screen: 'CaseDetail' },
    });

    res.json({ success: true, case: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not dispatch case.' });
  }
});

module.exports = router;
