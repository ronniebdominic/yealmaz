const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

const CACHE_KEY = 'zones';

// ── GET /api/zones — list all zones ───────────────────────
// Open to any authenticated role (Dispatch/Admin both need this to populate
// zone dropdowns/badges), not just ADMIN.
router.get('/', protect, async (req, res) => {
  const cached = await appCache.get(CACHE_KEY);
  if (cached) return res.json(cached);

  try {
    const zones = await prisma.zone.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { clinics: true, users: true } },
      },
    });
    await appCache.set(CACHE_KEY, zones);
    res.json(zones);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch zones.' });
  }
});

// ── POST /api/zones — create a zone (admin only) ──────────
router.post('/', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Zone name is required.' });

    const exists = await prisma.zone.findUnique({ where: { name: name.trim() } });
    if (exists) return res.status(409).json({ error: 'A zone with this name already exists.' });

    const zone = await prisma.zone.create({ data: { name: name.trim() } });
    await appCache.del(CACHE_KEY);
    res.status(201).json(zone);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create zone.' });
  }
});

// ── PATCH /api/zones/:id — rename a zone (admin only) ─────
router.patch('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Zone name is required.' });

    const zone = await prisma.zone.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    });
    await appCache.del(CACHE_KEY);
    res.json(zone);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Zone not found.' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'A zone with this name already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Could not update zone.' });
  }
});

// ── DELETE /api/zones/:id — remove a zone (admin only) ────
// Clinics/users pointing at this zone fall back to zoneId: null (ON DELETE
// SET NULL at the DB level) rather than being blocked or cascaded.
router.delete('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    await prisma.zone.delete({ where: { id: req.params.id } });
    await appCache.del(CACHE_KEY);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Zone not found.' });
    console.error(err);
    res.status(500).json({ error: 'Could not delete zone.' });
  }
});

module.exports = router;
