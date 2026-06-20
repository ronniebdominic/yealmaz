import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Confirm action modal ──────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const cfg = {
    picked_up:        { title: '✓ Confirm Picked Up',      desc: 'Confirm you have collected the impression from the clinic and are heading to the lab.', btn: '✓ Picked Up',      cls: 'btn btn-primary' },
    not_picked_up:    { title: '✕ Not Picked Up',           desc: 'Mark that collection was unsuccessful. The case will return to the pickup queue.',          btn: '✕ Not Picked Up',  cls: 'btn btn-ghost' },
    delivered:        { title: '✅ Confirm Delivery',        desc: 'Confirm this case has been successfully delivered to the clinic.',                           btn: '✅ Mark Delivered', cls: 'btn btn-success' },
    return_delivered: { title: '↩ Return — Not Delivered',  desc: 'Case could not be delivered. It will return to the dispatch queue for reassignment.',         btn: '↩ Return to Lab',  cls: 'btn btn-ghost' },
    not_delivered:    { title: '✕ Not Delivered',            desc: 'Mark as undeliverable. The case will return to the dispatch queue.',                         btn: '✕ Not Delivered',  cls: 'btn btn-ghost' },
  }[action] || { title: 'Confirm', desc: '', btn: 'Confirm', cls: 'btn btn-primary' };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{cfg.title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>{cfg.desc}</p>
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div className="case-number" style={{ marginBottom: 4 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
              {caseData.workType}{caseData.units != null ? ` · ${caseData.units} unit${caseData.units !== 1 ? 's' : ''}` : ''}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>🏥 {caseData.clinic?.name}</div>
            {caseData.clinic?.address && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>📍 {caseData.clinic.address}</div>
            )}
            {caseData.clinic?.phone && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>📞 {caseData.clinic.phone}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button className={cfg.cls} style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm} disabled={loading}>
              {loading ? 'Processing…' : cfg.btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Case row card ─────────────────────────────────────────
function CaseCard({ c, section, onAction }) {
  const isPickup = section === 'pickup';
  return (
    <div style={{
      padding: '16px 18px',
      borderBottom: '1px solid var(--border)',
      borderLeft: `3px solid ${isPickup ? '#EA580C' : 'var(--accent)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span className="case-number">{c.caseNumber}</span>
            {c.deliveryType === 'EXPRESS' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)' }}>⚡ Express</span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{c.patientName}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
            🏥 {c.clinic?.name}
          </div>
          {c.clinic?.address && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2 }}>
              📍 {c.clinic.address}
            </div>
          )}
          {c.clinic?.phone && (
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>
              📞 <a href={`tel:${c.clinic.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>{c.clinic.phone}</a>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {c.workType}{c.units != null ? ` · ${c.units} unit${c.units !== 1 ? 's' : ''}` : ''}
          </div>
          {c.dueDate && (
            <div style={{
              fontSize: 12, marginTop: 4,
              color: new Date(c.dueDate) < new Date() ? 'var(--red)' : 'var(--text-3)',
              fontWeight: new Date(c.dueDate) < new Date() ? 700 : 400,
            }}>
              📅 Due: {format(new Date(c.dueDate), 'dd MMM yyyy')}
              {new Date(c.dueDate) < new Date() ? ' — OVERDUE' : ''}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          {isPickup ? (
            <>
              <button
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: 'nowrap' }}
                onClick={() => onAction(c, 'picked_up')}
              >
                ✓ Mark as Picked Up
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}
                onClick={() => onAction(c, 'not_picked_up')}
              >
                ✕ Not Picked Up
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-success btn-sm"
                style={{ whiteSpace: 'nowrap', background: 'var(--green)', color: '#fff', border: 'none' }}
                onClick={() => onAction(c, 'delivered')}
              >
                ✅ Mark as Delivered
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--amber)', whiteSpace: 'nowrap' }}
                onClick={() => onAction(c, 'return_delivered')}
              >
                ↩ Return
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}
                onClick={() => onAction(c, 'not_delivered')}
              >
                ✕ Not Delivered
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Delivery Dashboard ───────────────────────────────
export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // { case, action }
  const [processing, setProcessing] = useState(false);
  const [tab, setTab]         = useState('pickup');

  const loadCases = useCallback(async () => {
    try {
      const res = await api.get('/delivery/assigned');
      setCases(res.data.cases ?? res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCases();
    const t = setInterval(loadCases, 20_000);
    return () => clearInterval(t);
  }, [loadCases]);

  // Real-time assignment notifications via socket
  useEffect(() => {
    if (!user?.id) return;
    import('../api').then(mod => {
      const socket = mod.socket;
      if (!socket) return;
      socket.emit('join_delivery', user.id);
      socket.on('case_assigned', () => loadCases());
      return () => socket.off('case_assigned');
    }).catch(() => {});
  }, [user?.id, loadCases]);

  const handleAction = async () => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { case: c, action } = modal;
      if (action === 'picked_up') {
        await api.post(`/delivery/${c.id}/collect-impression`);
        toast.success('✓ Impression collected — heading to lab');
      } else if (action === 'not_picked_up') {
        await api.patch(`/cases/${c.id}/status`, { status: 'PENDING_PICKUP', notes: 'Not picked up — returned to queue' });
        toast.success('↩ Case returned to pickup queue');
      } else if (action === 'delivered') {
        await api.post(`/delivery/${c.id}/deliver`);
        toast.success('✅ Delivery confirmed!');
      } else if (action === 'return_delivered' || action === 'not_delivered') {
        const note = action === 'return_delivered' ? 'Return — not delivered' : 'Could not deliver — returned to dispatch';
        await api.patch(`/cases/${c.id}/status`, { status: 'READY_TO_DISPATCH', notes: note });
        toast.success('↩ Case returned to dispatch queue');
      }
      setModal(null);
      loadCases();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally {
      setProcessing(false);
    }
  };

  // Split by type
  const pickupList   = cases.filter(c => c.status === 'PICKUP_ASSIGNED');
  const deliveryList = cases.filter(c => c.status === 'OUT_FOR_DELIVERY');
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'DV';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-title">🚚 Job Orders</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
            <div className="live-dot" /> Live · {user?.name?.split(' ')[0]}
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <button
            onClick={logout}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: 12, color: 'var(--text-3)', cursor: 'pointer' }}
          >
            ⏻
          </button>
        </div>
      </div>

      <div className="content" style={{ flex: 1 }}>
        {/* Summary */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('pickup')}>
            <div className="stat-icon" style={{ background: '#FFF7ED' }}>🛵</div>
            <div className="stat-label">Pick-up List</div>
            <div className="stat-value" style={{ color: '#EA580C' }}>{pickupList.length}</div>
            <div className="stat-sub">Impression collections</div>
          </div>
          <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('delivery')}>
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>📦</div>
            <div className="stat-label">Delivery List</div>
            <div className="stat-value" style={{ color: 'var(--accent)' }}>{deliveryList.length}</div>
            <div className="stat-sub">Cases to deliver</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
            <div className="stat-label">Total Assigned</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{cases.length}</div>
            <div className="stat-sub">My active jobs</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="filters" style={{ marginBottom: 16 }}>
          <button
            className={`filter-chip${tab === 'pickup' ? ' active' : ''}`}
            onClick={() => setTab('pickup')}
          >
            🛵 Pick-up List {pickupList.length > 0 && `(${pickupList.length})`}
          </button>
          <button
            className={`filter-chip${tab === 'delivery' ? ' active' : ''}`}
            onClick={() => setTab('delivery')}
          >
            📦 Delivery List {deliveryList.length > 0 && `(${deliveryList.length})`}
          </button>
        </div>

        {/* Pick-up List */}
        {tab === 'pickup' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">🛵 Pick-up List</div>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {pickupList.length} impression{pickupList.length !== 1 ? 's' : ''} to collect
              </span>
            </div>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
            ) : pickupList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎉</div>
                <div className="empty-title">No pickups assigned</div>
                <p>Impression collection jobs will appear here when dispatch assigns them to you.</p>
              </div>
            ) : (
              <div>
                {pickupList.map(c => (
                  <CaseCard key={c.id} c={c} section="pickup" onAction={(c, action) => setModal({ case: c, action })} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delivery List */}
        {tab === 'delivery' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">📦 Delivery List</div>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {deliveryList.length} case{deliveryList.length !== 1 ? 's' : ''} to deliver
              </span>
            </div>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
            ) : deliveryList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎉</div>
                <div className="empty-title">No deliveries assigned</div>
                <p>Cases dispatched to you will appear here for delivery to the clinic.</p>
              </div>
            ) : (
              <div>
                {deliveryList.map(c => (
                  <CaseCard key={c.id} c={c} section="delivery" onAction={(c, action) => setModal({ case: c, action })} />
                ))}
              </div>
            )}
          </div>
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
