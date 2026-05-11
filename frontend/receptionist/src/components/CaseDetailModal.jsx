import { useEffect, useState } from 'react';
import api from '../api';
import { StatusBadge, PaymentBadge, STAGE_ICONS } from './StatusBadge';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const STATUSES = [
  'RECEIVED','IMPRESSION','CASTING','FABRICATION',
  'QUALITY_CHECK','READY_TO_DISPATCH','OUT_FOR_DELIVERY','DELIVERED','ON_HOLD'
];

const STATUS_LABELS = {
  RECEIVED:'Received', IMPRESSION:'Impression', CASTING:'Casting',
  FABRICATION:'Fabrication', QUALITY_CHECK:'Quality Check',
  READY_TO_DISPATCH:'Ready to Dispatch', OUT_FOR_DELIVERY:'Out for Delivery',
  DELIVERED:'Delivered', ON_HOLD:'On Hold'
};

export default function CaseDetailModal({ caseId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    loadCase();
  }, [caseId]);

  const loadCase = async () => {
    try {
      const res = await api.get(`/cases/${caseId}`);
      setData(res.data);
      setNewStatus(res.data.status);
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
      await api.patch(`/cases/${caseId}/status`, { status: newStatus });
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      loadCase();
    } catch (err) {
      toast.error('Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const printQR = () => {
    if (!data?.qrCodeUrl) return;
    const w = window.open('', '_blank');
    w.document.write(`
      <html><body style="text-align:center;padding:40px;font-family:Arial">
        <h2>🦷 Ye-Almaz Dental Lab</h2>
        <h3>${data.caseNumber}</h3>
        <p>${data.patientName} — ${data.workType}</p>
        <img src="${data.qrCodeUrl}" style="width:200px;margin:20px auto;display:block"/>
        <p style="font-size:12px;color:#888">Scan to update production stage</p>
        <script>window.print()</script>
      </body></html>
    `);
  };

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
              ['Shade', data.shade || '—'],
              ['Due Date', data.dueDate ? format(new Date(data.dueDate), 'dd MMM yyyy') : '—'],
              ['Amount', data.totalAmount ? `₹${data.totalAmount.toLocaleString('en-IN')}` : '—'],
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
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <StatusBadge status={data.status} />
                <PaymentBadge status={data.paymentStatus} />
              </div>
            </div>

            {data.qrCodeUrl && (
              <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={printQR} title="Click to print QR">
                <img src={data.qrCodeUrl} alt="QR Code" style={{ width: '80px', height: '80px', border: '1px solid var(--border)', borderRadius: '8px' }} />
                <div style={{ fontSize: '10px', color: 'var(--text-3)', marginTop: '4px' }}>🖨️ Print</div>
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
                      {s.scannedBy && ` · ${s.scannedBy}`}
                    </div>
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
