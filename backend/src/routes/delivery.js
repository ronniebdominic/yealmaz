// Ye-Almaz — Delivery Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/delivery/assigned ───────────────────────────
// Delivery guy sees cases ready to dispatch or already picked up
router.get('/assigned', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const cases = await prisma.case.findMany({
      where: {
        OR: [
          // Active cases: ready to pick up or already en route (payment must be verified)
          {
            status: { in: ['READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'] },
            paymentStatus: 'PENDING'
          },
          // Today's completed deliveries (for the Delivered tab)
          {
            status: 'DELIVERED',
            deliveryLogs: { some: { deliveredAt: { gte: todayStart } } }
          }
        ]
      },
      include: {
        clinic: { select: { name: true, address: true, phone: true } },
        payment: true,
        deliveryLogs: { orderBy: { deliveredAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'asc' }
    });

    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch delivery cases.' });
  }
});

// ── POST /api/delivery/:caseId/pickup ────────────────────
// Delivery guy confirms pickup
router.post('/:caseId/pickup', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });

    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (caseData.paymentStatus !== 'VERIFIED') {
      return res.status(403).json({ error: 'Cannot pick up — payment not verified.' });
    }

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'OUT_FOR_DELIVERY' }
    });

    await prisma.deliveryLog.create({
      data: {
        caseId: req.params.caseId,
        deliveryById: req.user.id,
        pickedUpAt: new Date()
      }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'OUT_FOR_DELIVERY',
        scannedBy: req.user.name,
        notes: 'Picked up for delivery'
      }
    });

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinicId}`).emit('case_updated', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      status: 'OUT_FOR_DELIVERY',
      message: 'Your case is out for delivery!'
    });

    res.json({ success: true, message: 'Pickup confirmed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not confirm pickup.' });
  }
});

// ── POST /api/delivery/:caseId/deliver ───────────────────
// Delivery guy confirms delivery
router.post('/:caseId/deliver', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { notes } = req.body;

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'DELIVERED' }
    });

    await prisma.deliveryLog.updateMany({
      where: { caseId: req.params.caseId, deliveredAt: null },
      data: { deliveredAt: new Date(), notes }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'DELIVERED',
        scannedBy: req.user.name,
        notes: notes || 'Delivered successfully'
      }
    });

    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinicId}`).emit('case_updated', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      status: 'DELIVERED',
      message: 'Your case has been delivered!'
    });
    io.to('lab_staff').emit('case_delivered', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber
    });

    res.json({ success: true, message: 'Delivery confirmed.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not confirm delivery.' });
  }
});

module.exports = router;
