// Ye-Almaz — Employee Expenses / Reimbursement (Phase 2)
// Workflow: Submitted → Manager Approved → Finance Approved → Reimbursed.
// A FINANCE_APPROVED claim is picked up automatically by payroll.js's next
// run-creation as a REIMBURSEMENT PayrollAdjustment, then marked
// REIMBURSED once that entry exists.
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
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const uploadReceipt = (buffer, userId) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: 'yealmaz/expense-receipts', public_id: `expense_${userId}_${Date.now()}` },
    (error, result) => { if (error) reject(error); else resolve(result.secure_url); }
  );
  stream.end(buffer);
});

// STAFF_ROLES mirrors attendance.js's self-service list — any real
// employee can submit their own expense claim; only HR_MANAGER/ADMIN can
// see/manage everyone else's.
const STAFF_ROLES = ['DELIVERY', 'RECEPTIONIST', 'DISPATCH', 'LAB_TECH', 'FINANCE', 'INVENTORY_MANAGER', 'HR_MANAGER'];

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, status } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    const claims = await prisma.expenseClaim.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
    res.json(claims);
  } catch (err) {
    console.error('[expenses]', err);
    res.status(500).json({ error: 'Could not load expense claims.' });
  }
});

// Self-service: an employee's own claims only.
router.get('/mine', protect, restrict(...STAFF_ROLES), async (req, res) => {
  try {
    const claims = await prisma.expenseClaim.findMany({ where: { userId: req.user.id }, orderBy: { date: 'desc' } });
    res.json(claims);
  } catch (err) {
    console.error('[expenses mine]', err);
    res.status(500).json({ error: 'Could not load your expense claims.' });
  }
});

router.post('/', protect, restrict(...STAFF_ROLES, 'ADMIN'), upload.single('receipt'), async (req, res) => {
  try {
    const { userId, category, date, amount, description } = req.body || {};
    // HR/Admin can file on behalf of someone; anyone else can only file their own.
    const targetUserId = (req.user.role === 'HR_MANAGER' || req.user.role === 'ADMIN') && userId ? userId : req.user.id;
    if (!category?.trim() || !date || !amount) return res.status(400).json({ error: 'category, date and amount are required.' });

    let receiptUrl = null;
    if (req.file) receiptUrl = await uploadReceipt(req.file.buffer, targetUserId);

    const claim = await prisma.expenseClaim.create({
      data: { userId: targetUserId, category: category.trim(), date: new Date(date), amount: parseFloat(amount), description: description?.trim() || null, receiptUrl },
    });
    await invalidate('expenses:*');
    res.status(201).json(claim);
  } catch (err) {
    console.error('[expenses create]', err);
    res.status(500).json({ error: 'Could not submit expense claim.' });
  }
});

// Single status-advance endpoint — Submitted→ManagerApproved→FinanceApproved
// (or Rejected at any point before Reimbursed). Reimbursed is only ever set
// by payroll.js when the claim is actually picked up into a run.
const NEXT_STATUS = { SUBMITTED: 'MANAGER_APPROVED', MANAGER_APPROVED: 'FINANCE_APPROVED' };
router.patch('/:id/approve', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const claim = await prisma.expenseClaim.findUnique({ where: { id: req.params.id } });
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });
    const next = NEXT_STATUS[claim.status];
    if (!next) return res.status(400).json({ error: `Cannot approve a claim in status ${claim.status}.` });
    const updated = await prisma.expenseClaim.update({
      where: { id: req.params.id }, data: { status: next, approvedById: req.user.id, approvedAt: new Date() },
    });
    await invalidate('expenses:*');
    res.json(updated);
  } catch (err) {
    console.error('[expenses approve]', err);
    res.status(500).json({ error: 'Could not approve claim.' });
  }
});

router.patch('/:id/reject', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const claim = await prisma.expenseClaim.update({
      where: { id: req.params.id }, data: { status: 'REJECTED', approvedById: req.user.id, approvedAt: new Date() },
    });
    await invalidate('expenses:*');
    res.json(claim);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Claim not found.' });
    console.error('[expenses reject]', err);
    res.status(500).json({ error: 'Could not reject claim.' });
  }
});

module.exports = router;
