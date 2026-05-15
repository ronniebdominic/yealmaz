// Ye-Almaz — Payments Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer — store in memory, upload to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

// Helper: upload buffer to Cloudinary
const uploadToCloudinary = (buffer, caseNumber) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'yealmaz/payments', public_id: `payment_${caseNumber}_${Date.now()}` },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

// ── POST /api/payments/:caseId/upload ────────────────────
// Clinic uploads payment screenshot
router.post('/:caseId/upload', protect, upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId }
    });

    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    // Clinics can only upload for their own cases
    if (req.user.role === 'CLINIC' && caseData.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Upload to Cloudinary
    const screenshotUrl = await uploadToCloudinary(req.file.buffer, caseData.caseNumber);

    // Update payment record
    const payment = await prisma.payment.upsert({
      where: { caseId: req.params.caseId },
      update: {
        screenshotUrl,
        status: 'SCREENSHOT_UPLOADED',
        uploadedAt: new Date()
      },
      create: {
        caseId: req.params.caseId,
        screenshotUrl,
        status: 'SCREENSHOT_UPLOADED',
        uploadedAt: new Date()
      }
    });

    // Update case payment status
    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { paymentStatus: 'SCREENSHOT_UPLOADED' }
    });

    // Notify receptionist
    const io = req.app.get('io');
    io.to('lab_staff').emit('payment_uploaded', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      message: 'Payment screenshot uploaded — awaiting verification'
    });

    res.json({ success: true, payment, screenshotUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ── POST /api/payments/:caseId/verify ───────────────────
// Receptionist approves or rejects payment
router.post('/:caseId/verify', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { action, rejectionReason } = req.body; // action: 'APPROVE' | 'REJECT'

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'Action must be APPROVE or REJECT.' });
    }

    const newPaymentStatus = action === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const newCaseStatus = action === 'APPROVE' ? 'READY_TO_DISPATCH' : undefined;

    const payment = await prisma.payment.update({
      where: { caseId: req.params.caseId },
      data: {
        status: newPaymentStatus,
        verifiedById: req.user.id,
        verifiedAt: new Date(),
        rejectionReason: action === 'REJECT' ? rejectionReason : null
      }
    });

    // Update case
    const caseUpdate = { paymentStatus: newPaymentStatus };
    if (newCaseStatus) caseUpdate.status = newCaseStatus;

    const updatedCase = await prisma.case.update({
      where: { id: req.params.caseId },
      data: caseUpdate
    });

    // If approved, log the stage
    if (action === 'APPROVE') {
      await prisma.caseStage.create({
        data: {
          caseId: req.params.caseId,
          stageName: 'READY_TO_DISPATCH',
          scannedBy: req.user.name,
          notes: 'Payment verified — case ready for dispatch'
        }
      });
    }

    // Notify clinic
    const io = req.app.get('io');
    io.to(`clinic_${updatedCase.clinicId}`).emit('payment_verified', {
      caseId: updatedCase.id,
      caseNumber: updatedCase.caseNumber,
      action,
      rejectionReason: rejectionReason || null,
      message: action === 'APPROVE'
        ? 'Your payment has been verified. Your case is ready for dispatch!'
        : `Payment rejected: ${rejectionReason || 'Please re-upload your payment screenshot.'}`
    });

    res.json({ success: true, payment, case: updatedCase });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ── GET /api/payments/billing ────────────────────────────
// Receptionist sees all cases needing billing attention
router.get('/billing', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const cases = await prisma.case.findMany({
      where: {
        OR: [
          { status: 'PAYMENT_INVOICING' },
          {
            totalAmount: { not: null },
            paymentStatus: { in: ['PENDING', 'SCREENSHOT_UPLOADED', 'REJECTED'] }
          }
        ]
      },
      include: {
        clinic: { select: { name: true, phone: true, email: true, address: true } },
        payment: true
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(cases);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch billing cases.' });
  }
});

// ── POST /api/payments/:caseId/invoice ───────────────────
// Receptionist issues or updates an invoice for a case
router.post('/:caseId/invoice', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { amount, notes } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'A valid amount is required.' });
    }

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { clinic: { select: { id: true, name: true } } }
    });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    const invoiceNumber = `INV-${caseData.caseNumber}`;

    const payment = await prisma.payment.upsert({
      where: { caseId: req.params.caseId },
      update: {
        amount: parseFloat(amount),
        invoiceNumber,
        invoiceIssuedAt: new Date(),
        invoiceNotes: notes || null
      },
      create: {
        caseId: req.params.caseId,
        amount: parseFloat(amount),
        invoiceNumber,
        invoiceIssuedAt: new Date(),
        invoiceNotes: notes || null,
        status: 'PENDING'
      }
    });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { totalAmount: parseFloat(amount) }
    });

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinic.id}`).emit('invoice_issued', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      invoiceNumber,
      amount: parseFloat(amount),
      message: `Invoice issued: ₹${parseFloat(amount).toLocaleString('en-IN')}`
    });

    res.json({ success: true, payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not issue invoice.' });
  }
});

// ── GET /api/payments/pending ────────────────────────────
// Receptionist sees all unverified payments
router.get('/pending', protect, restrict('ADMIN', 'RECEPTIONIST'), async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { status: 'SCREENSHOT_UPLOADED' },
      include: {
        case: {
          include: { clinic: { select: { name: true, phone: true } } }
        }
      },
      orderBy: { uploadedAt: 'asc' }
    });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch pending payments.' });
  }
});

module.exports = router;
