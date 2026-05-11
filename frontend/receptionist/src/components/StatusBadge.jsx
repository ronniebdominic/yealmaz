const STATUS_MAP = {
  RECEIVED:          { label: 'Received',          cls: 'badge-received' },
  IMPRESSION:        { label: 'Impression',        cls: 'badge-impression' },
  CASTING:           { label: 'Casting',           cls: 'badge-casting' },
  FABRICATION:       { label: 'Fabrication',       cls: 'badge-fabrication' },
  QUALITY_CHECK:     { label: 'Quality Check',     cls: 'badge-qc' },
  READY_TO_DISPATCH: { label: 'Ready to Dispatch', cls: 'badge-ready' },
  OUT_FOR_DELIVERY:  { label: 'Out for Delivery',  cls: 'badge-dispatch' },
  DELIVERED:         { label: 'Delivered',         cls: 'badge-delivered' },
  ON_HOLD:           { label: 'On Hold',           cls: 'badge-hold' },
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

export function PaymentBadge({ status }) {
  const s = PAY_MAP[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export const STAGE_ICONS = {
  RECEIVED: '📥', IMPRESSION: '🦷', CASTING: '🔩',
  FABRICATION: '⚙️', QUALITY_CHECK: '🔍',
  READY_TO_DISPATCH: '📦', OUT_FOR_DELIVERY: '🚚', DELIVERED: '✅',
};
