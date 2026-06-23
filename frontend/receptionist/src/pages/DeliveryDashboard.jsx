import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Confirm modal ─────────────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');

  const CFG = {
    picked_up:     { title: '✓ Mark as Picked Up',    btn: '✓ Confirm Picked Up',      color: '#16A34A', needsReason: false },
    not_picked_up: { title: '✕ Not Picked Up',         btn: '✕ Confirm Not Picked Up',  color: '#DC2626', needsReason: true,  placeholder: 'Reason (e.g. clinic closed)…' },
    delivered:     { title: '✅ Mark as Delivered',    btn: '✅ Confirm Delivered',      color: '#16A34A', needsReason: false },
    not_delivered: { title: '↩ Return — Not Delivered',btn: '↩ Return to Dispatch',     color: '#DC2626', needsReason: true,  placeholder: 'Reason (e.g. clinic closed)…' },
  };
  const cfg = CFG[action] || {};

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title" style={{ color: cfg.color }}>{cfg.title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)', marginBottom: 4 }}>🏥 {caseData.clinic?.name}</div>
            {caseData.clinic?.address && <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 3 }}>📍 {caseData.clinic.address}</div>}
            {caseData.clinic?.phone && <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>📞 <a href={`tel:${caseData.clinic.phone}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>{caseData.clinic.phone}</a></div>}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
              <span className="case-number" style={{ marginRight: 8 }}>{caseData.caseNumber || '—'}</span>
              {caseData.patientName && caseData.patientName !== 'TBD' && caseData.patientName}
            </div>
          </div>
          {cfg.needsReason && (
            <textarea rows={2} placeholder={cfg.placeholder} value={reason} onChange={e => setReason(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', resize: 'vertical', fontFamily: 'inherit', marginBottom: 14 }} />
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button onClick={() => onConfirm(reason)} disabled={loading || (cfg.needsReason && !reason.trim())}
              style={{ flex: 1, justifyContent: 'center', background: cfg.color, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Processing…' : cfg.btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Delivery Dashboard ───────────────────────────────
export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [processing, setProcessing] = useState(false);

  // Search / filter
  const [search, setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');

  const loadCases = useCallback(async () => {
    try {
      const res = await api.get('/delivery/assigned');
      setCases(res.data.cases ?? res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadCases();
    const t = setInterval(loadCases, 20_000);
    return () => clearInterval(t);
  }, [loadCases]);

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

  const handleAction = async (reason = '') => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { case: c, action } = modal;
      if (action === 'picked_up') {
        await api.post(`/delivery/${c.id}/collect-impression`);
        toast.success('✓ Impression collected');
      } else if (action === 'not_picked_up') {
        await api.patch(`/cases/${c.id}/status`, { status: 'PENDING_PICKUP', notes: reason || 'Not picked up' });
        toast.success('↩ Returned to pickup queue');
      } else if (action === 'delivered') {
        await api.post(`/delivery/${c.id}/deliver`);
        toast.success('✅ Delivered!');
      } else if (action === 'not_delivered') {
        await api.post(`/delivery/${c.id}/return-to-dispatch`, { reason: reason || 'Could not deliver' });
        toast.success('↩ Returned to dispatch');
      }
      setModal(null);
      loadCases();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setProcessing(false); }
  };

  // Filter helper
  const applyFilter = useCallback((arr) => {
    const q = search.toLowerCase();
    return arr.filter(c => {
      if (q && !c.clinic?.name?.toLowerCase().includes(q) &&
               !c.caseNumber?.toLowerCase().includes(q) &&
               !c.patientName?.toLowerCase().includes(q) &&
               !c.clinic?.address?.toLowerCase().includes(q)) return false;
      if (dateFrom) {
        const created = new Date(c.createdAt);
        if (created < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
        const created = new Date(c.createdAt);
        if (created > end) return false;
      }
      return true;
    });
  }, [search, dateFrom, dateTo]);

  const pickupList   = useMemo(() => applyFilter(cases.filter(c => c.status === 'PICKUP_ASSIGNED')),   [cases, applyFilter]);
  const labPickups   = useMemo(() => applyFilter(cases.filter(c => c.status === 'READY_TO_DISPATCH')), [cases, applyFilter]);
  const deliveryList = useMemo(() => applyFilter(cases.filter(c => c.status === 'OUT_FOR_DELIVERY')),  [cases, applyFilter]);
  const completedList = useMemo(() => applyFilter(cases.filter(c => c.status === 'DELIVERED')),        [cases, applyFilter]);

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'DV';
  const hasFilter = search || dateFrom || dateTo;

  // ── Table row ────────────────────────────────────────────
  const Row = ({ c, section }) => (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1a1a2e' }}>
        {c.clinic?.name || '—'}
        {c.caseNumber && <div style={{ fontSize: 11, fontFamily: 'DM Mono, monospace', color: '#6b7280', marginTop: 2 }}>{c.caseNumber}</div>}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151' }}>
        {c.clinic?.address ? <><span style={{ marginRight: 4 }}>📍</span>{c.clinic.address}</> : '—'}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 13 }}>
        {c.clinic?.phone
          ? <a href={`tel:${c.clinic.phone}`} style={{ color: '#1A56A0', fontWeight: 600, textDecoration: 'none' }}>📞 {c.clinic.phone}</a>
          : '—'}
      </td>
      <td style={{ padding: '10px 14px' }}>
        {section === 'pickup' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setModal({ case: c, action: 'picked_up' })}
              style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✓ Mark as Picked Up
            </button>
            <button onClick={() => setModal({ case: c, action: 'not_picked_up' })}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✕ Not Picked Up
            </button>
          </div>
        )}
        {section === 'labpickup' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setModal({ case: c, action: 'picked_up' })}
              style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✓ Picked Up from Lab
            </button>
            <button onClick={() => setModal({ case: c, action: 'not_delivered' })}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ↩ Return to Dispatch
            </button>
          </div>
        )}
        {section === 'delivery' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setModal({ case: c, action: 'delivered' })}
              style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ✅ Mark as Delivered
            </button>
            <button onClick={() => setModal({ case: c, action: 'not_delivered' })}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ↩ Return Not Delivered
            </button>
          </div>
        )}
        {section === 'done' && (
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#D1FAE5', color: '#065F46' }}>
            ✅ Delivered {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : ''}
          </span>
        )}
      </td>
    </tr>
  );

  // Section header bar (styled like the Excel)
  const SectionHeader = ({ label, color, bg, count }) => (
    <tr>
      <td colSpan={4} style={{ padding: '8px 14px', background: bg, fontWeight: 800, fontSize: 13, color, letterSpacing: 0.3 }}>
        {label} <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>({count})</span>
      </td>
    </tr>
  );

  const ColHeaders = () => (
    <tr style={{ background: '#F9FAFB' }}>
      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase' }}>Clinic Name</th>
      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase' }}>Location</th>
      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase' }}>Contact</th>
      <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: 0.5, textTransform: 'uppercase' }}>Action</th>
    </tr>
  );

  const EmptyRow = ({ msg }) => (
    <tr>
      <td colSpan={4} style={{ padding: '16px 14px', textAlign: 'center', fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>
        {msg}
      </td>
    </tr>
  );

  const totalJobs = pickupList.length + labPickups.length + deliveryList.length;

  return (
    <div style={{ minHeight: '100vh', background: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar */}
      <div style={{ background: '#0F2044', color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="logo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Delivery Staff Portal</div>
            <div style={{ fontSize: 11, opacity: 0.65 }}>Job Order List</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: 0.7 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
            Live · {user?.name?.split(' ')[0]}
          </div>
          <button onClick={logout}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            ⏻ Logout
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>

        {/* Search / Filter bar */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 4, letterSpacing: 0.5 }}>SEARCH</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 10px', background: '#F9FAFB' }}>
              <span style={{ fontSize: 14 }}>🔍</span>
              <input placeholder="Clinic, case no., patient, location…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1, color: '#1F2937' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 4, letterSpacing: 0.5 }}>FROM DATE</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#1F2937' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', marginBottom: 4, letterSpacing: 0.5 }}>TO DATE</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#1F2937' }} />
          </div>
          {hasFilter && (
            <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
              style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Job Order List Table */}
        <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 16 }}>
          {/* Title bar */}
          <div style={{ background: '#1F2937', color: '#fff', padding: '10px 16px', fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>
            📋 Job Order List
            {totalJobs > 0 && <span style={{ marginLeft: 10, fontSize: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '2px 10px' }}>{totalJobs} active jobs</span>}
          </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Loading your jobs…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {/* ── Pick-up List (impression from clinic) ── */}
                <SectionHeader label="🔵 Pick-up List" bg="#DBEAFE" color="#1D4ED8" count={pickupList.length} />
                <ColHeaders />
                {pickupList.length === 0
                  ? <EmptyRow msg="No impression pickups assigned" />
                  : pickupList.map(c => <Row key={c.id} c={c} section="pickup" />)
                }

                {/* Spacer */}
                <tr><td colSpan={4} style={{ height: 12, background: '#F9FAFB' }} /></tr>

                {/* ── Lab Pickup (finished cases from lab) ── */}
                <SectionHeader label="🟠 Collect from Lab" bg="#FEF3C7" color="#92400E" count={labPickups.length} />
                <ColHeaders />
                {labPickups.length === 0
                  ? <EmptyRow msg="No cases to collect from lab" />
                  : labPickups.map(c => <Row key={c.id} c={c} section="labpickup" />)
                }

                {/* Spacer */}
                <tr><td colSpan={4} style={{ height: 12, background: '#F9FAFB' }} /></tr>

                {/* ── Delivery List ── */}
                <SectionHeader label="🟡 Delivery List" bg="#FEF9C3" color="#854D0E" count={deliveryList.length} />
                <ColHeaders />
                {deliveryList.length === 0
                  ? <EmptyRow msg="No deliveries in progress" />
                  : deliveryList.map(c => <Row key={c.id} c={c} section="delivery" />)
                }
              </tbody>
            </table>
          )}
        </div>

        {/* Completed / Delivered Orders */}
        <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ background: '#065F46', color: '#fff', padding: '10px 16px', fontWeight: 800, fontSize: 14, letterSpacing: 0.3 }}>
            ✅ Delivered Orders
            {completedList.length > 0 && <span style={{ marginLeft: 10, fontSize: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '2px 10px' }}>{completedList.length}</span>}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <ColHeaders />
              {completedList.length === 0
                ? <EmptyRow msg="No delivered orders yet today" />
                : completedList.map(c => <Row key={c.id} c={c} section="done" />)
              }
            </tbody>
          </table>
        </div>

      </div>

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
