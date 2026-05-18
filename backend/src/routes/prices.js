const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { appCache, invalidate } = require('../cache');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/prices
router.get('/', async (req, res) => {
  try {
    const cached = appCache.get('prices');
    if (cached) return res.json(cached);

    const prices = await prisma.workTypePrice.findMany({
      orderBy: { workType: 'asc' },
    });

    appCache.set('prices', prices, 3600);
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load prices.' });
  }
});

// PUT /api/prices  — body: [{ workType, price }, ...]
router.put('/', async (req, res) => {
  try {
    const updates = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'Expected array of { workType, price }.' });
    }

    await Promise.all(
      updates.map(({ workType, price }) =>
        prisma.workTypePrice.upsert({
          where: { workType },
          update: { price: parseFloat(price) },
          create: { workType, price: parseFloat(price) },
        })
      )
    );

    invalidate('prices');

    const prices = await prisma.workTypePrice.findMany({ orderBy: { workType: 'asc' } });
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update prices.' });
  }
});

module.exports = router;
