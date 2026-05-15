// Ye-Almaz — Cases Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const QRCode = require('qrcode');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper: generate case number e.g. YAL-2024-0042
async function generateCaseNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.case.count();
  const padded = String(count + 1).padStart(4, '0');
  return `YAL-${year}-${padded}`;
}

// ── GET /api/cases ───────────────────────────────────────
// Admin & Receptionist: all cases | Clinic: their own cases
router.get('/', protect, async (req, res) => {
  try {
    const { status, paymentStatus, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

    // Clinics only see their own cases
    if (req.user.role === 'CLINIC') {
      where.clinicId = req.user.id;
    }

    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { patientName: { contains: search, mode: 'insensitive' } },
        { caseNumber: { contains: search, mode: 'insensitive' } },
        { workType: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic: { select: { id: true, name: true, phone: true } },
          stages: { orderBy: { scannedAt: 'desc' }, take: 1 },
          payment: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.case.count({ where })
    ]);

    res.json({
      cases,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch cases.' });
  }
});

// ── GET /api/cases/:id ───────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
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

    // Clinics can only see their own cases
    if (req.user.role === 'CLINIC' && caseData.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json(caseData);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch case.' });
  }
});

// ── POST /api/cases ──────────────────────────────────────
// Clinic creates a new case
router.post('/', protect, async (req, res) => {
  try {
    const {
      patientName, patientAge, workType,
      toothNumbers, shade, notes, dueDate, totalAmount
    } = req.body;

    if (!patientName || !workType) {
      return res.status(400).json({ error: 'Patient name and work type are required.' });
    }

    const caseNumber = await generateCaseNumber();
    const clinicId = req.user.role === 'CLINIC' ? req.user.id : req.body.clinicId;

    if (!clinicId) return res.status(400).json({ error: 'Clinic ID is required.' });

    // Create case first to get the ID
    const newCase = await prisma.case.create({
      data: {
        caseNumber,
        patientName,
        patientAge: patientAge ? parseInt(patientAge) : null,
        workType,
        toothNumbers,
        shade,
        notes,
        dueDate: dueDate ? new Date(dueDate) : null,
        totalAmount: totalAmount ? parseFloat(totalAmount) : null,
        clinicId,
        status: 'CASE_ACCEPTED'
      }
    });

    // Generate QR code pointing to scan endpoint
    const qrData = `${process.env.APP_URL}/api/scan/${newCase.id}`;
    const qrCodeUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#1A56A0', light: '#FFFFFF' }
    });

    // Update case with QR code
    const updatedCase = await prisma.case.update({
      where: { id: newCase.id },
      data: { qrCodeUrl, qrCodeData: qrData },
      include: { clinic: { select: { name: true } } }
    });

    // Create initial stage record
    await prisma.caseStage.create({
      data: {
        caseId: newCase.id,
        stageName: 'CASE_ACCEPTED',
        scannedBy: req.user.name,
        notes: 'Case received and registered'
      }
    });

    // Create initial payment record
    await prisma.payment.create({
      data: { caseId: newCase.id, status: 'PENDING', amount: totalAmount ? parseFloat(totalAmount) : null }
    });

    // Notify lab staff via socket
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
    console.error(err);
    res.status(500).json({ error: 'Could not create case.' });
  }
});

// ── PATCH /api/cases/:id/status ──────────────────────────
// Receptionist / Admin updates case status
router.patch('/:id/status', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { status, notes } = req.body;

    const updated = await prisma.case.update({
      where: { id: req.params.id },
      data: { status }
    });

    // Log the stage change
    await prisma.caseStage.create({
      data: {
        caseId: req.params.id,
        stageName: status,
        scannedBy: req.user.name,
        notes: notes || null
      }
    });

    // Notify clinic and lab staff
    const io = req.app.get('io');
    io.to(`clinic_${updated.clinicId}`).emit('case_updated', {
      caseId: updated.id,
      caseNumber: updated.caseNumber,
      status: updated.status
    });
    io.to('lab_staff').emit('case_updated', {
      caseId: updated.id,
      caseNumber: updated.caseNumber,
      status: updated.status
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not update case status.' });
  }
});

module.exports = router;
