// Ye-Almaz — Goals / KPIs (Phase 3)
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, status } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;
    const goals = await prisma.goal.findMany({
      where, include: { user: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } }, orderBy: { dueDate: 'asc' },
    });
    res.json(goals);
  } catch (err) {
    console.error('[goals]', err);
    res.status(500).json({ error: 'Could not load goals.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, title, description, targetValue, unit, dueDate } = req.body || {};
    if (!userId || !title?.trim()) return res.status(400).json({ error: 'userId and title are required.' });
    const goal = await prisma.goal.create({
      data: {
        userId, title: title.trim(), description: description?.trim() || null,
        targetValue: targetValue === '' || targetValue == null ? null : parseFloat(targetValue),
        unit: unit?.trim() || null, dueDate: dueDate ? new Date(dueDate) : null, createdById: req.user.id,
      },
    });
    await invalidate('goals:*');
    res.status(201).json(goal);
  } catch (err) {
    console.error('[goals create]', err);
    res.status(500).json({ error: 'Could not create goal.' });
  }
});

router.patch('/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { actualValue, status } = req.body || {};
    const data = {};
    if (actualValue !== undefined) data.actualValue = actualValue === '' || actualValue == null ? null : parseFloat(actualValue);
    if (status !== undefined) data.status = status;
    const goal = await prisma.goal.update({ where: { id: req.params.id }, data });
    await invalidate('goals:*');
    res.json(goal);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Goal not found.' });
    console.error('[goals update]', err);
    res.status(500).json({ error: 'Could not update goal.' });
  }
});

module.exports = router;
