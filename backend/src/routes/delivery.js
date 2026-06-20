// Ye-Almaz — Delivery Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');

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

    const where = {
      ...(isDeliveryExec ? { assignedDeliveryId: req.user.id } : {}),
      OR: [
        { status: { in: ['PICKUP_ASSIGNED', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] } },
        { status: 'DELIVERED', deliveryLogs: { some: { deliveredAt: { gte: todayStart } } } }
      ]
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

// ── POST /api/delivery/:caseId/collect-impression ────────
// Delivery exec confirms impression collected from clinic → case enters production
router.post('/:caseId/collect-impression', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (caseData.status !== 'PICKUP_ASSIGNED') {
      return res.status(400).json({ error: 'Case is not in PICKUP_ASSIGNED status.' });
    }

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'CASE_ACCEPTED', assignedDeliveryId: null }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'CASE_ACCEPTED',
        scannedBy: req.user.name,
        notes: 'Impression collected from clinic — case handed to lab'
      }
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'delivery:*', 'dispatch:queue', 'dashboard:summary');

    const io = req.app.get('io');
    io.to('lab_staff').emit('new_case', {
      caseId: caseData.id, caseNumber: caseData.caseNumber,
      patientName: caseData.patientName, workType: caseData.workType,
      message: 'Impression received — ready for production'
    });
    io.to(`clinic_${caseData.clinicId}`).emit('case_updated', {
      caseId: caseData.id, caseNumber: caseData.caseNumber,
      status: 'CASE_ACCEPTED', message: 'Impression received at lab — production started!'
    });

    sendPushToClinic(prisma, caseData.clinicId, {
      title: '🏭 Impression Received at Lab',
      body: `Case ${caseData.caseNumber} (${caseData.patientName}) impression received. Production has started!`,
      data: { caseId: caseData.id, caseNumber: caseData.caseNumber, screen: 'CaseDetail' },
    });

    res.json({ success: true, message: 'Impression collected. Case entered production.' });
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

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'delivery:*', 'dashboard:summary', 'dashboard:analytics:*');

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
