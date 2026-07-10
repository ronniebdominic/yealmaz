// Ye-Almaz — QR Scan Route
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { invalidate } = require('../cache');
const { sendPushToClinic } = require('../utils/webpush');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── Department definitions ────────────────────────────────
const DEPARTMENTS = {
  RECEPTION:    { code: 'RECEPTION',    label: 'Reception',               short: 'REC', stage: 'CASE_ACCEPTED' },
  PLASTER:      { code: 'PLASTER',      label: 'Plaster Department',       short: 'PLS', stage: 'PLASTER_DEPARTMENT' },
  MARGIN:       { code: 'MARGIN',       label: 'Margin Department',        short: 'MRG', stage: 'MARGIN_DEPARTMENT' },
  SCANNING:     { code: 'SCANNING',     label: 'Scanning',                 short: 'SCN', stage: 'SCANNING' },
  DESIGNING:    { code: 'DESIGNING',    label: 'Designing',                short: 'DES', stage: 'DESIGNING' },
  MILLING:      { code: 'MILLING',      label: 'Milling / Sintering',      short: 'MIL', stage: 'MILLING_SINTERING' },
  RESIN_PRINT:  { code: 'RESIN_PRINT',  label: 'Resin 3D Printing',        short: 'R3D', stage: 'RESIN_3D_PRINTING' },
  METAL_PRINT:  { code: 'METAL_PRINT',  label: 'Metal 3D Printing',        short: 'M3D', stage: 'METAL_3D_PRINTING' },
  METAL_FINISH: { code: 'METAL_FINISH', label: 'Metal Finishing',          short: 'MFN', stage: 'METAL_FINISHING' },
  OPAQUE:       { code: 'OPAQUE',       label: 'Opaque Application',       short: 'OPQ', stage: 'OPAQUE_APPLICATION' },
  CERAMIC:      { code: 'CERAMIC',      label: 'Ceramic Layering',         short: 'CER', stage: 'CERAMIC_LAYERING' },
  ZIRCONIA:     { code: 'ZIRCONIA',     label: 'Zirconia Fitting',         short: 'ZRC', stage: 'ZIRCONIA_FITTING_FINISHING' },
  GLAZING:      { code: 'GLAZING',      label: 'Glazing',                  short: 'GLZ', stage: 'GLAZING' },
  THERMO:       { code: 'THERMO',       label: 'Thermo Press',             short: 'THP', stage: 'THERMO_PRESS' },
  TRIMMING:     { code: 'TRIMMING',     label: 'Trimming',                 short: 'TRM', stage: 'TRIMMING' },
  QC:           { code: 'QC',           label: 'Quality Control',          short: 'QC',  stage: 'QUALITY_CHECK' },
  PAYMENT:      { code: 'PAYMENT',      label: 'Payment / Invoicing',      short: 'PAY', stage: 'PAYMENT_INVOICING' },
  DISPATCH:     { code: 'DISPATCH',     label: 'Dispatch',                 short: 'DSP', stage: 'READY_TO_DISPATCH' },
};

// Department scan → sets this status
const DEPT_TO_STAGE = {
  RECEPTION:    'CASE_ACCEPTED',
  PLASTER:      'PLASTER_DEPARTMENT',
  MARGIN:       'MARGIN_DEPARTMENT',
  SCANNING:     'SCANNING',
  DESIGNING:    'DESIGNING',
  MILLING:      'MILLING_SINTERING',
  RESIN_PRINT:  'RESIN_3D_PRINTING',
  METAL_PRINT:  'METAL_3D_PRINTING',
  METAL_FINISH: 'METAL_FINISHING',
  OPAQUE:       'OPAQUE_APPLICATION',
  CERAMIC:      'CERAMIC_LAYERING',
  ZIRCONIA:     'ZIRCONIA_FITTING_FINISHING',
  GLAZING:      'GLAZING',
  THERMO:       'THERMO_PRESS',
  TRIMMING:     'TRIMMING',
  QC:           'QUALITY_CHECK',
  PAYMENT:      'PAYMENT_INVOICING',
  DISPATCH:     'READY_TO_DISPATCH',
};

// What comes next after each scan point
const NEXT_DEPT_LABEL = {
  RECEPTION:    'Plaster Department',
  PLASTER:      'Margin Department',
  MARGIN:       'Scanning',
  SCANNING:     'Designing',
  DESIGNING:    'Milling / Printing',
  MILLING:      'Metal / Ceramic Finishing',
  RESIN_PRINT:  'Trimming',
  METAL_PRINT:  'Metal Finishing',
  METAL_FINISH: 'Opaque Application',
  OPAQUE:       'Ceramic Layering',
  CERAMIC:      'Glazing',
  ZIRCONIA:     'Glazing',
  GLAZING:      'Quality Control',
  THERMO:       'Quality Control',
  TRIMMING:     'Quality Control',
  QC:           'Dispatch (auto)',
  PAYMENT:      'Dispatch',
  DISPATCH:     'Out for Delivery',
};

const STAGE_LABELS = {
  PENDING_PICKUP:            'Awaiting Impression Pickup',
  PICKUP_ASSIGNED:           'Pickup Assigned',
  CASE_ACCEPTED:             'Case Accepted',
  PLASTER_DEPARTMENT:        'Plaster Department',
  MARGIN_DEPARTMENT:         'Margin Department',
  SCANNING:                  'Scanning',
  DESIGNING:                 'Designing',
  MILLING_SINTERING:         'Milling / Sintering',
  RESIN_3D_PRINTING:         'Resin 3D Printing',
  METAL_3D_PRINTING:         'Metal 3D Printing',
  METAL_FINISHING:           'Metal Finishing',
  OPAQUE_APPLICATION:        'Opaque Application',
  CERAMIC_LAYERING:          'Ceramic Layering',
  ZIRCONIA_FITTING_FINISHING:'Zirconia Fitting & Finishing',
  GLAZING:                   'Glazing',
  THERMO_PRESS:              'Thermo Press',
  TRIMMING:                  'Trimming',
  QUALITY_CHECK:             'Quality Control',
  PAYMENT_INVOICING:         'Payment / Invoicing',
  READY_TO_DISPATCH:         'Ready to Dispatch',
  OUT_FOR_DELIVERY:          'Out for Delivery',
  DELIVERED:                 'Delivered',
  ON_HOLD:                   'On Hold',
  REMAKE:                    'Remake',
  CANCELLED:                 'Cancelled',
};

// ── GET /api/scan/departments ────────────────────────────
// Returns list of departments for dropdown
router.get('/departments', (req, res) => {
  res.json(Object.values(DEPARTMENTS));
});

// ── POST /api/scan/:caseId ───────────────────────────────
// Called when a QR is scanned at a department
// Body: { department: 'CAD_CAM', techName: 'Ahmed' }
router.post('/:caseId', protect, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { department, techName } = req.body;

    if (!department || !DEPT_TO_STAGE[department]) {
      return res.status(400).json({ error: 'Invalid department code.' });
    }

    // Lab techs scoped to specific department(s) can only scan those — an empty
    // list means unrestricted (matches the "Flexible" option in account setup).
    if (req.user.role === 'LAB_TECH' && req.user.departments?.length && !req.user.departments.includes(department)) {
      return res.status(403).json({ error: `You are not assigned to the ${DEPARTMENTS[department]?.label || department} department.` });
    }

    const caseData = await prisma.case.findUnique({
      where: { id: caseId },
      include: { clinic: { select: { id: true, name: true } } }
    });

    if (!caseData) {
      return res.status(404).json({ error: 'Case not found. Invalid QR code.' });
    }

    if (['DELIVERED', 'CANCELLED'].includes(caseData.status)) {
      return res.status(400).json({ error: `This case is already ${caseData.status.toLowerCase()}.` });
    }

    const newStatus = DEPT_TO_STAGE[department];
    const dept = DEPARTMENTS[department];
    const scannedBy = techName ? `${techName} (${dept.short})` : dept.label;

    // Deduplication: reject if same case+stage scanned within the last 60 seconds
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000);
    const recentDup = await prisma.caseStage.findFirst({
      where: {
        caseId,
        stageName: newStatus,
        scannedAt: { gte: sixtySecondsAgo },
      },
    });
    if (recentDup) {
      return res.status(409).json({
        error: 'Duplicate scan — this case was already scanned at this department just now.',
      });
    }

    // After QC passes → advance directly to READY_TO_DISPATCH in one write.
    // Guard: skip if already READY_TO_DISPATCH (re-scan idempotency).
    let finalStatus = newStatus;
    if (newStatus === 'QUALITY_CHECK') {
      if (caseData.status === 'READY_TO_DISPATCH') {
        // Already advanced on a previous scan — just log QC without changing status
        await prisma.caseStage.create({
          data: { caseId, stageName: 'QUALITY_CHECK', scannedBy, location: dept.label, notes: 'QC re-scan (already dispatched)' }
        });
        finalStatus = 'READY_TO_DISPATCH';
      } else {
        // Write READY_TO_DISPATCH directly — no intermediate QUALITY_CHECK write
        await prisma.case.update({ where: { id: caseId }, data: { status: 'READY_TO_DISPATCH' } });
        await prisma.caseStage.create({ data: { caseId, stageName: 'QUALITY_CHECK', scannedBy, location: dept.label, notes: 'QC passed' } });
        await prisma.caseStage.create({ data: { caseId, stageName: 'READY_TO_DISPATCH', scannedBy: 'System', notes: 'QC passed — moved to dispatch queue' } });
        finalStatus = 'READY_TO_DISPATCH';
      }
    } else {
      // Normal status update
      await prisma.case.update({ where: { id: caseId }, data: { status: newStatus } });
      await prisma.caseStage.create({
        data: { caseId, stageName: newStatus, scannedBy, location: dept.label, notes: `Scanned at ${dept.label} department` }
      });
    }

    // Real-time push
    const io = req.app.get('io');
    const payload = {
      caseId,
      caseNumber: caseData.caseNumber,
      patientName: caseData.patientName,
      clinicName: caseData.clinic.name,
      department: dept.label,
      departmentCode: department,
      newStatus: finalStatus,
      statusLabel: STAGE_LABELS[finalStatus],
      nextDept: NEXT_DEPT_LABEL[department] || '—',
      scannedAt: new Date().toISOString(),
      scannedBy
    };

    invalidate(`case:${caseId}`, `case:lab:${caseId}`, 'lab:active:*', 'cases:*', 'dashboard:summary', 'dashboard:cases-by-status', 'dispatch:queue');

    io.to('lab_staff').emit('stage_scanned', payload);
    io.to(`clinic_${caseData.clinic.id}`).emit('case_updated', payload);

    // Notify dispatch when case is ready
    if (finalStatus === 'READY_TO_DISPATCH') {
      io.to('lab_staff').emit('case_ready_for_dispatch', {
        caseId, caseNumber: caseData.caseNumber, patientName: caseData.patientName, clinicName: caseData.clinic.name,
      });
    }

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
            ${caseData.stages.map(s => `<div class="r-item"><span>${STAGE_LABELS[s.stageName]}</span><span>${new Date(s.scannedAt).toLocaleString('en-US',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>`).join('')}
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
