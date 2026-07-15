// Ye-Almaz — Cases Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const QRCode = require('qrcode');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { awardCasePoints } = require('./rewards');
const { buildWorkbookBuffer, sendXlsx } = require('../utils/excel');

const router = express.Router();
const prisma = new PrismaClient();

// Case numbers continue the imported sequence: YDL26005688, YDL26005689, …
// Backed by the Postgres sequence `case_number_seq` (seeded to 26005687), so
// numbering is atomic/concurrency-safe and unaffected by out-of-band imported
// numbers (e.g. the in-progress YDL2680xxxxx series).
async function generateCaseNumber() {
  const rows = await prisma.$queryRaw`SELECT nextval('case_number_seq') AS n`;
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

async function getDueDays(workType, isExpress = false) {
  try {
    const record = await prisma.workTypePrice.findUnique({
      where: { workType },
      select: { durationDays: true, expressDurationDays: true },
    });
    if (isExpress && record?.expressDurationDays) return record.expressDurationDays;
    if (record?.durationDays) return record.durationDays;
  } catch (_) {}
  return patternDays(workType);
}

// ── GET /api/cases ───────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const { status, paymentStatus, search, clinicId, page = 1, limit = 20, sortDir = 'desc', sortBy = 'date', dateFrom, dateTo, remake, redo } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const dateOrder  = sortDir === 'asc' ? 'asc' : 'desc';
    const orderByCol  = sortBy === 'caseNumber' ? 'caseNumber' : 'createdAt';

    const where = {};
    if (req.user.role === 'CLINIC') where.clinicId = req.user.id;
    else if (clinicId) where.clinicId = clinicId;
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
    // Order-date range filter (on createdAt)
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
    }
    if (remake === 'true')  where.remake = true;
    if (remake === 'false') where.remake = false;
    if (redo   === 'true')  where.redo   = true;
    if (redo   === 'false') where.redo   = false;

    const cacheKey = `cases:${req.user.role}:${req.user.id}:${JSON.stringify({ status, paymentStatus, search, clinicId, page, limit, sortDir, sortBy, dateFrom, dateTo, remake, redo })}`;
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
          clinic:           { select: { id: true, name: true, phone: true, isExcluded: true } },
          stages:           stagesRelation,
          payment:          true,
          assignedDelivery: { select: { id: true, name: true } },
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
    const { status, paymentStatus, search, clinicId, sortDir = 'desc', dateFrom, dateTo, remake, redo } = req.query;

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
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) { const end = new Date(dateTo); end.setHours(23, 59, 59, 999); where.createdAt.lte = end; }
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
      include: { clinic: { select: { name: true } }, payment: { select: { amount: true, status: true } } },
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
    // Stage `notes` are internal LMS-staff comments — never send them to the
    // clinic portal. The cache entry is shared across all roles (it's the same
    // underlying case), so strip notes on the way out rather than fragmenting
    // the cache per-role.
    const forClinic = (data) => {
      if (req.user.role !== 'CLINIC' || !data) return data;
      return { ...data, stages: data.stages?.map(({ notes, ...s }) => s) };
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
        clinic: true,
        stages: { orderBy: { scannedAt: 'asc' } },
        payment: true,
        deliveryLogs: { include: { deliveredBy: { select: { name: true } } } }
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
    const {
      patientName, patientAge, doctorName, doctorPhone, patientGender, workType,
      toothNumbers, units, shade, notes, remake, redo, remakeReason, dueDate, totalAmount, deliveryType, deliveryDate,
      dropOffAtLab
    } = req.body;

    if (!patientName || !workType) {
      return res.status(400).json({ error: 'Patient name and work type are required.' });
    }

    // Shade, doctor name, and doctor contact are mandatory for new orders.
    // Historical/back-dated entries (a deliveryDate is supplied) are exempt.
    if (!deliveryDate) {
      const missing = [];
      if (!shade || !String(shade).trim())             missing.push('shade');
      if (!doctorName || !String(doctorName).trim())   missing.push("doctor's name");
      if (!doctorPhone || !String(doctorPhone).trim()) missing.push("doctor's contact");
      if (missing.length) {
        return res.status(400).json({ error: `Please provide: ${missing.join(', ')}.` });
      }
    }

    const clinicId = req.user.role === 'CLINIC' ? req.user.id : req.body.clinicId;
    if (!clinicId) return res.status(400).json({ error: 'Clinic ID is required.' });

    const isExpress = deliveryType === 'EXPRESS';
    // Auto-calculate due date from work type; use manual value only if explicitly provided
    const autoDays = await getDueDays(workType, isExpress);
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
    const caseNumber = needsScanNumber ? await generateCaseNumber() : null;

    const newCase = await prisma.case.create({
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
        remake:       remake === true || remake === 'true',
        redo:         redo   === true || redo   === 'true',
        remakeReason: remakeReason || null,
        dueDate: resolvedDueDate,
        totalAmount: totalAmount ? parseFloat(totalAmount) : null,
        deliveryType: isExpress ? 'EXPRESS' : 'NORMAL',
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        clinicId,
        receptionistId: req.user.role === 'RECEPTIONIST' ? req.user.id : null,
        status: finalStatus,
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
      updatedCase = await prisma.case.update({
        where: { id: newCase.id },
        data: { qrCodeUrl, qrCodeData: qrData },
        include: { clinic: { select: { name: true } } }
      });
    } else {
      updatedCase = await prisma.case.findUnique({
        where: { id: newCase.id },
        include: { clinic: { select: { name: true } } }
      });
    }

    await prisma.caseStage.create({
      data: {
        caseId: newCase.id,
        stageName: newCase.status,
        scannedBy: req.user.name,
        notes: deliveryDate
          ? 'Case registered as historical/delivered'
          : dropOffAtLab
            ? 'Case dropped off at lab directly'
            : 'Case registered — awaiting impression pickup'
      }
    });

    await prisma.payment.create({
      data: { caseId: newCase.id, status: 'PENDING', amount: totalAmount ? parseFloat(totalAmount) : null }
    });

    // Award reward points if submitted by a clinic
    if (req.user.role === 'CLINIC') {
      awardCasePoints(req.user.id, newCase.id, newCase.caseNumber).catch(() => {});
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
    console.error('[POST /cases]', err);
    res.status(500).json({ error: err.message || 'Could not create case.' });
  }
});

// ── POST /api/cases/:id/accept ───────────────────────────
// Receptionist formally accepts a case: fills in details + generates scan number + QR
router.post('/:id/accept', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { shade, patientName, doctorName, doctorPhone, workType, units, toothNumbers, notes, patientAge, patientGender, deliveryType, totalAmount, dueDate } = req.body;

    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    // Generate scan/case number only if not already assigned
    let caseNumber = existing.caseNumber;
    if (!caseNumber) {
      caseNumber = await generateCaseNumber();
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
      ...(totalAmount   != null && totalAmount !== '' ? { totalAmount: parseFloat(totalAmount) } : {}),
      ...(dueDate       != null && dueDate !== ''     ? { dueDate: new Date(dueDate) }           : {}),
    };

    // Generate QR if not already present
    if (!existing.qrCodeUrl) {
      const qrData   = `${process.env.APP_URL}/api/scan/${existing.id}`;
      const qrCodeUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, color: { dark: '#1A56A0', light: '#FFFFFF' } });
      updatedData.qrCodeUrl  = qrCodeUrl;
      updatedData.qrCodeData = qrData;
    }

    const accepted = await prisma.case.update({
      where: { id: req.params.id },
      data: updatedData,
      include: { clinic: { select: { name: true } } },
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: 'CASE_ACCEPTED',
        scannedBy: req.user.name,
        notes: notes || 'Case accepted by receptionist',
      },
    });

    await invalidate(`case:${req.params.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dispatch:queue');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_updated', { caseId: accepted.id, caseNumber: accepted.caseNumber, status: 'CASE_ACCEPTED' });
    io.to(`clinic_${accepted.clinicId}`).emit('case_updated', { caseId: accepted.id, caseNumber: accepted.caseNumber, status: 'CASE_ACCEPTED' });

    res.json(accepted);
  } catch (err) {
    console.error('[POST /cases/:id/accept]', err);
    res.status(500).json({ error: 'Could not accept case.' });
  }
});

// ── DELETE /api/cases/:id ────────────────────────────────
router.delete('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    // Cascade delete in dependency order
    await prisma.$transaction([
      prisma.caseStage.deleteMany({ where: { caseId: req.params.id } }),
      prisma.caseComment.deleteMany({ where: { caseId: req.params.id } }),
      prisma.deliveryLog.deleteMany({ where: { caseId: req.params.id } }),
      prisma.notification.deleteMany({ where: { caseId: req.params.id } }),
      prisma.payment.deleteMany({ where: { caseId: req.params.id } }),
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
      caseNumber = await generateCaseNumber();
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
  'dueDate', 'deliveryDate', 'totalAmount', 'deliveryType',
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

    const updated = await prisma.case.update({ where: { id: req.params.id }, data });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: existing.status,
        scannedBy: req.user.name,
        notes: `Case details edited by ${req.user.name} (admin)`,
      }
    });

    await invalidate(`case:${req.params.id}`, `case:lab:${req.params.id}`, 'cases:*', 'lab:active:*', 'dashboard:summary', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', { caseId: updated.id, caseNumber: updated.caseNumber, status: updated.status });

    res.json(updated);
  } catch (err) {
    console.error('[PATCH /cases/:id]', err);
    res.status(500).json({ error: 'Could not update case.' });
  }
});

module.exports = router;
