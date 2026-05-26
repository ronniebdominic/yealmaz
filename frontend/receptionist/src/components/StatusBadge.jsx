const STATUS_MAP = {
  CASE_ACCEPTED:             { label: 'Case Accepted',            cls: 'badge-received' },
  PLASTER_DEPARTMENT:        { label: 'Plaster Department',       cls: 'badge-impression' },
  MARGIN_DEPARTMENT:         { label: 'Margin Department',        cls: 'badge-impression' },
  SCANNING:                  { label: 'Scanning',                 cls: 'badge-fabrication' },
  DESIGNING:                 { label: 'Designing',                cls: 'badge-fabrication' },
  MILLING_SINTERING:         { label: 'Milling / Sintering',      cls: 'badge-casting' },
  RESIN_3D_PRINTING:         { label: 'Resin 3D Printing',        cls: 'badge-casting' },
  METAL_3D_PRINTING:         { label: 'Metal 3D Printing',        cls: 'badge-casting' },
  METAL_FINISHING:           { label: 'Metal Finishing',          cls: 'badge-casting' },
  OPAQUE_APPLICATION:        { label: 'Opaque Application',       cls: 'badge-fabrication' },
  CERAMIC_LAYERING:          { label: 'Ceramic Layering',         cls: 'badge-fabrication' },
  ZIRCONIA_FITTING_FINISHING:{ label: 'Zirconia Fitting',         cls: 'badge-fabrication' },
  GLAZING:                   { label: 'Glazing',                  cls: 'badge-qc' },
  THERMO_PRESS:              { label: 'Thermo Press',             cls: 'badge-casting' },
  TRIMMING:                  { label: 'Trimming',                 cls: 'badge-qc' },
  QUALITY_CHECK:             { label: 'Quality Check',            cls: 'badge-qc' },
  PAYMENT_INVOICING:         { label: 'Payment / Invoicing',      cls: 'badge-ready' },
  READY_TO_DISPATCH:         { label: 'Ready to Dispatch',        cls: 'badge-ready' },
  OUT_FOR_DELIVERY:          { label: 'Out for Delivery',         cls: 'badge-dispatch' },
  DELIVERED:                 { label: 'Delivered',                cls: 'badge-delivered' },
  ON_HOLD:                   { label: 'On Hold',                  cls: 'badge-hold' },
  REMAKE:                    { label: 'Remake',                   cls: 'badge-hold' },
  CANCELLED:                 { label: 'Cancelled',                cls: 'badge-hold' },
};

const PAY_MAP = {
  PENDING:             { label: 'Payment Pending',   cls: 'badge-pay-pending' },
  SCREENSHOT_UPLOADED: { label: 'Awaiting Review',   cls: 'badge-pay-uploaded' },
  VERIFIED:            { label: 'Payment Verified',  cls: 'badge-pay-verified' },
  REJECTED:            { label: 'Payment Rejected',  cls: 'badge-pay-rejected' },
};

export function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function PaymentBadge({ status, isExcluded }) {
  if (isExcluded && status === 'PENDING') {
    return <span className="badge badge-trusted">🤝 Trusted Partner</span>;
  }
  const s = PAY_MAP[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export const STAGE_ICONS = {
  CASE_ACCEPTED: '📥', PLASTER_DEPARTMENT: '🏺', MARGIN_DEPARTMENT: '✂️',
  SCANNING: '🔬', DESIGNING: '🖥️',
  MILLING_SINTERING: '⚙️', RESIN_3D_PRINTING: '🖨️', METAL_3D_PRINTING: '🔩',
  METAL_FINISHING: '🔨', OPAQUE_APPLICATION: '🎨', CERAMIC_LAYERING: '🏛️',
  ZIRCONIA_FITTING_FINISHING: '💎', GLAZING: '✨', THERMO_PRESS: '🔥', TRIMMING: '✂️',
  QUALITY_CHECK: '🔍', PAYMENT_INVOICING: '💰',
  READY_TO_DISPATCH: '📦', OUT_FOR_DELIVERY: '🚚', DELIVERED: '✅',
  ON_HOLD: '⏸️', REMAKE: '🔄', CANCELLED: '❌',
};
