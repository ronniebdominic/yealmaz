import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Assign Modal ─────────────────────────────────────────────────────────────
function AssignModal({ caseData, executives, onConfirm, onClose, loading }) {
  const [selectedExecId, setSelectedExecId] = useState('');

  const current = caseData.assignedDelivery;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">🚚 Assign Delivery Executive</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Case summary */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 18, border: '1px solid var(--border)' }}>
            <div className="case-number" style={{ marginBottom: 4 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{caseData.workType} · {caseData.clinic?.name}</div>
            {caseData.clinic?.address && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>📍 {caseData.clinic.address}</div>
            )}
          </div>

          {current && (
            <div style={{ background: 'var(--amber-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 13, color: 'var(--amber)' }}>
              ⚠ Currently assigned to <strong>{current.name}</strong>
            </div>
          )}

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
            SELECT DELIVERY EXECUTIVE
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {executives.map(exec => {
              const activeCount = exec.assignedDeliveries?.length || 0;
              const isSelected = selectedExecId === exec.id;
              return (
                <button
                  key={exec.id}
                  onClick={() => setSelectedExecId(exec.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 10, border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--accent-dim)' : 'var(--surface-2)',
                    cursor: 'pointer', transition: 'all .15s', textAlign: 'left'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                      {isSelected ? '✓ ' : ''}{exec.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{exec.email}</div>
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: activeCount === 0 ? 'var(--green-dim)' : activeCount < 3 ? 'var(--amber-dim)' : 'var(--red-dim)',
                    color: activeCount === 0 ? 'var(--green)' : activeCount < 3 ? 'var(--amber)' : 'var(--red)',
                  }}>
                    {activeCount} active
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onConfirm(selectedExecId)}
              disabled={loading || !selectedExecId}
            >
              {loading ? 'Assigning…' : '✓ Assign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dispatch Dashboard ──────────────────────────────────────────────────
export default function DispatchDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases]           = useState([]);
  const [executives, setExecutives] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(null);   // { case }
  const [processing, setProcessing] = useState(false);
  const [tab, setTab]               = useState('queue'); // queue | enroute | delivered
  const [search, setSearch]         = useState('');
  const [open, setOpen]             = useState(false);

  const load = useCallback(async () => {
    try {
      const [queueRes, execRes] = await Promise.all([
        api.get('/dispatch/queue'),
        api.get('/dispatch/executives'),
      ]);
      setCases(queueRes.data);
      setExecutives(execRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const handleAssign = async (executiveId) => {
    if (!modal || !executiveId) return;
    setProcessing(true);
    try {
      await api.post(`/dispatch/${modal.case.id}/assign`, { executiveId });
      toast.success('✓ Case assigned!');
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Assignment failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleUnassign = async (c) => {
    if (!window.confirm(`Unassign ${c.caseNumber} from ${c.assignedDelivery?.name}?`)) return;
    try {
      await api.post(`/dispatch/${c.id}/unassign`);
      toast.success('Unassigned');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  // Derived lists
  const q = search.toLowerCase();
  const filtered = cases.filter(c =>
    !q ||
    c.caseNumber?.toLowerCase().includes(q) ||
    c.patientName?.toLowerCase().includes(q) ||
    c.clinic?.name?.toLowerCase().includes(q) ||
    c.assignedDelivery?.name?.toLowerCase().includes(q)
  );

  const queue     = filtered.filter(c => c.status === 'READY_TO_DISPATCH');
  const enRoute   = filtered.filter(c => c.status === 'OUT_FOR_DELIVERY');
  const delivered = filtered.filter(c => c.status === 'DELIVERED');
  const unassigned = queue.filter(c => !c.assignedDeliveryId);
  const shown = tab === 'queue' ? queue : tab === 'enroute' ? enRoute : delivered;

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'DS';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Drawer overlay ──────────────────────────────── */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* ── Drawer ──────────────────────────────────────── */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(0,196,180,0.15)', color: 'var(--accent)' }}>Dispatch</span>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Queue</div>
          <button className={`nav-item${tab === 'queue' ? ' active' : ''}`} onClick={() => { setTab('queue'); setOpen(false); }}>
            <span>📦</span> Ready to Dispatch
            {queue.length > 0 && <span className="badge-count">{queue.length}</span>}
          </button>
          <button className={`nav-item${tab === 'enroute' ? ' active' : ''}`} onClick={() => { setTab('enroute'); setOpen(false); }}>
            <span>🚚</span> En Route
            {enRoute.length > 0 && <span className="badge-count">{enRoute.length}</span>}
          </button>
          <button className={`nav-item${tab === 'delivered' ? ' active' : ''}`} onClick={() => { setTab('delivered'); setOpen(false); }}>
            <span>✅</span> Delivered
          </button>
        </nav>
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Dispatch</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </div>

      {/* Topbar */}
      <div className="topbar">
        <button className="hamburger-topbar" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <div className="topbar-title">📋 Dispatch Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
          <div className="live-dot" />
          Live · {user?.name}
        </div>
      </div>

      <div className="content" style={{ flex: 1 }}>

        {/* Stats */}
        <div className="stats-grid stats-4" style={{ '--cols': 4 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>📦</div>
            <div className="stat-label">Ready to Dispatch</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{queue.length}</div>
            <div className="stat-sub" style={{ color: unassigned.length > 0 ? 'var(--red)' : 'var(--green)' }}>
              {unassigned.length > 0 ? `⚠ ${unassigned.length} unassigned` : '✓ All assigned'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>🚚</div>
            <div className="stat-label">En Route</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{enRoute.length}</div>
            <div className="stat-sub">Out for delivery</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
            <div className="stat-label">Delivered Today</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{delivered.length}</div>
            <div className="stat-sub">Completed</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--surface-2)' }}>👥</div>
            <div className="stat-label">Executives</div>
            <div className="stat-value">{executives.length}</div>
            <div className="stat-sub">{executives.filter(e => (e.assignedDeliveries?.length || 0) > 0).length} active</div>
          </div>
        </div>

        {/* Executive load summary */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '.05em' }}>
            EXECUTIVE WORKLOAD
          </div>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
            {executives.map((exec, i) => {
              const active = exec.assignedDeliveries?.length || 0;
              return (
                <div key={exec.id} style={{
                  flex: '1 1 180px', padding: '14px 18px',
                  borderRight: i < executives.length - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
                    {exec.name.replace('Yealmaz Delivery Executive ', 'Exec ')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{exec.email}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {exec.assignedDeliveries?.map(c => (
                      <span key={c.id} style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 20,
                        background: c.status === 'OUT_FOR_DELIVERY' ? 'var(--amber-dim)' : 'var(--accent-dim)',
                        color: c.status === 'OUT_FOR_DELIVERY' ? 'var(--amber)' : 'var(--accent)',
                        fontWeight: 600
                      }}>
                        {c.caseNumber}
                      </span>
                    ))}
                    {active === 0 && (
                      <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>● Free</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tabs + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="filters" style={{ margin: 0, flex: 1 }}>
            <button className={`filter-chip ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
              📦 Queue {queue.length > 0 && `(${queue.length})`}
              {unassigned.length > 0 && <span style={{ marginLeft: 4, color: 'var(--red)', fontWeight: 700 }}>⚠{unassigned.length}</span>}
            </button>
            <button className={`filter-chip ${tab === 'enroute' ? 'active' : ''}`} onClick={() => setTab('enroute')}>
              🚚 En Route {enRoute.length > 0 && `(${enRoute.length})`}
            </button>
            <button className={`filter-chip ${tab === 'delivered' ? 'active' : ''}`} onClick={() => setTab('delivered')}>
              ✅ Delivered {delivered.length > 0 && `(${delivered.length})`}
            </button>
          </div>
          <input
            className="search-input"
            placeholder="Search case, patient, clinic…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
        </div>

        {/* Case list */}
        <div className="card">
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : shown.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{tab === 'queue' ? '🎉' : tab === 'enroute' ? '📭' : '📋'}</div>
              <div className="empty-title">
                {tab === 'queue' ? 'Queue is Empty' : tab === 'enroute' ? 'None En Route' : 'No Deliveries Today'}
              </div>
              <p>{tab === 'queue' ? 'No cases waiting for dispatch.' : tab === 'enroute' ? 'No cases currently out for delivery.' : 'Completed deliveries will appear here.'}</p>
            </div>
          ) : shown.map(c => {
            const isUnassigned = !c.assignedDeliveryId;
            const accentColor = c.status === 'READY_TO_DISPATCH'
              ? (isUnassigned ? 'var(--red)' : 'var(--accent)')
              : c.status === 'OUT_FOR_DELIVERY' ? 'var(--amber)' : 'var(--green)';
            return (
              <div key={c.id} style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${accentColor}`, padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  {/* Left: case info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span className="case-number">{c.caseNumber}</span>
                      <StatusBadge status={c.status} />
                      {c.deliveryType === 'EXPRESS' && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)' }}>⚡ Express</span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{c.patientName}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>{c.workType} · 🏥 {c.clinic?.name}</div>
                    {c.clinic?.address && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>📍 {c.clinic.address}</div>
                    )}
                    {c.dueDate && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        📅 Due: {format(new Date(c.dueDate), 'dd MMM yyyy')}
                      </div>
                    )}
                  </div>

                  {/* Right: assignment + actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    {/* Assigned exec badge */}
                    {c.assignedDelivery ? (
                      <div style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, textAlign: 'right' }}>
                        👤 {c.assignedDelivery.name.replace('Yealmaz Delivery Executive ', 'Exec ')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'var(--red-dim)', color: 'var(--red)', fontWeight: 700 }}>
                        ⚠ Unassigned
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(c.status === 'READY_TO_DISPATCH' || c.status === 'OUT_FOR_DELIVERY') && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setModal({ case: c })}
                        >
                          {c.assignedDelivery ? '↻ Reassign' : '+ Assign'}
                        </button>
                      )}
                      {c.assignedDelivery && c.status !== 'DELIVERED' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleUnassign(c)}
                          style={{ color: 'var(--red)' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Delivery time for delivered */}
                    {c.status === 'DELIVERED' && c.deliveryLogs?.[0]?.deliveredAt && (
                      <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
                        ✅ {format(new Date(c.deliveryLogs[0].deliveredAt), 'dd MMM, h:mm a')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assign Modal */}
      {modal && (
        <AssignModal
          caseData={modal.case}
          executives={executives}
          onConfirm={handleAssign}
          onClose={() => setModal(null)}
          loading={processing}
        />
      )}

      {/* Sign out FAB */}
      <button
        onClick={logout}
        title="Sign out"
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--surface)', border: '2px solid var(--red)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, cursor: 'pointer', zIndex: 50, transition: 'all .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--red-dim)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
      >
        ⏻
      </button>
    </div>
  );
}
