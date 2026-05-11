const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', protect, async (req, res) => {
  try {
    const clinics = await prisma.clinic.findMany({
      where: { isActive: true },
      select: { id: true, name: true, phone: true, address: true },
      orderBy: { name: 'asc' }
    });
    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch clinics.' });
  }
});

module.exports = router;