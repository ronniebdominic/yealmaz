const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
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

module.exports = router;
