// Ye-Almaz — Telegram Bot: Operations & Audit-Trail Queries
//
// READ-ONLY. Purpose-built aggregate queries for the lab-operations and
// people domains the bot previously couldn't see at all (inventory, milling
// yield, goods requests, staff reward points, attendance/leave) plus the
// business audit trail ("who did what to this case, and when").
//
// Why these live here rather than being extracted from their routes, unlike
// the dashboard/cases/payments tools in botTools.js: those routes carry real
// business rules (what counts as revenue, what counts as outstanding) that
// must never be duplicated, so the bot calls their exact compute functions.
// The queries below are plain aggregates over models with no such rules —
// a count of clock-ins is a count of clock-ins — and the matching routes are
// UI-shaped (paginated, per-employee, permission-scoped). Rewriting those to
// serve both would add risk to working HR/inventory screens for no accuracy
// gain, so these are independent, narrow, and read-only.
//
// SINGLE AUDIT POINT (same rule as botTools.js): nothing in this file may
// create/update/delete/upsert. Every query below is findMany/count/aggregate/
// groupBy only.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Deliberately excludes payroll, salary, advances, expense claims,
// performance reviews and employee documents. The bot's access boundary is
// a Telegram chat ID — a far weaker credential than an ADMIN login — so
// people-data exposure stops at attendance and leave, which is what the
// owner asked to be able to ask about.
const PEOPLE_DATA_BOUNDARY_NOTE = 'Payroll, salary, advances, expense claims and performance reviews are intentionally not available to this bot.';

function dayBounds(from, to) {
  // process.env.TZ is Africa/Addis_Ababa (set in index.js), so these parse
  // and compare in lab-local time without manual offset math.
  const start = from ? new Date(`${from}T00:00:00`) : new Date(new Date().getFullYear(), 0, 1);
  const end = to ? new Date(`${to}T23:59:59.999`) : new Date();
  return { start, end };
}

function ymd(d) {
  return d ? new Date(d).toLocaleDateString('en-CA') : null;
}

function leaveCount(rows) {
  return (rows || []).length;
}

// ── OPERATIONS ────────────────────────────────────────────
async function getOperationsReport({ area, from, to } = {}) {
  const { start, end } = dayBounds(from, to);
  const range = { from: ymd(start), to: ymd(end) };

  if (area === 'inventory') {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true, quantityOnHand: true, reorderThreshold: true },
    });
    // "Low stock" is only meaningful for items that opted in by setting a
    // threshold — a null threshold means "no alerting wanted", not zero.
    const lowStock = items
      .filter(i => i.reorderThreshold != null && i.quantityOnHand <= i.reorderThreshold)
      .map(i => ({ name: i.name, unit: i.unit, quantityOnHand: i.quantityOnHand, reorderThreshold: i.reorderThreshold }));

    const movements = await prisma.inventoryTransaction.groupBy({
      by: ['type'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    return {
      range,
      activeItemCount: items.length,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock,
      movementsInRange: movements.map(m => ({ type: m.type, netQuantity: m._sum.quantity || 0, transactions: m._count._all })),
      items: items.slice(0, 40).map(i => ({ name: i.name, unit: i.unit, quantityOnHand: i.quantityOnHand })),
    };
  }

  if (area === 'milling') {
    const [totals, perTech] = await Promise.all([
      prisma.millingYield.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { blanksUsed: true, crownsProduced: true, bonusPoints: true },
        _count: { _all: true },
      }),
      prisma.millingYield.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { blanksUsed: true, crownsProduced: true, bonusPoints: true },
        _count: { _all: true },
      }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: perTech.map(t => t.userId) } },
      select: { id: true, name: true },
    });
    const nameById = Object.fromEntries(users.map(u => [u.id, u.name]));

    const blanks = totals._sum.blanksUsed || 0;
    const crowns = totals._sum.crownsProduced || 0;

    return {
      range,
      logEntries: totals._count._all,
      blanksUsed: blanks,
      crownsProduced: crowns,
      crownsPerBlank: blanks > 0 ? Number((crowns / blanks).toFixed(2)) : null,
      bonusPointsAwarded: totals._sum.bonusPoints || 0,
      byTechnician: perTech
        .map(t => ({
          name: nameById[t.userId] || 'Unknown',
          blanksUsed: t._sum.blanksUsed || 0,
          crownsProduced: t._sum.crownsProduced || 0,
          crownsPerBlank: (t._sum.blanksUsed || 0) > 0
            ? Number(((t._sum.crownsProduced || 0) / t._sum.blanksUsed).toFixed(2))
            : null,
          bonusPoints: t._sum.bonusPoints || 0,
        }))
        .sort((a, b) => b.crownsProduced - a.crownsProduced),
    };
  }

  if (area === 'goods_requests') {
    const [byStatus, pending] = await Promise.all([
      prisma.inventoryRequest.groupBy({
        by: ['status'],
        where: { createdAt: { gte: start, lte: end } },
        _count: { _all: true },
      }),
      prisma.inventoryRequest.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 25,
        select: {
          quantityRequested: true, department: true, createdAt: true,
          item: { select: { name: true, unit: true } },
          requestedBy: { select: { name: true } },
        },
      }),
    ]);

    return {
      range,
      countsInRange: byStatus.map(s => ({ status: s.status, count: s._count._all })),
      // Pending is deliberately all-time, not range-filtered: an unfulfilled
      // request from before the range is still outstanding today, and that's
      // what "what's waiting on me" means.
      pendingAllTime: pending.map(r => ({
        item: r.item?.name, unit: r.item?.unit, quantity: r.quantityRequested,
        department: r.department, requestedBy: r.requestedBy?.name,
        waitingSinceDays: Math.floor((Date.now() - new Date(r.createdAt)) / 86400000),
      })),
    };
  }

  if (area === 'staff_rewards') {
    const [points, earnedInRange] = await Promise.all([
      prisma.staffPoints.findMany({
        orderBy: { totalEarned: 'desc' },
        take: 25,
        select: { totalEarned: true, user: { select: { name: true } } },
      }),
      prisma.staffRewardTransaction.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { points: true },
        _count: { _all: true },
      }),
    ]);

    return {
      range,
      pointsAwardedInRange: earnedInRange._sum.points || 0,
      awardsInRange: earnedInRange._count._all,
      leaderboardAllTime: points.map(p => ({ name: p.user?.name || 'Unknown', totalEarned: p.totalEarned })),
    };
  }

  return { error: `Unknown area "${area}". Valid areas: inventory, milling, goods_requests, staff_rewards.` };
}

// ── ATTENDANCE & LEAVE ────────────────────────────────────
async function getStaffAttendance({ from, to, name } = {}) {
  const { start, end } = dayBounds(from, to);
  const range = { from: ymd(start), to: ymd(end) };

  const userWhere = name ? { name: { contains: name, mode: 'insensitive' } } : {};

  const events = await prisma.attendanceEvent.findMany({
    where: { timestamp: { gte: start, lte: end }, user: userWhere },
    orderBy: { timestamp: 'asc' },
    select: {
      timestamp: true, type: true, source: true,
      user: { select: { id: true, name: true } },
    },
  });

  // Group into per-person day summaries. "Days present" counts distinct
  // calendar days with at least one CLOCK_IN — not raw event count, which
  // double-counts break events and manual corrections.
  const byUser = new Map();
  for (const e of events) {
    const uid = e.user?.id;
    if (!uid) continue;
    if (!byUser.has(uid)) {
      byUser.set(uid, { name: e.user.name, clockInDays: new Set(), events: 0, sources: new Set(), firstAt: null, lastAt: null });
    }
    const rec = byUser.get(uid);
    rec.events++;
    rec.sources.add(e.source);
    if (e.type === 'CLOCK_IN') rec.clockInDays.add(ymd(e.timestamp));
    if (!rec.firstAt) rec.firstAt = e.timestamp;
    rec.lastAt = e.timestamp;
  }

  const leave = await prisma.leaveRecord.findMany({
    // Any leave overlapping the range, not only leave starting inside it.
    where: { fromDate: { lte: end }, toDate: { gte: start }, user: userWhere },
    orderBy: { fromDate: 'asc' },
    take: 50,
    select: {
      fromDate: true, toDate: true, status: true, dayPortion: true, reason: true,
      user: { select: { name: true } },
      leaveType: { select: { name: true } },
    },
  });

  const staffRows = [...byUser.values()];

  // An empty result has to be LOUD. A bare `staff: []` was observed being
  // treated by the model as a blank to fill: asked who was present in a
  // month with no attendance rows, it answered with entirely invented staff
  // names. Saying so explicitly, in words, gives it something correct to
  // repeat instead of a vacuum.
  if (staffRows.length === 0 && leaveCount(leave) === 0) {
    return {
      range,
      filteredToName: name || null,
      noDataInRange: true,
      staff: [],
      leaveInRange: [],
      message: `No attendance or leave records exist for ${range.from} to ${range.to}${name ? ` matching "${name}"` : ''}. No staff were recorded as present, and no names can be listed for this period.`,
      note: PEOPLE_DATA_BOUNDARY_NOTE,
    };
  }

  return {
    range,
    filteredToName: name || null,
    staff: staffRows
      .map(r => ({
        name: r.name,
        daysPresent: r.clockInDays.size,
        totalEvents: r.events,
        sources: [...r.sources],
        firstEventAt: r.firstAt,
        lastEventAt: r.lastAt,
      }))
      .sort((a, b) => b.daysPresent - a.daysPresent),
    leaveInRange: leave.map(l => ({
      name: l.user?.name, from: ymd(l.fromDate), to: ymd(l.toDate),
      status: l.status, dayPortion: l.dayPortion,
      leaveType: l.leaveType?.name || null, reason: l.reason || null,
    })),
    note: PEOPLE_DATA_BOUNDARY_NOTE,
  };
}

// ── AUDIT TRAIL ───────────────────────────────────────────
// The "server logs" a lab owner actually needs: the business audit trail of
// who moved what, when. (Application/infrastructure error logs are NOT here
// — they stream to Railway's stdout, aren't persisted in the database, and
// routinely contain connection strings and other infrastructure detail that
// must not be relayed into a chat.)
async function getCaseHistory({ identifier } = {}) {
  const trimmed = String(identifier || '').trim();
  if (!trimmed) return { error: 'No case number or id given.' };

  const kase = await prisma.case.findFirst({
    where: { OR: [{ caseNumber: trimmed }, { id: trimmed }] },
    select: {
      caseNumber: true, patientName: true, workType: true, status: true,
      createdAt: true, deliveryDate: true,
      clinic: { select: { name: true } },
      stages: {
        orderBy: { scannedAt: 'asc' },
        select: { stageName: true, scannedAt: true, scannedBy: true, location: true, notes: true },
      },
      deliveryLogs: {
        orderBy: { createdAt: 'asc' },
        select: { pickedUpAt: true, deliveredAt: true, notes: true, deliveredBy: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { createdAt: true, body: true, authorName: true, authorRole: true },
      },
    },
  });

  if (!kase) return { error: `No case found matching "${trimmed}".` };

  const stages = kase.stages || [];
  // Time spent at each step is the gap to the NEXT scan — the single most
  // useful thing in a case history for spotting where a case actually sat.
  const timeline = stages.map((s, i) => {
    const next = stages[i + 1];
    const hours = next ? (new Date(next.scannedAt) - new Date(s.scannedAt)) / 3600000 : null;
    return {
      stage: s.stageName,
      at: s.scannedAt,
      by: s.scannedBy || null,
      location: s.location || null,
      notes: s.notes || null,
      hoursUntilNextStage: hours != null ? Number(hours.toFixed(1)) : null,
    };
  });

  const slowest = [...timeline]
    .filter(t => t.hoursUntilNextStage != null)
    .sort((a, b) => b.hoursUntilNextStage - a.hoursUntilNextStage)[0] || null;

  return {
    caseNumber: kase.caseNumber,
    patientName: kase.patientName,
    workType: kase.workType,
    clinic: kase.clinic?.name || null,
    currentStatus: kase.status,
    createdAt: kase.createdAt,
    deliveryDate: kase.deliveryDate,
    totalStages: stages.length,
    timeline,
    longestStep: slowest ? { stage: slowest.stage, hours: slowest.hoursUntilNextStage } : null,
    deliveries: (kase.deliveryLogs || []).map(d => ({
      pickedUpAt: d.pickedUpAt, deliveredAt: d.deliveredAt,
      by: d.deliveredBy?.name || null, notes: d.notes || null,
    })),
    comments: (kase.comments || []).map(c => ({ at: c.createdAt, by: c.authorName || null, role: c.authorRole || null, text: c.body })),
  };
}

async function getActivityLog({ area, from, to, limit } = {}) {
  const { start, end } = dayBounds(from, to);
  const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 50);
  const range = { from: ymd(start), to: ymd(end) };
  const window = { gte: start, lte: end };

  if (area === 'attendance') {
    const rows = await prisma.attendanceEvent.findMany({
      where: { timestamp: window }, orderBy: { timestamp: 'desc' }, take,
      select: { timestamp: true, type: true, source: true, user: { select: { name: true } } },
    });
    return { range, area, events: rows.map(r => ({ at: r.timestamp, who: r.user?.name, what: r.type, source: r.source })) };
  }

  if (area === 'inventory') {
    const rows = await prisma.inventoryTransaction.findMany({
      where: { createdAt: window }, orderBy: { createdAt: 'desc' }, take,
      select: {
        createdAt: true, type: true, quantity: true, note: true,
        item: { select: { name: true } }, performedBy: { select: { name: true } },
      },
    });
    return { range, area, events: rows.map(r => ({ at: r.createdAt, who: r.performedBy?.name, what: r.type, item: r.item?.name, quantityDelta: r.quantity, note: r.note })) };
  }

  if (area === 'deliveries') {
    const rows = await prisma.deliveryLog.findMany({
      where: { OR: [{ pickedUpAt: window }, { deliveredAt: window }] },
      orderBy: { createdAt: 'desc' }, take,
      select: {
        pickedUpAt: true, deliveredAt: true, notes: true,
        deliveredBy: { select: { name: true } }, case: { select: { caseNumber: true } },
      },
    });
    return { range, area, events: rows.map(r => ({ caseNumber: r.case?.caseNumber, who: r.deliveredBy?.name, pickedUpAt: r.pickedUpAt, deliveredAt: r.deliveredAt, notes: r.notes })) };
  }

  // default: case production scans
  const rows = await prisma.caseStage.findMany({
    where: { scannedAt: window }, orderBy: { scannedAt: 'desc' }, take,
    select: { scannedAt: true, stageName: true, scannedBy: true, location: true, case: { select: { caseNumber: true } } },
  });
  return {
    range, area: 'case_scans',
    events: rows.map(r => ({ at: r.scannedAt, caseNumber: r.case?.caseNumber, stage: r.stageName, who: r.scannedBy, location: r.location })),
  };
}

// ── FULL-POPULATION CASE COUNTING ─────────────────────────
// search_cases returns at most a page of rows, which cannot answer "find
// every case matching X" — a context window physically can't hold thousands
// of rows. This answers the same question the honest way: the true total
// across the whole population plus grouped breakdowns, with no row cap and
// no sampling, so a count is never quietly the capped page size.
async function countCases({ status, paymentStatus, clinicName, workType, dateFrom, dateTo, groupBy } = {}) {
  const where = {};
  if (status) where.status = status;
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (workType) where.workType = { contains: workType, mode: 'insensitive' };
  if (clinicName) where.clinic = { name: { contains: clinicName, mode: 'insensitive' } };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo) where.createdAt.lte = new Date(`${dateTo}T23:59:59.999`);
  }

  const [total, amount] = await Promise.all([
    prisma.case.count({ where }),
    prisma.case.aggregate({ where, _sum: { totalAmount: true } }),
  ]);

  const result = {
    filters: { status: status || null, paymentStatus: paymentStatus || null, clinicName: clinicName || null, workType: workType || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
    totalMatchingCases: total,
    totalAmount: amount._sum.totalAmount || 0,
  };

  const validGroupBy = ['status', 'paymentStatus', 'workType'];
  if (groupBy && validGroupBy.includes(groupBy)) {
    const grouped = await prisma.case.groupBy({
      by: [groupBy], where, _count: { _all: true }, _sum: { totalAmount: true },
    });
    result.groupedBy = groupBy;
    result.breakdown = grouped
      .map(g => ({ value: g[groupBy], cases: g._count._all, amount: g._sum.totalAmount || 0 }))
      .sort((a, b) => b.cases - a.cases);
  }

  return result;
}

module.exports = { getOperationsReport, getStaffAttendance, getCaseHistory, getActivityLog, countCases };
