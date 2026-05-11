import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import CaseDetailModal from '../components/CaseDetailModal';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState(null);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/payments/pending');
      setPayments(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const verify = async (caseId, action) => {
    let rejectionReason;
    if (action === 'REJECT') {
      rejectionReason = prompt('Reason for rejection (will be sent to clinic):');
      if (!rejectionReason) return;
    }
    setProcessing(caseId + action);
    try {
      await api.post(`/payments/${caseId}/verify`, { action, rejectionReason });
      toast.success(action === 'APPROVE' ? '✅ Payment approved! Case ready to dispatch.' : '❌ Payment rejected.');
      loadPayments();
    } catch (err) {
      toast.error('Action failed. Please try again.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Layout pendingPayments={payments.length}>
      <div className="topbar">
        <div className="topbar-title">Verify Payments</div>
        <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
          {payments.length} screenshot{payments.length !== 1 ? 's' : ''} awaiting review
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '60px' }}>Loading…</div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <div className="empty-title">All payments verified</div>
            <p>No screenshots waiting for review right now</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {payments.map(p => (
              <div className="card" key={p.id} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: '0' }}>
                  {/* Screenshot preview */}
                  <div style={{ width: '180px', flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    {p.screenshotUrl ? (
                      <img
                        src={p.screenshotUrl}
                        alt="Payment"
                        style={{ width: '100%', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border)' }}
                        onClick={() => window.open(p.screenshotUrl, '_blank')}
                      />
                    ) : (
                      <div style={{ color: 'var(--text-3)', textAlign: 'center', fontSize: '12px' }}>No image</div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700 }}>{p.case?.patientName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', marginTop: '2px' }}>
                          {p.case?.caseNumber}
                        </div>
                      </div>
                      <PaymentBadge status={p.status} />
                    </div>

                    <div className="grid-2" style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-3)' }}>Clinic: </span>
                        <strong>{p.case?.clinic?.name}</strong>
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-3)' }}>Amount: </span>
                        <strong>{p.amount ? `₹${p.amount.toLocaleString('en-IN')}` : '—'}</strong>
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-3)' }}>Work: </span>
                        <strong>{p.case?.workType}</strong>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                        Uploaded: {p.uploadedAt ? format(new Date(p.uploadedAt), 'dd MMM, h:mm a') : '—'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="btn btn-success"
                        onClick={() => verify(p.caseId, 'APPROVE')}
                        disabled={processing === p.caseId + 'APPROVE'}
                      >
                        ✓ Approve & Unlock Delivery
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => verify(p.caseId, 'REJECT')}
                        disabled={processing === p.caseId + 'REJECT'}
                      >
                        ✗ Reject
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedCase({ id: p.caseId })}
                      >
                        View Case
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedCase && (
        <CaseDetailModal
          caseId={selectedCase.id}
          onClose={() => { setSelectedCase(null); loadPayments(); }}
        />
      )}
    </Layout>
  );
}
