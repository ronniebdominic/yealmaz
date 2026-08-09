// Ye-Almaz — Skills Matrix (Phase 3)
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'skills:all';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);
    const skills = await prisma.skill.findMany({ orderBy: { name: 'asc' } });
    await appCache.set(cacheKey, skills);
    res.json(skills);
  } catch (err) {
    console.error('[skills]', err);
    res.status(500).json({ error: 'Could not load skills.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, department } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const skill = await prisma.skill.create({ data: { name: name.trim(), department: department?.trim() || null } });
    await invalidate('skills:all');
    res.status(201).json(skill);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A skill with that name already exists.' });
    console.error('[skills create]', err);
    res.status(500).json({ error: 'Could not create skill.' });
  }
});

// ── Employee ↔ Skill (the skills matrix itself) ──────────
router.get('/matrix', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, department } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (department) where.skill = { department };
    const entries = await prisma.employeeSkill.findMany({
      where,
      include: { user: { select: { id: true, name: true } }, skill: true, assessedBy: { select: { id: true, name: true } } },
      orderBy: { assessedAt: 'desc' },
    });
    res.json(entries);
  } catch (err) {
    console.error('[skills matrix]', err);
    res.status(500).json({ error: 'Could not load skills matrix.' });
  }
});

router.post('/matrix', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, skillId, level, expiryDate } = req.body || {};
    if (!userId || !skillId) return res.status(400).json({ error: 'userId and skillId are required.' });
    const entry = await prisma.employeeSkill.upsert({
      where: { userId_skillId: { userId, skillId } },
      create: { userId, skillId, level: level || 'BEGINNER', assessedById: req.user.id, expiryDate: expiryDate ? new Date(expiryDate) : null },
      update: { level: level || 'BEGINNER', assessedById: req.user.id, assessedAt: new Date(), expiryDate: expiryDate ? new Date(expiryDate) : null },
      include: { skill: true },
    });
    await invalidate('skills:*');
    res.status(201).json(entry);
  } catch (err) {
    console.error('[skills matrix create]', err);
    res.status(500).json({ error: 'Could not record skill assessment.' });
  }
});

module.exports = router;
