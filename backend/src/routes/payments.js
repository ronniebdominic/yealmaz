// Ye-Almaz — Payments Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const uploadToCloudinary = (buffer, caseNumber) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'yealmaz/payments', public_id: `payment_${caseNumber}_${Date.now()}` },
      (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
    );
    stream.end(buffer);
  });
};

// ── POST /api/payments/:caseId/upload ────────────────────
router.post('/:caseId/upload', protect, upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (req.user.role === 'CLINIC' && caseData.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const screenshotUrl = await uploadToCloudinary(req.file.buffer, caseData.caseNumber);

    const payment = await prisma.payment.upsert({
      where: { caseId: req.params.caseId },
      update: { screenshotUrl, status: 'SCREENSHOT_UPLOADED', uploadedAt: new Date() },
      create: { caseId: req.params.caseId, screenshotUrl, status: 'SCREENSHOT_UPLOADED', uploadedAt: new Date() }
    });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { paymentStatus: 'SCREENSHOT_UPLOADED' }
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'payments:*', 'dashboard:summary');

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
router.post('/:caseId/verify', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE'), async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
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

    const caseUpdate = { paymentStatus: newPaymentStatus };
    if (newCaseStatus) caseUpdate.status = newCaseStatus;

    const updatedCase = await prisma.case.update({
      where: { id: req.params.caseId },
      data: caseUpdate
    });

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

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');

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
router.get('/billing', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:billing:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = {
      OR: [
        { status: { in: ['PAYMENT_INVOICING'] } },
        { totalAmount: { not: null }, paymentStatus: { in: ['PENDING', 'SCREENSHOT_UPLOADED', 'REJECTED'] } }
      ]
    };

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic: { select: { name: true, phone: true, email: true, address: true, isExcluded: true } },
          payment: true
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.case.count({ where })
    ]);

    const result = { cases, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } };
    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch billing cases.' });
  }
});

// ── POST /api/payments/:caseId/invoice ───────────────────
router.post('/:caseId/invoice', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE'), async (req, res) => {
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
      update: { amount: parseFloat(amount), invoiceNumber, invoiceIssuedAt: new Date(), invoiceNotes: notes || null },
      create: { caseId: req.params.caseId, amount: parseFloat(amount), invoiceNumber, invoiceIssuedAt: new Date(), invoiceNotes: notes || null, status: 'PENDING' }
    });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { totalAmount: parseFloat(amount) }
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'payments:*');

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinic.id}`).emit('invoice_issued', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      invoiceNumber,
      amount: parseFloat(amount),
      message: `Invoice issued: Br ${parseFloat(amount).toLocaleString('en-US')}`
    });

    res.json({ success: true, payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not issue invoice.' });
  }
});

// ── POST /api/payments/:caseId/collect ──────────────────
// Admin manually marks payment as collected (cash, bank transfer, etc.) — no screenshot needed
router.post('/:caseId/collect', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  try {
    const { amount, notes } = req.body;

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { clinic: { select: { id: true, name: true } } }
    });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    const paymentData = {
      status: 'VERIFIED',
      verifiedById: req.user.id,
      verifiedAt: new Date(),
      rejectionReason: null,
    };
    if (amount) paymentData.amount = parseFloat(amount);
    if (notes)  paymentData.invoiceNotes = notes;

    const payment = await prisma.payment.upsert({
      where:  { caseId: req.params.caseId },
      update: paymentData,
      create: { caseId: req.params.caseId, ...paymentData }
    });

    const caseUpdate = { paymentStatus: 'VERIFIED' };
    if (amount) caseUpdate.totalAmount = parseFloat(amount);

    await prisma.case.update({ where: { id: req.params.caseId }, data: caseUpdate });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinic.id}`).emit('payment_verified', {
      caseId:  caseData.id,
      caseNumber: caseData.caseNumber,
      action:  'APPROVE',
      message: 'Payment has been confirmed by the lab.'
    });

    res.json({ success: true, payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not collect payment.' });
  }
});

// ── POST /api/payments/:caseId/override ─────────────────
// Admin force-sets payment status to any value with a mandatory reason (audit-logged)
router.post('/:caseId/override', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { status, amount, reason } = req.body;

    const VALID = ['PENDING', 'VERIFIED', 'REJECTED'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID.join(', ')}.` });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'A reason is required for payment overrides.' });
    }

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { clinic: { select: { id: true, name: true } } }
    });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    // Build payment patch
    const paymentPatch = {
      status,
      rejectionReason: status === 'REJECTED' ? reason.trim() : null,
    };
    if (status === 'VERIFIED') {
      paymentPatch.verifiedById = req.user.id;
      paymentPatch.verifiedAt   = new Date();
    }
    if (status === 'PENDING') {
      // Reset verification fields
      paymentPatch.verifiedById    = null;
      paymentPatch.verifiedAt      = null;
      paymentPatch.screenshotUrl   = null;
      paymentPatch.uploadedAt      = null;
    }
    if (amount !== undefined && amount !== null && amount !== '') {
      paymentPatch.amount = parseFloat(amount);
    }

    const payment = await prisma.payment.upsert({
      where:  { caseId: req.params.caseId },
      update: paymentPatch,
      create: { caseId: req.params.caseId, ...paymentPatch }
    });

    const casePatch = { paymentStatus: status };
    if (amount !== undefined && amount !== null && amount !== '') {
      casePatch.totalAmount = parseFloat(amount);
    }
    await prisma.case.update({ where: { id: req.params.caseId }, data: casePatch });

    // Audit trail — record in case stages so it shows in timeline
    await prisma.caseStage.create({
      data: {
        caseId:    req.params.caseId,
        stageName: caseData.status,   // keep current stage, just log the note
        scannedBy: req.user.name,
        notes: `[PAYMENT OVERRIDE → ${status}] ${reason.trim()}`,
      }
    });

    await invalidate(
      `case:${req.params.caseId}`, 'cases:*', 'payments:*',
      'dashboard:summary', 'dashboard:analytics:*'
    );

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinic.id}`).emit('payment_verified', {
      caseId:       caseData.id,
      caseNumber:   caseData.caseNumber,
      action:       status === 'VERIFIED' ? 'APPROVE' : 'UPDATE',
      message:      status === 'VERIFIED'
        ? 'Your payment status has been updated by the lab.'
        : `Payment status updated to ${status}.`,
    });

    res.json({ success: true, payment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not override payment.' });
  }
});

// ── GET /api/payments/pending ────────────────────────────
router.get('/pending', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:pending:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = { status: 'SCREENSHOT_UPLOADED' };
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { case: { include: { clinic: { select: { name: true, phone: true } } } } },
        orderBy: { uploadedAt: 'asc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.payment.count({ where })
    ]);

    const result = { payments, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } };
    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch pending payments.' });
  }
});

// ── GET /api/payments/history ────────────────────────────
router.get('/history', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:history:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = { status: 'VERIFIED' };
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          case: {
            include: { clinic: { select: { name: true } } }
          }
        },
        orderBy: { verifiedAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.payment.count({ where })
    ]);

    const result = {
      payments,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
    };
    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch payment history.' });
  }
});

// ── GET /api/payments/trusted ────────────────────────────
// Pending cases from isExcluded clinics — collected in person by finance
router.get('/trusted', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:trusted:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = {
      paymentStatus: 'PENDING',
      clinic: { isExcluded: true },
    };

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic: { select: { name: true, phone: true, address: true, isExcluded: true } },
          payment: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.case.count({ where }),
    ]);

    const result = {
      cases,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    };
    await appCache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch trusted partner cases.' });
  }
});

module.exports = router;
