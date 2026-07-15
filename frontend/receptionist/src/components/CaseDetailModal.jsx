import { useEffect, useState } from 'react';
import api from '../api';
import { StatusBadge, PaymentBadge, STAGE_ICONS } from './StatusBadge';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { printCaseLabel } from '../utils/printLabel';

const STATUSES = [
  'PENDING_PICKUP', 'PICKUP_ASSIGNED',
  'CASE_ACCEPTED',
  'PLASTER_DEPARTMENT', 'MARGIN_DEPARTMENT',
  'SCANNING', 'DESIGNING',
  'MILLING_SINTERING', 'RESIN_3D_PRINTING', 'METAL_3D_PRINTING',
  'METAL_FINISHING', 'OPAQUE_APPLICATION', 'CERAMIC_LAYERING',
  'ZIRCONIA_FITTING_FINISHING', 'GLAZING', 'THERMO_PRESS', 'TRIMMING',
  'QUALITY_CHECK', 'PAYMENT_INVOICING',
  'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED',
  'ON_HOLD', 'REMAKE', 'CANCELLED',
];

const STATUS_LABELS = {
  PENDING_PICKUP:            'Awaiting Pickup',
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
  QUALITY_CHECK:             'Quality Check',
  PAYMENT_INVOICING:         'Payment / Invoicing',
  READY_TO_DISPATCH:         'Ready to Dispatch',
  OUT_FOR_DELIVERY:          'Out for Delivery',
  DELIVERED:                 'Delivered',
  ON_HOLD:                   'On Hold',
  REMAKE:                    'Remake',
  CANCELLED:                 'Cancelled',
};

export default function CaseDetailModal({ caseId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [deliveryDateInput, setDeliveryDateInput] = useState('');
  const [savingDeliveryDate, setSavingDeliveryDate] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    loadCase();
    loadComments();
  }, [caseId]);

  const loadComments = async () => {
    try {
      const res = await api.get(`/cases/${caseId}/comments`);
      setComments(res.data || []);
    } catch { /* non-fatal */ }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await api.post(`/cases/${caseId}/comments`, { body: newComment.trim() });
      setNewComment('');
      loadComments();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add comment');
    } finally {
      setPostingComment(false);
    }
  };

  const loadCase = async () => {
    try {
      const res = await api.get(`/cases/${caseId}`);
      setData(res.data);
      setNewStatus(res.data.status);
      setDeliveryDateInput(res.data.deliveryDate ? res.data.deliveryDate.slice(0, 10) : '');
    } catch (err) {
      toast.error('Could not load case');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async () => {
    if (newStatus === data.status) return;
    setUpdating(true);
    try {
      await api.patch(`/cases/${caseId}/status`, { status: newStatus, notes: statusNotes || undefined });
      setStatusNotes('');
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      loadCase();
    } catch (err) {
      toast.error('Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const saveDeliveryDate = async () => {
    setSavingDeliveryDate(true);
    try {
      await api.patch(`/cases/${caseId}/delivery-date`, { deliveryDate: deliveryDateInput || null });
      toast.success(deliveryDateInput ? 'Delivery date saved' : 'Delivery date cleared');
      loadCase();
    } catch (err) {
      toast.error('Could not save delivery date');
    } finally {
      setSavingDeliveryDate(false);
    }
  };

  const printQR = () => printCaseLabel(data);

  if (loading) return (
    <div className="modal-overlay">
      <div className="modal" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">{data.patientName}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', marginTop: '2px' }}>
              {data.caseNumber}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Info grid */}
          <div className="grid-2" style={{ marginBottom: '20px' }}>
            {[
              ['Clinic', data.clinic?.name],
              ['Work Type', data.workType],
              ['Tooth Numbers', data.toothNumbers || '—'],
              ...(data.units != null ? [['Units', data.units]] : []),
              ['Shade', data.shade || '—'],
              [data.dueDate ? 'Due Date' : data.payment?.verifiedAt ? 'Delivered' : 'Due Date',
                data.dueDate
                  ? format(new Date(data.dueDate), 'dd MMM yyyy')
                  : data.payment?.verifiedAt
                    ? format(new Date(data.payment.verifiedAt), 'dd MMM yyyy')
                    : '—'],
              ['Amount', data.totalAmount ? `Br ${data.totalAmount.toLocaleString('en-US')}` : '—'],
              ...(data.deliveryDate ? [['Delivered On', format(new Date(data.deliveryDate), 'dd MMM yyyy, h:mm a')]] : []),
              ...(data.doctorName ? [['Doctor', data.doctorName]] : []),
              ...(data.doctorPhone ? [['Doctor Phone', data.doctorPhone]] : []),
              ...(data.patientGender ? [['Patient Gender', data.patientGender]] : []),
              ...(data.remake ? [['Remake', '🔄 Yes' + (data.remakeReason ? ' — ' + data.remakeReason : '')]] : []),
              ...(data.isRedo ? [['Redo / Replacement', '♻️ Yes — 50% rate']] : []),
            ].map(([label, val]) => (
              <div key={label} style={{ background: 'var(--surface-2)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', fontWeight: 600, marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{val}</div>
              </div>
            ))}
          </div>

          {data.notes && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '13px' }}>
              <strong>Notes:</strong> {data.notes}
            </div>
          )}

          {/* Comments / additional info from-or-for the dentist */}
          <div className="divider" />
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
              💬 Comments <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>· additional info needed from the dentist</span>
            </div>
            {comments.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {comments.map(c => (
                  <div key={c.id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                      {c.authorName || 'Staff'}{c.authorRole ? ` · ${c.authorRole}` : ''} · {format(new Date(c.createdAt), 'dd MMM yyyy, h:mm a')}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea
                placeholder="Add a comment (e.g. need shade confirmation from the dentist)…"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                rows={2}
                style={{ flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <button className="btn btn-primary btn-sm" onClick={postComment} disabled={postingComment || !newComment.trim()}>
                {postingComment ? '…' : 'Add'}
              </button>
            </div>
          </div>

          <div className="divider" />

          {/* Status + QR */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>Update Status</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ flex: 1 }}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={updateStatus} disabled={updating || newStatus === data.status}>
                  {updating ? '…' : 'Save'}
                </button>
              </div>
              {newStatus === 'CASE_ACCEPTED' && newStatus !== data.status && (
                <textarea
                  placeholder="Add a note for this acceptance (e.g. shade, dentist instructions)…"
                  value={statusNotes}
                  onChange={e => setStatusNotes(e.target.value)}
                  rows={3}
                  style={{ width: '100%', marginTop: 10, padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', resize: 'vertical', fontFamily: 'inherit' }}
                />
              )}
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <StatusBadge status={data.status} />
                <PaymentBadge status={data.paymentStatus} isExcluded={data.clinic?.isExcluded} />
              </div>
            </div>

            {data.qrCodeUrl && (
              <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={printQR} title="Click to print QR">
                <img src={data.qrCodeUrl} alt="QR Code" style={{ width: '80px', height: '80px', border: '1px solid var(--border)', borderRadius: '8px' }} />
                <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '4px' }}>🖨️ Print</div>
              </div>
            )}
          </div>

          {/* Delivery Date */}
          <div className="divider" />
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
              Delivery Date
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                value={deliveryDateInput}
                onChange={e => setDeliveryDateInput(e.target.value)}
                style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--text-1)', background: 'var(--surface)', outline: 'none', fontFamily: 'DM Sans, sans-serif' }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={saveDeliveryDate}
                disabled={savingDeliveryDate}
              >
                {savingDeliveryDate ? '…' : 'Save'}
              </button>
              {deliveryDateInput && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setDeliveryDateInput(''); }}
                  style={{ color: 'var(--text-3)' }}
                  title="Clear delivery date"
                >
                  ✕
                </button>
              )}
            </div>
            {data.deliveryDate && (
              <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 5 }}>
                ✅ Currently set to {format(new Date(data.deliveryDate), 'dd MMM yyyy')}
              </div>
            )}
          </div>

          {/* Payment screenshot */}
          {data.payment?.screenshotUrl && (
            <>
              <div className="divider" />
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '8px' }}>
                  Payment Screenshot <PaymentBadge status={data.payment.status} />
                </div>
                <img
                  src={data.payment.screenshotUrl}
                  className="screenshot-img"
                  onClick={() => window.open(data.payment.screenshotUrl, '_blank')}
                  alt="Payment screenshot"
                />
                {data.payment.status === 'SCREENSHOT_UPLOADED' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button className="btn btn-success" style={{ flex: 1 }} onClick={async () => {
                      try {
                        await api.post(`/payments/${caseId}/verify`, { action: 'APPROVE' });
                        toast.success('Payment verified! Case is ready to dispatch.');
                        loadCase();
                      } catch { toast.error('Verification failed'); }
                    }}>
                      ✓ Approve Payment
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={async () => {
                      const reason = prompt('Reason for rejection:');
                      if (!reason) return;
                      try {
                        await api.post(`/payments/${caseId}/verify`, { action: 'REJECT', rejectionReason: reason });
                        toast.success('Payment rejected. Clinic will be notified.');
                        loadCase();
                      } catch { toast.error('Rejection failed'); }
                    }}>
                      ✗ Reject
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Stage Timeline */}
          <div className="divider" />
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)', marginBottom: '12px' }}>Production Timeline</div>
          {data.stages?.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '13px' }}>No stage scans yet.</div>
          ) : (
            <div className="timeline">
              {data.stages.map((s, i) => (
                <div className="timeline-item" key={s.id}>
                  <div className={`timeline-dot done`}>{STAGE_ICONS[s.stageName] || '●'}</div>
                  <div className="timeline-content">
                    <div className="timeline-label">{STATUS_LABELS[s.stageName]}</div>
                    <div className="timeline-time">
                      {format(new Date(s.scannedAt), 'dd MMM yyyy, h:mm a')}
                    </div>
                    {s.scannedBy && (
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                        Scanned by: <strong style={{ color: 'var(--text-2)' }}>{s.scannedBy}</strong>
                      </div>
                    )}
                    {s.notes && <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>{s.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
