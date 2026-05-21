import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import QRScanner from '../components/QRScanner';

// ── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const isPickup = action === 'pickup';
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">
            {isPickup ? '📦 Confirm Pickup' : '✅ Confirm Delivery'}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
            {isPickup
              ? 'Confirm you have picked up this case from the lab.'
              : 'Confirm this case has been delivered to the clinic.'}
          </p>

          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div className="case-number" style={{ marginBottom: 4 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{caseData.workType} · {caseData.clinic?.name}</div>
            {caseData.clinic?.address && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>📍 {caseData.clinic.address}</div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              className={isPickup ? 'btn btn-primary' : 'btn btn-success'}
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? 'Processing…' : isPickup ? '📦 Confirm Pickup' : '✅ Mark Delivered'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────
export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [processing, setProcessing] = useState(false);
  const [tab, setTab]         = useState('active');
  const [scanMode, setScanMode] = useState(false);

  useEffect(() => {
    loadCases();
    const t = setInterval(loadCases, 30000);
    return () => clearInterval(t);
  }, []);

  const loadCases = async () => {
    try {
      const res = await api.get('/delivery/assigned');
      setCases(res.data.cases ?? res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (caseId) => {
    setScanMode(false);
    const found = cases.find(c => c.id === caseId);
    if (!found) { toast.error('Case not in your delivery queue'); return; }
    if (found.status === 'DELIVERED') { toast.success(`✅ ${found.caseNumber} — already delivered`); return; }
    if (found.status === 'READY_TO_DISPATCH') setModal({ case: found, action: 'pickup' });
    else if (found.status === 'OUT_FOR_DELIVERY') setModal({ case: found, action: 'deliver' });
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

  const active  = cases.filter(c => c.status !== 'DELIVERED');
  const done    = cases.filter(c => c.status === 'DELIVERED');
  const shown   = tab === 'active' ? active : done;
  const ready   = active.filter(c => c.status === 'READY_TO_DISPATCH').length;
  const enRoute = active.filter(c => c.status === 'OUT_FOR_DELIVERY').length;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div className="topbar">
        <div className="topbar-title">🚚 Delivery Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-3)' }}>
          <div className="live-dot" />
          Live · {user?.name?.split(' ')[0]}
        </div>
      </div>

      <div className="content" style={{ flex: 1 }}>

        {/* Stats row */}
        <div className="stats-grid stats-3">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>📦</div>
            <div className="stat-label">To Pick Up</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{ready}</div>
            <div className="stat-sub">Ready at lab</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>🚚</div>
            <div className="stat-label">En Route</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{enRoute}</div>
            <div className="stat-sub">Out for delivery</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
            <div className="stat-label">Delivered</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{done.length}</div>
            <div className="stat-sub">Today</div>
          </div>
        </div>

        {/* Tabs + Scan QR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div className="filters" style={{ margin: 0, flex: 1 }}>
            <button
              className={`filter-chip ${tab === 'active' ? 'active' : ''}`}
              onClick={() => setTab('active')}
            >
              Active{active.length ? ` (${active.length})` : ''}
            </button>
            <button
              className={`filter-chip ${tab === 'done' ? 'active' : ''}`}
              onClick={() => setTab('done')}
            >
              Delivered{done.length ? ` (${done.length})` : ''}
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setScanMode(true)}>
            📷 Scan QR
          </button>
        </div>

        {/* Case list */}
        <div className="card">
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{tab === 'active' ? '🎉' : '📭'}</div>
              <div className="empty-title">{tab === 'active' ? 'All Clear!' : 'No Deliveries Yet'}</div>
              <p>{tab === 'active' ? 'No cases waiting for pickup or delivery.' : "Completed deliveries appear here."}</p>
            </div>
          ) : shown.map(c => {
            const deliveredAt = c.deliveryLogs?.[0]?.deliveredAt || c.updatedAt;
            const accentColor = c.status === 'READY_TO_DISPATCH' ? 'var(--accent)'
              : c.status === 'OUT_FOR_DELIVERY' ? 'var(--amber)' : 'var(--green)';
            return (
              <div key={c.id} style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${accentColor}`, padding: '16px 18px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <span className="case-number">{c.caseNumber}</span>
                    <div className="patient-name" style={{ marginTop: 4 }}>{c.patientName}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{c.workType}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>

                {/* Clinic row */}
                <div style={{ fontSize: 13, color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span>🏥 <strong>{c.clinic?.name}</strong></span>
                  {c.clinic?.phone && (
                    <a href={`tel:${c.clinic.phone}`} style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>📞 Call</a>
                  )}
                </div>

                {/* Address */}
                {c.clinic?.address && (
                  <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text-2)', display: 'flex', gap: 8, marginBottom: 10 }}>
                    <span>📍</span>
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(c.clinic.address)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-2)', textDecoration: 'none' }}>
                      {c.clinic.address}
                    </a>
                  </div>
                )}

                {/* Action buttons */}
                {c.status === 'READY_TO_DISPATCH' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setModal({ case: c, action: 'pickup' })}>
                    📦 Confirm Pickup
                  </button>
                )}
                {c.status === 'OUT_FOR_DELIVERY' && (
                  <button className="btn btn-success btn-sm" onClick={() => setModal({ case: c, action: 'deliver' })}>
                    ✅ Mark Delivered
                  </button>
                )}
                {c.status === 'DELIVERED' && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    ✅ Delivered · {format(new Date(deliveredAt), 'dd MMM, h:mm a')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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

      {scanMode && (
        <QRScanner onScan={handleScan} onClose={() => setScanMode(false)} />
      )}

      {/* Bottom FAB — sign out */}
      <button
        onClick={logout}
        title="Sign out"
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--surface)', border: '2px solid var(--red)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, cursor: 'pointer', zIndex: 50,
          transition: 'all .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--red-dim)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
      >
        ⏻
      </button>
    </div>
  );
}
