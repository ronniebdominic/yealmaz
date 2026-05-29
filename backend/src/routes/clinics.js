const express  = require('express');
const bcrypt    = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, async (req, res) => {
  const cacheKey = 'clinics';
  const cached = await appCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, phone: true, address: true },
      orderBy: { name: 'asc' }
    });
    await appCache.set(cacheKey, clinics);
    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch clinics.' });
  }
});

// ── GET /api/clinics/all — active clinics list for admin ──
router.get('/all', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: {
        id: true, code: true, name: true, station: true,
        email: true, phone: true, address: true,
        isActive: true, isExcluded: true, createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch clinics.' });
  }
});

// ── POST /api/clinics — create clinic (admin only) ───────
router.post('/', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, code, station, email, phone, address, password, isExcluded } = req.body;

    if (!name?.trim())     return res.status(400).json({ error: 'Clinic name is required.' });
    if (!password?.trim()) return res.status(400).json({ error: 'Password is required.' });

    // Check for duplicate email
    if (email) {
      const exists = await prisma.clinic.findUnique({ where: { email } });
      if (exists) return res.status(409).json({ error: 'A clinic with this email already exists.' });
    }

    // Check for duplicate code
    if (code) {
      const exists = await prisma.clinic.findUnique({ where: { code } });
      if (exists) return res.status(409).json({ error: 'A clinic with this code already exists.' });
    }

    const hashed = await bcrypt.hash(password, 10);

    const clinic = await prisma.clinic.create({
      data: {
        name:       name.trim(),
        code:       code?.trim()    || null,
        station:    station?.trim() || null,
        email:      email?.trim()   || null,
        phone:      phone?.trim()   || null,
        address:    address?.trim() || null,
        password:   hashed,
        isExcluded: isExcluded ?? false,
      },
      select: {
        id: true, code: true, name: true, station: true,
        email: true, phone: true, address: true,
        isActive: true, isExcluded: true, createdAt: true,
      },
    });

    // Bust the clinics list cache
    await appCache.del('clinics');

    res.status(201).json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create clinic.' });
  }
});

// ── PATCH /api/clinics/:id — update clinic (admin only) ──
router.patch('/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { name, code, station, email, phone, address, isActive, isExcluded, password } = req.body;

    const updateData = {};
    if (name     !== undefined) updateData.name       = name.trim();
    if (code     !== undefined) updateData.code       = code?.trim()    || null;
    if (station  !== undefined) updateData.station    = station?.trim() || null;
    if (email    !== undefined) updateData.email      = email?.trim()   || null;
    if (phone    !== undefined) updateData.phone      = phone?.trim()   || null;
    if (address  !== undefined) updateData.address    = address?.trim() || null;
    if (isActive    !== undefined) updateData.isActive    = isActive;
    if (isExcluded  !== undefined) updateData.isExcluded  = isExcluded;
    if (password?.trim()) updateData.password = await bcrypt.hash(password.trim(), 10);

    const clinic = await prisma.clinic.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true, code: true, name: true, station: true,
        email: true, phone: true, address: true,
        isActive: true, isExcluded: true, createdAt: true,
      },
    });

    await appCache.del('clinics');
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update clinic.' });
  }
});

module.exports = router;
