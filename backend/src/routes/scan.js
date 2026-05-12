// Ye-Almaz — QR Scan Route
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ── Department definitions ────────────────────────────────
const DEPARTMENTS = {
  CAD_CAM:  { code: 'CAD_CAM',  label: 'CAD CAM Milling',    short: 'CMI', stage: 'FABRICATION' },
  CERAMIC:  { code: 'CERAMIC',  label: 'Ceramic Finishing',   short: 'CFI', stage: 'QUALITY_CHECK' },
  DIECUT:   { code: 'DIECUT',   label: 'Diecutting',          short: 'DIE', stage: 'IMPRESSION' },
  CASTING:  { code: 'CASTING',  label: 'Casting',             short: 'CST', stage: 'CASTING' },
  QC:       { code: 'QC',       label: 'Quality Control',     short: 'QC',  stage: 'QUALITY_CHECK' },
  DISPATCH: { code: 'DISPATCH', label: 'Dispatch',            short: 'DSP', stage: 'READY_TO_DISPATCH' },
};

// Department flow: when scanned at a department → sets this status
const DEPT_TO_STAGE = {
  DIECUT:   'IMPRESSION',
  CASTING:  'CASTING',
  CAD_CAM:  'FABRICATION',
  CERAMIC:  'QUALITY_CHECK',
  QC:       'QUALITY_CHECK',
  DISPATCH: 'READY_TO_DISPATCH',
};

// What stage comes AFTER each department scan
const NEXT_DEPT_LABEL = {
  DIECUT:   'CAD CAM Milling',
  CASTING:  'CAD CAM Milling',
  CAD_CAM:  'Ceramic Finishing',
  CERAMIC:  'Quality Control',
  QC:       'Dispatch',
  DISPATCH: 'Ready for Delivery',
};

const STAGE_LABELS = {
  RECEIVED:          'Case Received',
  IMPRESSION:        'Diecutting',
  CASTING:           'Casting',
  FABRICATION:       'CAD CAM Milling',
  QUALITY_CHECK:     'Ceramic / QC',
  READY_TO_DISPATCH: 'Ready to Dispatch',
  OUT_FOR_DELIVERY:  'Out for Delivery',
  DELIVERED:         'Delivered'
};

// ── GET /api/scan/departments ────────────────────────────
// Returns list of departments for dropdown
router.get('/departments', (req, res) => {
  res.json(Object.values(DEPARTMENTS));
});

// ── POST /api/scan/:caseId ───────────────────────────────
// Called when a QR is scanned at a department
// Body: { department: 'CAD_CAM', techName: 'Ahmed' }
router.post('/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;
    const { department, techName } = req.body;

    if (!department || !DEPT_TO_STAGE[department]) {
      return res.status(400).json({ error: 'Invalid department code.' });
    }

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: { clinic: { select: { id: true, name: true } } }
    });

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found. Invalid QR code.' });
    }

    if (caseData.status === 'DELIVERED') {
      return res.status(400).json({ error: 'This case has already been delivered.' });
    }

    const newStatus = DEPT_TO_STAGE[department];
    const dept = DEPARTMENTS[department];
    const scannedBy = techName ? `${techName} (${dept.short})` : dept.label;

    // Update case status
    await prisma.case.update({
      where: { id: caseId },
      data: { status: newStatus }
    });

    // Log the stage
    await prisma.caseStage.create({
      data: {
        caseId,
        stageName: newStatus,
        scannedBy,
        location: dept.label,
        notes: `Scanned at ${dept.label} department`
      }
    });

    // Real-time push
    const io = req.app.get('io');
    const payload = {
      caseId,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      clinicName: caseData.clinic.name,
      department: dept.label,
      departmentCode: department,
      newStatus,
      statusLabel: STAGE_LABELS[newStatus],
      nextDept: NEXT_DEPT_LABEL[department] || '—',
      scannedAt: new Date().toISOString(),
      scannedBy
    };

    io.to('lab_staff').emit('stage_scanned', payload);
    io.to(`clinic_${caseData.clinic.id}`).emit('case_updated', payload);

    res.json({ success: true, ...payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Scan failed. Please try again.' });
  }
});

// ── GET /api/scan/:caseId ─────────────────────────────────
// QR code browser scan — returns case info (for camera-based QR scanning)
router.get('/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        clinic: { select: { name: true } },
        stages: { orderBy: { scannedAt: 'desc' }, take: 5 }
      }
    });

    if (!caseData) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:40px;background:#f5f7fa">
          <h2>❌ Case Not Found</h2><p>Invalid QR Code</p>
        </body></html>
      `);
    }

    // Return JSON for the lab dashboard app
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ caseId, caseNumber: caseData.caseNumber, patientName: caseData.patientName, workType: caseData.workType, status: caseData.status, statusLabel: STAGE_LABELS[caseData.status], clinic: caseData.clinic.name, stages: caseData.stages });
    }

    // Return HTML for direct browser scan
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Ye-Almaz Dental Lab</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:Arial,sans-serif;background:#F5F7FA;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
          .card{background:#fff;border-radius:16px;padding:28px 22px;max-width:380px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1)}
          .logo{color:#1A56A0;font-size:18px;font-weight:700;margin-bottom:4px}
          .cn{color:#888;font-size:12px;font-family:monospace;margin-bottom:16px}
          .patient{font-size:22px;font-weight:700;color:#0F2044;margin-bottom:4px}
          .work{font-size:14px;color:#666;margin-bottom:16px}
          .stage{background:#e8f4e8;border-radius:10px;padding:14px;margin-bottom:12px}
          .stage-lbl{color:#15803d;font-weight:700;font-size:15px}
          .recent{text-align:left;font-size:12px;color:#888;margin-top:12px}
          .r-item{padding:6px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between}
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-size:36px;margin-bottom:8px">🦷</div>
          <div class="logo">Ye-Almaz Dental Lab</div>
          <div class="cn">${caseData.caseNumber}</div>
          <div class="patient">${caseData.patientName}</div>
          <div class="work">${caseData.workType} · ${caseData.clinic.name}</div>
          <div class="stage">
            <div class="stage-lbl">Current: ${STAGE_LABELS[caseData.status]}</div>
          </div>
          <div class="recent">
            <strong>Recent Activity</strong>
            ${caseData.stages.map(s => `<div class="r-item"><span>${STAGE_LABELS[s.stageName]}</span><span>${new Date(s.scannedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>`).join('')}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading case');
  }
});

module.exports = router;
