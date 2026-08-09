// Ye-Almaz — Onboarding (Phase 4)
// Per-employee customizable checklist. DEFAULT_TASKS seeds a new
// employee's list on first use; HR can add/remove tasks freely afterward
// — "allow HR to customize checklist."
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const DEFAULT_TASKS = [
  'Contract signed', 'ID collected', 'Bank details on file', 'ERP account created',
  'Email set up', 'Biometric/attendance enrolled', 'Equipment issued',
  'Initial training scheduled', 'Department assigned', 'Manager introduced',
];

router.get('/:userId', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    let tasks = await prisma.onboardingTask.findMany({ where: { userId: req.params.userId }, orderBy: { sortOrder: 'asc' } });
    if (tasks.length === 0) {
      await prisma.onboardingTask.createMany({
        data: DEFAULT_TASKS.map((label, i) => ({ userId: req.params.userId, label, sortOrder: i })),
      });
      tasks = await prisma.onboardingTask.findMany({ where: { userId: req.params.userId }, orderBy: { sortOrder: 'asc' } });
    }
    res.json(tasks);
  } catch (err) {
    console.error('[onboarding]', err);
    res.status(500).json({ error: 'Could not load onboarding checklist.' });
  }
});

router.post('/:userId/tasks', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { label } = req.body || {};
    if (!label?.trim()) return res.status(400).json({ error: 'label is required.' });
    const count = await prisma.onboardingTask.count({ where: { userId: req.params.userId } });
    const task = await prisma.onboardingTask.create({ data: { userId: req.params.userId, label: label.trim(), sortOrder: count } });
    await invalidate('onboarding:*');
    res.status(201).json(task);
  } catch (err) {
    console.error('[onboarding task create]', err);
    res.status(500).json({ error: 'Could not add task.' });
  }
});

router.patch('/tasks/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { isDone } = req.body || {};
    const task = await prisma.onboardingTask.update({
      where: { id: req.params.id },
      data: { isDone: !!isDone, completedAt: isDone ? new Date() : null, completedById: isDone ? req.user.id : null },
    });
    await invalidate('onboarding:*');
    res.json(task);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Task not found.' });
    console.error('[onboarding task update]', err);
    res.status(500).json({ error: 'Could not update task.' });
  }
});

router.delete('/tasks/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    await prisma.onboardingTask.delete({ where: { id: req.params.id } });
    await invalidate('onboarding:*');
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Task not found.' });
    console.error('[onboarding task delete]', err);
    res.status(500).json({ error: 'Could not delete task.' });
  }
});

module.exports = router;
