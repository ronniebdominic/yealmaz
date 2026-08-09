// Ye-Almaz — Recruitment (Phase 4)
// Candidate tracking, with a "hire" action that creates the real User
// account (same shape as HRWorkspace's own Add Employee flow) and links
// it back to the candidate record rather than duplicating account
// creation logic.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const candidates = await prisma.candidate.findMany({
      where, include: { createdBy: { select: { id: true, name: true } }, hiredUser: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(candidates);
  } catch (err) {
    console.error('[recruitment]', err);
    res.status(500).json({ error: 'Could not load candidates.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, email, phone, position, source, notes } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const candidate = await prisma.candidate.create({
      data: { name: name.trim(), email: email?.trim() || null, phone: phone?.trim() || null, position: position?.trim() || null, source: source?.trim() || null, notes: notes?.trim() || null, createdById: req.user.id },
    });
    await invalidate('recruitment:*');
    res.status(201).json(candidate);
  } catch (err) {
    console.error('[recruitment create]', err);
    res.status(500).json({ error: 'Could not add candidate.' });
  }
});

router.patch('/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { status, notes } = req.body || {};
    const data = {};
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    const candidate = await prisma.candidate.update({ where: { id: req.params.id }, data });
    await invalidate('recruitment:*');
    res.json(candidate);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Candidate not found.' });
    console.error('[recruitment update]', err);
    res.status(500).json({ error: 'Could not update candidate.' });
  }
});

// ── POST /api/recruitment/:id/hire ───────────────────────
// Creates a real User account for an OFFER-stage candidate and marks them
// HIRED — same account-creation shape as POST /api/users, called directly
// here rather than duplicated, so a hired candidate is a real employee
// immediately (shows up in Admin > Users and HR > Employees).
router.post('/:id/hire', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    const candidate = await prisma.candidate.findUnique({ where: { id: req.params.id } });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found.' });
    if (candidate.status === 'HIRED') return res.status(400).json({ error: 'This candidate is already hired.' });

    const finalEmail = (email || candidate.email || '').trim().toLowerCase();
    if (!finalEmail) return res.status(400).json({ error: 'An email is required to create the account.' });
    const exists = await prisma.user.findUnique({ where: { email: finalEmail } });
    if (exists) return res.status(409).json({ error: 'A user with this email already exists.' });

    const hashed = await bcrypt.hash((password || 'ChangeMe@123').trim(), 10);
    const [user] = await prisma.$transaction([
      prisma.user.create({ data: { name: candidate.name, email: finalEmail, password: hashed, role: role || 'LAB_TECH', phone: candidate.phone || null } }),
    ]);
    await prisma.candidate.update({ where: { id: candidate.id }, data: { status: 'HIRED', hiredUserId: user.id } });

    await invalidate('recruitment:*', 'employees:all');
    res.status(201).json({ user, candidate: { ...candidate, status: 'HIRED', hiredUserId: user.id } });
  } catch (err) {
    console.error('[recruitment hire]', err);
    res.status(500).json({ error: 'Could not hire candidate.' });
  }
});

module.exports = router;
