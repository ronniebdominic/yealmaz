// Ye-Almaz — Case Stages Route
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/stages/:caseId ──────────────────────────────
// Full stage history for a case
router.get('/:caseId', protect, async (req, res) => {
  try {
    const stages = await prisma.caseStage.findMany({
      where: { caseId: req.params.caseId },
      orderBy: { scannedAt: 'asc' }
    });
    res.json(stages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch stages.' });
  }
});

module.exports = router;
