// Ye-Almaz — Cases Routes
const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const QRCode = require('qrcode');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { awardCasePoints } = require('./rewards');
const { clawBackCasePoints } = require('../utils/rewards');
const { buildWorkbookBuffer, sendXlsx } = require('../utils/excel');
const { startOfDay, endOfDay } = require('../utils/dateRange');

const router = express.Router();
const prisma = new PrismaClient();

// Case numbers continue the imported sequence: YDL26005688, YDL26005689, …
// Backed by the Postgres sequence `case_number_seq` (seeded to 26005687), so
// numbering is atomic/concurrency-safe and unaffected by out-of-band imported
// numbers (e.g. the in-progress YDL2680xxxxx series).
// `db` is either the module-level `prisma` client or a `$transaction`
// callback's tx client — same shape for the calls used here.
async function generateCaseNumber(db) {
  const rows = await db.$queryRaw`SELECT nextval('case_number_seq') AS n`;
  return `YDL${rows[0].n.toString()}`;
}

// ── Auto due-date rules ───────────────────────────────────
// DB-stored durationDays takes priority; pattern matching is the fallback.
function patternDays(workType) {
  const w = (workType || '').toLowerCase();
  if (w.includes('coping'))   return 3;
  if (w.includes('aligner'))  return 6;
  if (w.includes('zirconia')) return 4;
  if (w.includes('ceramic'))  return 6;
  if (w.includes('emax'))     return 6;
  if (w.includes('guard') || w.includes('splint') || w.includes('retainer') ||
      w.includes('bleaching') || w.includes('gingival')) return 4;
  return 5;
}

async function getDueDays(db, workType, isExpress = false) {
  try {
    const record = await db.workTypePrice.findUnique({
      where: { workType },
      select: { durationDays: true, expressDurationDays: true },
    });
    if (isExpress && record?.expressDurationDays) return record.expressDurationDays;
    if (record?.durationDays) return record.durationDays;
  } catch (_) {}
  return patternDays(workType);
}

// ── Shared single-case creation ───────────────────────────
// Used by both POST / (one item) and POST /bulk (N items, one per call,
// inside a single transaction) — the only place a Case row gets created,
// so the two entry points can never drift apart. Throws { status, message }
// on validation failure; the caller's route handler catches and responds.
// `db` is either `prisma` or a `$transaction` tx client.
async function createSingleCase(db, fields, actorUser) {
  const {
    patientName, patientAge, doctorName, doctorPhone, patientGender, workType,
    toothNumbers, units, shade, notes, remake, redo, remakeReason, originalCaseId, dueDate, totalAmount,
    deliveryType, deliveryDate, dropOffAtLab, clinicId, orderGroupId,
    discountType, discountValue,
  } = fields;

  if (!patientName || !workType) {
    throw { status: 400, message: 'Patient name and work type are required.' };
  }

  // Remake/redo — the price is decided later by the Operation Manager's
  // review (GET /cases/review/queue, PATCH /:id/review-decide), never by
  // whoever's creating/accepting the case. Enforced server-side (not just
  // client-side) so a stale/incorrect client-sent totalAmount can never
  // stick, and so every remake/redo case is traceable back to the case it
  // replaces — required for the 50%-of-original Redo calculation.
  const isRemake = remake === true || remake === 'true';
  let originalCase = null;
  if (isRemake) {
    if (!originalCaseId) {
      throw { status: 400, message: 'Select the original case this is a remake/redo of.' };
    }
    originalCase = await db.case.findUnique({ where: { id: originalCaseId }, select: { id: true } });
    if (!originalCase) {
      throw { status: 400, message: 'Referenced original case not found.' };
    }
  }

  // Discount audit trail — totalAmount above is already the final,
  // post-discount figure (computed client-side, same convention as
  // POST /:id/accept); these two fields just explain why it's lower than
  // the standard price, not a second source of truth. Not applicable to a
  // remake/redo case — its amount is 0 until reviewed, discount-free.
  if (!isRemake) {
    if (discountType && !['AMOUNT', 'PERCENT'].includes(discountType)) {
      throw { status: 400, message: 'discountType must be AMOUNT or PERCENT.' };
    }
    if (discountType && (discountValue == null || isNaN(parseFloat(discountValue)) || parseFloat(discountValue) < 0)) {
      throw { status: 400, message: 'discountValue must be a non-negative number when a discount type is set.' };
    }
    if (discountType === 'PERCENT' && parseFloat(discountValue) > 100) {
      throw { status: 400, message: 'A percentage discount cannot exceed 100.' };
    }
  }

  // Shade, doctor name, and doctor contact are mandatory for new orders.
  // Historical/back-dated entries (a deliveryDate is supplied) are exempt.
  // Aligner cases have no shade to record — same detection used everywhere
  // else this work type gets special-cased (odontogram, due-date pattern).
  const isAlignerCase = String(workType || '').toLowerCase().includes('aligner');
  if (!deliveryDate) {
    const missing = [];
    if (!isAlignerCase && (!shade || !String(shade).trim())) missing.push('shade');
    if (!doctorName || !String(doctorName).trim())   missing.push("doctor's name");
    if (!doctorPhone || !String(doctorPhone).trim()) missing.push("doctor's contact");
    if (missing.length) {
      throw { status: 400, message: `Please provide: ${missing.join(', ')}.` };
    }
  }

  if (!clinicId) throw { status: 400, message: 'Clinic ID is required.' };

  const isExpress = deliveryType === 'EXPRESS';
  // Auto-calculate due date from work type; use manual value only if explicitly provided
  const autoDays = await getDueDays(db, workType, isExpress);
  const autoDate = new Date();
  autoDate.setDate(autoDate.getDate() + autoDays);
  const resolvedDueDate = dueDate ? new Date(dueDate) : autoDate;

  // Compute units from toothNumbers if not explicitly provided
  const resolvedUnits = units != null
    ? parseInt(units)
    : toothNumbers
      ? toothNumbers.split(',').map(t => t.trim()).filter(Boolean).length
      : null;

  // Determine final status first so we know whether to generate a case number.
  // PENDING_PICKUP cases (mobile submissions, phone orders) go through dispatch → pickup →
  // receptionist acceptance. The scan/case number and QR code are assigned at acceptance,
  // NOT at submission, so the clinic doesn't see a number that implies the case is in production.
  const finalStatus = deliveryDate ? 'DELIVERED' : (dropOffAtLab ? 'CASE_ACCEPTED' : 'PENDING_PICKUP');
  const needsScanNumber = finalStatus !== 'PENDING_PICKUP';
  const caseNumber = needsScanNumber ? await generateCaseNumber(db) : null;

  const newCase = await db.case.create({
    data: {
      caseNumber,
      patientName,
      patientAge: patientAge ? parseInt(patientAge) : null,
      doctorName: doctorName || null,
      doctorPhone: doctorPhone || null,
      patientGender: patientGender || null,
      workType,
      toothNumbers,
      units: resolvedUnits,
      shade,
      notes,
      remake:       isRemake,
      redo:         false, // decided later by review-decide — never set at creation
      remakeReason: isRemake ? (remakeReason || null) : null,
      originalCaseId: isRemake ? originalCase.id : null,
      remakeStatus: isRemake ? 'PENDING_REVIEW' : null,
      dueDate: resolvedDueDate,
      totalAmount: isRemake ? 0 : (totalAmount ? parseFloat(totalAmount) : null),
      deliveryType: isExpress ? 'EXPRESS' : 'NORMAL',
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      clinicId,
      receptionistId: actorUser.role === 'RECEPTIONIST' ? actorUser.id : null,
      status: finalStatus,
      orderGroupId: orderGroupId || null,
      discountType: isRemake ? null : (discountType || null),
      discountValue: isRemake ? null : (discountType ? parseFloat(discountValue) : null),
    }
  });

  // QR code is only meaningful once a case is in lab production.
  // Skip for PENDING_PICKUP cases — it will be generated when the receptionist accepts.
  let updatedCase = newCase;
  if (needsScanNumber) {
    const qrData = `${process.env.APP_URL}/api/scan/${newCase.id}`;
    const qrCodeUrl = await QRCode.toDataURL(qrData, {
      width: 300, margin: 2,
      color: { dark: '#1A56A0', light: '#FFFFFF' }
    });
    updatedCase = await db.case.update({
      where: { id: newCase.id },
      data: { qrCodeUrl, qrCodeData: qrData },
      include: { clinic: { select: { name: true } } }
    });
  } else {
    updatedCase = await db.case.findUnique({
      where: { id: newCase.id },
      include: { clinic: { select: { name: true } } }
    });
  }

  await db.caseStage.create({
    data: {
      caseId: newCase.id,
      stageName: newCase.status,
      scannedBy: actorUser.name,
      notes: deliveryDate
        ? 'Case registered as historical/delivered'
        : dropOffAtLab
          ? 'Case dropped off at lab directly'
          : 'Case registered — awaiting impression pickup'
    }
  });

  await db.payment.create({
    data: { caseId: newCase.id, status: 'PENDING', amount: isRemake ? 0 : (totalAmount ? parseFloat(totalAmount) : null) }
  });

  return updatedCase;
}

// ── GET /api/cases ───────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { status, paymentStatus, search, clinicId, page = 1, limit = 20, sortDir = 'desc', sortBy = 'date', dateFrom, dateTo, dateBy, remake, redo, orderGroupId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const dateOrder  = sortDir === 'asc' ? 'asc' : 'desc';
    const orderByCol  = sortBy === 'caseNumber' ? 'caseNumber' : 'createdAt';

    const where = {};
    if (req.user.role === 'CLINIC') where.clinicId = req.user.id;
    else if (clinicId) where.clinicId = clinicId;
    if (orderGroupId) where.orderGroupId = orderGroupId;
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (paymentStatus) {
      const payStatuses = paymentStatus.split(',').map(s => s.trim()).filter(Boolean);
      where.paymentStatus = payStatuses.length === 1 ? payStatuses[0] : { in: payStatuses };
    }
    if (search) {
      where.OR = [
        { clinic: { name: { contains: search, mode: 'insensitive' } } },
        { patientName: { contains: search, mode: 'insensitive' } },
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { workType: { contains: search, mode: 'insensitive' } }
      ];
    }
    // Date range filter — on createdAt (order date) by default, or on
    // deliveryDate when dateBy=delivery (used by the Admin Analytics
    // drill-downs for delivered-cohort KPIs, so the case list you see
    // matches the date range the tile itself was computed over).
    if (dateFrom || dateTo) {
      const dateField = dateBy === 'delivery' ? 'deliveryDate' : 'createdAt';
      where[dateField] = {};
      if (dateFrom) where[dateField].gte = startOfDay(dateFrom);
      if (dateTo) where[dateField].lte = endOfDay(dateTo);
    }
    if (remake === 'true')  where.remake = true;
    if (remake === 'false') where.remake = false;
    if (redo   === 'true')  where.redo   = true;
    if (redo   === 'false') where.redo   = false;

    const cacheKey = `cases:${req.user.role}:${req.user.id}:${JSON.stringify({ status, paymentStatus, search, clinicId, page, limit, sortDir, sortBy, dateFrom, dateTo, dateBy, remake, redo, orderGroupId })}`;
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);

    // Stage `notes` are internal LMS-staff comments (e.g. from Milling/Margin
    // scans) — never expose them to the clinic portal. Clinics still see the
    // stage name/timestamp for tracking, just not the free-text note.
    const stagesRelation = req.user.role === 'CLINIC'
      ? { select: { id: true, stageName: true, scannedAt: true, location: true }, orderBy: { scannedAt: 'desc' }, take: 1 }
      : { orderBy: { scannedAt: 'desc' }, take: 1 };

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic:           { select: { id: true, name: true, phone: true, isExcluded: true, station: true, zone: { select: { id: true, name: true } } } },
          stages:           stagesRelation,
          payment:          true,
          assignedDelivery: { select: { id: true, name: true } },
          // Remake/redo lineage — so the production label (printLabel.js) can
          // show the previous scan number without a separate fetch.
          originalCase:     { select: { caseNumber: true } },
        },
        orderBy: { [orderByCol]: dateOrder },
        skip,
        take: parseInt(limit)
      }),
      prisma.case.count({ where })
    ]);

    const result = {
      cases,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    };

    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch cases.' });
  }
});

// ── GET /api/cases/export ────────────────────────────────
// Excel export of all cases matching the same filters as GET /api/cases (no pagination).
// Defined before /:id so "export" isn't captured as an :id.
router.get('/export', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'DISPATCH'), async (req, res) => {
  try {
    const { status, paymentStatus, search, clinicId, sortDir = 'desc', dateFrom, dateTo, dateBy, remake, redo } = req.query;

    const where = {};
    if (clinicId) where.clinicId = clinicId;
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (paymentStatus) {
      const payStatuses = paymentStatus.split(',').map(s => s.trim()).filter(Boolean);
      where.paymentStatus = payStatuses.length === 1 ? payStatuses[0] : { in: payStatuses };
    }
    if (search) {
      where.OR = [
        { clinic: { name: { contains: search, mode: 'insensitive' } } },
        { patientName: { contains: search, mode: 'insensitive' } },
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { workType: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      const dateField = dateBy === 'delivery' ? 'deliveryDate' : 'createdAt';
      where[dateField] = {};
      if (dateFrom) where[dateField].gte = startOfDay(dateFrom);
      if (dateTo) where[dateField].lte = endOfDay(dateTo);
    }
    if (remake === 'true')  where.remake = true;
    if (remake === 'false') where.remake = false;
    if (redo   === 'true')  where.redo   = true;
    if (redo   === 'false') where.redo   = false;

    const cases = await prisma.case.findMany({
      where,
      include: { clinic: { select: { name: true } }, payment: { select: { amount: true } } },
      orderBy: { createdAt: sortDir === 'asc' ? 'asc' : 'desc' },
    });

    const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const columns = [
      { header: 'Case #',        value: c => c.caseNumber },
      { header: 'Clinic',        value: c => c.clinic?.name || '' },
      { header: 'Patient',       value: c => c.patientName },
      { header: 'Work Type',     value: c => c.workType },
      { header: 'Units',         value: c => c.units ?? '' },
      { header: 'Shade',         value: c => c.shade || '' },
      { header: 'Doctor',        value: c => c.doctorName || '' },
      { header: 'Doctor Phone',  value: c => c.doctorPhone || '' },
      { header: 'Status',        value: c => c.status },
      { header: 'Payment',       value: c => c.paymentStatus },
      { header: 'Amount (Br)',   value: c => c.payment?.amount ?? c.totalAmount ?? '' },
      { header: 'Delivery Type', value: c => c.deliveryType },
      { header: 'Order Date',    value: c => iso(c.createdAt) },
      { header: 'Due Date',      value: c => iso(c.dueDate) },
      { header: 'Delivered On',  value: c => iso(c.deliveryDate) },
    ];

    const buffer = buildWorkbookBuffer(cases, columns, 'Cases');
    sendXlsx(res, buffer, `cases_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error('[cases export]', err);
    res.status(500).json({ error: 'Could not export cases.' });
  }
});

// ── GET /api/cases/finishing-log ─────────────────────────
// Reception notification feed: cases that have REACHED a finishing stage
// (Metal Finishing or Zirconia Fitting & Finishing) recently — not just
// cases currently parked there. Lab techs often scan a case through several
// stages within minutes, so a "current status" filter would miss it by the
// time reception checks. Defined before /:id so it isn't captured as an id.
const FINISHING_STAGES = ['METAL_FINISHING', 'ZIRCONIA_FITTING_FINISHING'];
router.get('/finishing-log', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  const cacheKey = 'cases:finishing-log';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // rolling 3-day window
    const stages = await prisma.caseStage.findMany({
      where: { stageName: { in: FINISHING_STAGES }, scannedAt: { gte: since } },
      orderBy: { scannedAt: 'desc' },
      select: { caseId: true, stageName: true, scannedAt: true, scannedBy: true },
    });

    // Keep only the most recent finishing scan per case (stages is already
    // ordered newest-first, so the first occurrence per caseId wins).
    const seen = new Set();
    const latestPerCase = [];
    for (const s of stages) {
      if (seen.has(s.caseId)) continue;
      seen.add(s.caseId);
      latestPerCase.push(s);
    }

    const cases = await prisma.case.findMany({
      where: { id: { in: latestPerCase.map(s => s.caseId) }, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      include: {
        clinic: { select: { name: true, zone: { select: { id: true, name: true } } } },
        payment: { select: { amount: true, status: true } },
        // Remake/redo lineage — so this list's "Print Label" button can also
        // show the previous scan number on the printed slip (printLabel.js).
        originalCase: { select: { caseNumber: true } },
      },
    });
    const caseMap = new Map(cases.map(c => [c.id, c]));

    const result = latestPerCase
      .filter(s => caseMap.has(s.caseId))
      .map(s => ({
        ...caseMap.get(s.caseId),
        finishingStage:     s.stageName,
        finishingScannedAt: s.scannedAt,
        finishingScannedBy: s.scannedBy,
      }));

    await appCache.set(cacheKey, result, 20);
    res.json(result);
  } catch (err) {
    console.error('[cases finishing-log]', err);
    res.status(500).json({ error: 'Could not fetch finishing log.' });
  }
});

// ── GET /api/cases/:id ───────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    // Stage `notes` are internal LMS-staff comments, and `scannedBy` names
    // the specific employee who scanned each stage — neither should reach
    // the clinic portal (clinics only need to see status progression, not
    // internal staff attribution). The cache entry is shared across all
    // roles (it's the same underlying case), so strip these on the way out
    // rather than fragmenting the cache per-role.
    const forClinic = (data) => {
      if (req.user.role !== 'CLINIC' || !data) return data;
      return { ...data, stages: data.stages?.map(({ notes, scannedBy, ...s }) => s) };
    };

    const cacheKey = `case:${req.params.id}`;
    const cached = await appCache.get(cacheKey);
    if (cached) {
      if (req.user.role === 'CLINIC' && cached.clinicId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      return res.json(forClinic(cached));
    }

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: {
        clinic: { include: { zone: true } },
        stages: { orderBy: { scannedAt: 'asc' } },
        payment: true,
        deliveryLogs: { include: { deliveredBy: { select: { name: true } } } },
        // Remake/redo lineage — the case this one branched from, and any
        // later cases that branched from this one.
        originalCase: { select: { id: true, caseNumber: true, patientName: true, workType: true } },
        remakes: { select: { id: true, caseNumber: true, patientName: true, status: true, createdAt: true } },
      }
    });

    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (req.user.role === 'CLINIC' && caseData.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await appCache.set(cacheKey, caseData);
    res.json(forClinic(caseData));
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch case.' });
  }
});

// ── POST /api/cases ──────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const clinicId = req.user.role === 'CLINIC' ? req.user.id : req.body.clinicId;
    const updatedCase = await createSingleCase(prisma, { ...req.body, clinicId }, req.user);

    // Award reward points if submitted by a clinic
    if (req.user.role === 'CLINIC') {
      awardCasePoints(req.user.id, updatedCase.id, updatedCase.caseNumber).catch(() => {});
    }

    await invalidate('cases:*', 'payments:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*', 'dispatch:queue', 'dispatch:stations');

    const io = req.app.get('io');
    io.to('lab_staff').emit('new_case', {
      caseId: updatedCase.id,
      caseNumber: updatedCase.caseNumber,
      patientName: updatedCase.patientName,
      clinicName: updatedCase.clinic.name,
      workType: updatedCase.workType
    });

    res.status(201).json(updatedCase);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[POST /cases]', err);
    res.status(500).json({ error: err.message || 'Could not create case.' });
  }
});

// ── POST /api/cases/bulk ──────────────────────────────────
// Multiple work-type items for the same patient visit in one submission
// (e.g. 2 Zirconia crowns for 2 teeth + a separate PFM crown) — each item
// becomes its own independently-tracked Case (own case number/QR/CaseStage/
// Payment, moves through the department pipeline on its own), lightly
// linked via a shared orderGroupId. Single-item submissions keep using
// POST / above — this route requires at least 2 items.
router.post('/bulk', protect, async (req, res) => {
  try {
    const { items, ...shared } = req.body;
    if (!Array.isArray(items) || items.length < 2) {
      return res.status(400).json({ error: 'items must be an array of at least 2 work-type entries.' });
    }

    const clinicId = req.user.role === 'CLINIC' ? req.user.id : shared.clinicId;
    const orderGroupId = crypto.randomUUID();

    const cases = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const item of items) {
        created.push(await createSingleCase(tx, { ...shared, ...item, clinicId, orderGroupId }, req.user));
      }
      return created;
    });

    // Reward points + socket emits happen after the transaction commits —
    // same as the single-case path, so a slow non-DB call never holds a DB lock.
    if (req.user.role === 'CLINIC') {
      for (const c of cases) awardCasePoints(req.user.id, c.id, c.caseNumber).catch(() => {});
    }

    await invalidate('cases:*', 'payments:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*', 'dispatch:queue', 'dispatch:stations');

    const io = req.app.get('io');
    for (const c of cases) {
      io.to('lab_staff').emit('new_case', {
        caseId: c.id,
        caseNumber: c.caseNumber,
        patientName: c.patientName,
        clinicName: c.clinic.name,
        workType: c.workType
      });
    }

    res.status(201).json({ cases });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[POST /cases/bulk]', err);
    res.status(500).json({ error: err.message || 'Could not create cases.' });
  }
});

// ── POST /api/cases/:id/accept ───────────────────────────
// Receptionist formally accepts a case: fills in details + generates scan number + QR
router.post('/:id/accept', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const {
      shade, patientName, doctorName, doctorPhone, workType, units, toothNumbers, notes,
      patientAge, patientGender, deliveryType, totalAmount, dueDate,
      remake, redo, isRedo, remakeReason, originalCaseId,
      discountType, discountValue,
      // Extra work-type items for a multi-item order the receptionist is
      // splitting out while accepting — each becomes its own new,
      // fully-accepted Case (own scan number, QR, stage, payment row) via
      // the same createSingleCase() helper /cases/bulk uses, sharing an
      // orderGroupId with the case being accepted here. Shape matches
      // NewCase.jsx's buildItemPayload: { workType, shade, toothNumbers,
      // units, totalAmount, dueDate, remake, remakeReason, originalCaseId,
      // discountType, discountValue }.
      additionalItems,
    } = req.body;

    if (discountType && !['AMOUNT', 'PERCENT'].includes(discountType)) {
      return res.status(400).json({ error: 'discountType must be AMOUNT or PERCENT.' });
    }
    if (discountType && (discountValue == null || isNaN(parseFloat(discountValue)) || parseFloat(discountValue) < 0)) {
      return res.status(400).json({ error: 'discountValue must be a non-negative number when a discount type is set.' });
    }
    if (discountType === 'PERCENT' && parseFloat(discountValue) > 100) {
      return res.status(400).json({ error: 'A percentage discount cannot exceed 100.' });
    }

    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    const extraItems = Array.isArray(additionalItems) ? additionalItems.filter(it => it && it.workType) : [];
    for (const it of extraItems) {
      if (it.discountType && !['AMOUNT', 'PERCENT'].includes(it.discountType)) {
        return res.status(400).json({ error: 'discountType must be AMOUNT or PERCENT.' });
      }
    }
    // Splitting into multiple work-type items links them all under one
    // orderGroupId — reuse the case's existing group if it's already part
    // of one (e.g. re-accepting), otherwise mint a new one only when
    // there's actually more than one item to group.
    const orderGroupId = extraItems.length > 0 ? (existing.orderGroupId || crypto.randomUUID()) : existing.orderGroupId;

    // Remake/redo lineage — this case keeps getting its own new scan number
    // (assigned below, same as any other case); originalCaseId just links it
    // back to the case it's a remake/redo of, like a branch pointing at its
    // parent. Validate the reference so a typo/stale ID doesn't silently 404
    // later when someone tries to follow the link.
    //
    // The price itself is decided later by the Operation Manager's review
    // (GET /cases/review/queue, PATCH /:id/review-decide) — accepting a
    // remake/redo case always forces totalAmount to 0 and an original case
    // link is required, since the eventual 50%-of-original Redo calculation
    // depends on it.
    const isRemake = remake === true || remake === 'true';
    let originalCase = null;
    if (originalCaseId) {
      if (originalCaseId === req.params.id) {
        return res.status(400).json({ error: 'A case cannot reference itself as the original case.' });
      }
      originalCase = await prisma.case.findUnique({ where: { id: originalCaseId }, select: { id: true, caseNumber: true } });
      if (!originalCase) return res.status(400).json({ error: 'Referenced original case not found.' });
    }
    if (isRemake && !originalCase) {
      return res.status(400).json({ error: 'Select the original case this is a remake/redo of.' });
    }

    // Generate scan/case number only if not already assigned
    let caseNumber = existing.caseNumber;
    if (!caseNumber) {
      caseNumber = await generateCaseNumber(prisma);
    }

    const resolvedUnits = units != null
      ? parseInt(units)
      : toothNumbers
        ? toothNumbers.split(',').map(t => t.trim()).filter(Boolean).length
        : existing.units;

    const updatedData = {
      status: 'CASE_ACCEPTED',
      caseNumber,
      ...(shade        ? { shade }                        : {}),
      ...(patientName  ? { patientName: patientName.trim() } : {}),
      ...(doctorName   ? { doctorName }                   : {}),
      ...(doctorPhone  ? { doctorPhone }                  : {}),
      ...(workType     ? { workType }                     : {}),
      ...(resolvedUnits ? { units: resolvedUnits }        : {}),
      ...(toothNumbers  ? { toothNumbers }                : {}),
      ...(notes        ? { notes }                        : {}),
      ...(patientAge    ? { patientAge: parseInt(patientAge) }     : {}),
      ...(patientGender ? { patientGender }                        : {}),
      ...(deliveryType  != null                  ? { deliveryType }                              : {}),
      ...(dueDate       != null && dueDate !== ''     ? { dueDate: new Date(dueDate) }           : {}),
      ...(remake != null ? { remake: Boolean(remake) } : {}),
      ...(isRedo != null ? { isRedo: Boolean(isRedo) } : {}),
      ...(remake ? { remakeReason: remakeReason?.trim() || null } : {}),
      ...(originalCase ? { originalCaseId: originalCase.id } : {}),
      ...(isRemake
        // Server-enforced, not just client-side — regardless of whatever
        // totalAmount/discount/redo the client sent, a remake/redo case is
        // always Br 0 and unreviewed until the Operation Manager decides.
        ? { redo: false, totalAmount: 0, discountType: null, discountValue: null, remakeStatus: 'PENDING_REVIEW' }
        : {
            ...(totalAmount != null && totalAmount !== '' ? { totalAmount: parseFloat(totalAmount) } : {}),
            ...(redo != null ? { redo: Boolean(redo) } : {}),
            // Locked at acceptance time — totalAmount above is already the
            // final, post-discount figure (computed client-side same as the
            // rest of this endpoint's pricing); these two fields are the
            // audit trail explaining why it's lower than the standard
            // price, not a second source of truth.
            discountType: discountType || null,
            discountValue: discountType ? parseFloat(discountValue) : null,
          }),
      orderGroupId: orderGroupId || null,
    };

    // Split-off items should carry the patient/doctor details as they're
    // actually being saved on THIS accept (updatedData), not the stale
    // pre-accept row — e.g. a doctor name corrected while accepting must
    // flow through to every sibling case too, not just the primary one.
    const effectiveShared = {
      patientName: updatedData.patientName ?? existing.patientName,
      doctorName: updatedData.doctorName ?? existing.doctorName,
      doctorPhone: updatedData.doctorPhone ?? existing.doctorPhone,
      patientGender: updatedData.patientGender ?? existing.patientGender,
      deliveryType: updatedData.deliveryType ?? existing.deliveryType,
      notes: updatedData.notes ?? existing.notes,
    };

    // Generate QR if not already present
    if (!existing.qrCodeUrl) {
      const qrData   = `${process.env.APP_URL}/api/scan/${existing.id}`;
      const qrCodeUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#1A56A0', light: '#FFFFFF' } });
      updatedData.qrCodeUrl  = qrCodeUrl;
      updatedData.qrCodeData = qrData;
    }

    const lineageFlags = [
      isRemake ? `Remake/Redo${remakeReason?.trim() ? ' — ' + remakeReason.trim() : ''} (pending Operation Manager review)` : null,
      isRedo ? 'Redo/Replacement (50%)' : null,
    ].filter(Boolean);
    const lineageNote = originalCase
      ? ` — ${lineageFlags.length ? lineageFlags.join(', ') : 'linked'} of case ${originalCase.caseNumber || originalCase.id}`
      : '';

    // Accepting the primary case + splitting off any extra work-type items
    // as sibling cases (sharing orderGroupId) is one atomic action — either
    // all of it lands or none of it does. Wrapped in a transaction only
    // when there's actually a split to do, so the common single-item path
    // is unchanged from before.
    const doAccept = async (db) => {
      const acceptedCase = await db.case.update({
        where: { id: req.params.id },
        data: updatedData,
        include: { clinic: { select: { name: true } } },
      });

      await db.caseStage.create({
        data: {
          caseId: req.params.id,
          stageName: 'CASE_ACCEPTED',
          scannedBy: req.user.name,
          notes: (notes || 'Case accepted by receptionist') + lineageNote,
        },
      });

      const additionalCases = [];
      for (const item of extraItems) {
        additionalCases.push(await createSingleCase(db, {
          patientAge: existing.patientAge,
          ...effectiveShared,
          ...item,
          clinicId: existing.clinicId,
          dropOffAtLab: true,
          orderGroupId,
        }, req.user));
      }

      return { acceptedCase, additionalCases };
    };

    const { acceptedCase: accepted, additionalCases } = extraItems.length > 0
      ? await prisma.$transaction((tx) => doAccept(tx))
      : await doAccept(prisma);

    await invalidate(
      `case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dispatch:queue',
      ...(additionalCases.length ? ['dashboard:cases-by-status', 'dashboard:analytics:*', 'dispatch:stations'] : [])
    );

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_updated', { caseId: accepted.id, caseNumber: accepted.caseNumber, status: 'CASE_ACCEPTED' });
    io.to(`clinic_${accepted.clinicId}`).emit('case_updated', { caseId: accepted.id, caseNumber: accepted.caseNumber, status: 'CASE_ACCEPTED' });
    for (const c of additionalCases) {
      io.to('lab_staff').emit('new_case', {
        caseId: c.id,
        caseNumber: c.caseNumber,
        patientName: c.patientName,
        clinicName: c.clinic.name,
        workType: c.workType,
      });
    }

    res.json(additionalCases.length ? { ...accepted, additionalCases } : accepted);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[POST /cases/:id/accept]', err);
    res.status(500).json({ error: 'Could not accept case.' });
  }
});

// ── DELETE /api/cases/:id ────────────────────────────────
// ADMIN can delete any case. DISPATCH can only delete orders that haven't
// been accepted yet (no caseNumber, still PENDING_PICKUP/PICKUP_ASSIGNED/
// CANCELLED) — e.g. an order the clinic cancelled before it was ever picked
// up, so it doesn't pile up as a dead row after cancel-pickup already
// removed it from the active pipeline.
router.delete('/:id', protect, restrict('ADMIN', 'DISPATCH'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    if (req.user.role === 'DISPATCH' &&
        (existing.caseNumber || !['PENDING_PICKUP', 'PICKUP_ASSIGNED', 'CANCELLED'].includes(existing.status))) {
      return res.status(403).json({ error: 'Dispatch can only delete orders that have not been accepted yet.' });
    }

    // A case that never got picked up shouldn't leave the clinic holding
    // reward points for an order that never actually happened.
    await clawBackCasePoints(prisma, existing.id, existing.clinicId);

    // Cascade delete in dependency order
    await prisma.$transaction([
      prisma.caseStage.deleteMany({ where: { caseId: req.params.id } }),
      prisma.caseComment.deleteMany({ where: { caseId: req.params.id } }),
      prisma.deliveryLog.deleteMany({ where: { caseId: req.params.id } }),
      prisma.notification.deleteMany({ where: { caseId: req.params.id } }),
      prisma.payment.deleteMany({ where: { caseId: req.params.id } }),
      prisma.sheetSyncRow.deleteMany({ where: { caseId: req.params.id } }),
      prisma.case.delete({ where: { id: req.params.id } }),
    ]);

    // Reclaim the scan number if it was the most recently issued one, so a deleted
    // case doesn't leave a permanent gap — the next new case reuses it instead of
    // the sequence skipping ahead. Only safe when it's exactly the last number
    // issued (nothing has been generated after it).
    const numMatch = existing.caseNumber && existing.caseNumber.match(/^YDL(\d+)$/);
    if (numMatch) {
      const deletedNum = BigInt(numMatch[1]);
      const [seqRow] = await prisma.$queryRawUnsafe(`SELECT last_value, is_called FROM case_number_seq`);
      if (seqRow.is_called && seqRow.last_value === deletedNum) {
        await prisma.$executeRawUnsafe(`SELECT setval('case_number_seq', ${(deletedNum - 1n).toString()}, true)`);
      }
    }

    await invalidate(`case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_deleted', { caseId: req.params.id, caseNumber: existing.caseNumber });

    res.json({ success: true, message: `Case ${existing.caseNumber} deleted.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete case.' });
  }
});

// ── GET /api/cases/:id/comments ─────────────────────────
// Staff comment thread on a case (e.g. additional info needed from the dentist)
router.get('/:id/comments', protect, async (req, res) => {
  try {
    if (req.user.role === 'CLINIC') {
      const c = await prisma.case.findUnique({ where: { id: req.params.id }, select: { clinicId: true } });
      if (!c || c.clinicId !== req.user.id) return res.status(403).json({ error: 'Access denied.' });
    }
    const comments = await prisma.caseComment.findMany({
      where: { caseId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    console.error('[GET comments]', err);
    res.status(500).json({ error: 'Could not load comments.' });
  }
});

// ── POST /api/cases/:id/comments ────────────────────────
router.post('/:id/comments', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'DISPATCH'), async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'Comment cannot be empty.' });
    }
    const comment = await prisma.caseComment.create({
      data: {
        caseId:     req.params.id,
        body:       String(body).trim(),
        authorName: req.user.name,
        authorRole: req.user.role,
      },
    });
    res.status(201).json(comment);
  } catch (err) {
    console.error('[POST comments]', err);
    res.status(500).json({ error: 'Could not add comment.' });
  }
});

// ── PATCH /api/cases/:id/delivery-date ──────────────────
router.patch('/:id/delivery-date', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { deliveryDate } = req.body;
    const updated = await prisma.case.update({
      where: { id: req.params.id },
      data: { deliveryDate: deliveryDate ? new Date(deliveryDate) : null },
    });
    await invalidate(`case:${req.params.id}`, 'cases:*', 'dashboard:analytics:*');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update delivery date.' });
  }
});

// ── PATCH /api/cases/:id/units ────────────────────────────
// Reception (not just admin) can correct the unit count — the number of
// units actually going out sometimes changes right before/at delivery
// (e.g. a unit was dropped from the case, or the lab count differed from
// what was ordered), and that shouldn't require an admin to fix.
//
// Units and pricing are linked: for per-unit work types (isFlatRate=false
// on WorkTypePrice) the billed amount shifts by (newUnits - oldUnits) *
// unitPrice, where unitPrice honors the case's delivery type (express vs
// normal) and remake/redo status (free / 50%). This is a DELTA adjustment,
// not a from-scratch recompute, so anything else baked into totalAmount at
// creation (e.g. a digital-intake arch fee) is preserved untouched. Flat-rate
// work types (dentures, night guards, retainers, etc.) are priced per case
// regardless of unit count, so units change with no price impact.
//
// If payment has already been verified (money collected/confirmed), the
// amount is deliberately left alone — silently rewriting a verified payment
// would corrupt the financial record. The response flags this so the UI can
// tell the receptionist to loop in Finance/Admin for a manual adjustment.
router.patch('/:id/units', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.id }, include: { payment: true } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    const units = parseInt(req.body.units, 10);
    if (!Number.isInteger(units) || units < 1) {
      return res.status(400).json({ error: 'Units must be a whole number of at least 1.' });
    }

    const oldUnits = existing.units ?? 0;
    const unitsChanged = units !== oldUnits;

    let priceAdjustment = { changed: false, reason: 'unchanged', oldAmount: existing.totalAmount ?? null, newAmount: existing.totalAmount ?? null };
    const caseData = { units };

    if (unitsChanged) {
      if (existing.payment?.status === 'VERIFIED') {
        priceAdjustment = { changed: false, reason: 'payment_verified', oldAmount: existing.totalAmount ?? null, newAmount: existing.totalAmount ?? null };
      } else {
        const priceRow = await prisma.workTypePrice.findUnique({ where: { workType: existing.workType } });
        if (!priceRow || priceRow.isFlatRate) {
          priceAdjustment = { changed: false, reason: priceRow ? 'flat_rate' : 'no_price_row', oldAmount: existing.totalAmount ?? null, newAmount: existing.totalAmount ?? null };
        } else {
          const useExpress = existing.deliveryType === 'EXPRESS' && priceRow.expressPrice != null;
          const unitPrice = useExpress ? priceRow.expressPrice : priceRow.price;
          const multiplier = existing.remake ? 0 : (existing.redo || existing.isRedo) ? 0.5 : 1;
          const delta = unitPrice * multiplier * (units - oldUnits);

          if (delta !== 0) {
            const oldAmount = existing.totalAmount ?? 0;
            const newAmount = Math.max(0, oldAmount + delta);
            caseData.totalAmount = newAmount;
            priceAdjustment = { changed: true, reason: 'adjusted', oldAmount, newAmount };
          }
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.case.update({ where: { id: req.params.id }, data: caseData, include: { payment: true } });
      if (priceAdjustment.changed && existing.payment) {
        await tx.payment.update({ where: { caseId: req.params.id }, data: { amount: priceAdjustment.newAmount } });
        c.payment.amount = priceAdjustment.newAmount;
      }
      return c;
    });

    if (unitsChanged) {
      const priceNote = priceAdjustment.changed
        ? ` — billed amount adjusted from Br ${priceAdjustment.oldAmount?.toLocaleString('en-US')} to Br ${priceAdjustment.newAmount.toLocaleString('en-US')}`
        : priceAdjustment.reason === 'payment_verified'
          ? ' — amount left unchanged (payment already verified)'
          : '';
      await prisma.caseStage.create({
        data: {
          caseId: req.params.id,
          stageName: existing.status,
          scannedBy: req.user.name,
          notes: `Units changed from ${existing.units ?? '—'} to ${units} by ${req.user.name}${priceNote}`,
        }
      });
    }

    await invalidate(`case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', { caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status });

    res.json({ ...updated, priceAdjustment });
  } catch (err) {
    console.error('[PATCH /cases/:id/units]', err);
    res.status(500).json({ error: 'Could not update units.' });
  }
});

// ── PATCH /api/cases/:id/remake ──────────────────────────
// Mark an EXISTING case as remake/redo (or clear it) — reception, not just
// admin. caseNumber is never reassigned, so the case keeps the exact scan
// number it already has. Flipping remake on fresh (the case wasn't already
// mid-review or decided) re-enters it into the same PENDING_REVIEW workflow
// as accept/create — totalAmount forced to 0 until the Operation Manager
// decides at PATCH /:id/review-decide — so this manual correction path can't
// be used to bypass that review.
router.patch('/:id/remake', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.id }, include: { payment: true } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    const { remake, remakeReason, redo, isRedo, originalCaseId } = req.body;
    const isRemake = Boolean(remake);

    let originalCase = null;
    const resolvedOriginalCaseId = originalCaseId || existing.originalCaseId;
    if (isRemake) {
      if (!resolvedOriginalCaseId) {
        return res.status(400).json({ error: 'Select the original case this is a remake/redo of.' });
      }
      if (resolvedOriginalCaseId === req.params.id) {
        return res.status(400).json({ error: 'A case cannot reference itself as the original case.' });
      }
      originalCase = await prisma.case.findUnique({ where: { id: resolvedOriginalCaseId }, select: { id: true } });
      if (!originalCase) return res.status(400).json({ error: 'Referenced original case not found.' });
    }

    const enteringWorkflow = isRemake && existing.remakeStatus == null;

    const data = {
      remake:       isRemake,
      remakeReason: isRemake ? (remakeReason?.trim() || null) : null,
      redo:         isRemake ? Boolean(redo) : false,
      isRedo:       Boolean(isRedo),
      remakeStatus: isRemake ? (enteringWorkflow ? 'PENDING_REVIEW' : existing.remakeStatus) : null,
      ...(originalCase ? { originalCaseId: originalCase.id } : {}),
      ...(enteringWorkflow ? { totalAmount: 0, discountType: null, discountValue: null } : {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.case.update({ where: { id: req.params.id }, data });
      if (enteringWorkflow && existing.payment) {
        await tx.payment.update({ where: { caseId: req.params.id }, data: { amount: 0 } });
      }
      return c;
    });

    const flags = [
      data.remake ? `Remake/Redo${data.remakeReason ? ' — ' + data.remakeReason : ''}${enteringWorkflow ? ' (pending Operation Manager review)' : ''}` : null,
      data.isRedo ? 'Redo/Replacement (50%)' : null,
    ].filter(Boolean);
    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: existing.status,
        scannedBy: req.user.name,
        notes: flags.length ? `Marked as ${flags.join(', ')} by ${req.user.name}` : `Remake/Redo flags cleared by ${req.user.name}`,
      }
    });

    await invalidate(`case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /cases/:id/remake]', err);
    res.status(500).json({ error: 'Could not update remake/redo status.' });
  }
});

// ── GET /api/cases/review/queue ──────────────────────────
// Every case still awaiting the Operation Manager's remake/redo decision —
// lab-wide, not scoped per-manager (unlike leave requests) since there's no
// "which Operation Manager owns which case" concept, just one queue any
// LEADER/ADMIN can act on.
router.get('/review/queue', protect, restrict('LEADER', 'ADMIN'), async (req, res) => {
  try {
    const cases = await prisma.case.findMany({
      where: { remakeStatus: 'PENDING_REVIEW' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, caseNumber: true, patientName: true, workType: true,
        remakeReason: true, createdAt: true,
        clinic: { select: { name: true } },
        originalCase: { select: { id: true, caseNumber: true, patientName: true, workType: true, totalAmount: true } },
      },
    });
    res.json(cases);
  } catch (err) {
    console.error('[GET /cases/review/queue]', err);
    res.status(500).json({ error: 'Could not load the review queue.' });
  }
});

// ── PATCH /api/cases/:id/review-decide ───────────────────
// Operation Manager's decision on a pending remake/redo case: REMAKE (free
// of charge, totalAmount stays 0) or REDO (charged 50% of the ORIGINAL
// case's totalAmount — not a fresh recalculation of this case's own work
// type/units). Payment.amount is explicitly re-synced here since nothing
// keeps it auto-synced with Case.totalAmount on most write paths.
router.patch('/:id/review-decide', protect, restrict('LEADER', 'ADMIN'), async (req, res) => {
  try {
    const { decision } = req.body;
    if (!['REMAKE', 'REDO'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be REMAKE or REDO.' });
    }

    const existing = await prisma.case.findUnique({
      where: { id: req.params.id },
      include: { payment: true, originalCase: { select: { id: true, caseNumber: true, totalAmount: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });
    if (existing.remakeStatus !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: 'This case is not awaiting review.' });
    }
    if (!existing.originalCase) {
      return res.status(400).json({ error: 'This case has no linked original case — cannot calculate a Redo charge.' });
    }

    const isRedo = decision === 'REDO';
    const newAmount = isRedo ? Math.round((existing.originalCase.totalAmount || 0) * 0.5 * 100) / 100 : 0;

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.case.update({
        where: { id: req.params.id },
        data: {
          remakeStatus: isRedo ? 'REDO_CHARGED' : 'REMAKE_FREE',
          redo: isRedo,
          totalAmount: newAmount,
        },
        include: { clinic: { select: { name: true } } },
      });
      if (existing.payment) {
        await tx.payment.update({ where: { caseId: req.params.id }, data: { amount: newAmount } });
      }
      await tx.caseStage.create({
        data: {
          caseId: req.params.id,
          stageName: existing.status,
          scannedBy: req.user.name,
          notes: isRedo
            ? `Case review: Redo — charged Br ${newAmount.toLocaleString('en-US')} (50% of original ${existing.originalCase.caseNumber || ''}) — decided by ${req.user.name}`
            : `Case review: Remake — free of charge — decided by ${req.user.name}`,
        },
      });
      return c;
    });

    await invalidate(`case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*', 'dispatch:queue');
    res.json(updated);
  } catch (err) {
    console.error('[PATCH /cases/:id/review-decide]', err);
    res.status(500).json({ error: 'Could not record the review decision.' });
  }
});

// ── PATCH /api/cases/:id/status ──────────────────────────
// RECEPTIONIST/ADMIN can set any status (incl. REJECTED, UNDER_REVIEW).
// DELIVERY role is limited to delivery-workflow transitions only.
router.patch('/:id/status', protect, restrict('ADMIN', 'RECEPTIONIST', 'DELIVERY'), async (req, res) => {
  try {
    const { status, notes } = req.body;

    const DELIVERY_ALLOWED = new Set(['CASE_ACCEPTED','PENDING_PICKUP','OUT_FOR_DELIVERY','DELIVERED','READY_TO_DISPATCH']);
    if (req.user.role === 'DELIVERY' && !DELIVERY_ALLOWED.has(status)) {
      return res.status(403).json({ error: `Delivery role cannot set status to ${status}.` });
    }

    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    // Any status past PENDING_PICKUP needs a scan/case number. The dedicated /accept
    // endpoint assigns one, but this generic status override (used for manual
    // corrections) previously didn't — a case could be pushed to CASE_ACCEPTED (or
    // further) here and be stuck with no scan number. Assign one here too, same rule
    // as case creation/acceptance.
    let caseNumber = existing.caseNumber;
    let assignedNumber = false;
    if (!caseNumber && status !== 'PENDING_PICKUP') {
      caseNumber = await generateCaseNumber(prisma);
      assignedNumber = true;
    }

    const updated = await prisma.case.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(assignedNumber ? { caseNumber } : {}),
        ...(status === 'DELIVERED' ? { deliveryDate: new Date() } : {}),
      }
    });

    // QR code is tied to having a scan number — generate it now if this transition
    // just assigned the case's first one (mirrors /accept's behavior).
    if (assignedNumber && !existing.qrCodeUrl) {
      const qrData = `${process.env.APP_URL}/api/scan/${req.params.id}`;
      const qrCodeUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#1A56A0', light: '#FFFFFF' } });
      await prisma.case.update({ where: { id: req.params.id }, data: { qrCodeUrl, qrCodeData: qrData } });
    }

    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: status,
        scannedBy: req.user.name,
        notes: notes || null
      }
    });

    invalidate(`case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*', 'lab:active');

    const io = req.app.get('io');
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', {
      caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status
    });
    io.to('lab_staff').emit('case_updated', {
      caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update case status.' });
  }
});

// ── PATCH /api/cases/:id ─────────────────────────────────
// Admin-only: edit core case details (patient/doctor info, work type, tooth
// numbers, units, shade, pricing, dates, remake/redo flags). Status and
// payment status are changed via their own dedicated endpoints, not here.
const EDITABLE_FIELDS = [
  'patientName', 'patientAge', 'doctorName', 'doctorPhone', 'patientGender',
  'workType', 'toothNumbers', 'units', 'shade', 'notes',
  'remake', 'redo', 'remakeReason', 'isRedo',
  'dueDate', 'deliveryDate', 'totalAmount', 'deliveryType', 'clinicId',
];
const INT_FIELDS   = new Set(['patientAge', 'units']);
const FLOAT_FIELDS = new Set(['totalAmount']);
const DATE_FIELDS  = new Set(['dueDate', 'deliveryDate']);
const BOOL_FIELDS  = new Set(['remake', 'redo', 'isRedo']);

router.patch('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    const data = {};
    for (const field of EDITABLE_FIELDS) {
      if (!(field in req.body)) continue;
      const raw = req.body[field];
      if (INT_FIELDS.has(field))        data[field] = raw === '' || raw == null ? null : parseInt(raw, 10);
      else if (FLOAT_FIELDS.has(field)) data[field] = raw === '' || raw == null ? null : parseFloat(raw);
      else if (DATE_FIELDS.has(field))  data[field] = raw ? new Date(raw) : null;
      else if (BOOL_FIELDS.has(field))  data[field] = Boolean(raw);
      else                              data[field] = raw === '' ? null : raw;
    }

    if ('patientName' in data && !data.patientName) {
      return res.status(400).json({ error: 'Patient name cannot be empty.' });
    }
    if ('workType' in data && !data.workType) {
      return res.status(400).json({ error: 'Work type cannot be empty.' });
    }

    let clinicChangeNote = '';
    if ('clinicId' in data) {
      if (!data.clinicId) return res.status(400).json({ error: 'Clinic cannot be empty.' });
      if (data.clinicId !== existing.clinicId) {
        const [oldClinic, newClinic] = await Promise.all([
          prisma.clinic.findUnique({ where: { id: existing.clinicId }, select: { name: true } }),
          prisma.clinic.findUnique({ where: { id: data.clinicId }, select: { name: true } }),
        ]);
        if (!newClinic) return res.status(400).json({ error: 'Selected clinic does not exist.' });
        clinicChangeNote = ` — clinic changed from ${oldClinic?.name || 'Unknown'} to ${newClinic.name}`;
      }
    }

    const updated = await prisma.case.update({ where: { id: req.params.id }, data });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: existing.status,
        scannedBy: req.user.name,
        notes: `Case details edited by ${req.user.name} (admin)${clinicChangeNote}`,
      }
    });

    await invalidate(`case:${req.params.id}`, `case:lab:${req.params.id}`, 'cases:*', 'lab:active:*', 'dashboard:summary', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', { caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status });
    if (clinicChangeNote) {
      io.to(`clinic_${existing.clinicId}`).emit('case_updated', { caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status });
    }

    res.json(updated);
  } catch (err) {
    console.error('[PATCH /cases/:id]', err);
    res.status(500).json({ error: 'Could not update case.' });
  }
});

module.exports = router;
