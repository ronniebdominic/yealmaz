// Ye-Almaz — Training & Certifications (Phase 3)
// Certification "status" (Valid/Expiring Soon/Expired) is computed from
// expiryDate at read time — never stored, so it can't silently go stale.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const EXPIRING_SOON_DAYS = 30;
function certStatus(expiryDate) {
  if (!expiryDate) return 'VALID';
  const days = (new Date(expiryDate) - new Date()) / 86400000;
  if (days < 0) return 'EXPIRED';
  if (days <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON';
  return 'VALID';
}

// ── Training ──────────────────────────────────────────────
router.get('/records', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, status } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    const records = await prisma.trainingRecord.findMany({
      where, include: { user: { select: { id: true, name: true } } }, orderBy: { date: 'desc' },
    });
    res.json(records);
  } catch (err) {
    console.error('[training records]', err);
    res.status(500).json({ error: 'Could not load training records.' });
  }
});

router.post('/records', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, title, trainerName, date, durationHours, status } = req.body || {};
    if (!userId || !title?.trim() || !date) return res.status(400).json({ error: 'userId, title and date are required.' });
    const record = await prisma.trainingRecord.create({
      data: {
        userId, title: title.trim(), trainerName: trainerName?.trim() || null, date: new Date(date),
        durationHours: durationHours ? parseFloat(durationHours) : null, status: status || 'SCHEDULED', createdById: req.user.id,
      },
    });
    await invalidate('training:*');
    res.status(201).json(record);
  } catch (err) {
    console.error('[training records create]', err);
    res.status(500).json({ error: 'Could not create training record.' });
  }
});

router.patch('/records/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { status, score, certificateUrl } = req.body || {};
    const data = {};
    if (status !== undefined) data.status = status;
    if (score !== undefined) data.score = score === '' || score == null ? null : parseFloat(score);
    if (certificateUrl !== undefined) data.certificateUrl = certificateUrl || null;
    const record = await prisma.trainingRecord.update({ where: { id: req.params.id }, data });
    await invalidate('training:*');
    res.json(record);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Training record not found.' });
    console.error('[training records update]', err);
    res.status(500).json({ error: 'Could not update training record.' });
  }
});

// ── Certifications ────────────────────────────────────────
router.get('/certifications', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.query;
    const where = userId ? { userId } : {};
    const certs = await prisma.certification.findMany({
      where, include: { user: { select: { id: true, name: true } } }, orderBy: { expiryDate: 'asc' },
    });
    res.json(certs.map(c => ({ ...c, status: certStatus(c.expiryDate) })));
  } catch (err) {
    console.error('[certifications]', err);
    res.status(500).json({ error: 'Could not load certifications.' });
  }
});

router.post('/certifications', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, name, issueDate, expiryDate, certificateUrl } = req.body || {};
    if (!userId || !name?.trim() || !issueDate) return res.status(400).json({ error: 'userId, name and issueDate are required.' });
    const cert = await prisma.certification.create({
      data: { userId, name: name.trim(), issueDate: new Date(issueDate), expiryDate: expiryDate ? new Date(expiryDate) : null, certificateUrl: certificateUrl || null },
    });
    await invalidate('training:*');
    res.status(201).json({ ...cert, status: certStatus(cert.expiryDate) });
  } catch (err) {
    console.error('[certifications create]', err);
    res.status(500).json({ error: 'Could not create certification.' });
  }
});

// Alerts feed for the HR Analytics dashboard — certifications expiring
// within EXPIRING_SOON_DAYS or already expired, across everyone.
router.get('/certifications/alerts', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const certs = await prisma.certification.findMany({
      where: { expiryDate: { not: null } },
      include: { user: { select: { id: true, name: true } } },
    });
    const alerts = certs.map(c => ({ ...c, status: certStatus(c.expiryDate) })).filter(c => c.status !== 'VALID');
    res.json(alerts);
  } catch (err) {
    console.error('[certifications alerts]', err);
    res.status(500).json({ error: 'Could not load certification alerts.' });
  }
});

module.exports = router;
