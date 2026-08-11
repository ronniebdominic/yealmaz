// Ye-Almaz — Delivery Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');
const { buildAgentNameMaps, matchDeliveryAgent, DELIVERY_EVENT_STAGE_OR, classifyDeliveryEvent } = require('../utils/deliveryAttribution');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { localDayKey } = require('../utils/scanAttribution');
const liveLocations = require('../state/liveLocations');

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
// A delivery agent's own full archive — GET /assigned only ever shows
// today's live board, so anything from a prior day is otherwise invisible
// to the person who handled it. Unlike the old version (DELIVERED cases
// only), this covers BOTH legs of a driver's work: PICKUP (collecting an
// impression from a clinic, or collecting a finished case from the lab)
// and DELIVERY (dropping a finished case off at a clinic) — each is its
// own event row, since the same case can involve two different trips (and
// even two different drivers) on its way through the lab. Matched via
// CaseStage, not DeliveryLog.deliveryById — see deliveryAttribution.js.
router.get('/history', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, from, to, userId, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const isDeliveryExec = req.user.role === 'DELIVERY';
    const targetUserId = isDeliveryExec ? req.user.id : (userId || null);

    const scannedAtFilter = {};
    if (from) scannedAtFilter.gte = new Date(`${from}T00:00:00`);
    if (to) { const d = new Date(`${to}T00:00:00`); d.setHours(23, 59, 59, 999); scannedAtFilter.lte = d; }

    const [agents, stages] = await Promise.all([
      prisma.user.findMany({ where: { role: 'DELIVERY' }, select: { id: true, name: true, isActive: true } }),
      prisma.caseStage.findMany({
        where: {
          OR: DELIVERY_EVENT_STAGE_OR,
          scannedBy: { not: null },
          ...(Object.keys(scannedAtFilter).length ? { scannedAt: scannedAtFilter } : {}),
        },
        select: {
          id: true, stageName: true, notes: true, scannedAt: true, scannedBy: true, caseId: true,
          case: { select: { caseNumber: true, patientName: true, clinic: { select: { name: true } } } },
        },
        orderBy: { scannedAt: 'desc' },
      }),
    ]);

    const nameMaps = buildAgentNameMaps(agents);
    const q = search?.trim().toLowerCase();
    const events = [];
    for (const s of stages) {
      const agent = matchDeliveryAgent(s.scannedBy, s.notes, nameMaps);
      if (!agent) continue;
      if (targetUserId && agent.id !== targetUserId) continue;

      const classified = classifyDeliveryEvent(s.stageName);
      if (!classified) continue;
      if (type && type !== classified.type) continue;

      if (q) {
        const haystack = `${s.case?.caseNumber || ''} ${s.case?.patientName || ''} ${s.case?.clinic?.name || ''}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      events.push({
        id: s.id,
        type: classified.type,
        pickupKind: classified.pickupKind,
        caseId: s.caseId,
        caseNumber: s.case?.caseNumber,
        patientName: s.case?.patientName,
        clinicName: s.case?.clinic?.name,
        occurredAt: s.scannedAt,
        ...(targetUserId ? {} : { agentId: agent.id, agentName: agent.name }),
      });
    }

    const total = events.length;
    const paged = events.slice(skip, skip + parseInt(limit));

    res.json({ events: paged, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
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

// ── Live location tracking ───────────────────────────────
// Opt-in on the driver's side (a visible toggle in the delivery portal,
// defaulted off) — nothing here ever starts tracking on its own. Storage
// is in-memory only (state/liveLocations.js) — see that file's header
// comment for why this is deliberately not persisted.

// ── POST /api/delivery/location — driver posts their current position ──
router.post('/location', protect, restrict('DELIVERY'), async (req, res) => {
  const { latitude, longitude, accuracy, heading, speed } = req.body || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude are required numbers.' });
  }
  liveLocations.setPosition(req.user.id, { latitude, longitude, accuracy, heading, speed });

  const io = req.app.get('io');
  io.to('dispatch_ops').emit('driver_location', {
    userId: req.user.id, name: req.user.name, station: req.user.station,
    latitude, longitude, accuracy, heading, speed, updatedAt: new Date(),
  });

  res.json({ success: true });
});

// ── POST /api/delivery/location/stop — driver turns sharing off ────────
// Removes the entry immediately rather than waiting for it to age out, so
// switching the toggle off is reflected on the live map right away.
router.post('/location/stop', protect, restrict('DELIVERY'), async (req, res) => {
  liveLocations.removePosition(req.user.id);
  const io = req.app.get('io');
  io.to('dispatch_ops').emit('driver_location_stopped', { userId: req.user.id });
  res.json({ success: true });
});

// ── GET /api/delivery/locations — Dispatch/Admin's current snapshot ────
// The live map's initial load; subsequent updates arrive over the
// 'dispatch_ops' socket room (driver_location / driver_location_stopped).
router.get('/locations', protect, restrict('ADMIN', 'DISPATCH'), async (req, res) => {
  try {
    const active = liveLocations.getActivePositions();
    if (active.length === 0) return res.json({ agents: [] });

    const users = await prisma.user.findMany({
      where: { id: { in: active.map(a => a.userId) } },
      select: { id: true, name: true, station: true },
    });
    const byId = new Map(users.map(u => [u.id, u]));

    res.json({
      agents: active
        .filter(a => byId.has(a.userId)) // account deactivated/deleted since their last post
        .map(a => ({ ...a, name: byId.get(a.userId).name, station: byId.get(a.userId).station })),
    });
  } catch (err) {
    console.error('[delivery locations]', err);
    res.status(500).json({ error: 'Could not load live locations.' });
  }
});

// ── GET /api/delivery/my-performance ─────────────────────
// The logged-in driver's own activity — summary stats (pickups AND
// deliveries, separately, plus their combined share of the whole lab's
// order volume in the same range) plus a real, paginated event history.
// Self-scoped the same way GET /delivery/history and
// GET /dashboard/delivery-performance are — CaseStage attribution via
// utils/deliveryAttribution.js, not DeliveryLog. Mirrors GET /lab/my-performance's
// shape for the lab tech's equivalent self-view.
router.get('/my-performance', protect, restrict('DELIVERY', 'ADMIN'), async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;
    const dateTo = to ? endOfDay(to) : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
    const defaultFrom = new Date(); defaultFrom.setDate(defaultFrom.getDate() - 29); defaultFrom.setHours(0, 0, 0, 0);
    const dateFrom = from ? startOfDay(from) : defaultFrom;

    const [agents, stages] = await Promise.all([
      prisma.user.findMany({ where: { role: 'DELIVERY' }, select: { id: true, name: true, isActive: true } }),
      prisma.caseStage.findMany({
        where: { OR: DELIVERY_EVENT_STAGE_OR, scannedAt: { gte: dateFrom, lte: dateTo }, scannedBy: { not: null } },
        select: {
          stageName: true, scannedBy: true, scannedAt: true, notes: true, caseId: true,
          case: { select: { caseNumber: true, patientName: true, workType: true, clinic: { select: { name: true } } } },
        },
        orderBy: { scannedAt: 'desc' },
      }),
    ]);

    const nameMaps = buildAgentNameMaps(agents);
    let totalLabOrders = 0;
    const myEvents = [];
    for (const s of stages) {
      const agent = matchDeliveryAgent(s.scannedBy, s.notes, nameMaps);
      if (!agent) continue; // same exclusions as dashboard.js — self-pickups/admin edits/unmatched
      const classified = classifyDeliveryEvent(s.stageName);
      if (!classified) continue;
      totalLabOrders++;
      if (agent.id === req.user.id) myEvents.push({ ...s, ...classified });
    }

    const clinics = new Set();
    const dailyCounts = {};
    let lastActiveAt = null;
    let totalPickups = 0, totalDeliveries = 0;
    for (const s of myEvents) {
      if (s.type === 'PICKUP') totalPickups++; else totalDeliveries++;
      if (s.case?.clinic?.name) clinics.add(s.case.clinic.name);
      const day = localDayKey(s.scannedAt);
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      if (!lastActiveAt || s.scannedAt > lastActiveAt) lastActiveAt = s.scannedAt;
    }
    const activeDays = Object.keys(dailyCounts).length;
    const totalOrders = myEvents.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    res.json({
      range: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      summary: {
        totalOrders,
        totalPickups,
        totalDeliveries,
        uniqueClinics: clinics.size,
        activeDays,
        avgPerActiveDay: activeDays > 0 ? Math.round((totalOrders / activeDays) * 10) / 10 : 0,
        totalLabOrders,
        shareOfTotalPercent: totalLabOrders > 0 ? Math.round((totalOrders / totalLabOrders) * 1000) / 10 : null,
        dailyCounts,
        lastActiveAt,
      },
      events: myEvents.slice(skip, skip + parseInt(limit)).map(s => ({
        id: s.caseId,
        type: s.type,
        pickupKind: s.pickupKind,
        caseNumber: s.case?.caseNumber,
        patientName: s.case?.patientName,
        workType: s.case?.workType,
        clinicName: s.case?.clinic?.name,
        occurredAt: s.scannedAt,
      })),
      pagination: {
        total: totalOrders, page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil(totalOrders / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('[delivery my-performance]', err);
    res.status(500).json({ error: 'Could not load your performance.' });
  }
});

module.exports = router;
