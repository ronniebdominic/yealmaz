// Ye-Almaz — Cases Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const QRCode = require('qrcode');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { awardCasePoints } = require('./rewards');

const router = express.Router();
const prisma = new PrismaClient();

async function generateCaseNumber() {
  const yy = String(new Date().getFullYear()).slice(-2);
  const prefix = `YDL${yy}`;

  const last = await prisma.case.findFirst({
    where: { caseNumber: { startsWith: prefix } },
    orderBy: { caseNumber: 'desc' },
    select: { caseNumber: true },
  });

  const lastNum = last ? parseInt(last.caseNumber.slice(prefix.length), 10) || 0 : 0;
  const padded = String(lastNum + 1).padStart(6, '0');
  return `${prefix}${padded}`;
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
    const { status, paymentStatus, search, clinicId, page = 1, limit = 20, sortDir = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const dateOrder = sortDir === 'asc' ? 'asc' : 'desc';

    const where = {};
    if (req.user.role === 'CLINIC') where.clinicId = req.user.id;
    else if (clinicId) where.clinicId = clinicId;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { clinic: { name: { contains: search, mode: 'insensitive' } } },
        { patientName: { contains: search, mode: 'insensitive' } },
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { workType: { contains: search, mode: 'insensitive' } }
      ];
    }

    const cacheKey = `cases:${req.user.role}:${req.user.id}:${JSON.stringify({ status, paymentStatus, search, clinicId, page, limit, sortDir })}`;
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic: { select: { id: true, name: true, phone: true, isExcluded: true } },
          stages: { orderBy: { scannedAt: 'desc' }, take: 1 },
          payment: true
        },
        orderBy: { createdAt: dateOrder },
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

// ── GET /api/cases/:id ───────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const cacheKey = `case:${req.params.id}`;
    const cached = await appCache.get(cacheKey);
    if (cached) {
      if (req.user.role === 'CLINIC' && cached.clinicId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
      return res.json(cached);
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
    res.json(caseData);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch case.' });
  }
});

// ── POST /api/cases ──────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const {
      patientName, patientAge, doctorName, doctorPhone, patientGender, workType,
      toothNumbers, units, shade, notes, remake, remakeReason, dueDate, totalAmount, deliveryType, deliveryDate
    } = req.body;

    if (!patientName || !workType) {
      return res.status(400).json({ error: 'Patient name and work type are required.' });
    }

    const caseNumber = await generateCaseNumber();
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
        remakeReason: remakeReason || null,
        dueDate: resolvedDueDate,
        totalAmount: totalAmount ? parseFloat(totalAmount) : null,
        deliveryType: isExpress ? 'EXPRESS' : 'NORMAL',
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        clinicId,
        receptionistId: req.user.role === 'RECEPTIONIST' ? req.user.id : null,
        status: deliveryDate ? 'DELIVERED' : 'PENDING_PICKUP'
      }
    });

    const qrData = `${process.env.APP_URL}/api/scan/${newCase.id}`;
    const qrCodeUrl = await QRCode.toDataURL(qrData, {
      width: 300, margin: 2,
      color: { dark: '#1A56A0', light: '#FFFFFF' }
    });

    const updatedCase = await prisma.case.update({
      where: { id: newCase.id },
      data: { qrCodeUrl, qrCodeData: qrData },
      include: { clinic: { select: { name: true } } }
    });

    await prisma.caseStage.create({
      data: {
        caseId: newCase.id,
        stageName: 'PENDING_PICKUP',
        scannedBy: req.user.name,
        notes: 'Case registered — awaiting impression pickup'
      }
    });

    await prisma.payment.create({
      data: { caseId: newCase.id, status: 'PENDING', amount: totalAmount ? parseFloat(totalAmount) : null }
    });

    // Award reward points if submitted by a clinic
    if (req.user.role === 'CLINIC') {
      awardCasePoints(req.user.id, newCase.id, newCase.caseNumber).catch(() => {});
    }

    await invalidate('cases:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*');

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

// ── DELETE /api/cases/:id ────────────────────────────────
router.delete('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.case.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Case not found.' });

    // Cascade delete in dependency order
    await prisma.$transaction([
      prisma.caseStage.deleteMany({ where: { caseId: req.params.id } }),
      prisma.deliveryLog.deleteMany({ where: { caseId: req.params.id } }),
      prisma.notification.deleteMany({ where: { caseId: req.params.id } }),
      prisma.payment.deleteMany({ where: { caseId: req.params.id } }),
      prisma.case.delete({ where: { id: req.params.id } }),
    ]);

    await invalidate(`case:${req.params.id}`, 'cases:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to('lab_staff').emit('case_deleted', { caseId: req.params.id, caseNumber: existing.caseNumber });

    res.json({ success: true, message: `Case ${existing.caseNumber} deleted.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete case.' });
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
router.patch('/:id/status', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { status, notes } = req.body;

    const updated = await prisma.case.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(status === 'DELIVERED' ? { deliveryDate: new Date() } : {}),
      }
    });

    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: status,
        scannedBy: req.user.name,
        notes: notes || null
      }
    });

    invalidate(`case:${req.params.id}`, 'cases:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dashboard:analytics:*', 'lab:active');

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

module.exports = router;
