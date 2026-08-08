// Ye-Almaz — Salary Structures (Phase 2)
// Components are configurable name+category+calc-method rows, assembled
// into named structures, and assigned to employees — "do not hard-code
// salary calculations." Assignment follows the same never-overwrite
// history pattern as ShiftAssignment (see shifts.js).
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// ── Components ────────────────────────────────────────────
router.get('/components', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'salary:components';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);
    const components = await prisma.salaryComponent.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    await appCache.set(cacheKey, components);
    res.json(components);
  } catch (err) {
    console.error('[salary components]', err);
    res.status(500).json({ error: 'Could not load salary components.' });
  }
});

router.post('/components', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, category, calcType, defaultAmount } = req.body || {};
    if (!name?.trim() || !category) return res.status(400).json({ error: 'name and category are required.' });
    const component = await prisma.salaryComponent.create({
      data: { name: name.trim(), category, calcType: calcType || 'FIXED', defaultAmount: parseFloat(defaultAmount) || 0 },
    });
    await invalidate('salary:components');
    res.status(201).json(component);
  } catch (err) {
    console.error('[salary components create]', err);
    res.status(500).json({ error: 'Could not create salary component.' });
  }
});

router.patch('/components/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, category, calcType, defaultAmount, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (category !== undefined) data.category = category;
    if (calcType !== undefined) data.calcType = calcType;
    if (defaultAmount !== undefined) data.defaultAmount = parseFloat(defaultAmount) || 0;
    if (isActive !== undefined) data.isActive = isActive;
    const component = await prisma.salaryComponent.update({ where: { id: req.params.id }, data });
    await invalidate('salary:components');
    res.json(component);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Component not found.' });
    console.error('[salary components update]', err);
    res.status(500).json({ error: 'Could not update salary component.' });
  }
});

// ── Structures ────────────────────────────────────────────
router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const structures = await prisma.salaryStructure.findMany({
      include: { items: { include: { component: true }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(structures);
  } catch (err) {
    console.error('[salary structures]', err);
    res.status(500).json({ error: 'Could not load salary structures.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, items } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required.' });
    const structure = await prisma.salaryStructure.create({
      data: {
        name: name.trim(),
        items: {
          create: (items || []).map((it, i) => ({ componentId: it.componentId, amount: it.amount === '' || it.amount == null ? null : parseFloat(it.amount), sortOrder: i })),
        },
      },
      include: { items: { include: { component: true } } },
    });
    await invalidate('salary:structures');
    res.status(201).json(structure);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A structure with that name already exists.' });
    console.error('[salary structures create]', err);
    res.status(500).json({ error: 'Could not create salary structure.' });
  }
});

// Replaces the structure's item list wholesale — simpler and safer than
// diffing individual add/remove calls for a form that edits the whole set
// at once.
router.patch('/:id', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, isActive, items } = req.body || {};
    const structure = await prisma.$transaction(async (tx) => {
      const data = {};
      if (name !== undefined) data.name = name.trim();
      if (isActive !== undefined) data.isActive = isActive;
      const updated = await tx.salaryStructure.update({ where: { id: req.params.id }, data });
      if (items !== undefined) {
        await tx.salaryStructureItem.deleteMany({ where: { structureId: req.params.id } });
        for (let i = 0; i < items.length; i++) {
          await tx.salaryStructureItem.create({
            data: { structureId: req.params.id, componentId: items[i].componentId, amount: items[i].amount === '' || items[i].amount == null ? null : parseFloat(items[i].amount), sortOrder: i },
          });
        }
      }
      return tx.salaryStructure.findUnique({ where: { id: req.params.id }, include: { items: { include: { component: true } } } });
    });
    await invalidate('salary:structures');
    res.json(structure);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Structure not found.' });
    console.error('[salary structures update]', err);
    res.status(500).json({ error: 'Could not update salary structure.' });
  }
});

// ── Assignment (never overwrites — closes out the open row, inserts new) ──
router.post('/assign', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, structureId, effectiveFrom, note } = req.body || {};
    if (!userId || !structureId) return res.status(400).json({ error: 'userId and structureId are required.' });
    const structure = await prisma.salaryStructure.findUnique({ where: { id: structureId } });
    if (!structure) return res.status(404).json({ error: 'Structure not found.' });

    const from = effectiveFrom ? new Date(effectiveFrom) : new Date();
    const assignment = await prisma.$transaction(async (tx) => {
      const open = await tx.employeeSalaryAssignment.findFirst({ where: { userId, effectiveTo: null } });
      if (open) await tx.employeeSalaryAssignment.update({ where: { id: open.id }, data: { effectiveTo: from } });
      return tx.employeeSalaryAssignment.create({
        data: { userId, structureId, effectiveFrom: from, note: note?.trim() || null, createdById: req.user.id },
        include: { structure: true },
      });
    });
    await invalidate('salary:*');
    res.status(201).json(assignment);
  } catch (err) {
    console.error('[salary assign]', err);
    res.status(500).json({ error: 'Could not assign salary structure.' });
  }
});

router.get('/assignments', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.query;
    const where = userId ? { userId } : {};
    const assignments = await prisma.employeeSalaryAssignment.findMany({
      where,
      include: { structure: { include: { items: { include: { component: true } } } }, user: { select: { id: true, name: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    res.json(assignments);
  } catch (err) {
    console.error('[salary assignments]', err);
    res.status(500).json({ error: 'Could not load salary assignments.' });
  }
});

module.exports = router;
