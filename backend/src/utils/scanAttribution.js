// Ye-Almaz — shared helpers for attributing a CaseStage scan to a lab tech.
// A department scan always writes CaseStage.scannedBy as `${techName} (${SHORT})`
// — see scan.js and LabDashboard.jsx (techName is the logged-in user's own
// name, not free-typed). That trailing "(SHORT)" both identifies a real
// department scan (as opposed to any other way a CaseStage row gets written
// — Reception's status endpoint, Dispatch's assign/cancel endpoints, the
// "System" auto-advance to READY_TO_DISPATCH) and lets us recover which
// department it was. There's no scannedById FK yet, so attribution is by
// exact name match against the current account.

// Mirrors scan.js's DEPARTMENTS short-codes → labels. Duplicated rather than
// exported/imported since scan.js only exports its router (same pattern as
// PRODUCTION_STATUSES being duplicated across files elsewhere in this codebase).
const DEPT_SHORT_LABELS = {
  REC: 'Reception', PLS: 'Plaster Department', MRG: 'Margin Department',
  SCN: 'Scanning', DES: 'Designing', MIL: 'Milling / Sintering',
  R3D: 'Resin 3D Printing', M3D: 'Metal 3D Printing', MFN: 'Metal Finishing',
  OPQ: 'Opaque Application', CER: 'Ceramic Layering', ZRC: 'Zirconia Fitting',
  GLZ: 'Glazing', THP: 'Thermo Press', TRM: 'Trimming', QC: 'Quality Control',
  PAY: 'Payment / Invoicing', DSP: 'Dispatch',
};

const SCAN_PATTERN = /^(.*)\s\(([A-Z0-9_]+)\)$/;

// Local (EAT, per process.env.TZ) calendar-day key — NOT toISOString(),
// which is always UTC and would silently shift late-night/early-morning
// scans onto the wrong day (the same class of bug fixed elsewhere in this
// codebase for date-range filtering).
const localDayKey = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

module.exports = { DEPT_SHORT_LABELS, SCAN_PATTERN, localDayKey };
