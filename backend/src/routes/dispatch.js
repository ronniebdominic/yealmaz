// Ye-Almaz — Dispatch Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');

const router = express.Router();
const prisma = new PrismaClient();

// Fallback due-date calculator (mirrors the one in cases.js)
async function getDueDays(workType) {
  try {
    const rec = await prisma.workTypePrice.findUnique({ where: { workType }, select: { durationDays: true } });
    if (rec?.durationDays) return rec.durationDays;
  } catch (_) {}
  const w = (workType || '').toLowerCase();
  if (w.includes('coping') || w.includes('zirconia')) return 4;
  if (w.includes('aligner') || w.includes('ceramic') || w.includes('emax')) return 6;
  return 5;
}

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
        clinic: { select: { id: true, code: true, name: true, station: true, zone: { select: { id: true, name: true } }, address: true, phone: true } },
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
        id: true, name: true, email: true, phone: true, station: true,
        zone: { select: { id: true, name: true } },
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
        clinic: { select: { id: true, code: true, name: true, station: true, zone: { select: { id: true, name: true } }, address: true, phone: true, isExcluded: true } },
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

// ── GET /api/dispatch/milling ────────────────────────────
// Cases currently at the Milling / Sintering stage — informational heads-up
// so dispatch knows what's coming down the pipeline before it hits QC/delivery.
router.get('/milling', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  const cacheKey = 'dispatch:milling';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const cases = await prisma.case.findMany({
      where: { status: 'MILLING_SINTERING' },
      include: {
        clinic: { select: { id: true, code: true, name: true } },
        stages: { where: { stageName: 'MILLING_SINTERING' }, orderBy: { scannedAt: 'desc' }, take: 1 }
      },
      orderBy: { dueDate: 'asc' }
    });

    await appCache.set(cacheKey, cases, 20);
    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch milling cases.' });
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

// ── POST /api/dispatch/:caseId/self-dropoff ──────────────
// Clinic brings the impression to the lab themselves — no delivery partner
// needed. Moves the case straight to the same "arrived at lab, awaiting
// receptionist acceptance" state a driver-delivered pickup reaches after
// delivery.js's /collect-impression (PICKUP_ASSIGNED + no assigned driver),
// so it shows up in Reception's existing "Arrived at Lab" queue unchanged.
router.post('/:caseId/self-dropoff', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.caseId }, include: { clinic: { select: { name: true } } } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });
    if (existing.status !== 'PENDING_PICKUP') {
      return res.status(400).json({ error: 'Case is not awaiting pickup.' });
    }

    const updated = await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'PICKUP_ASSIGNED', assignedDeliveryId: null },
      include: { clinic: { select: { name: true } } },
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'PICKUP_ASSIGNED',
        scannedBy: req.user.name,
        notes: `Self drop-off by ${existing.clinic?.name || 'clinic'} — no delivery partner assigned`,
      }
    });

    await invalidate('dispatch:queue', 'dispatch:stations', 'delivery:*', `case:${req.params.caseId}`, 'cases:*', 'dashboard:summary');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_arrived', {
      caseId: updated.id, caseNumber: updated.caseNumber,
      patientName: updated.patientName, workType: updated.workType,
      message: `${existing.clinic?.name || 'Clinic'} dropped off the impression directly — awaiting receptionist acceptance`
    });

    res.json({ success: true, case: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not record self drop-off.' });
  }
});

// ── POST /api/dispatch/phone-order ──────────────────────────
// Dispatcher creates a new case from a telephonic call.
// clinicId OR (clinicName + clinicPhone) must be provided.
// No mandatory shade/doctor validation — that is done by receptionist on acceptance.
// caseNumber is NOT generated here — assigned by receptionist when they accept.
router.post('/phone-order', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  try {
    const {
      clinicId, clinicName, clinicPhone, clinicAddress,
      patientName, workType, doctorName, doctorPhone, notes,
      assignToExecutiveId, deliveryType, selfDropOff,
    } = req.body;

    const resolvedDeliveryType = deliveryType === 'EXPRESS' ? 'EXPRESS' : 'NORMAL';

    // patientName is filled in by the receptionist when accepting the case;
    // dispatcher only needs to provide clinic info for the pickup.

    // Resolve or create clinic
    let resolvedClinicId = clinicId;
    if (!resolvedClinicId) {
      if (!clinicName?.trim()) return res.status(400).json({ error: 'Clinic name is required when clinic is not selected.' });
      // Create a minimal clinic record (no login / email required)
      const newClinic = await prisma.clinic.create({
        data: {
          name:     clinicName.trim(),
          phone:    clinicPhone  || null,
          address:  clinicAddress || null,
          email:    `phone-order-${Date.now()}@yealmaz.internal`,
          password: 'PHONE_ORDER_NO_LOGIN',
          isActive: true,
        },
      });
      resolvedClinicId = newClinic.id;
      await invalidate('clinics');
    }

    const autoDays = workType ? await getDueDays(workType) : 5;
    const dueDate  = new Date();
    dueDate.setDate(dueDate.getDate() + autoDays);

    // Self drop-off skips a delivery partner entirely — lands straight in the
    // same "arrived at lab, no driver" state Reception's Accept queue already
    // watches for, same as assign-pickup + collect-impression combined.
    const status = (selfDropOff || assignToExecutiveId) ? 'PICKUP_ASSIGNED' : 'PENDING_PICKUP';

    const newCase = await prisma.case.create({
      data: {
        caseNumber:  null, // assigned by receptionist on acceptance
        patientName: patientName.trim(),
        workType:    workType || 'TBD',
        doctorName:  doctorName || null,
        doctorPhone: doctorPhone || null,
        notes:       notes || null,
        dueDate,
        deliveryType: resolvedDeliveryType,
        clinicId:    resolvedClinicId,
        status,
        ...(!selfDropOff && assignToExecutiveId ? { assignedDeliveryId: assignToExecutiveId } : {}),
      },
      include: { clinic: { select: { name: true, phone: true, address: true } } },
    });

    await prisma.caseStage.create({
      data: {
        caseId:    newCase.id,
        stageName: status,
        scannedBy: req.user.name,
        notes:     `Phone order placed by dispatcher${resolvedDeliveryType === 'EXPRESS' ? ' — ⚡ Express' : ''}${selfDropOff ? ' — self drop-off by clinic' : assignToExecutiveId ? ' — pickup assigned' : ''}`,
      },
    });

    await prisma.payment.create({
      data: { caseId: newCase.id, status: 'PENDING' },
    });

    await invalidate('cases:*', 'dispatch:queue', 'dashboard:summary');

    const io = req.app.get('io');
    io.to('lab_staff').emit('new_case', {
      caseId: newCase.id, caseNumber: null, patientName: newCase.patientName, clinicName: newCase.clinic.name, workType: newCase.workType,
    });

    res.status(201).json(newCase);
  } catch (err) {
    console.error('[POST /dispatch/phone-order]', err);
    res.status(500).json({ error: err.message || 'Could not create phone order.' });
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
