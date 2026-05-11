// Ye-Almaz — QR Scan Route
// This is a PUBLIC endpoint — no auth required (the QR code is the auth)
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Stage progression order
const STAGE_ORDER = [
  'RECEIVED',
  'IMPRESSION',
  'CASTING',
  'FABRICATION',
  'QUALITY_CHECK',
  'READY_TO_DISPATCH',
  'OUT_FOR_DELIVERY',
  'DELIVERED'
];

const STAGE_LABELS = {
  RECEIVED:          'Case Received',
  IMPRESSION:        'Impression Stage',
  CASTING:           'Casting Stage',
  FABRICATION:       'Fabrication Stage',
  QUALITY_CHECK:     'Quality Check',
  READY_TO_DISPATCH: 'Ready to Dispatch',
  OUT_FOR_DELIVERY:  'Out for Delivery',
  DELIVERED:         'Delivered'
};

// ── GET /api/scan/:caseId ────────────────────────────────
// When QR code is scanned, this endpoint is hit
// It automatically advances the case to the next stage
router.get('/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;
    const { stage, by } = req.query; // optional: ?stage=CASTING&by=TechName

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: { clinic: { select: { id: true, name: true } } }
    });

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found. Invalid QR code.' });
    }

    // Determine next stage
    let newStatus;
    if (stage && STAGE_ORDER.includes(stage)) {
      newStatus = stage;
    } else {
      // Auto-advance to next stage
      const currentIndex = STAGE_ORDER.indexOf(caseData.status);
      if (currentIndex === -1 || currentIndex >= STAGE_ORDER.length - 1) {
        return res.json({
          success: false,
          message: 'Case is already at final stage (Delivered).',
          case: {
            caseNumber: caseData.caseNumber,
            patientName: caseData.patientName,
            status: caseData.status,
            statusLabel: STAGE_LABELS[caseData.status]
          }
        });
      }
      newStatus = STAGE_ORDER[currentIndex + 1];
    }

    // Update case status
    const updated = await prisma.case.update({
      where: { id: caseId },
      data: { status: newStatus }
    });

    // Log the stage scan
    await prisma.caseStage.create({
      data: {
        caseId,
        stageName: newStatus,
        scannedBy: by || 'QR Scan',
        notes: `Scanned via QR code — advanced to ${STAGE_LABELS[newStatus]}`
      }
    });

    // Real-time push to all connected clients
    const io = req.app.get('io');
    const payload = {
      caseId,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      clinicName: caseData.clinic.name,
      previousStatus: caseData.status,
      newStatus,
      statusLabel: STAGE_LABELS[newStatus],
      scannedAt: new Date().toISOString(),
      scannedBy: by || 'QR Scan'
    };

    io.to('lab_staff').emit('stage_scanned', payload);
    io.to(`clinic_${caseData.clinic.id}`).emit('case_updated', payload);

    // Return a mobile-friendly HTML response (shows on phone when QR is scanned)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Ye-Almaz Dental Lab</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: #f0f4f8; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
          .card { background: white; border-radius: 16px; padding: 32px 24px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.1); }
          .logo { color: #1A56A0; font-size: 20px; font-weight: bold; margin-bottom: 4px; }
          .sub { color: #888; font-size: 13px; margin-bottom: 24px; }
          .badge { display: inline-block; background: #1A56A0; color: white; border-radius: 20px; padding: 6px 20px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }
          .patient { font-size: 22px; font-weight: bold; color: #1F2937; margin-bottom: 4px; }
          .case-num { color: #888; font-size: 13px; margin-bottom: 20px; }
          .stage { background: #e8f4e8; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
          .stage-label { color: #15803d; font-weight: bold; font-size: 15px; }
          .stage-sub { color: #666; font-size: 12px; margin-top: 4px; }
          .time { color: #aaa; font-size: 12px; margin-top: 16px; }
          .check { font-size: 48px; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✅</div>
          <div class="logo">🦷 Ye-Almaz Dental Lab</div>
          <div class="sub">Stage Updated Successfully</div>
          <div class="badge">SCANNED</div>
          <div class="patient">${caseData.patientName}</div>
          <div class="case-num">${caseData.caseNumber}</div>
          <div class="stage">
            <div class="stage-label">➜ ${STAGE_LABELS[newStatus]}</div>
            <div class="stage-sub">Advanced from: ${STAGE_LABELS[caseData.status]}</div>
          </div>
          <div class="time">Scanned at ${new Date().toLocaleTimeString('en-IN')} by ${by || 'Lab Staff'}</div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scan failed. Please try again.' });
  }
});

module.exports = router;
