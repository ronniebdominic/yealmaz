// Ye-Almaz — loads what the TV needs from the database, records production events, and fans them out.
const crypto = require('node:crypto');
const prisma = require('../db');
const { DEFAULT_CONFIG, sanitizeConfig } = require('./tvConfig');
const { buildSnapshot } = require('./tvProjection');
const extras = require('./tvExtras');
const { DELIVERY_EVENT_STAGE_OR, buildAgentNameMaps } = require('../utils/deliveryAttribution');
const { NOT_ATTENDANCE_ONLY } = require('../utils/attendanceOnly');

const TV_ROOM = 'tv';
const SNAPSHOT_TTL_MS = 3000;
let snapshotCache = null; // { at, seq, value }
let io = null; // the /tv namespace
let lastEventWarn = 0;

const setNamespace = (ns) => { io = ns; };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── config
async function loadConfig() {
  try {
    const row = await prisma.tvConfig.findUnique({ where: { id: 'default' } });
    return sanitizeConfig(row?.config || DEFAULT_CONFIG);
  } catch (err) {
    console.error('[tv] config load failed, using defaults:', err.message);
    return sanitizeConfig(DEFAULT_CONFIG);
  }
}
async function saveConfig(input, userId) {
  const config = sanitizeConfig(input);
  await prisma.tvConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', config, updatedById: userId },
    update: { config, updatedById: userId },
  });
  snapshotCache = null;
  if (io) io.to(TV_ROOM).emit('tv:config', config); // live: no TV restart needed
  return config;
}

// ── events
// Written right after the change it describes was saved. Never throws: a failure to log must not undo or
// fail a scan; the TV's periodic resync still shows the right state because it reads the real tables.
async function recordEvent(evt) {
  try {
    const row = await prisma.productionEvent.create({
      data: {
        type: evt.type, caseId: evt.caseId || null, caseNumber: evt.caseNumber || null,
        stage: evt.stage || null, fromStage: evt.fromStage || null, department: evt.department || null,
        actorUserId: evt.actorUserId || null, actorName: evt.actorName || null, data: evt.data || undefined,
      },
    });
    snapshotCache = null;
    if (io) io.to(TV_ROOM).emit('tv:event', publicEvent(row));
    return row;
  } catch (err) {
    if (Date.now() - lastEventWarn > 60000) { lastEventWarn = Date.now(); console.error('[tv] could not record event (are the TV tables created?):', err.message); }
    return null;
  }
}
// Display-safe view of an event (the actor appears by first name only).
function publicEvent(r) {
  return {
    seq: Number(r.seq), type: r.type, caseNumber: r.caseNumber, stage: r.stage, fromStage: r.fromStage,
    department: r.department, actor: r.actorName ? r.actorName.trim().split(/\s+/)[0] : null, at: r.occurredAt,
  };
}
async function eventsAfter(after, limit = 500) {
  const rows = await prisma.productionEvent.findMany({ where: { seq: { gt: BigInt(after) } }, orderBy: { seq: 'asc' }, take: limit });
  return rows.map(publicEvent);
}
async function latestSeq() {
  const row = await prisma.productionEvent.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true } });
  return row ? Number(row.seq) : 0;
}

// ── snapshot
const startOfLocalDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }; // process TZ is Africa/Addis_Ababa

async function computeSnapshot() {
  const config = await loadConfig();
  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const since = new Date(now.getTime() - 2 * config.performance.periodDays * 24 * 3600 * 1000);

  const seq = await latestSeq(); // read first: anything newer than this arrives as a delta
  const caseRows = await prisma.case.findMany({
    where: { status: { notIn: ['DELIVERED', 'CANCELLED', 'REJECTED'] } },
    select: {
      id: true, caseNumber: true, workType: true, units: true, status: true, dueDate: true, remake: true, redo: true,
      isRedo: true, remakeStatus: true, createdAt: true, updatedAt: true,
      // used only to choose a dispatch bucket; never copied into the snapshot
      paymentStatus: true, assignedDeliveryId: true, clinic: { select: { isExcluded: true } },
    },
  });
  const cases = caseRows.map(({ clinic, ...c }) => ({ ...c, isTrustedPartner: !!clinic?.isExcluded }));
  const ids = cases.map(c => c.id);
  const stageRows = await prisma.caseStage.findMany({
    where: { OR: [{ caseId: { in: ids } }, { scannedAt: { gte: since } }] },
    select: { caseId: true, stageName: true, scannedAt: true, scannedBy: true },
    orderBy: { scannedAt: 'asc' },
    take: 40000,
  });
  const stageRowsByCase = {};
  for (const r of stageRows) (stageRowsByCase[r.caseId] ||= []).push(r);

  // units of cases that already left the lab (needed to weight finished work)
  const known = new Set(ids);
  const otherIds = Object.keys(stageRowsByCase).filter(id => !known.has(id));
  const caseMetaById = new Map(cases.map(c => [c.id, c]));
  for (let i = 0; i < otherIds.length; i += 1000) {
    const rows = await prisma.case.findMany({ where: { id: { in: otherIds.slice(i, i + 1000) } }, select: { id: true, units: true } });
    for (const r of rows) caseMetaById.set(r.id, r);
  }
  const remade = await prisma.case.findMany({
    where: { originalCaseId: { in: Object.keys(stageRowsByCase) } },
    select: { originalCaseId: true },
  });
  const remadeCaseIds = new Set(remade.map(r => r.originalCaseId));

  const employees = await prisma.user.findMany({
    where: { role: 'LAB_TECH', isActive: true, isSharedAccount: false },
    select: { id: true, name: true, departments: true },
  });
  const events = await prisma.attendanceEvent.findMany({
    where: { userId: { in: employees.map(e => e.id) }, timestamp: { gte: dayStart } },
    select: { userId: true, type: true, timestamp: true },
  });
  const attendanceByUser = new Map();
  for (const ev of events) { if (!attendanceByUser.has(ev.userId)) attendanceByUser.set(ev.userId, []); attendanceByUser.get(ev.userId).push(ev); }

  const base = buildSnapshot({ now, dayStart, cases, stageRowsByCase, employees, attendanceByUser, remadeCaseIds, caseMetaById, config, seq });

  // ── extra screens: HR lists, delivery performance (each from the same tables the HR / delivery pages use)
  const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
  const [hrUsers, dayEvents, leaveRecords, holiday, corrections, assignments, agents, deliveryEvents] = await Promise.all([
    prisma.user.findMany({ where: { isSharedAccount: false, isActive: true, OR: [{ role: { not: 'ADMIN' } }, { employeeProfile: { isNot: null } }] }, select: { id: true, name: true, role: true, staffRole: { select: { name: true, department: true } } } }),
    prisma.attendanceEvent.findMany({ where: { timestamp: { gte: dayStart, lte: dayEnd } }, select: { userId: true, type: true, timestamp: true, source: true } }),
    prisma.leaveRecord.findMany({ where: { status: 'APPROVED', fromDate: { lte: dayEnd }, toDate: { gte: dayStart } } }),
    prisma.holiday.findUnique({ where: { date: dayStart } }).catch(() => null),
    prisma.attendanceCorrection.findMany({ where: { date: dayStart } }),
    prisma.shiftAssignment.findMany({ where: { effectiveFrom: { lte: dayStart }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: dayStart } }] }, orderBy: { effectiveFrom: 'desc' }, include: { shift: true } }),
    prisma.user.findMany({ where: { role: 'DELIVERY', isActive: true, ...NOT_ATTENDANCE_ONLY }, select: { id: true, name: true, isActive: true } }),
    prisma.caseStage.findMany({ where: { OR: DELIVERY_EVENT_STAGE_OR, scannedAt: { gte: dayStart }, scannedBy: { not: null } }, select: { stageName: true, scannedBy: true, notes: true, scannedAt: true, caseId: true } }),
  ]);
  const group = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.userId)) m.set(r.userId, []); m.get(r.userId).push(r); } return m; };
  const shiftByUser = new Map();
  for (const a of assignments) if (!shiftByUser.has(a.userId)) shiftByUser.set(a.userId, a.shift);

  return {
    ...base,
    dispatch: extras.buildDispatchBoard({ cases, stageRowsByCase, dayStart, now }),
    statusBoard: extras.buildStatusBoard({ cases, stageRowsByCase, dayStart, config }),
    hr: extras.buildHrBoard({
      day: dayStart, now, employees: hrUsers, eventsByUser: group(dayEvents), leaveByUser: new Map(leaveRecords.map(l => [l.userId, l])),
      shiftByUser, correctionByUser: new Map(corrections.map(c => [c.userId, c])), holiday, hiddenIds: config.hiddenEmployeeIds,
    }),
    delivery: extras.buildDeliveryBoard({ agents, events: deliveryEvents, maps: buildAgentNameMaps(agents), activeCases: cases }),
    labScans: extras.buildLabScans({ stageRowsByCase, employees, dayStart, inProcess: base.kpis.inProduction, hiddenIds: config.hiddenEmployeeIds }),
  };
}

// Coalesces concurrent requests and reuses a result for a few seconds, so many TVs cost one computation.
let inflight = null;
async function getSnapshot() {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) return snapshotCache.value;
  if (!inflight) {
    inflight = computeSnapshot().then(v => { snapshotCache = { at: Date.now(), value: v }; return v; }).finally(() => { inflight = null; });
  }
  return inflight;
}

// ── display sessions
const newSecret = (prefix) => `${prefix}${crypto.randomBytes(24).toString('base64url')}`;
const newPairingCode = () => crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'); // e.g. 3F9A1-C07BE

async function createPairing(label, userId) {
  const code = newPairingCode();
  const row = await prisma.displaySession.create({
    data: { label: label.slice(0, 60), pairingHash: sha256(code), pairingExpiresAt: new Date(Date.now() + 10 * 60 * 1000), createdById: userId },
  });
  return { id: row.id, code, expiresAt: row.pairingExpiresAt };
}
// One-time: exchanges a fresh pairing code for the TV's own long-lived token (shown once, stored hashed).
async function pairDisplay(code) {
  const hash = sha256(String(code || '').trim().toUpperCase());
  const row = await prisma.displaySession.findUnique({ where: { pairingHash: hash } });
  if (!row || row.revokedAt || !row.pairingExpiresAt || row.pairingExpiresAt < new Date()) return null;
  const token = newSecret('tvd_');
  await prisma.displaySession.update({ where: { id: row.id }, data: { tokenHash: sha256(token), pairingHash: null, pairingExpiresAt: null, pairedAt: new Date(), lastSeenAt: new Date() } });
  return { token, id: row.id, label: row.label };
}
const sessionCache = new Map(); // tokenHash -> { at, ok, id }
async function verifyDisplayToken(token) {
  if (typeof token !== 'string' || !token.startsWith('tvd_')) return null;
  const hash = sha256(token);
  const hit = sessionCache.get(hash);
  if (hit && Date.now() - hit.at < 10000) return hit.ok ? { id: hit.id } : null;
  const row = await prisma.displaySession.findUnique({ where: { tokenHash: hash } });
  const ok = !!row && !row.revokedAt;
  sessionCache.set(hash, { at: Date.now(), ok, id: row?.id });
  if (sessionCache.size > 200) sessionCache.clear();
  if (ok && (!row.lastSeenAt || Date.now() - row.lastSeenAt > 60000)) prisma.displaySession.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return ok ? { id: row.id } : null;
}
async function revokeDisplay(id) {
  await prisma.displaySession.update({ where: { id }, data: { revokedAt: new Date() } });
  sessionCache.clear();
  if (io) io.to(`display_${id}`).emit('tv:revoked'); // the screen drops to the pairing page at once
}

module.exports = {
  TV_ROOM, setNamespace, loadConfig, saveConfig, recordEvent, eventsAfter, latestSeq, getSnapshot,
  createPairing, pairDisplay, verifyDisplayToken, revokeDisplay, publicEvent,
};
