// Ye-Almaz — the lab's production departments, in the order a case normally travels, for the TV.
// Mirrors scan.js's DEPARTMENTS (code -> stage / label / short). scan.js only exports its router, so the
// table is repeated here; tests/tvProjection.test.js checks the two stay in step.
const LAB_DEPARTMENTS = [
  { code: 'PLASTER',      label: 'Plaster',            short: 'PLS', stage: 'PLASTER_DEPARTMENT' },
  { code: 'MARGIN',       label: 'Margin',             short: 'MRG', stage: 'MARGIN_DEPARTMENT' },
  { code: 'SCANNING',     label: 'Scanning',           short: 'SCN', stage: 'SCANNING' },
  { code: 'DESIGNING',    label: 'Designing',          short: 'DES', stage: 'DESIGNING' },
  { code: 'MILLING',      label: 'Milling / Sintering', short: 'MIL', stage: 'MILLING_SINTERING' },
  { code: 'RESIN_PRINT',  label: 'Resin Printing',     short: 'R3D', stage: 'RESIN_3D_PRINTING' },
  { code: 'METAL_PRINT',  label: 'Metal Printing',     short: 'M3D', stage: 'METAL_3D_PRINTING' },
  { code: 'METAL_FINISH', label: 'Metal Finishing',    short: 'MFN', stage: 'METAL_FINISHING' },
  { code: 'OPAQUE',       label: 'Opaque',             short: 'OPQ', stage: 'OPAQUE_APPLICATION' },
  { code: 'CERAMIC',      label: 'Ceramic Layering',   short: 'CER', stage: 'CERAMIC_LAYERING' },
  { code: 'ZIRCONIA',     label: 'Zirconia Fitting',   short: 'ZRC', stage: 'ZIRCONIA_FITTING_FINISHING' },
  { code: 'GLAZING',      label: 'Glazing',            short: 'GLZ', stage: 'GLAZING' },
  { code: 'THERMO',       label: 'Thermo Press',       short: 'THP', stage: 'THERMO_PRESS' },
  { code: 'TRIMMING',     label: 'Trimming',           short: 'TRM', stage: 'TRIMMING' },
  { code: 'QC',           label: 'Quality Control',    short: 'QC',  stage: 'QUALITY_CHECK' },
];

// Everything before the lab floor and after it. Shown in the pipeline, never as employee work.
const INTAKE_STAGES = ['PENDING_PICKUP', 'PICKUP_ASSIGNED', 'UNDER_REVIEW', 'CASE_ACCEPTED'];
const DISPATCH_STAGES = ['PAYMENT_INVOICING', 'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY'];
const FINISHED_STAGES = ['DELIVERED', 'CANCELLED', 'REJECTED'];

const BY_STAGE = Object.fromEntries(LAB_DEPARTMENTS.map(d => [d.stage, d]));
const BY_SHORT = Object.fromEntries(LAB_DEPARTMENTS.map(d => [d.short, d]));

module.exports = { LAB_DEPARTMENTS, INTAKE_STAGES, DISPATCH_STAGES, FINISHED_STAGES, BY_STAGE, BY_SHORT };
