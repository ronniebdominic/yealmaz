// Ye-Almaz — Dispatch Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');
const { clawBackCasePoints } = require('../utils/rewards');

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

// ── POST /api/dispatch/:caseId/cancel-pickup ─────────────
// The driver went to the clinic to collect the impression, but the clinic
// cancelled the order on the spot — it was never picked up. Marks the case
// CANCELLED (a status that already exists and is already excluded from
// Reception's Accept Cases queue and every other active-case view) so it
// stops cluttering the pipeline, instead of sitting stuck in PICKUP_ASSIGNED
// forever with no exit path. Deliberately does NOT reuse the generic
// PATCH /cases/:id/status — that endpoint auto-assigns a fresh scan number
// to any case that doesn't have one whenever the target status isn't
// PENDING_PICKUP, which would burn a real production scan number just to
// cancel a dead order.
router.post('/:caseId/cancel-pickup', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  const { reason } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'A reason is required.' });

  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    // A case should never have both a caseNumber and a pre-acceptance status,
    // but the generic /status endpoint lets DELIVERY/ADMIN revert a case's
    // status without clearing caseNumber — guard against cancelling
    // something that's actually already an in-production case.
    if (existing.caseNumber || !['PENDING_PICKUP', 'PICKUP_ASSIGNED'].includes(existing.status)) {
      return res.status(400).json({ error: 'Only pending/assigned pickups that have not been accepted yet can be cancelled this way.' });
    }

    await clawBackCasePoints(prisma, existing.id, existing.clinicId);

    const updated = await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'CANCELLED', assignedDeliveryId: null },
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'CANCELLED',
        scannedBy: req.user.name,
        notes: `Cancelled by clinic (not picked up) — ${reason.trim()}`,
      }
    });

    await invalidate(
      `case:${req.params.caseId}`, 'cases:*', 'payments:*', 'dashboard:summary',
      'dashboard:cases-by-status', 'dashboard:analytics:*', 'dispatch:queue', 'dispatch:stations'
    );

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_updated', { caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status });
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', { caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status });

    res.json({ success: true, case: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not cancel pickup.' });
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

// ── POST /api/dispatch/:caseId/self-pickup ────────────────
// The dentist/clinic comes to the lab and collects the finished case
// themselves — the delivery-side mirror of /self-dropoff on the intake
// side. No delivery partner is involved, so the case skips OUT_FOR_DELIVERY
// entirely and goes straight to DELIVERED, same as delivery.js's /deliver
// (DeliveryLog, clinic notification, cache invalidation) minus the driver-
// specific bits, since no driver — and therefore no open DeliveryLog row —
// was ever assigned for this leg.
router.post('/:caseId/self-pickup', protect, restrict('DISPATCH', 'ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.caseId }, include: { clinic: { select: { name: true } } } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });
    if (existing.status !== 'READY_TO_DISPATCH') {
      return res.status(400).json({ error: 'Case is not ready for dispatch.' });
    }

    const now = new Date();
    const updated = await prisma.case.update({
      where: { id: req.params.caseId },
      data: { status: 'DELIVERED', deliveryDate: now, assignedDeliveryId: null },
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId,
        stageName: 'DELIVERED',
        scannedBy: req.user.name,
        notes: `Self pickup by ${existing.clinic?.name || 'clinic'} — collected in person, no delivery partner`,
      }
    });

    await invalidate('dispatch:queue', 'dispatch:stations', 'delivery:*', `case:${req.params.caseId}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', {
      caseId: updated.id, caseNumber: updated.caseNumber,
      status: 'DELIVERED', message: 'Your case has been picked up!'
    });
    io.to('lab_staff').emit('case_delivered', { caseId: updated.id, caseNumber: updated.caseNumber });

    sendPushToClinic(prisma, updated.clinicId, {
      title: '✅ Case Picked Up',
      body: `Case ${updated.caseNumber} (${updated.patientName}) was picked up in person.`,
      data: { caseId: updated.id, caseNumber: updated.caseNumber, screen: 'CaseDetail' },
    });

    res.json({ success: true, case: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not record self pickup.' });
  }
});

module.exports = router;
