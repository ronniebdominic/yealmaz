// Ye-Almaz — Employee Assets (Phase 3)
// CompanyAsset (the physical item) is separate from AssetAssignment (who
// has it and when) — an asset's full assignment history stays intact
// across handoffs, same never-overwrite spirit as ShiftAssignment.
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const cacheKey = 'assets:all';
    const cached = await appCache.get(cacheKey);
    if (cached) return res.json(cached);
    const assets = await prisma.companyAsset.findMany({
      include: { assignments: { where: { returnedAt: null }, include: { user: { select: { id: true, name: true } } }, take: 1 } },
      orderBy: { name: 'asc' },
    });
    await appCache.set(cacheKey, assets);
    res.json(assets);
  } catch (err) {
    console.error('[assets]', err);
    res.status(500).json({ error: 'Could not load assets.' });
  }
});

router.post('/', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { name, type, serialNumber } = req.body || {};
    if (!name?.trim() || !type?.trim()) return res.status(400).json({ error: 'name and type are required.' });
    const asset = await prisma.companyAsset.create({ data: { name: name.trim(), type: type.trim(), serialNumber: serialNumber?.trim() || null } });
    await invalidate('assets:all');
    res.status(201).json(asset);
  } catch (err) {
    console.error('[assets create]', err);
    res.status(500).json({ error: 'Could not create asset.' });
  }
});

router.post('/:id/assign', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId, condition, note } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId is required.' });
    const asset = await prisma.companyAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    if (asset.status === 'ASSIGNED') return res.status(400).json({ error: 'This asset is already assigned — return it first.' });

    const [assignment] = await prisma.$transaction([
      prisma.assetAssignment.create({ data: { assetId: asset.id, userId, condition: condition?.trim() || null, note: note?.trim() || null, assignedById: req.user.id } }),
      prisma.companyAsset.update({ where: { id: asset.id }, data: { status: 'ASSIGNED' } }),
    ]);
    await invalidate('assets:*');
    res.status(201).json(assignment);
  } catch (err) {
    console.error('[assets assign]', err);
    res.status(500).json({ error: 'Could not assign asset.' });
  }
});

router.post('/:id/return', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { condition, lost } = req.body || {};
    const openAssignment = await prisma.assetAssignment.findFirst({ where: { assetId: req.params.id, returnedAt: null }, orderBy: { assignedAt: 'desc' } });
    if (!openAssignment) return res.status(400).json({ error: 'This asset has no active assignment.' });

    await prisma.$transaction([
      prisma.assetAssignment.update({ where: { id: openAssignment.id }, data: { returnedAt: new Date(), condition: condition?.trim() || openAssignment.condition } }),
      prisma.companyAsset.update({ where: { id: req.params.id }, data: { status: lost ? 'LOST' : 'AVAILABLE' } }),
    ]);
    await invalidate('assets:*');
    res.json({ ok: true });
  } catch (err) {
    console.error('[assets return]', err);
    res.status(500).json({ error: 'Could not process return.' });
  }
});

router.get('/assignments', protect, restrict('HR_MANAGER', 'ADMIN'), async (req, res) => {
  try {
    const { userId } = req.query;
    const where = userId ? { userId } : {};
    const assignments = await prisma.assetAssignment.findMany({
      where, include: { asset: true, user: { select: { id: true, name: true } } }, orderBy: { assignedAt: 'desc' },
    });
    res.json(assignments);
  } catch (err) {
    console.error('[assets assignments]', err);
    res.status(500).json({ error: 'Could not load asset assignments.' });
  }
});

module.exports = router;
