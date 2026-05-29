import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import QRScanner from '../components/QRScanner';

// ── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const isCollect  = action === 'collect';
  const isPickup   = action === 'pickup';
  const title      = isCollect ? '🛵 Confirm Impression Collected'
                   : isPickup  ? '📦 Confirm Pickup from Lab'
                   :             '✅ Confirm Delivery';
  const description = isCollect ? 'Confirm you have collected the impression/cast from the clinic and brought it to the lab.'
                    : isPickup  ? 'Confirm you have picked up this case from the lab for delivery.'
                    :             'Confirm this case has been delivered to the clinic.';
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>{description}</p>

          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div className="case-number" style={{ marginBottom: 4 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {caseData.workType}
              {caseData.units != null && (
                <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-3)' }}>({caseData.units} units)</span>
              )}
              {' · '}{caseData.clinic?.name}
            </div>
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
              {loading ? 'Processing…' : isCollect ? '🏭 Impression at Lab' : isPickup ? '📦 Confirm Pickup' : '✅ Mark Delivered'}
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
  const [tab, setTab]           = useState('active');
  const [scanMode, setScanMode] = useState(false);
  const [search, setSearch]     = useState('');
  const [clinicFilter, setClinicFilter] = useState('');

  useEffect(() => {
    loadCases();
    const t = setInterval(loadCases, 30000);
    return () => clearInterval(t);
  }, []);

  // Join personal socket room for real-time assignment notifications
  useEffect(() => {
    if (!user?.id) return;
    // Dynamically import socket if available
    import('../api').then(mod => {
      const socket = mod.socket;
      if (!socket) return;
      socket.emit('join_delivery', user.id);
      socket.on('case_assigned', () => loadCases());
      return () => socket.off('case_assigned');
    }).catch(() => {});
  }, [user?.id]);

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
    if (found.status === 'PICKUP_ASSIGNED') setModal({ case: found, action: 'collect' });
    else if (found.status === 'READY_TO_DISPATCH') setModal({ case: found, action: 'pickup' });
    else if (found.status === 'OUT_FOR_DELIVERY') setModal({ case: found, action: 'deliver' });
  };

  const handleAction = async () => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { case: c, action } = modal;
      if (action === 'collect') {
        await api.post(`/delivery/${c.id}/collect-impression`);
        toast.success('🏭 Impression handed to lab!');
      } else if (action === 'pickup') {
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

  const active      = cases.filter(c => c.status !== 'DELIVERED');
  const done        = cases.filter(c => c.status === 'DELIVERED');
  const toPickUp    = active.filter(c => c.status === 'PICKUP_ASSIGNED').length;
  const ready       = active.filter(c => c.status === 'READY_TO_DISPATCH').length;

  // Apply search + clinic filter
  const sq = search.toLowerCase();
  const applyFilter = (arr) => arr.filter(c =>
    (!clinicFilter || c.clinic?.name === clinicFilter) &&
    (!sq || c.clinic?.name?.toLowerCase().includes(sq) || c.caseNumber?.toLowerCase().includes(sq) || c.patientName?.toLowerCase().includes(sq))
  );
  const shown = applyFilter(tab === 'active' ? active : done);

  // Unique clinic names for dropdown
  const clinicNames = [...new Set(cases.map(c => c.clinic?.name).filter(Boolean))].sort();
  const enRoute     = active.filter(c => c.status === 'OUT_FOR_DELIVERY').length;

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
        <div className="stats-grid stats-4">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#FFF7ED' }}>🛵</div>
            <div className="stat-label">Collect from Clinic</div>
            <div className="stat-value" style={{ color: '#EA580C' }}>{toPickUp}</div>
            <div className="stat-sub">Impression pickup</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>📦</div>
            <div className="stat-label">To Deliver</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div className="filters" style={{ margin: 0, flex: 1 }}>
            <button className={`filter-chip ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
              Active{active.length ? ` (${active.length})` : ''}
            </button>
            <button className={`filter-chip ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
              Delivered{done.length ? ` (${done.length})` : ''}
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setScanMode(true)}>
            📷 Scan QR
          </button>
        </div>

        {/* Search + clinic filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: 160 }}>
            <span className="icon">🔍</span>
            <input
              placeholder="Search clinic, case or patient…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {clinicNames.length > 1 && (
            <select
              value={clinicFilter}
              onChange={e => setClinicFilter(e.target.value)}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: 'var(--text-1)', background: 'var(--surface)', outline: 'none', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', minWidth: 150 }}
            >
              <option value="">All Clinics</option>
              {clinicNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
          {(search || clinicFilter) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setClinicFilter(''); }} style={{ color: 'var(--red)' }}>✕</button>
          )}
        </div>

        {/* Case list — grouped by clinic */}
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{tab === 'active' ? '🎉' : '📭'}</div>
            <div className="empty-title">{tab === 'active' ? 'All Clear!' : 'No Deliveries Yet'}</div>
            <p>{tab === 'active' ? 'No cases waiting.' : 'Completed deliveries appear here.'}</p>
          </div>
        ) : (() => {
          // Group shown cases by clinic
          const grouped = {};
          for (const c of shown) {
            const key = c.clinic?.name || 'Unknown Clinic';
            if (!grouped[key]) grouped[key] = { clinic: c.clinic, cases: [] };
            grouped[key].cases.push(c);
          }
          return Object.values(grouped).map(g => (
            <div key={g.clinic?.id || g.clinic?.name} className="card" style={{ marginBottom: 14 }}>
              {/* Clinic header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)', borderRadius: '10px 10px 0 0' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {g.clinic?.name?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>🏥 {g.clinic?.name}</div>
                  {g.clinic?.station && (
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent)', marginTop: 1 }}>
                      {g.clinic.station.toUpperCase()}
                    </div>
                  )}
                  {g.clinic?.address && (
                    <a href={`https://maps.google.com/?q=${encodeURIComponent(g.clinic.address)}`} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', marginTop: 2, display: 'block' }}>
                      📍 {g.clinic.address}
                    </a>
                  )}
                </div>
                {g.clinic?.phone && (
                  <a href={`tel:${g.clinic.phone}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}>📞 Call</a>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', flexShrink: 0 }}>
                  {g.cases.length}
                </span>
              </div>

              {/* Cases under this clinic */}
              {g.cases.map(c => {
                const deliveredAt = c.deliveryLogs?.[0]?.deliveredAt || c.updatedAt;
                const accentColor = c.status === 'PICKUP_ASSIGNED' ? '#CA8A04'
                  : c.status === 'READY_TO_DISPATCH' ? 'var(--accent)'
                  : c.status === 'OUT_FOR_DELIVERY' ? 'var(--amber)' : 'var(--green)';
                return (
                  <div key={c.id} style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${accentColor}`, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <span className="case-number">{c.caseNumber}</span>
                        <div className="patient-name" style={{ marginTop: 4 }}>{c.patientName}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                          {c.workType}{c.units != null && <span style={{ marginLeft: 4, color: 'var(--text-3)' }}>· {c.units} units</span>}
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    {c.status === 'PICKUP_ASSIGNED' && (
                      <button className="btn btn-sm" style={{ background: '#FFF7ED', color: '#EA580C', border: '1px solid #FDBA74' }} onClick={() => setModal({ case: c, action: 'collect' })}>
                        🛵 Impression Collected from Clinic
                      </button>
                    )}
                    {c.status === 'READY_TO_DISPATCH' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setModal({ case: c, action: 'pickup' })}>
                        📦 Confirm Pickup from Lab
                      </button>
                    )}
                    {c.status === 'OUT_FOR_DELIVERY' && (
                      <button className="btn btn-success btn-sm" onClick={() => setModal({ case: c, action: 'deliver' })}>
                        ✅ Mark Delivered
                      </button>
                    )}
                    {c.status === 'DELIVERED' && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        ✅ Delivered · {format(new Date(deliveredAt), 'dd MMM, h:mm a')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ));
        })()}
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
