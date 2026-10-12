// Ye-Almaz — Clinic advance-payment wallet
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Chapa } = require('chapa-nodejs');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');
const { billedOf } = require('../services/financeRules');
const { sendPushToClinic } = require('../utils/webpush');
const { applyWalletToClinicOutstanding, applyWalletToCase } = require('../services/walletDeduction');

const router = express.Router();
const prisma = new PrismaClient();

const chapa = process.env.CHAPA_SECRET_KEY
  ? new Chapa({ secretKey: process.env.CHAPA_SECRET_KEY, webhookSecret: process.env.CHAPA_WEBHOOK_SECRET || undefined })
  : null;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const FINANCE = ['ADMIN', 'FINANCE', 'FINANCE_CASHIER', 'FINANCE_AP'];
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const WALLET_TX_PREFIX = 'YDLW';

const uploadReceipt = (buffer, clinicId) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'yealmaz/wallet', public_id: `topup_${clinicId}_${Date.now()}` },
    (err, result) => (err ? reject(err) : resolve(result.secure_url)),
  );
  stream.end(buffer);
});

const parseAmount = (v) => {
  const n = round2(parseFloat(v));
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? n : null;
};

// Credit an APPROVED top-up exactly once (concurrent webhook/poll/approve safe).
async function approveTopup(txId, approvedById) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.walletTransaction.updateMany({
      where: { id: txId, type: 'TOPUP', status: 'PENDING' },
      data: { status: 'APPROVED', approvedById: approvedById || null, approvedAt: new Date() },
    });
    if (claimed.count === 0) return null; // already processed
    const t = await tx.walletTransaction.findUnique({ where: { id: txId } });
    await tx.clinicWallet.upsert({
      where: { clinicId: t.clinicId },
      update: { balance: { increment: t.amount } },
      create: { clinicId: t.clinicId, balance: t.amount },
    });
    return t;
  });
}

const PAYCASES_PREFIX = 'PAYCASES:';

async function spendOnCases(clinicId, caseIds) {
  const results = [];
  for (const id of caseIds) {
    const c = await prisma.case.findUnique({ where: { id }, select: { clinicId: true } });
    if (!c || c.clinicId !== clinicId) continue;
    results.push(await applyWalletToCase(prisma, id));
  }
  return results;
}

// The cases a clinic may settle in one go: its own, unpaid, with no receipt awaiting review.
async function payableCases(clinicId, caseIds) {
  if (!Array.isArray(caseIds) || caseIds.length === 0 || caseIds.length > 200) return null;
  const cases = await prisma.case.findMany({
    where: { id: { in: caseIds }, clinicId, remake: false, paymentStatus: { in: ['PENDING', 'PAYMENT_REQUESTED', 'REJECTED'] } },
    select: { id: true, totalAmount: true, payment: { select: { amount: true, amountReceived: true } } },
  });
  return cases
    .map(c => ({ id: c.id, due: round2(billedOf(c) - (c.payment?.amountReceived || 0)) }))
    .filter(c => c.due > 0);
}

// Shared with the public Chapa webhook in payments.js.
async function finalizeWalletTopup(txRef, io) {
  const t = await prisma.walletTransaction.findUnique({ where: { chapaTxRef: txRef } });
  if (!t) return null;
  if (t.status === 'APPROVED') return t;
  if (!chapa) return null;
  const verification = await chapa.verify({ tx_ref: txRef });
  if (verification.status !== 'success' || verification.data?.status !== 'success') return null;
  const credited = await approveTopup(t.id, null);
  if (credited) {
    // A "pay these cases" checkout: the top-up is spent straight away on the chosen cases.
    if (t.note?.startsWith(PAYCASES_PREFIX)) await spendOnCases(t.clinicId, t.note.slice(PAYCASES_PREFIX.length).split(','));
    await invalidate('payments:*', 'cases:*', 'dashboard:summary', 'dashboard:analytics:*');
    io?.to(`clinic_${t.clinicId}`).emit('wallet_updated', { message: `Br ${t.amount.toLocaleString('en-US')} added to your advance balance.` });
    sendPushToClinic(prisma, t.clinicId, { title: '✅ Advance Payment Received', body: `Br ${t.amount.toLocaleString('en-US')} was added to your advance balance.`, data: { type: 'wallet_topup', screen: 'Wallet' } });
  }
  return credited || t;
}
router.finalizeWalletTopup = finalizeWalletTopup;
router.WALLET_TX_PREFIX = WALLET_TX_PREFIX;

// ── Clinic: GET /api/wallet ──────────────────────────────
router.get('/', protect, restrict('CLINIC'), async (req, res) => {
  try {
    const [wallet, transactions] = await Promise.all([
      prisma.clinicWallet.findUnique({ where: { clinicId: req.user.id } }),
      prisma.walletTransaction.findMany({ where: { clinicId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    res.json({ balance: wallet?.balance || 0, transactions });
  } catch (err) {
    console.error('[wallet]', err);
    res.status(500).json({ error: 'Could not load your balance.' });
  }
});

// ── Clinic: start a Chapa top-up ─────────────────────────
router.post('/topup/chapa/initialize', protect, restrict('CLINIC'), async (req, res) => {
  try {
    if (!chapa) return res.status(503).json({ error: 'Online payments are not configured yet.' });
    const amount = parseAmount(req.body.amount);
    if (!amount) return res.status(400).json({ error: 'Enter a valid amount.' });

    const clinic = await prisma.clinic.findUnique({ where: { id: req.user.id } });
    const txRef = chapa.genTxRef({ prefix: WALLET_TX_PREFIX });
    const [firstName, ...rest] = (clinic.name || 'Clinic').split(' ');

    const response = await chapa.initialize({
      amount: String(amount), currency: 'ETB', tx_ref: txRef,
      first_name: firstName || 'Clinic', last_name: rest.join(' ') || clinic.name || '-',
      email: clinic.email || 'clinic.payments@gmail.com',
      phone_number: clinic.phone || undefined,
      callback_url: `${process.env.APP_URL}/api/payments/chapa/webhook`,
      return_url: `${process.env.APP_URL}/api/wallet/chapa/return/${txRef}`,
      customization: { title: 'Ye-Almaz Lab', description: 'Advance payment top-up' },
    });
    if (response.status !== 'success' || !response.data?.checkout_url) {
      return res.status(502).json({ error: 'Could not start online payment. Please try again.' });
    }

    await prisma.walletTransaction.create({
      data: { clinicId: clinic.id, type: 'TOPUP', method: 'CHAPA', status: 'PENDING', amount, chapaTxRef: txRef, createdById: clinic.id },
    });
    res.json({ success: true, checkoutUrl: response.data.checkout_url, txRef });
  } catch (err) {
    console.error('[wallet chapa initialize]', err.message);
    res.status(500).json({ error: 'Could not start online payment. Please try again.' });
  }
});

router.get('/chapa/return/:txRef', async (req, res) => {
  try { await finalizeWalletTopup(req.params.txRef, req.app.get('io')); } catch (err) { console.error('[wallet return]', err); }
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Top-up</title>
  <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f1729;color:#fff;text-align:center}</style>
  </head><body><div><h2>Thank you</h2><p>You can return to the Ye-Almaz app now.</p></div></body></html>`);
});

router.get('/chapa/status/:txRef', protect, restrict('CLINIC'), async (req, res) => {
  try {
    const t = await prisma.walletTransaction.findUnique({ where: { chapaTxRef: req.params.txRef } });
    if (!t || t.clinicId !== req.user.id) return res.status(404).json({ error: 'Top-up not found.' });
    const done = await finalizeWalletTopup(req.params.txRef, req.app.get('io'));
    res.json({ status: done?.status || t.status });
  } catch (err) {
    console.error('[wallet chapa status]', err);
    res.status(500).json({ error: 'Could not check top-up status.' });
  }
});

// ── Clinic: pay several cases at once (bulk) ─────────────
// From the advance balance...
router.post('/pay-cases', protect, restrict('CLINIC'), async (req, res) => {
  try {
    const cases = await payableCases(req.user.id, req.body.caseIds);
    if (!cases?.length) return res.status(400).json({ error: 'Select at least one unpaid case.' });
    const results = await spendOnCases(req.user.id, cases.map(c => c.id));
    await invalidate('payments:*', 'cases:*', 'dashboard:summary', 'dashboard:analytics:*');
    const applied = round2(results.reduce((s, r) => s + (r.applied || 0), 0));
    if (!applied) return res.status(400).json({ error: 'Your advance balance is empty.' });
    res.json({ success: true, applied, fullyPaid: results.filter(r => r.complete).length });
  } catch (err) {
    console.error('[wallet pay-cases]', err);
    res.status(500).json({ error: 'Could not pay from your balance.' });
  }
});

// ...or one Chapa checkout for the lot (credited, then spent on those cases).
router.post('/pay-cases/chapa/initialize', protect, restrict('CLINIC'), async (req, res) => {
  try {
    if (!chapa) return res.status(503).json({ error: 'Online payments are not configured yet.' });
    const cases = await payableCases(req.user.id, req.body.caseIds);
    if (!cases?.length) return res.status(400).json({ error: 'Select at least one unpaid case.' });

    const clinic = await prisma.clinic.findUnique({ where: { id: req.user.id } });
    const wallet = await prisma.clinicWallet.findUnique({ where: { clinicId: clinic.id } });
    const total = round2(cases.reduce((s, c) => s + c.due, 0));
    const amount = round2(total - Math.min(wallet?.balance || 0, total)); // existing balance covers its share
    if (amount <= 0) return res.status(400).json({ error: 'Your advance balance already covers these cases. Use Pay from balance.' });

    const txRef = chapa.genTxRef({ prefix: WALLET_TX_PREFIX });
    const [firstName, ...rest] = (clinic.name || 'Clinic').split(' ');
    const response = await chapa.initialize({
      amount: String(amount), currency: 'ETB', tx_ref: txRef,
      first_name: firstName || 'Clinic', last_name: rest.join(' ') || clinic.name || '-',
      email: clinic.email || 'clinic.payments@gmail.com',
      phone_number: clinic.phone || undefined,
      callback_url: `${process.env.APP_URL}/api/payments/chapa/webhook`,
      return_url: `${process.env.APP_URL}/api/wallet/chapa/return/${txRef}`,
      customization: { title: 'Ye-Almaz Lab', description: `Payment for ${cases.length} case(s)` },
    });
    if (response.status !== 'success' || !response.data?.checkout_url) {
      return res.status(502).json({ error: 'Could not start online payment. Please try again.' });
    }
    await prisma.walletTransaction.create({
      data: {
        clinicId: clinic.id, type: 'TOPUP', method: 'CHAPA', status: 'PENDING', amount, chapaTxRef: txRef,
        note: `${PAYCASES_PREFIX}${cases.map(c => c.id).join(',')}`, createdById: clinic.id,
      },
    });
    res.json({ success: true, checkoutUrl: response.data.checkout_url, txRef, amount, cases: cases.length });
  } catch (err) {
    console.error('[wallet pay-cases chapa]', err.message);
    res.status(500).json({ error: 'Could not start online payment. Please try again.' });
  }
});

// ── Clinic: submit a cash top-up for Finance approval ────
router.post('/topup/cash', protect, restrict('CLINIC'), upload.single('screenshot'), async (req, res) => {
  try {
    const amount = parseAmount(req.body.amount);
    if (!amount) return res.status(400).json({ error: 'Enter a valid amount.' });
    const screenshotUrl = req.file ? await uploadReceipt(req.file.buffer, req.user.id) : null;

    const t = await prisma.walletTransaction.create({
      data: {
        clinicId: req.user.id, type: 'TOPUP', method: 'CASH', status: 'PENDING', amount,
        reference: req.body.reference?.trim() || null, screenshotUrl, createdById: req.user.id,
      },
    });
    await invalidate('payments:*');
    req.app.get('io')?.to('lab_staff').emit('wallet_topup_submitted', { id: t.id, amount, message: 'New advance-payment top-up awaiting approval' });
    res.status(201).json(t);
  } catch (err) {
    console.error('[wallet cash topup]', err);
    res.status(500).json({ error: 'Could not submit your top-up. Please try again.' });
  }
});

// ── Finance: pending cash top-ups ────────────────────────
router.get('/topups/pending', protect, restrict(...FINANCE), async (req, res) => {
  try {
    const rows = await prisma.walletTransaction.findMany({
      where: { type: 'TOPUP', status: 'PENDING', method: 'CASH' },
      orderBy: { createdAt: 'asc' },
    });
    const clinics = await prisma.clinic.findMany({ where: { id: { in: rows.map(r => r.clinicId) } }, select: { id: true, name: true, phone: true } });
    const byId = Object.fromEntries(clinics.map(c => [c.id, c]));
    res.json(rows.map(r => ({ ...r, clinic: byId[r.clinicId] || null })));
  } catch (err) {
    console.error('[wallet pending]', err);
    res.status(500).json({ error: 'Could not load top-ups.' });
  }
});

router.post('/topups/:id/approve', protect, restrict(...FINANCE), async (req, res) => {
  try {
    const t = await prisma.walletTransaction.findUnique({ where: { id: req.params.id } });
    if (!t || t.type !== 'TOPUP' || t.method !== 'CASH') return res.status(404).json({ error: 'Top-up not found.' });
    const credited = await approveTopup(t.id, req.user.id);
    if (!credited) return res.status(409).json({ error: 'This top-up was already processed.' });
    await invalidate('payments:*');
    req.app.get('io')?.to(`clinic_${t.clinicId}`).emit('wallet_updated', { message: `Br ${t.amount.toLocaleString('en-US')} added to your advance balance.` });
    sendPushToClinic(prisma, t.clinicId, { title: '✅ Top-up Approved', body: `Br ${t.amount.toLocaleString('en-US')} was added to your advance balance.`, data: { type: 'wallet_topup', screen: 'Wallet' } });
    res.json({ success: true });
  } catch (err) {
    console.error('[wallet approve]', err);
    res.status(500).json({ error: 'Could not approve top-up.' });
  }
});

router.post('/topups/:id/reject', protect, restrict(...FINANCE), async (req, res) => {
  try {
    const reason = req.body.reason?.trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });
    const r = await prisma.walletTransaction.updateMany({
      where: { id: req.params.id, type: 'TOPUP', method: 'CASH', status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: reason, approvedById: req.user.id, approvedAt: new Date() },
    });
    if (r.count === 0) return res.status(409).json({ error: 'This top-up was already processed.' });
    await invalidate('payments:*');
    const t = await prisma.walletTransaction.findUnique({ where: { id: req.params.id } });
    req.app.get('io')?.to(`clinic_${t.clinicId}`).emit('wallet_updated', { message: 'Your top-up was not approved.' });
    sendPushToClinic(prisma, t.clinicId, { title: '⚠️ Top-up Not Approved', body: `Your Br ${t.amount.toLocaleString('en-US')} top-up was not approved: ${reason}`, data: { type: 'wallet_topup', screen: 'Wallet' } });
    res.json({ success: true });
  } catch (err) {
    console.error('[wallet reject]', err);
    res.status(500).json({ error: 'Could not reject top-up.' });
  }
});

// ── Finance: balances, ledger, apply to outstanding ──────
router.get('/balances', protect, restrict(...FINANCE), async (req, res) => {
  try {
    const wallets = await prisma.clinicWallet.findMany({ where: { balance: { gt: 0 } } });
    res.json(Object.fromEntries(wallets.map(w => [w.clinicId, w.balance])));
  } catch (err) {
    res.status(500).json({ error: 'Could not load balances.' });
  }
});

router.get('/clinic/:clinicId', protect, restrict(...FINANCE), async (req, res) => {
  try {
    const [wallet, transactions] = await Promise.all([
      prisma.clinicWallet.findUnique({ where: { clinicId: req.params.clinicId } }),
      prisma.walletTransaction.findMany({ where: { clinicId: req.params.clinicId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);
    res.json({ balance: wallet?.balance || 0, transactions });
  } catch (err) {
    res.status(500).json({ error: 'Could not load wallet.' });
  }
});

router.post('/clinic/:clinicId/apply', protect, restrict(...FINANCE), async (req, res) => {
  try {
    const results = await applyWalletToClinicOutstanding(prisma, req.params.clinicId, { id: req.user.id, name: req.user.name });
    await invalidate('cases:*', 'payments:*', 'dashboard:summary', 'dashboard:analytics:*');
    res.json({ success: true, casesAffected: results.length, applied: round2(results.reduce((s, r) => s + r.applied, 0)), results });
  } catch (err) {
    console.error('[wallet apply]', err);
    res.status(500).json({ error: 'Could not apply balance.' });
  }
});

// Cash received in person for a clinic's advance payment: credited straight away
// (already received by staff, so no separate approval step).
router.post('/clinic/:clinicId/cash', protect, restrict('ADMIN', 'FINANCE', 'FINANCE_CASHIER'), async (req, res) => {
  try {
    const amount = parseAmount(req.body.amount);
    if (!amount) return res.status(400).json({ error: 'Enter a valid amount.' });
    const clinic = await prisma.clinic.findUnique({ where: { id: req.params.clinicId }, select: { id: true, name: true } });
    if (!clinic) return res.status(404).json({ error: 'Clinic not found.' });

    const t = await prisma.$transaction(async (tx) => {
      await tx.clinicWallet.upsert({
        where: { clinicId: clinic.id },
        update: { balance: { increment: amount } },
        create: { clinicId: clinic.id, balance: amount },
      });
      return tx.walletTransaction.create({
        data: {
          clinicId: clinic.id, type: 'TOPUP', method: 'CASH', status: 'APPROVED', amount,
          reference: req.body.reference?.trim() || null,
          note: `Cash received by ${req.user.name}${req.body.note?.trim() ? ` — ${req.body.note.trim()}` : ''}`,
          createdById: req.user.id, approvedById: req.user.id, approvedAt: new Date(),
        },
      });
    });
    await invalidate('payments:*');
    req.app.get('io')?.to(`clinic_${clinic.id}`).emit('wallet_updated', { message: `Br ${amount.toLocaleString('en-US')} added to your advance balance.` });
    sendPushToClinic(prisma, clinic.id, { title: '✅ Advance Payment Received', body: `Br ${amount.toLocaleString('en-US')} cash was added to your advance balance.`, data: { type: 'wallet_topup', screen: 'Wallet' } });
    const wallet = await prisma.clinicWallet.findUnique({ where: { clinicId: clinic.id } });
    res.status(201).json({ success: true, transaction: t, balance: wallet.balance });
  } catch (err) {
    console.error('[wallet cash]', err);
    res.status(500).json({ error: 'Could not record the cash payment.' });
  }
});

// Manual correction (ADMIN / FINANCE): positive adds, negative removes. Needs a note.
router.post('/clinic/:clinicId/adjust', protect, restrict('ADMIN', 'FINANCE'), async (req, res) => {
  try {
    const amount = round2(parseFloat(req.body.amount));
    const note = req.body.note?.trim();
    if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Enter a non-zero amount.' });
    if (!note) return res.status(400).json({ error: 'A note is required.' });

    await prisma.$transaction(async (tx) => {
      const w = await tx.clinicWallet.findUnique({ where: { clinicId: req.params.clinicId } });
      if (amount < 0 && (w?.balance || 0) + amount < 0) throw Object.assign(new Error('NEGATIVE'), { code: 'NEGATIVE' });
      await tx.clinicWallet.upsert({
        where: { clinicId: req.params.clinicId },
        update: { balance: { increment: amount } },
        create: { clinicId: req.params.clinicId, balance: amount },
      });
      await tx.walletTransaction.create({
        data: { clinicId: req.params.clinicId, type: 'ADJUSTMENT', status: 'APPROVED', amount: Math.abs(amount), note: `${amount > 0 ? '+' : '-'} ${note}`, approvedById: req.user.id, approvedAt: new Date() },
      });
    });
    await invalidate('payments:*');
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'NEGATIVE') return res.status(400).json({ error: 'That would take the balance below zero.' });
    console.error('[wallet adjust]', err);
    res.status(500).json({ error: 'Could not adjust balance.' });
  }
});

module.exports = router;
