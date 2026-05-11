import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const isPickup = action === 'pickup';
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.7)',
      backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end',
      justifyContent: 'center', zIndex: 100
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, padding: '24px 20px 40px',
        borderTop: '1px solid var(--border-2)',
        animation: 'slideUp 0.25s ease'
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {isPickup ? '📦 Confirm Pickup' : '✅ Confirm Delivery'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
          {isPickup
            ? 'Confirm you have picked up this case from the lab.'
            : 'Confirm this case has been delivered to the clinic.'}
        </div>

        <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', marginBottom: 4 }}>
            {caseData.caseNumber}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>{caseData.patientName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {caseData.workType} · {caseData.clinic?.name}
          </div>
          {caseData.clinic?.address && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              📍 {caseData.clinic.address}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={`btn ${isPickup ? 'btn-primary' : 'btn-success'}`}
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing…' : isPickup ? '📦 Confirm Pickup' : '✅ Mark Delivered'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [tab, setTab] = useState('active');

  useEffect(() => {
    loadCases();
    const interval = setInterval(loadCases, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCases = async () => {
    try {
      const res = await api.get('/delivery/assigned');
      setCases(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { case: c, action } = modal;
      if (action === 'pickup') {
        await api.post(`/delivery/${c.id}/pickup`);
        toast.success('📦 Pickup confirmed!');
      } else {
        await api.post(`/delivery/${c.id}/deliver`);
        toast.success('✅ Delivery confirmed!');
      }
      setModal(null);
      loadCases();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  const active = cases.filter(c => c.status !== 'DELIVERED');
  const done = cases.filter(c => c.status === 'DELIVERED');
  const displayed = tab === 'active' ? active : done;
  const readyCount = active.filter(c => c.status === 'READY_TO_DISPATCH').length;
  const enRouteCount = active.filter(c => c.status === 'OUT_FOR_DELIVERY').length;

  const statusPill = (status) => {
    if (status === 'READY_TO_DISPATCH') return <span className="badge badge-ready">📦 Ready</span>;
    if (status === 'OUT_FOR_DELIVERY') return <span className="badge badge-dispatch">🚚 En Route</span>;
    if (status === 'DELIVERED') return <span className="badge badge-delivered">✅ Delivered</span>;
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: 480, margin: '0 auto' }}>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🦷</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Ye-Almaz Lab</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--green-dim)', border: '1px solid var(--accent)',
            borderRadius: 20, padding: '4px 12px',
            fontSize: 12, fontWeight: 700, color: 'var(--accent)'
          }}>
            <div className="live-dot" />
            🚚 {user?.name?.split(' ')[0]}
          </div>
          <button className="logout-btn" onClick={logout} title="Logout" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 18 }}>⏻</button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="content">

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">To Pick Up</div>
            <div className="stat-value" style={{ color: 'var(--green)', fontSize: 28 }}>{readyCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">En Route</div>
            <div className="stat-value" style={{ color: 'var(--amber)', fontSize: 28 }}>{enRouteCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Delivered</div>
            <div className="stat-value" style={{ color: 'var(--text-3)', fontSize: 28 }}>{done.length}</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['active', 'done'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`filter-chip ${tab === t ? 'active' : ''}`} style={{ flex: 1, textAlign: 'center' }}>
              {t === 'active' ? `Active${active.length > 0 ? ` (${active.length})` : ''}` : `Delivered${done.length > 0 ? ` (${done.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Cases */}
        {loading ? (
          <div className="empty-state"><div className="empty-icon">⏳</div><div className="empty-title">Loading…</div></div>
        ) : displayed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{tab === 'active' ? '🎉' : '📭'}</div>
            <div className="empty-title">{tab === 'active' ? 'All Clear!' : 'No Deliveries Yet'}</div>
            <p style={{ color: 'var(--text-3)', fontSize: 13, maxWidth: 220, textAlign: 'center' }}>
              {tab === 'active' ? 'No cases waiting for pickup or delivery.' : 'Completed deliveries appear here.'}
            </p>
          </div>
        ) : (
          displayed.map(c => (
            <div key={c.id} className="card" style={{
              marginBottom: 12, overflow: 'hidden',
              borderLeft: c.status === 'READY_TO_DISPATCH' ? '3px solid var(--green)'
                : c.status === 'OUT_FOR_DELIVERY' ? '3px solid var(--amber)'
                : '3px solid var(--text-3)'
            }}>
              {/* Card top */}
              <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="case-number">{c.caseNumber}</div>
                  <div className="patient-name">{c.patientName}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{c.workType}</div>
                </div>
                {statusPill(c.status)}
              </div>

              {/* Clinic */}
              <div style={{ padding: '0 16px 10px', fontSize: 13, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🏥 <strong style={{ color: 'var(--text-1)' }}>{c.clinic?.name}</strong></span>
                {c.clinic?.phone && c.clinic.phone !== '' && (
                  <a href={`tel:${c.clinic.phone}`} style={{ color: 'var(--blue)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                    📞 Call
                  </a>
                )}
              </div>

              {/* Address */}
              {c.clinic?.address && c.clinic.address !== '' && (
                <div style={{ margin: '0 16px 12px', background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--text-2)', display: 'flex', gap: 8 }}>
                  <span>📍</span><span>{c.clinic.address}</span>
                </div>
              )}

              {/* Actions */}
              {c.status !== 'DELIVERED' && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  {c.status === 'READY_TO_DISPATCH' && (
                    <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setModal({ case: c, action: 'pickup' })}>
                      📦 Confirm Pickup
                    </button>
                  )}
                  {c.status === 'OUT_FOR_DELIVERY' && (
                    <button className="btn btn-success" style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => setModal({ case: c, action: 'deliver' })}>
                      ✅ Mark Delivered
                    </button>
                  )}
                </div>
              )}

              {/* Delivered timestamp */}
              {c.status === 'DELIVERED' && (
                <div style={{ padding: '8px 16px 12px', fontSize: 12, color: 'var(--text-3)' }}>
                  Delivered · {format(new Date(c.updatedAt), 'dd MMM, h:mm a')}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Confirm modal */}
      {modal && (
        <ConfirmModal
          caseData={modal.case}
          action={modal.action}
          onConfirm={handleAction}
          onClose={() => setModal(null)}
          loading={processing}
        />
      )}
    </div>
  );
}
