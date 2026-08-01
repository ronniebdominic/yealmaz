// Ye-Almaz — Attendance Routes
// POST /events is PUBLIC: biometric-device callback, own secret auth
// (mirrors webhooks.js's case-sync posture — hard-fails if the secret is
// missing or wrong, never silently skips verification). No device is wired
// up yet; every row today comes from HR's manual entry via POST /manual.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { startOfDay, endOfDay } = require('../utils/dateRange');
const { localDayKey } = require('../utils/scanAttribution');

const router = express.Router();
const prisma = new PrismaClient();

const DUPLICATE_WINDOW_MS = 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// Distance between two lat/lng points in meters (haversine formula).
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius, meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Shared validation for the public device endpoint, manual entry, and
// self-service geofenced clock-in/out — validates rather than blindly
// persisting whatever a callback (or a phone's GPS) claims.
async function recordEvent({ userId, timestamp, type, source, deviceId, recordedById, latitude, longitude, distanceMeters }) {
  const ts = new Date(timestamp);
  if (isNaN(ts.getTime())) throw { status: 400, message: 'Invalid timestamp.' };
  if (ts.getTime() - Date.now() > FUTURE_SKEW_MS) throw { status: 400, message: 'Timestamp is too far in the future.' };

  const recent = await prisma.attendanceEvent.findFirst({
    where: {
      userId, type,
      timestamp: { gte: new Date(ts.getTime() - DUPLICATE_WINDOW_MS), lte: new Date(ts.getTime() + DUPLICATE_WINDOW_MS) },
    },
  });
  if (recent) throw { status: 409, message: 'A matching event was already recorded within the last minute.' };

  let note = null;
  if (type === 'CLOCK_OUT') {
    const dayStart = new Date(ts); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(ts); dayEnd.setHours(23, 59, 59, 999);
    const priorIn = await prisma.attendanceEvent.findFirst({
      where: { userId, type: 'CLOCK_IN', timestamp: { gte: dayStart, lte: ts } },
      orderBy: { timestamp: 'desc' },
    });
    // Accepted-but-flagged rather than rejected — biometric terminals
    // generally have no retry logic, so dropping data silently is worse
    // than a flagged anomaly HR can review.
    if (!priorIn) note = 'auto-flagged: no matching clock-in';
  }

  return prisma.attendanceEvent.create({
    data: {
      userId, timestamp: ts, type, source, deviceId: deviceId || null, recordedById: recordedById || null, note,
      latitude: latitude ?? null, longitude: longitude ?? null, distanceMeters: distanceMeters ?? null,
    },
  });
}

// ── POST /api/attendance/events — public device callback ──
router.post('/events', async (req, res) => {
  try {
    const secret = req.headers['x-attendance-device-secret'];
    if (!process.env.ATTENDANCE_DEVICE_SECRET || secret !== process.env.ATTENDANCE_DEVICE_SECRET) {
      return res.status(401).end();
    }
    const { employeeCode, timestamp, type, deviceId } = req.body || {};
    if (!employeeCode || !timestamp || !['CLOCK_IN', 'CLOCK_OUT'].includes(type)) {
      return res.status(400).json({ error: 'employeeCode, timestamp and type (CLOCK_IN/CLOCK_OUT) are required.' });
    }
    const profile = await prisma.employeeProfile.findUnique({ where: { employeeCode } });
    if (!profile) return res.status(404).json({ error: 'Unknown employee code.' });

    const event = await recordEvent({ userId: profile.userId, timestamp, type, source: 'BIOMETRIC', deviceId });
    await invalidate('attendance:events*', 'dashboard:hr-summary');
    res.status(201).json(event);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[attendance events]', err);
    res.status(500).json({ error: 'Could not record attendance event.' });
  }
});

// ── POST /api/attendance/manual ────────────────────────────
router.post('/manual', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, timestamp, type } = req.body || {};
    if (!userId || !timestamp || !['CLOCK_IN', 'CLOCK_OUT'].includes(type)) {
      return res.status(400).json({ error: 'userId, timestamp and type (CLOCK_IN/CLOCK_OUT) are required.' });
    }
    const event = await recordEvent({ userId, timestamp, type, source: 'MANUAL', recordedById: req.user.id });
    await invalidate('attendance:events*', 'dashboard:hr-summary');
    res.status(201).json(event);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[attendance manual]', err);
    res.status(500).json({ error: 'Could not record attendance event.' });
  }
});

// ── POST /api/attendance/self ────────────────────────────────
// Self-service clock-in/out — delivery agents only, accepted only within
// ATTENDANCE_RADIUS_METERS of the lab (LAB_LATITUDE/LAB_LONGITUDE). No
// biometric hardware involved; the phone's own GPS is the only input.
router.post('/self', protect, restrict('DELIVERY'), async (req, res) => {
  try {
    const { LAB_LATITUDE, LAB_LONGITUDE, ATTENDANCE_RADIUS_METERS } = process.env;
    if (!LAB_LATITUDE || !LAB_LONGITUDE || !ATTENDANCE_RADIUS_METERS) {
      return res.status(503).json({ error: 'Self-service attendance is not configured yet.' });
    }

    const { type, latitude, longitude } = req.body || {};
    if (!['CLOCK_IN', 'CLOCK_OUT'].includes(type)) {
      return res.status(400).json({ error: 'type (CLOCK_IN/CLOCK_OUT) is required.' });
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'latitude and longitude are required.' });
    }

    const radius = parseFloat(ATTENDANCE_RADIUS_METERS);
    const distance = haversineMeters(latitude, longitude, parseFloat(LAB_LATITUDE), parseFloat(LAB_LONGITUDE));
    if (distance > radius) {
      return res.status(403).json({
        error: `You're ${Math.round(distance)}m from the lab — must be within ${radius}m to clock ${type === 'CLOCK_IN' ? 'in' : 'out'}.`,
        distanceMeters: distance,
        radiusMeters: radius,
      });
    }

    const event = await recordEvent({
      userId: req.user.id, timestamp: new Date().toISOString(), type, source: 'GEOFENCE',
      latitude, longitude, distanceMeters: distance,
    });
    await invalidate('attendance:events*', 'dashboard:hr-summary');
    res.status(201).json(event);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[attendance self]', err);
    res.status(500).json({ error: 'Could not record attendance event.' });
  }
});

// ── GET /api/attendance/self/today ───────────────────────────
// Lets the requesting user's own app know whether to show Clock In or
// Clock Out, without needing the HR-only GET / below.
router.get('/self/today', protect, async (req, res) => {
  try {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const events = await prisma.attendanceEvent.findMany({
      where: { userId: req.user.id, timestamp: { gte: dayStart } },
      orderBy: { timestamp: 'asc' },
    });
    res.json({ events });
  } catch (err) {
    console.error('[attendance self/today]', err);
    res.status(500).json({ error: 'Could not load attendance.' });
  }
});

// ── GET /api/attendance ─────────────────────────────────────
router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (from) where.timestamp = { ...(where.timestamp || {}), gte: startOfDay(from) };
    if (to) where.timestamp = { ...(where.timestamp || {}), lte: endOfDay(to) };

    const events = await prisma.attendanceEvent.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, recordedBy: { select: { id: true, name: true } } },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    // Derived daily summary — bucketed on the local (EAT) calendar day via
    // localDayKey, not toISOString(), matching the established convention.
    const daily = {};
    for (const e of events) {
      const key = `${e.userId}:${localDayKey(e.timestamp)}`;
      if (!daily[key]) daily[key] = { userId: e.userId, userName: e.user.name, date: localDayKey(e.timestamp), events: [] };
      daily[key].events.push({ type: e.type, timestamp: e.timestamp, source: e.source });
    }

    res.json({ events, dailySummary: Object.values(daily) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load attendance.' });
  }
});

// ── Leave — HR logs these directly on an employee's behalf ─
router.post('/leave', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, fromDate, toDate, reason, status } = req.body || {};
    if (!userId || !fromDate || !toDate) return res.status(400).json({ error: 'userId, fromDate and toDate are required.' });
    const record = await prisma.leaveRecord.create({
      data: {
        userId, fromDate: new Date(fromDate), toDate: new Date(toDate),
        reason: reason?.trim() || null,
        status: status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
        recordedById: req.user.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    await invalidate('attendance:leave*', 'dashboard:hr-summary');
    res.status(201).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log leave.' });
  }
});

router.get('/leave', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (from) where.fromDate = { gte: startOfDay(from) };
    if (to) where.toDate = { lte: endOfDay(to) };
    const records = await prisma.leaveRecord.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, recordedBy: { select: { id: true, name: true } } },
      orderBy: { fromDate: 'desc' },
    });
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load leave records.' });
  }
});

module.exports = router;
