import {
  MdTwoWheeler, MdDirectionsBike, MdMoveToInbox, MdScience, MdContentCut,
  MdBiotech, MdComputer, MdSettings, MdPrint, MdBuild, MdPalette,
  MdAccountBalance, MdDiamond, MdAutoAwesome, MdLocalFireDepartment,
  MdSearch, MdPaid, MdInventory2, MdLocalShipping, MdCheckCircle, MdPause,
  MdAutorenew, MdCancel, MdHandshake,
} from 'react-icons/md';

const STATUS_MAP = {
  PENDING_PICKUP:            { label: 'Awaiting Pickup',          cls: 'badge-pickup' },
  PICKUP_ASSIGNED:           { label: 'Pickup Assigned',          cls: 'badge-pickup-assigned' },
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
  UNDER_REVIEW:              { label: 'Under Review',             cls: 'badge-review' },
  REJECTED:                  { label: 'Rejected',                 cls: 'badge-rejected' },
};

const PAY_MAP = {
  PENDING:             { label: 'No Request Yet',    cls: 'badge-pay-pending' },
  PAYMENT_REQUESTED:   { label: 'Request Sent',      cls: 'badge-pay-uploaded' },
  SCREENSHOT_UPLOADED: { label: 'Awaiting Review',   cls: 'badge-pay-uploaded' },
  VERIFIED:            { label: 'Payment Verified',  cls: 'badge-pay-verified' },
  REJECTED:            { label: 'Payment Rejected',  cls: 'badge-pay-rejected' },
};

export function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function PaymentBadge({ status, isExcluded, isRemake }) {
  if (isRemake && status !== 'VERIFIED') {
    return <span className="badge badge-trusted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MdAutorenew size={11} /> Remake — Free</span>;
  }
  if (isExcluded && status === 'PENDING') {
    return <span className="badge badge-trusted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MdHandshake size={11} /> Trusted Partner</span>;
  }
  const s = PAY_MAP[status] || { label: status, cls: '' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export const STAGE_ICONS = {
  PENDING_PICKUP: MdTwoWheeler, PICKUP_ASSIGNED: MdDirectionsBike,
  CASE_ACCEPTED: MdMoveToInbox, PLASTER_DEPARTMENT: MdScience, MARGIN_DEPARTMENT: MdContentCut,
  SCANNING: MdBiotech, DESIGNING: MdComputer,
  MILLING_SINTERING: MdSettings, RESIN_3D_PRINTING: MdPrint, METAL_3D_PRINTING: MdBuild,
  METAL_FINISHING: MdBuild, OPAQUE_APPLICATION: MdPalette, CERAMIC_LAYERING: MdAccountBalance,
  ZIRCONIA_FITTING_FINISHING: MdDiamond, GLAZING: MdAutoAwesome, THERMO_PRESS: MdLocalFireDepartment, TRIMMING: MdContentCut,
  QUALITY_CHECK: MdSearch, PAYMENT_INVOICING: MdPaid,
  READY_TO_DISPATCH: MdInventory2, OUT_FOR_DELIVERY: MdLocalShipping, DELIVERED: MdCheckCircle,
  ON_HOLD: MdPause, REMAKE: MdAutorenew, CANCELLED: MdCancel,
  UNDER_REVIEW: MdSearch, REJECTED: MdCancel,
};
