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
const { resolveShiftForUserDate, computeDaySummary } = require('../services/attendanceDaySummary');
const { getLeaveDayCount } = require('../utils/leaveDayCount');

const router = express.Router();
const prisma = new PrismaClient();

const DUPLICATE_WINDOW_MS = 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// "End"-type events that expect an earlier "start"-type event the same day.
const PAIR_START = { CLOCK_OUT: 'CLOCK_IN', BREAK_END: 'BREAK_START' };

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
  const startType = PAIR_START[type];
  if (startType) {
    const dayStart = new Date(ts); dayStart.setHours(0, 0, 0, 0);
    const priorStart = await prisma.attendanceEvent.findFirst({
      where: { userId, type: startType, timestamp: { gte: dayStart, lte: ts } },
      orderBy: { timestamp: 'desc' },
    });
    // Accepted-but-flagged rather than rejected — biometric terminals
    // generally have no retry logic, so dropping data silently is worse
    // than a flagged anomaly HR can review.
    if (!priorStart) note = `auto-flagged: no matching ${startType === 'CLOCK_IN' ? 'clock-in' : 'break start'}`;
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
// Self-service clock-in/out + break start/end — any staff account (not
// CLINIC/ADMIN). No biometric hardware involved; the phone's own GPS is
// the only input. CLOCK_IN/CLOCK_OUT are accepted only within
// ATTENDANCE_RADIUS_METERS of the lab (LAB_LATITUDE/LAB_LONGITUDE) —
// start/end of shift genuinely happens there. BREAK_START/BREAK_END are
// NOT geofenced — most relevant for delivery agents, who are out on their
// route rather than at the lab, but applies uniformly to everyone; the
// reported coordinates are still stored for the same audit trail.
const SELF_TYPES = ['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END'];
const SHIFT_BOUNDARY_TYPES = ['CLOCK_IN', 'CLOCK_OUT'];
const STAFF_ROLES = ['DELIVERY', 'RECEPTIONIST', 'DISPATCH', 'LAB_TECH', 'FINANCE', 'INVENTORY_MANAGER', 'HR_MANAGER', 'LEADER'];

router.post('/self', protect, restrict(...STAFF_ROLES), async (req, res) => {
  try {
    const { type, latitude, longitude } = req.body || {};
    if (!SELF_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${SELF_TYPES.join(', ')}.` });
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'latitude and longitude are required.' });
    }

    let distance = null;
    if (SHIFT_BOUNDARY_TYPES.includes(type)) {
      const labLat = parseFloat(process.env.LAB_LATITUDE);
      const labLon = parseFloat(process.env.LAB_LONGITUDE);
      const radius = parseFloat(process.env.ATTENDANCE_RADIUS_METERS);
      // Number.isFinite, not a truthy/!! check — an unparseable env var
      // (empty, missing, or non-numeric junk) must FAIL CLOSED as "not
      // configured," never silently pass through. `distance > NaN` is
      // always false in JS, which would otherwise accept a clock-in from
      // anywhere on Earth without ever rejecting it.
      if (!Number.isFinite(labLat) || !Number.isFinite(labLon) || !Number.isFinite(radius)) {
        console.error('[attendance self] LAB_LATITUDE/LAB_LONGITUDE/ATTENDANCE_RADIUS_METERS missing or non-numeric:',
          { LAB_LATITUDE: process.env.LAB_LATITUDE, LAB_LONGITUDE: process.env.LAB_LONGITUDE, ATTENDANCE_RADIUS_METERS: process.env.ATTENDANCE_RADIUS_METERS });
        return res.status(503).json({ error: 'Self-service attendance is not configured yet.' });
      }
      distance = haversineMeters(latitude, longitude, labLat, labLon);
      if (distance > radius) {
        return res.status(403).json({
          error: `You're ${Math.round(distance)}m from the lab — must be within ${radius}m to clock ${type === 'CLOCK_IN' ? 'in' : 'out'}.`,
          distanceMeters: distance,
          radiusMeters: radius,
        });
      }
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

// Writes the USED ledger entry for an approved leave record — shared by
// both the HR-direct-entry path (approves immediately) and the self-
// service decide path (approves later, on HR's decision) so the ledger
// deduction logic never drifts between the two.
async function writeLeaveLedgerIfNeeded(tx, record, decidedById) {
  if (!record.leaveTypeId) return;
  const days = await getLeaveDayCount(tx, record.fromDate, record.toDate, record.dayPortion || 'FULL');
  if (days <= 0) return;
  await tx.leaveLedgerEntry.create({
    data: {
      userId: record.userId, leaveTypeId: record.leaveTypeId, transactionType: 'USED', days: -days,
      effectiveDate: record.fromDate, relatedLeaveRecordId: record.id, recordedById: decidedById,
    },
  });
}

// ── Leave — HR logs these directly on an employee's behalf ─
// leaveTypeId/dayPortion are optional passthroughs (Phase 1 HR expansion) —
// existing callers that omit them keep working unchanged, defaulting to no
// type and a full day. When both a type and an APPROVED status are given,
// this also writes the matching USED ledger entry (see leave.js's
// getLeaveDayCount for the holiday-excluding day-count logic) in the same
// transaction, so a leave record and its ledger deduction can never drift
// apart.
router.post('/leave', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, fromDate, toDate, reason, status, leaveTypeId, dayPortion } = req.body || {};
    if (!userId || !fromDate || !toDate) return res.status(400).json({ error: 'userId, fromDate and toDate are required.' });
    const finalStatus = status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
    const from = new Date(fromDate), to = new Date(toDate);

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveRecord.create({
        data: {
          userId, fromDate: from, toDate: to,
          reason: reason?.trim() || null,
          status: finalStatus,
          recordedById: req.user.id,
          leaveTypeId: leaveTypeId || null,
          dayPortion: dayPortion || 'FULL',
        },
        include: { user: { select: { id: true, name: true } }, leaveType: true },
      });

      if (leaveTypeId && finalStatus === 'APPROVED') {
        const days = await getLeaveDayCount(tx, from, to, dayPortion || 'FULL');
        if (days > 0) {
          await tx.leaveLedgerEntry.create({
            data: {
              userId, leaveTypeId, transactionType: 'USED', days: -days,
              effectiveDate: from, relatedLeaveRecordId: created.id, recordedById: req.user.id,
            },
          });
        }
      }
      return created;
    });

    await invalidate('attendance:leave*', 'dashboard:hr-summary', 'leave:*');
    res.status(201).json(record);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log leave.' });
  }
});

// By default this only shows requests that have cleared the manager stage
// (MANAGER_APPROVED/APPROVED/REJECTED) plus PENDING requests from anyone
// with no manager assigned (nobody to gate them, so they go to HR
// directly) — a raw PENDING request awaiting its manager's decision does
// NOT show up here. Pass includeAwaitingManager=true to see everything
// (e.g. for an overview/audit view).
router.get('/leave', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to, leaveTypeId, includeAwaitingManager } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (leaveTypeId) where.leaveTypeId = leaveTypeId;
    if (from) where.fromDate = { gte: startOfDay(from) };
    if (to) where.toDate = { lte: endOfDay(to) };

    let records = await prisma.leaveRecord.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, employeeProfile: { select: { managerId: true } } } },
        recordedBy: { select: { id: true, name: true } }, leaveType: true,
      },
      orderBy: { fromDate: 'desc' },
    });

    if (!includeAwaitingManager || includeAwaitingManager === 'false') {
      records = records.filter(r => r.status !== 'PENDING' || !r.user?.employeeProfile?.managerId);
    }
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load leave records.' });
  }
});

// ── Manager (Leader) approval stage ──────────────────────
// A request from someone WITH a manager must clear this stage
// (PENDING -> MANAGER_APPROVED) before HR ever sees it in the default
// GET /leave list above. LEADER is the intended role for this, but
// HR_MANAGER/ADMIN can also act as a fallback approver for any team.
// Being a manager isn't tied to holding the LEADER role, though — any
// account can end up as someone's EmployeeProfile.managerId (e.g. a
// LAB_TECH designated a team's manager without changing their login
// role/dashboard) — so this is open to any authenticated user, scoped to
// their own reports unless they're HR_MANAGER/ADMIN.
const MANAGER_DECIDE_BROAD_ROLES = ['HR_MANAGER', 'ADMIN'];
router.get('/leave/team', protect, async (req, res) => {
  try {
    const where = { status: 'PENDING' };
    if (!MANAGER_DECIDE_BROAD_ROLES.includes(req.user.role)) {
      where.user = { employeeProfile: { managerId: req.user.id } };
    }
    const records = await prisma.leaveRecord.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, leaveType: true },
      orderBy: { fromDate: 'asc' },
    });
    res.json(records);
  } catch (err) {
    console.error('[leave team]', err);
    res.status(500).json({ error: 'Could not load team leave requests.' });
  }
});

router.patch('/leave/:id/manager-decide', protect, async (req, res) => {
  try {
    const { decision, note } = req.body || {};
    if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'decision must be APPROVED or REJECTED.' });

    const existing = await prisma.leaveRecord.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { employeeProfile: { select: { managerId: true } } } } },
    });
    if (!existing) return res.status(404).json({ error: 'Leave request not found.' });
    if (existing.status !== 'PENDING') return res.status(400).json({ error: `This request is already ${existing.status}.` });
    if (!MANAGER_DECIDE_BROAD_ROLES.includes(req.user.role) && existing.user?.employeeProfile?.managerId !== req.user.id) {
      return res.status(403).json({ error: 'This request is not assigned to you.' });
    }

    const updated = await prisma.leaveRecord.update({
      where: { id: req.params.id },
      data: { status: decision === 'APPROVED' ? 'MANAGER_APPROVED' : 'REJECTED', note: note?.trim() || null },
      include: { user: { select: { id: true, name: true } }, leaveType: true },
    });
    await invalidate('attendance:leave*', 'leave:*');
    res.json(updated);
  } catch (err) {
    console.error('[leave manager-decide]', err);
    res.status(500).json({ error: 'Could not decide on leave request.' });
  }
});

// ── Self-service leave requests ──────────────────────────
// An employee submits their own request (status starts PENDING, unlike
// HR's direct-entry path above which defaults to APPROVED) — HR decides
// via PATCH /leave/:id/decide. Same STAFF_ROLES list as the self-service
// attendance clock.
router.post('/leave/request', protect, restrict(...STAFF_ROLES), async (req, res) => {
  try {
    const { fromDate, toDate, reason, leaveTypeId, dayPortion } = req.body || {};
    if (!fromDate || !toDate) return res.status(400).json({ error: 'fromDate and toDate are required.' });
    const record = await prisma.leaveRecord.create({
      data: {
        userId: req.user.id, fromDate: new Date(fromDate), toDate: new Date(toDate),
        reason: reason?.trim() || null, status: 'PENDING', recordedById: req.user.id,
        leaveTypeId: leaveTypeId || null, dayPortion: dayPortion || 'FULL',
      },
      include: { leaveType: true },
    });
    await invalidate('attendance:leave*', 'leave:*');
    res.status(201).json(record);
  } catch (err) {
    console.error('[leave request]', err);
    res.status(500).json({ error: 'Could not submit leave request.' });
  }
});

router.get('/leave/mine', protect, restrict(...STAFF_ROLES), async (req, res) => {
  try {
    const records = await prisma.leaveRecord.findMany({
      where: { userId: req.user.id },
      include: { leaveType: true },
      orderBy: { fromDate: 'desc' },
    });
    res.json(records);
  } catch (err) {
    console.error('[leave mine]', err);
    res.status(500).json({ error: 'Could not load your leave requests.' });
  }
});

// HR's final decision. A request from someone WITH a manager must have
// cleared MANAGER_APPROVED first (see PATCH /leave/:id/manager-decide) —
// HR can't approve straight from PENDING for those, so a request can
// never silently skip its manager's review. Requests from someone with
// no manager assigned go straight from PENDING to HR, since there's no
// one else to gate them. Approving writes the ledger deduction (if the
// request has a leaveTypeId) in the same transaction as the status
// change.
router.patch('/leave/:id/decide', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { decision, note } = req.body || {};
    if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'decision must be APPROVED or REJECTED.' });

    const record = await prisma.$transaction(async (tx) => {
      const existing = await tx.leaveRecord.findUnique({
        where: { id: req.params.id },
        include: { user: { select: { employeeProfile: { select: { managerId: true } } } } },
      });
      if (!existing) throw { status: 404, message: 'Leave request not found.' };
      if (existing.status === 'PENDING' && existing.user?.employeeProfile?.managerId) {
        throw { status: 400, message: "This request hasn't been approved by the employee's manager yet." };
      }
      if (!['PENDING', 'MANAGER_APPROVED'].includes(existing.status)) {
        throw { status: 400, message: `This request is already ${existing.status}.` };
      }

      const updated = await tx.leaveRecord.update({
        where: { id: req.params.id },
        data: { status: decision, note: note?.trim() || null },
        include: { user: { select: { id: true, name: true } }, leaveType: true },
      });
      if (decision === 'APPROVED') await writeLeaveLedgerIfNeeded(tx, updated, req.user.id);
      return updated;
    });

    await invalidate('attendance:leave*', 'dashboard:hr-summary', 'leave:*');
    res.json(record);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[leave decide]', err);
    res.status(500).json({ error: 'Could not decide on leave request.' });
  }
});

// ── GET /api/attendance/summary?date=&userId=&department= ──
// Roster-wide day view backing the Attendance dashboard: one computed
// status per employee for the given date, plus aggregate KPI counts.
// Reuses the same isSharedAccount:false posture as GET /api/employees so
// department/system logins never show up as "employees" here either.
router.get('/summary', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { date, userId, department } = req.query;
    const day = date ? new Date(`${date}T00:00:00`) : new Date();
    if (isNaN(day.getTime())) return res.status(400).json({ error: 'Invalid date.' });
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

    const where = { isSharedAccount: false, isActive: true };
    if (userId) where.id = userId;
    if (department) where.departments = { has: department };

    const [employees, events, leaveRecords, holiday, corrections, assignments] = await Promise.all([
      prisma.user.findMany({ where, select: { id: true, name: true, departments: true, role: true } }),
      prisma.attendanceEvent.findMany({ where: { timestamp: { gte: day, lte: dayEnd } } }),
      prisma.leaveRecord.findMany({ where: { status: 'APPROVED', fromDate: { lte: dayEnd }, toDate: { gte: day } } }),
      prisma.holiday.findUnique({ where: { date: day } }).catch(() => null),
      prisma.attendanceCorrection.findMany({ where: { date: day } }),
      prisma.shiftAssignment.findMany({
        where: { effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
        orderBy: { effectiveFrom: 'desc' },
        include: { shift: true },
      }),
    ]);

    const eventsByUser = new Map();
    for (const e of events) {
      if (!eventsByUser.has(e.userId)) eventsByUser.set(e.userId, []);
      eventsByUser.get(e.userId).push(e);
    }
    const leaveByUser = new Map(leaveRecords.map(l => [l.userId, l]));
    const correctionByUser = new Map(corrections.map(c => [c.userId, c]));
    // First match per user wins (already ordered effectiveFrom desc).
    const shiftByUser = new Map();
    for (const a of assignments) if (!shiftByUser.has(a.userId)) shiftByUser.set(a.userId, a.shift);

    const counts = { present: 0, absent: 0, onLeave: 0, late: 0, earlyDeparture: 0, missingPunch: 0, overtime: 0 };
    const results = employees.map(emp => {
      const summary = computeDaySummary({
        date: day,
        events: eventsByUser.get(emp.id) || [],
        shift: shiftByUser.get(emp.id) || null,
        holiday,
        leaveRecord: leaveByUser.get(emp.id) || null,
        correction: correctionByUser.get(emp.id) || null,
      });
      if (summary.status === 'PRESENT' || summary.status === 'IN_PROGRESS') counts.present++;
      if (summary.status === 'ABSENT') counts.absent++;
      if (summary.status === 'ON_LEAVE' || summary.status === 'HALF_DAY_LEAVE') counts.onLeave++;
      if (summary.status === 'MISSING_PUNCH') counts.missingPunch++;
      if (summary.late) counts.late++;
      if (summary.earlyDepartureMinutes > 0) counts.earlyDeparture++;
      if (summary.overtimeHours > 0) counts.overtime++;
      return {
        id: emp.id, name: emp.name, departments: emp.departments, role: emp.role,
        shift: shiftByUser.get(emp.id) ? { id: shiftByUser.get(emp.id).id, name: shiftByUser.get(emp.id).name } : null,
        ...summary,
      };
    });

    res.json({ date: localDayKey(day), counts, employees: results });
  } catch (err) {
    console.error('[attendance summary]', err);
    res.status(500).json({ error: 'Could not load attendance summary.' });
  }
});

// ── GET /api/attendance/summary/range?userId=&from=&to= ────
// One employee across a date range — powers the Employee Profile's
// Attendance tab. Loops computeDaySummary per day (range is expected to be
// weeks/months, not years, so this stays cheap).
router.get('/summary/range', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to } = req.query;
    if (!userId || !from || !to) return res.status(400).json({ error: 'userId, from and to are required.' });
    const fromDate = startOfDay(from), toDate = endOfDay(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return res.status(400).json({ error: 'Invalid from/to.' });

    const [events, leaveRecords, holidays, corrections, assignments] = await Promise.all([
      prisma.attendanceEvent.findMany({ where: { userId, timestamp: { gte: fromDate, lte: toDate } } }),
      prisma.leaveRecord.findMany({ where: { userId, status: 'APPROVED', fromDate: { lte: toDate }, toDate: { gte: fromDate } } }),
      prisma.holiday.findMany({ where: { date: { gte: fromDate, lte: toDate } } }),
      prisma.attendanceCorrection.findMany({ where: { userId, date: { gte: fromDate, lte: toDate } } }),
      prisma.shiftAssignment.findMany({
        where: { userId, effectiveFrom: { lte: toDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: fromDate } }] },
        include: { shift: true }, orderBy: { effectiveFrom: 'asc' },
      }),
    ]);

    const holidayByDay = new Map(holidays.map(h => [localDayKey(h.date), h]));
    const correctionByDay = new Map(corrections.map(c => [localDayKey(c.date), c]));

    const days = [];
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
      const dayEvents = events.filter(e => e.timestamp >= dayStart && e.timestamp <= dayEnd);
      const shiftForDay = [...assignments].reverse().find(a =>
        a.effectiveFrom <= dayEnd && (!a.effectiveTo || a.effectiveTo >= dayStart))?.shift || null;
      const leaveForDay = leaveRecords.find(l => l.fromDate <= dayEnd && l.toDate >= dayStart) || null;

      days.push(computeDaySummary({
        date: dayStart,
        events: dayEvents,
        shift: shiftForDay,
        holiday: holidayByDay.get(localDayKey(dayStart)) || null,
        leaveRecord: leaveForDay,
        correction: correctionByDay.get(localDayKey(dayStart)) || null,
      }));
    }

    res.json({ range: { from: fromDate.toISOString(), to: toDate.toISOString() }, days });
  } catch (err) {
    console.error('[attendance summary/range]', err);
    res.status(500).json({ error: 'Could not load attendance range.' });
  }
});

// ── Attendance corrections ──────────────────────────────────
// Additive audit record only — AttendanceEvent rows are never edited or
// deleted. original* is captured from the current raw-derived summary at
// write time so nothing about "what changed" is ever ambiguous later.
router.post('/corrections', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, date, correctedClockIn, correctedClockOut, reason } = req.body || {};
    if (!userId || !date || !reason?.trim()) return res.status(400).json({ error: 'userId, date and reason are required.' });
    const day = new Date(`${date}T00:00:00`);
    if (isNaN(day.getTime())) return res.status(400).json({ error: 'Invalid date.' });
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

    const events = await prisma.attendanceEvent.findMany({ where: { userId, timestamp: { gte: day, lte: dayEnd } } });
    const shift = await resolveShiftForUserDate(prisma, userId, day);
    const before = computeDaySummary({ date: day, events, shift, holiday: null, leaveRecord: null, correction: null });

    const correction = await prisma.attendanceCorrection.create({
      data: {
        userId, date: day,
        originalClockIn: before.clockIn, originalClockOut: before.clockOut,
        correctedClockIn: correctedClockIn ? new Date(correctedClockIn) : null,
        correctedClockOut: correctedClockOut ? new Date(correctedClockOut) : null,
        reason: reason.trim(), approvedById: req.user.id,
      },
    });
    await invalidate('attendance:*', 'dashboard:hr-summary');
    res.status(201).json(correction);
  } catch (err) {
    console.error('[attendance corrections create]', err);
    res.status(500).json({ error: 'Could not record correction.' });
  }
});

router.get('/corrections', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, from, to } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (from) where.date = { ...(where.date || {}), gte: startOfDay(from) };
    if (to) where.date = { ...(where.date || {}), lte: endOfDay(to) };
    const corrections = await prisma.attendanceCorrection.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(corrections);
  } catch (err) {
    console.error('[attendance corrections list]', err);
    res.status(500).json({ error: 'Could not load corrections.' });
  }
});

module.exports = router;
