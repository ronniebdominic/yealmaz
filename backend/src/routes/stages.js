// Ye-Almaz — Case Stages Route
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/stages/:caseId ──────────────────────────────
// Full stage history for a case. Clinics only ever see their own case's
// stages, and never staff-internal fields (notes, who scanned it) — same
// stripping as GET /cases/:id's forClinic().
router.get('/:caseId', protect, async (req, res) => {
  try {
    if (req.user.role === 'CLINIC') {
      const caseData = await prisma.case.findUnique({ where: { id: req.params.caseId }, select: { clinicId: true } });
      if (!caseData || caseData.clinicId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const stages = await prisma.caseStage.findMany({
      where: { caseId: req.params.caseId },
      orderBy: { scannedAt: 'asc' }
    });

    if (req.user.role === 'CLINIC') {
      return res.json(stages.map(({ notes, scannedBy, ...s }) => s));
    }
    res.json(stages);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch stages.' });
  }
});

module.exports = router;
