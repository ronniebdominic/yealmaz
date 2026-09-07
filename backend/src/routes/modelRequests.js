// Ye-Almaz — Model Requests
//
// Staff (reception/lab) asking a clinic to send in a NEW physical model for
// a case already in the system (original damaged, or a later production
// step needs another one). Deliberately its own model rather than reusing
// Case.status/assignedDeliveryId — see schema.prisma's comment on
// ModelRequest for why. Driver assignment lives in dispatch.js (mirroring
// how case-pickup assignment does), and collection lives in delivery.js —
// this file only owns the request/schedule/cancel lifecycle.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');

const router = express.Router();
const prisma = new PrismaClient();

const CASE_SUMMARY_SELECT = {
  id: true, caseNumber: true, patientName: true, workType: true, status: true,
  clinicId: true, clinic: { select: { id: true, name: true, phone: true } },
};

// ── POST /api/model-requests ──────────────────────────────
// Staff creates a request against an existing case.
router.post('/', protect, restrict('RECEPTIONIST', 'ADMIN'), async (req, res) => {
  try {
    const { caseId, requesterNote } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId is required.' });

    const kase = await prisma.case.findUnique({ where: { id: caseId }, select: CASE_SUMMARY_SELECT });
    if (!kase) return res.status(404).json({ error: 'Case not found.' });

    const request = await prisma.modelRequest.create({
      data: { caseId, requestedById: req.user.id, requesterNote: requesterNote?.trim() || null },
      include: { case: { select: CASE_SUMMARY_SELECT }, requestedBy: { select: { id: true, name: true } } },
    });

    await prisma.caseStage.create({
      data: {
        caseId,
        stageName: kase.status,
        scannedBy: req.user.name,
        notes: `New model requested from ${kase.clinic.name}${requesterNote ? ' — ' + requesterNote.trim() : ''}`,
      },
    });

    await invalidate('model-requests:*', `case:${caseId}`, 'dashboard:summary');

    sendPushToClinic(prisma, kase.clinicId, {
      title: '🦷 New Model Requested',
      body: `The lab needs a new model for case ${kase.caseNumber || kase.patientName}${requesterNote ? ': ' + requesterNote.trim() : ''}. Please schedule a pickup.`,
      data: { caseId, modelRequestId: request.id, screen: 'CaseDetail' },
    });

    const io = req.app.get('io');
    io.to(`clinic_${kase.clinicId}`).emit('model_request_created', {
      modelRequestId: request.id, caseId, caseNumber: kase.caseNumber,
    });

    res.status(201).json(request);
  } catch (err) {
    console.error('[POST /model-requests]', err);
    res.status(500).json({ error: 'Could not create model request.' });
  }
});

// ── GET /api/model-requests ────────────────────────────────
// Clinics only ever see their own (via the linked case's clinicId); staff
// sees everything, optionally filtered by status.
router.get('/', protect, async (req, res) => {
  try {
    const { status, caseId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (caseId) where.caseId = caseId;
    if (req.user.role === 'CLINIC') where.case = { clinicId: req.user.id };

    const requests = await prisma.modelRequest.findMany({
      where,
      include: {
        case: { select: CASE_SUMMARY_SELECT },
        requestedBy: { select: { id: true, name: true } },
        assignedDelivery: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(requests);
  } catch (err) {
    console.error('[GET /model-requests]', err);
    res.status(500).json({ error: 'Could not load model requests.' });
  }
});

// ── PATCH /api/model-requests/:id/schedule ────────────────
// The clinic (or admin, on their behalf) picks a pickup time. This is what
// surfaces the request in Dispatch's queue — see GET /dispatch/model-requests.
router.patch('/:id/schedule', protect, restrict('CLINIC', 'ADMIN'), async (req, res) => {
  try {
    const { scheduledPickupAt } = req.body;
    if (!scheduledPickupAt) return res.status(400).json({ error: 'scheduledPickupAt is required.' });
    const when = new Date(scheduledPickupAt);
    if (isNaN(when.getTime())) return res.status(400).json({ error: 'scheduledPickupAt is not a valid date.' });

    const request = await prisma.modelRequest.findUnique({
      where: { id: req.params.id },
      include: { case: { select: CASE_SUMMARY_SELECT } },
    });
    if (!request) return res.status(404).json({ error: 'Model request not found.' });
    if (req.user.role === 'CLINIC' && request.case.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Not your request.' });
    }
    if (!['REQUESTED', 'SCHEDULED'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot schedule a request that is already ${request.status.toLowerCase()}.` });
    }

    const updated = await prisma.modelRequest.update({
      where: { id: req.params.id },
      data: { status: 'SCHEDULED', scheduledPickupAt: when },
      include: { case: { select: CASE_SUMMARY_SELECT }, requestedBy: { select: { id: true, name: true } } },
    });

    await prisma.caseStage.create({
      data: {
        caseId: request.caseId,
        stageName: request.case.status,
        scannedBy: req.user.name,
        notes: `Model pickup scheduled for ${when.toLocaleString('en-US')}`,
      },
    });

    await invalidate('model-requests:*', 'dispatch:model-requests', `case:${request.caseId}`);

    const io = req.app.get('io');
    io.to('lab_staff').emit('model_request_scheduled', {
      modelRequestId: updated.id, caseId: updated.caseId, caseNumber: updated.case.caseNumber,
      scheduledPickupAt: updated.scheduledPickupAt,
    });

    res.json(updated);
  } catch (err) {
    console.error('[PATCH /model-requests/:id/schedule]', err);
    res.status(500).json({ error: 'Could not schedule pickup.' });
  }
});

// ── PATCH /api/model-requests/:id/cancel ──────────────────
// Either side can call this off before it's collected. If a driver was
// already assigned, they're released (mirrors dispatch's /unassign).
router.patch('/:id/cancel', protect, restrict('CLINIC', 'RECEPTIONIST', 'ADMIN', 'DISPATCH'), async (req, res) => {
  try {
    const { reason } = req.body;
    const request = await prisma.modelRequest.findUnique({
      where: { id: req.params.id },
      include: { case: { select: CASE_SUMMARY_SELECT } },
    });
    if (!request) return res.status(404).json({ error: 'Model request not found.' });
    if (req.user.role === 'CLINIC' && request.case.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Not your request.' });
    }
    if (['COLLECTED', 'CANCELLED'].includes(request.status)) {
      return res.status(400).json({ error: `Already ${request.status.toLowerCase()}.` });
    }

    const updated = await prisma.modelRequest.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason?.trim() || null, assignedDeliveryId: null },
      include: { case: { select: CASE_SUMMARY_SELECT } },
    });

    await prisma.caseStage.create({
      data: {
        caseId: request.caseId,
        stageName: request.case.status,
        scannedBy: req.user.name,
        notes: `Model request cancelled${reason ? ' — ' + reason.trim() : ''}`,
      },
    });

    await invalidate('model-requests:*', 'dispatch:model-requests', `case:${request.caseId}`);

    if (req.user.role !== 'CLINIC') {
      sendPushToClinic(prisma, request.case.clinicId, {
        title: 'Model Request Cancelled',
        body: `The model request for case ${request.case.caseNumber || request.case.patientName} was cancelled by the lab.`,
        data: { caseId: request.caseId },
      });
    } else {
      const io = req.app.get('io');
      io.to('lab_staff').emit('model_request_cancelled', { modelRequestId: updated.id, caseId: updated.caseId });
    }

    res.json(updated);
  } catch (err) {
    console.error('[PATCH /model-requests/:id/cancel]', err);
    res.status(500).json({ error: 'Could not cancel model request.' });
  }
});

module.exports = router;
