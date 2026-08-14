// Ye-Almaz — Payments Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Chapa } = require('chapa-nodejs');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');
const { buildWorkbookBuffer, sendXlsx } = require('../utils/excel');
const { startOfDay, endOfDay } = require('../utils/dateRange');

const router = express.Router();
const prisma = new PrismaClient();

const chapa = process.env.CHAPA_SECRET_KEY
  ? new Chapa({
      secretKey: process.env.CHAPA_SECRET_KEY,
      webhookSecret: process.env.CHAPA_WEBHOOK_SECRET || undefined,
    })
  : null;

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

// ── Chapa: shared helper to mark a payment VERIFIED ──────
// Used by both the webhook and the in-app verify-on-return check.
async function finalizeChapaPayment(txRef, io) {
  const payment = await prisma.payment.findUnique({
    where: { chapaTxRef: txRef },
    include: { case: { include: { clinic: { select: { id: true, name: true } } } } }
  });
  if (!payment || !payment.case) return null;
  if (payment.status === 'VERIFIED') return payment; // already processed

  const verification = await chapa.verify({ tx_ref: txRef });
  if (verification.status !== 'success' || verification.data?.status !== 'success') {
    return null;
  }

  const caseData = payment.case;
  const updatedPayment = await prisma.payment.update({
    where: { caseId: caseData.id },
    data: {
      status: 'VERIFIED',
      verifiedAt: new Date(),
      invoiceNumber: payment.invoiceNumber || `INV-${caseData.caseNumber}`,
      invoiceIssuedAt: payment.invoiceIssuedAt || new Date(),
    }
  });

  const updatedCase = await prisma.case.update({
    where: { id: caseData.id },
    data: { paymentStatus: 'VERIFIED', status: 'READY_TO_DISPATCH' }
  });

  await prisma.caseStage.create({
    data: {
      caseId: caseData.id,
      stageName: 'READY_TO_DISPATCH',
      scannedBy: 'Chapa (Online Payment)',
      notes: `Payment verified via Chapa — invoice ${updatedPayment.invoiceNumber} issued — case ready for dispatch`
    }
  });

  await invalidate(`case:${caseData.id}`, 'cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');

  io?.to(`clinic_${caseData.clinic.id}`).emit('payment_verified', {
    caseId: caseData.id,
    caseNumber: caseData.caseNumber,
    action: 'APPROVE',
    message: 'Your online payment was successful. Your case is ready for dispatch!'
  });

  return updatedPayment;
}

// ── POST /api/payments/:caseId/chapa/initialize ──────────
// Clinic starts an online payment for a case with a pending payment request
router.post('/:caseId/chapa/initialize', protect, async (req, res) => {
  try {
    if (!chapa) return res.status(503).json({ error: 'Online payments are not configured yet.' });

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { clinic: true, payment: true }
    });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (req.user.role === 'CLINIC' && caseData.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const amount = caseData.payment?.amount ?? caseData.totalAmount;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'No amount due for this case.' });
    }
    if (!['PAYMENT_REQUESTED', 'REJECTED'].includes(caseData.paymentStatus)) {
      return res.status(400).json({ error: 'This case is not awaiting payment.' });
    }

    const txRef = chapa.genTxRef({ prefix: 'YDL' });
    const [firstName, ...rest] = (caseData.clinic.name || 'Clinic').split(' ');

    const response = await chapa.initialize({
      amount: String(amount),
      currency: 'ETB',
      tx_ref: txRef,
      first_name: firstName || 'Clinic',
      last_name: rest.join(' ') || caseData.clinic.name || '-',
      email: caseData.clinic.email || 'clinic.payments@gmail.com',
      phone_number: caseData.clinic.phone || undefined,
      callback_url: `${process.env.APP_URL}/api/payments/chapa/webhook`,
      return_url: `${process.env.APP_URL}/api/payments/chapa/return/${caseData.id}`,
      customization: {
        title: 'Ye-Almaz Lab',
        description: `Payment for case ${caseData.caseNumber}`,
      },
    });

    if (response.status !== 'success' || !response.data?.checkout_url) {
      return res.status(502).json({ error: 'Could not start online payment. Please try again.' });
    }

    await prisma.payment.upsert({
      where: { caseId: caseData.id },
      update: { chapaTxRef: txRef, chapaCheckoutUrl: response.data.checkout_url },
      create: { caseId: caseData.id, chapaTxRef: txRef, chapaCheckoutUrl: response.data.checkout_url, amount }
    });

    res.json({ success: true, checkoutUrl: response.data.checkout_url, txRef });
  } catch (err) {
    console.error('[Chapa initialize]', err.message, JSON.stringify(err.errors || err.cause || ''));
    res.status(500).json({ error: 'Could not start online payment. Please try again.' });
  }
});

// ── POST /api/payments/chapa/webhook ─────────────────────
// Public endpoint called by Chapa when a transaction completes.
// Body is parsed (+ raw body captured) by the global express.json middleware.
router.post('/chapa/webhook', async (req, res) => {
  try {
    if (!chapa) return res.status(503).end();

    const signature = req.headers['x-chapa-signature'] || req.headers['chapa-signature'];
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});

    if (process.env.CHAPA_WEBHOOK_SECRET && signature) {
      let valid = false;
      try { valid = chapa.verifyWebhook(rawBody, signature); }
      catch (e) { console.warn('[Chapa webhook] verify threw:', e.message); }
      if (!valid) {
        console.warn('[Chapa webhook] signature mismatch — rejecting');
        return res.status(401).end();
      }
    }

    const txRef = req.body?.tx_ref;
    if (txRef) await finalizeChapaPayment(txRef, req.app.get('io'));

    res.status(200).end();
  } catch (err) {
    console.error('[Chapa webhook]', err);
    res.status(200).end(); // ack so Chapa doesn't retry indefinitely
  }
});

// ── GET /api/payments/chapa/return/:caseId ───────────────
// Browser redirect target after the Chapa checkout completes
router.get('/chapa/return/:caseId', async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { caseId: req.params.caseId } });
    if (chapa && payment?.chapaTxRef) await finalizeChapaPayment(payment.chapaTxRef, req.app.get('io'));
  } catch (err) {
    console.error('[Chapa return]', err);
  }
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment</title>
  <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f1729;color:#fff;text-align:center}</style>
  </head><body><div><h2>✅ Thank you</h2><p>You can return to the Ye-Almaz app now.</p></div></body></html>`);
});

// ── GET /api/payments/chapa/status/:caseId ───────────────
// Polled by the app after returning from the checkout to confirm verification
router.get('/chapa/status/:caseId', protect, async (req, res) => {
  try {
    const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });
    if (req.user.role === 'CLINIC' && caseData.clinicId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const payment = await prisma.payment.findUnique({ where: { caseId: req.params.caseId } });
    if (chapa && payment?.chapaTxRef && payment.status !== 'VERIFIED') {
      await finalizeChapaPayment(payment.chapaTxRef, req.app.get('io'));
    }

    const refreshed = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    res.json({ paymentStatus: refreshed.paymentStatus });
  } catch (err) {
    console.error('[Chapa status]', err);
    res.status(500).json({ error: 'Could not check payment status.' });
  }
});

// ── POST /api/payments/:caseId/verify ───────────────────
router.post('/:caseId/verify', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'FINANCE_CASHIER'), async (req, res) => {
  try {
    const { action, rejectionReason } = req.body;
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'Action must be APPROVE or REJECT.' });
    }

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      select: { caseNumber: true, clinicId: true }
    });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    const newPaymentStatus = action === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const newCaseStatus = action === 'APPROVE' ? 'READY_TO_DISPATCH' : undefined;

    // On approval: auto-issue the invoice
    const invoicePatch = action === 'APPROVE' ? {
      invoiceNumber: `INV-${caseData.caseNumber}`,
      invoiceIssuedAt: new Date(),
    } : {};

    const payment = await prisma.payment.update({
      where: { caseId: req.params.caseId },
      data: {
        status: newPaymentStatus,
        verifiedById: req.user.id,
        verifiedAt: new Date(),
        rejectionReason: action === 'REJECT' ? rejectionReason : null,
        ...invoicePatch,
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
          notes: `Payment verified — invoice ${invoicePatch.invoiceNumber} issued — case ready for dispatch`
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
router.get('/billing', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'FINANCE_CASHIER'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:billing:${page}:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Exclude terminal statuses so cancelled/delivered cases with old payment
    // requests don't bleed into the billing queue.
    const ACTIVE_STATUSES = [
      'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
      'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
      'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
      'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
      'READY_TO_DISPATCH','OUT_FOR_DELIVERY','PENDING_PICKUP','PICKUP_ASSIGNED','UNDER_REVIEW',
    ];
    const where = {
      clinic: { isExcluded: false },
      status: { in: ACTIVE_STATUSES },
      OR: [
        { status: 'PAYMENT_INVOICING', paymentStatus: 'PENDING' },
        { paymentStatus: { in: ['PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED', 'REJECTED'] } }
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

// ── POST /api/payments/:caseId/request ──────────────────
// Finance sends payment request (with amount) to clinic app — no invoice yet
router.post('/:caseId/request', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'DISPATCH'), async (req, res) => {
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

    const amt = parseFloat(amount);

    await prisma.payment.upsert({
      where: { caseId: req.params.caseId },
      update: { amount: amt, status: 'PAYMENT_REQUESTED', invoiceNotes: notes || null },
      create: { caseId: req.params.caseId, amount: amt, status: 'PAYMENT_REQUESTED', invoiceNotes: notes || null }
    });

    await prisma.case.update({
      where: { id: req.params.caseId },
      data: { paymentStatus: 'PAYMENT_REQUESTED', totalAmount: amt }
    });

    // Timeline accountability — who requested it, on the same case-detail
    // production timeline everything else shows up in. Reuses the case's
    // current stage (READY_TO_DISPATCH — this only fires once QC has
    // passed) rather than inventing a new CaseStatus value.
    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId, stageName: caseData.status, scannedBy: req.user.name,
        notes: `Payment requested by ${req.user.name} — Br ${amt.toLocaleString('en-US')}${notes?.trim() ? ` (${notes.trim()})` : ''}`,
      },
    });

    await invalidate(`case:${req.params.caseId}`, 'cases:*', 'payments:*');

    const io = req.app.get('io');
    io.to(`clinic_${caseData.clinic.id}`).emit('payment_requested', {
      caseId: caseData.id,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      amount: amt,
      message: `Payment request: Br ${amt.toLocaleString('en-US')} — please upload your payment receipt`
    });

    const { sendPushToClinic } = require('../utils/webpush');
    await sendPushToClinic(prisma, caseData.clinic.id, {
      title: '💳 Payment Request — Ye-Almaz Lab',
      body: `${caseData.caseNumber}: Br ${amt.toLocaleString('en-US')} due for ${caseData.workType}. Please upload your payment receipt.`,
      data: { caseId: caseData.id, type: 'payment_request' }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send payment request.' });
  }
});

// ── POST /api/payments/:caseId/collect ──────────────────
// Admin manually marks payment as collected (cash, bank transfer, etc.) — no screenshot needed
router.post('/:caseId/collect', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_CASHIER', 'FINANCE_AP'), async (req, res) => {
  try {
    const { amount, notes, taxWithheld } = req.body;

    const caseData = await prisma.case.findUnique({
      where: { id: req.params.caseId },
      include: { clinic: { select: { id: true, name: true } }, payment: true }
    });
    if (!caseData) return res.status(404).json({ error: 'Case not found.' });

    // Some clinics deduct a withholding tax (they file it to the government
    // directly) before paying the remainder — that deducted amount is NOT
    // owed to us, so it must never be conflated with amount/totalAmount (the
    // true invoice value) or amountReceived (a genuine still-owed shortfall).
    const resolvedAmount = amount ? parseFloat(amount) : (caseData.payment?.amount ?? caseData.totalAmount);
    let taxWithheldAmount = null;
    if (taxWithheld) {
      taxWithheldAmount = parseFloat(taxWithheld);
      if (isNaN(taxWithheldAmount) || taxWithheldAmount < 0) {
        return res.status(400).json({ error: 'Tax withheld must be a non-negative number.' });
      }
      if (resolvedAmount != null && taxWithheldAmount > resolvedAmount) {
        return res.status(400).json({ error: 'Tax withheld cannot exceed the amount collected.' });
      }
    }

    const paymentData = {
      status: 'VERIFIED',
      verifiedById: req.user.id,
      verifiedAt: new Date(),
      rejectionReason: null,
    };
    if (amount) paymentData.amount = parseFloat(amount);
    if (taxWithheldAmount != null) paymentData.taxWithheld = taxWithheldAmount;
    let noteText = notes || '';
    if (taxWithheldAmount != null) {
      noteText += `${noteText ? ' | ' : ''}Withholding tax: Br ${taxWithheldAmount} deducted by clinic`;
    }
    if (noteText) paymentData.invoiceNotes = noteText;

    // Issue a real invoice on collection (if one wasn't already issued).
    // Real invoices only exist after payment — this is what Billing & Invoicing lists.
    if (!caseData.payment?.invoiceNumber) {
      paymentData.invoiceNumber   = `INV-${caseData.caseNumber}`;
      paymentData.invoiceIssuedAt = new Date();
    }

    const payment = await prisma.payment.upsert({
      where:  { caseId: req.params.caseId },
      update: paymentData,
      create: { caseId: req.params.caseId, ...paymentData }
    });

    const caseUpdate = { paymentStatus: 'VERIFIED' };
    if (amount) caseUpdate.totalAmount = parseFloat(amount);

    await prisma.case.update({ where: { id: req.params.caseId }, data: caseUpdate });

    // Timeline accountability — this is the only "who actually collected
    // the money" record for trusted-partner settlements (they skip the
    // per-case request/verify flow entirely and are collected later in a
    // batch, case by case, through this same endpoint) as well as any
    // cash case collected in person rather than via the upload/verify flow.
    await prisma.caseStage.create({
      data: {
        caseId: req.params.caseId, stageName: caseData.status, scannedBy: req.user.name,
        notes: `Payment collected by ${req.user.name}${resolvedAmount != null ? ` — Br ${resolvedAmount.toLocaleString('en-US')}` : ''}`,
      },
    });

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
router.get('/pending', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE', 'FINANCE_CASHIER'), async (req, res) => {
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

// ── GET /api/payments/gateway ────────────────────────────
// Clinic-app payment transactions (online gateway + screenshot uploads) with
// their outcome, so finance can see success / failed / pending at a glance.
router.get('/gateway', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_CASHIER'), async (req, res) => {
  const { limit = 200 } = req.query;
  const cacheKey = `payments:gateway:${limit}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Clinic-app payment lifecycle ONLY — a payment request was sent to the clinic,
    // the clinic started an online checkout (chapaTxRef), or uploaded a receipt
    // (screenshotUrl). This deliberately EXCLUDES in-person manual collections
    // (VERIFIED with no chapaTxRef/screenshot), which are not "paid via clinic app".
    const payments = await prisma.payment.findMany({
      where: {
        OR: [
          { chapaTxRef:   { not: null } },  // online gateway attempt (any outcome)
          { screenshotUrl: { not: null } }, // clinic uploaded a receipt (pending/verified/rejected)
          { status: { in: ['PAYMENT_REQUESTED', 'SCREENSHOT_UPLOADED'] } }, // request sent / awaiting review
        ],
      },
      include: { case: { include: { clinic: { select: { name: true, phone: true } } } } },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit),
    });

    const tx = payments.map(p => {
      const method = p.chapaTxRef ? 'GATEWAY' : (p.screenshotUrl ? 'SCREENSHOT' : 'REQUESTED');
      let outcome;
      if (p.status === 'VERIFIED')                 outcome = 'SUCCESS';        // paid via app + approved
      else if (p.status === 'REJECTED')            outcome = 'FAILED';         // rejected / unsuccessful
      else if (p.status === 'SCREENSHOT_UPLOADED') outcome = 'PENDING_REVIEW'; // receipt uploaded, needs approval
      else if (p.status === 'PAYMENT_REQUESTED')   outcome = 'AWAITING_PAYMENT'; // request sent, awaiting clinic
      else if (p.chapaTxRef)                       outcome = 'PENDING_GATEWAY'; // checkout started, not yet confirmed
      else                                         outcome = 'PENDING';
      return {
        id: p.id, caseId: p.caseId,
        caseNumber: p.case?.caseNumber, patientName: p.case?.patientName,
        clinicName: p.case?.clinic?.name, workType: p.case?.workType,
        amount: p.amount, method, outcome, status: p.status,
        chapaTxRef: p.chapaTxRef, screenshotUrl: p.screenshotUrl,
        verifiedAt: p.verifiedAt, uploadedAt: p.uploadedAt, updatedAt: p.updatedAt,
        rejectionReason: p.rejectionReason,
      };
    });

    const counts = tx.reduce((a, t) => {
      if (t.outcome === 'SUCCESS') a.success++;
      else if (t.outcome === 'FAILED') a.failed++;
      else a.pending++;
      return a;
    }, { success: 0, failed: 0, pending: 0 });

    const result = { transactions: tx, counts };
    await appCache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[payments/gateway]', err);
    res.status(500).json({ error: 'Could not fetch gateway transactions.' });
  }
});

// ── GET /api/payments/history ────────────────────────────
router.get('/history', protect, restrict('ADMIN', 'RECEPTIONIST', 'FINANCE'), async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:history:${page}:${limit}:${search}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = {
      status: 'VERIFIED',
      ...(search ? {
        OR: [
          { case: { clinic: { name: { contains: search, mode: 'insensitive' } } } },
          { case: { patientName: { contains: search, mode: 'insensitive' } } },
          { case: { caseNumber: { contains: search, mode: 'insensitive' } } },
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
        ]
      } : {})
    };
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

// ── GET /api/payments/invoices ───────────────────────────
// Real invoices — only exist once payment is done (VERIFIED + invoice issued).
// This is what the Billing & Invoicing tab lists.
router.get('/invoices', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  const { page = 1, limit = 50, search = '', clinicId, dateFrom, dateTo, method } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  try {
    const where = {
      status: 'VERIFIED',
      invoiceNumber: { not: null },
      ...(search ? {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { fsNumber: { contains: search, mode: 'insensitive' } },
          { case: { clinic: { name: { contains: search, mode: 'insensitive' } } } },
          { case: { patientName: { contains: search, mode: 'insensitive' } } },
          { case: { caseNumber: { contains: search, mode: 'insensitive' } } },
        ]
      } : {}),
      ...(clinicId ? { case: { clinicId } } : {}),
      // Method isn't a stored field — it's inferred from which channel
      // recorded the payment (same logic the frontend uses to label it).
      ...(method === 'ONLINE'     ? { chapaTxRef: { not: null } } : {}),
      ...(method === 'SCREENSHOT' ? { chapaTxRef: null, screenshotUrl: { not: null } } : {}),
      ...(method === 'MANUAL'     ? { chapaTxRef: null, screenshotUrl: null } : {}),
    };
    if (dateFrom || dateTo) {
      where.invoiceIssuedAt = {};
      if (dateFrom) where.invoiceIssuedAt.gte = startOfDay(dateFrom);
      if (dateTo) where.invoiceIssuedAt.lte = endOfDay(dateTo);
    }
    const [payments, total, totalAgg] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { case: { include: { clinic: { select: { name: true, phone: true, address: true } } } } },
        orderBy: { invoiceIssuedAt: 'desc' },
        skip, take: parseInt(limit),
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);

    res.json({
      invoices: payments,
      totalAmount: totalAgg._sum.amount || 0,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('[payments/invoices]', err);
    res.status(500).json({ error: 'Could not fetch invoices.' });
  }
});

// ── GET /api/payments/trusted ────────────────────────────
// Pending cases from isExcluded clinics — collected in person by finance
router.get('/trusted', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_AP'), async (req, res) => {
  const { page = 1, limit = 20, search = '', clinicId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `payments:trusted:${page}:${limit}:${search}:${clinicId || ''}`;
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const where = {
      clinic: { isExcluded: true },
      // Outstanding is always exclusive of in-progress cases — finance only
      // collects on cases that have actually been DELIVERED, so in-progress lab
      // cases (still being scanned/designed/milled) are excluded here regardless
      // of whether a specific clinic is selected.
      ...(clinicId
        ? { clinicId, paymentStatus: { not: 'VERIFIED' }, status: 'DELIVERED' }
        : { paymentStatus: 'PENDING', status: 'DELIVERED' }),
      ...(search ? {
        OR: [
          { clinic: { name: { contains: search, mode: 'insensitive' } } },
          { patientName: { contains: search, mode: 'insensitive' } },
          { caseNumber: { contains: search, mode: 'insensitive' } },
        ]
      } : {})
    };

    const [cases, total] = await Promise.all([
      prisma.case.findMany({
        where,
        include: {
          clinic: { select: { id: true, name: true, phone: true, address: true, isExcluded: true } },
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

// ── GET /api/payments/statement/:clinicId ────────────────
// All outstanding (PENDING) cases for a trusted clinic, optionally filtered by month
// Body factored into getClinicStatement() so both the route and the
// Telegram bot's tool layer (services/botTools.js) call the exact same
// query — same convention as dashboard.js's compute* functions.
async function getClinicStatement(clinicId, { dateFrom, dateTo } = {}) {
  const where = {
    clinicId,
    clinic: { isExcluded: true },
    paymentStatus: 'PENDING',
    // A bill only covers work that's actually done — cases still in
    // production (accepted yesterday, in progress, etc.) aren't billable
    // yet and must not appear here, even though their paymentStatus is
    // also PENDING. Matches the same rule already enforced in /trusted.
    status: 'DELIVERED',
  };

  // Filtered by deliveryDate, not createdAt — this bill is "what did we
  // deliver (and are owed for) in this period," not "what was ordered."
  if (dateFrom || dateTo) {
    where.deliveryDate = {};
    if (dateFrom) where.deliveryDate.gte = startOfDay(dateFrom);
    if (dateTo) where.deliveryDate.lte = endOfDay(dateTo);
  }

  return prisma.case.findMany({
    where,
    include: {
      clinic: { select: { name: true, phone: true, address: true } },
      payment: { select: { invoiceNumber: true, amount: true, fsNumber: true, amountReceived: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

router.get('/statement/:clinicId', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_AP'), async (req, res) => {
  try {
    res.json(await getClinicStatement(req.params.clinicId, req.query));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch statement.' });
  }
});

// ── POST /api/payments/:caseId/fs-number ─────────────────
// Manually recorded FS number (the clinic's paper sales-invoice/fiscal
// receipt number) — Finance types this in while reconciling a Trusted
// Partner bill, since the lab has no fiscal-device integration.
router.post('/:caseId/fs-number', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_AP'), async (req, res) => {
  const { caseId } = req.params;
  const { fsNumber } = req.body;

  try {
    const payment = await prisma.payment.update({
      where: { caseId },
      data: { fsNumber: fsNumber ? String(fsNumber).trim() || null : null },
    });
    res.json({ fsNumber: payment.fsNumber });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Case has no payment record.' });
    console.error(err);
    res.status(500).json({ error: 'Could not save FS number.' });
  }
});

// ── GET /api/payments/export ─────────────────────────────
// Excel export of payments. Filter by comma-separated status set, search, and
// a verified-date range — covers billing, history (VERIFIED) and unpaid reports.
router.get('/export', protect, restrict('ADMIN', 'FINANCE', 'RECEPTIONIST'), async (req, res) => {
  try {
    const { status, search, dateFrom, dateTo } = req.query;

    const where = {};
    if (status) where.status = { in: String(status).split(',').map(s => s.trim()).filter(Boolean) };
    if (search) {
      where.OR = [
        { case: { clinic: { name: { contains: search, mode: 'insensitive' } } } },
        { case: { patientName: { contains: search, mode: 'insensitive' } } },
        { case: { caseNumber: { contains: search, mode: 'insensitive' } } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { fsNumber: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (dateFrom || dateTo) {
      where.verifiedAt = {};
      if (dateFrom) where.verifiedAt.gte = startOfDay(dateFrom);
      if (dateTo) where.verifiedAt.lte = endOfDay(dateTo);
    }

    const payments = await prisma.payment.findMany({
      where,
      include: { case: { include: { clinic: { select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });

    const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const columns = [
      { header: 'Invoice #',   value: p => p.invoiceNumber || '' },
      { header: 'FS #',        value: p => p.fsNumber || '' },
      { header: 'Case #',      value: p => p.case?.caseNumber || '' },
      { header: 'Clinic',      value: p => p.case?.clinic?.name || '' },
      { header: 'Patient',     value: p => p.case?.patientName || '' },
      { header: 'Work Type',   value: p => p.case?.workType || '' },
      { header: 'Amount (Br)', value: p => p.amount ?? '' },
      { header: 'Status',      value: p => p.status },
      { header: 'Verified At', value: p => iso(p.verifiedAt) },
    ];

    const buffer = buildWorkbookBuffer(payments, columns, 'Payments');
    sendXlsx(res, buffer, `payments_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error('[payments export]', err);
    res.status(500).json({ error: 'Could not export payments.' });
  }
});

Object.assign(router, { getClinicStatement });

module.exports = router;
