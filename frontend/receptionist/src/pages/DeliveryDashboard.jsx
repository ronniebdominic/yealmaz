import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Confirm modal ─────────────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');

  const CFG = {
    picked_up:     { title: 'Mark as Picked Up',    color: '#16A34A', needsReason: false, btn: '✓ Confirm Picked Up' },
    not_picked_up: { title: 'Not Picked Up',         color: '#DC2626', needsReason: true,  btn: '✕ Confirm', placeholder: 'Reason (e.g. clinic closed)…' },
    lab_pickup:    { title: 'Collected from Lab',    color: '#16A34A', needsReason: false, btn: '✓ Confirm Collected' },
    delivered:     { title: 'Mark as Delivered',     color: '#16A34A', needsReason: false, btn: '✅ Confirm Delivered' },
    not_delivered: { title: 'Return — Not Delivered',color: '#DC2626', needsReason: true,  btn: '↩ Return to Dispatch', placeholder: 'Reason (e.g. clinic closed)…' },
  };
  const cfg = CFG[action] || {};

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background: cfg.color, color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15 }}>
          {cfg.title}
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid #E5E7EB' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1F2937', marginBottom: 3 }}>🏥 {caseData.clinic?.name}</div>
            {caseData.clinic?.address && <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 2 }}>📍 {caseData.clinic.address}</div>}
            {caseData.clinic?.phone  && <div style={{ fontSize: 13 }}>📞 <a href={`tel:${caseData.clinic.phone}`} style={{ color: '#1A56A0', fontWeight: 700 }}>{caseData.clinic.phone}</a></div>}
            {(caseData.caseNumber || caseData.workType) && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E7EB', fontSize: 12, color: '#6B7280' }}>
                {caseData.caseNumber && <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{caseData.caseNumber}</span>}
                {caseData.workType}
              </div>
            )}
          </div>
          {cfg.needsReason && (
            <textarea rows={2} placeholder={cfg.placeholder} value={reason} onChange={e => setReason(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #D1D5DB', resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={loading}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
              Cancel
            </button>
            <button onClick={() => onConfirm(reason)} disabled={loading || (cfg.needsReason && !reason.trim())}
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: cfg.color, color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Processing…' : cfg.btn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────
export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [processing, setProcessing] = useState(false);
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
      const s = mod.socket;
      if (!s) return;
      s.emit('join_delivery', user.id);
      s.on('case_assigned', loadCases);
      return () => s.off('case_assigned', loadCases);
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
        await api.patch(`/cases/${c.id}/status`, { status: 'PENDING_PICKUP', notes: reason });
        toast.success('↩ Returned to queue');
      } else if (action === 'lab_pickup') {
        await api.post(`/delivery/${c.id}/pickup`);
        toast.success('✓ Collected from lab');
      } else if (action === 'delivered') {
        await api.post(`/delivery/${c.id}/deliver`);
        toast.success('✅ Delivered!');
      } else if (action === 'not_delivered') {
        await api.post(`/delivery/${c.id}/return-to-dispatch`, { reason });
        toast.success('↩ Returned to dispatch');
      }
      setModal(null);
      loadCases();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setProcessing(false); }
  };

  // Filter
  const applyFilter = useCallback(arr => {
    const q = search.toLowerCase();
    return arr.filter(c => {
      if (q && !c.clinic?.name?.toLowerCase().includes(q) &&
               !c.caseNumber?.toLowerCase().includes(q) &&
               !c.clinic?.address?.toLowerCase().includes(q) &&
               !c.patientName?.toLowerCase().includes(q)) return false;
      if (dateFrom && new Date(c.createdAt) < new Date(dateFrom)) return false;
      if (dateTo)   { const e = new Date(dateTo); e.setHours(23,59,59,999); if (new Date(c.createdAt) > e) return false; }
      return true;
    });
  }, [search, dateFrom, dateTo]);

  // Sections — impression pickups + lab pickups together form "Pick-up List"
  const impressionPickups = useMemo(() => applyFilter(cases.filter(c => c.status === 'PICKUP_ASSIGNED')),    [cases, applyFilter]);
  const labPickups        = useMemo(() => applyFilter(cases.filter(c => c.status === 'READY_TO_DISPATCH')), [cases, applyFilter]);
  const deliveryList      = useMemo(() => applyFilter(cases.filter(c => c.status === 'OUT_FOR_DELIVERY')),  [cases, applyFilter]);
  const completedList     = useMemo(() => applyFilter(cases.filter(c => c.status === 'DELIVERED')),         [cases, applyFilter]);

  const pickupList = [...impressionPickups, ...labPickups]; // combined pick-up list
  const totalActive = pickupList.length + deliveryList.length;
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) || 'DV';
  const hasFilter = search || dateFrom || dateTo;

  // ── Shared table row ─────────────────────────────────────
  const TR = ({ c, section }) => (
    <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
      <td style={{ padding: '10px 14px', minWidth: 180 }}>
        <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{c.clinic?.name || '—'}</div>
        {c.caseNumber && <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{c.caseNumber}</div>}
        {c.workType && <div style={{ fontSize: 11, color: '#6B7280' }}>{c.workType}{c.units ? ` · ${c.units}u` : ''}</div>}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 13, color: '#374151', minWidth: 160 }}>
        {c.clinic?.address
          ? <><span style={{ color: '#6B7280' }}>📍 </span>{c.clinic.address}</>
          : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>
      <td style={{ padding: '10px 14px', fontSize: 13, minWidth: 140 }}>
        {c.clinic?.phone
          ? <a href={`tel:${c.clinic.phone}`} style={{ color: '#1A56A0', fontWeight: 700, textDecoration: 'none' }}>📞 {c.clinic.phone}</a>
          : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>
      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Green action */}
          <button
            onClick={() => setModal({ case: c, action: section === 'delivery' ? 'delivered' : c.status === 'READY_TO_DISPATCH' ? 'lab_pickup' : 'picked_up' })}
            style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {section === 'delivery' ? '✓ Mark as Deliver' : c.status === 'READY_TO_DISPATCH' ? '✓ Picked up from Lab' : '✓ Mark as Pick up'}
          </button>
          {/* Red action */}
          <button
            onClick={() => setModal({ case: c, action: section === 'delivery' ? 'not_delivered' : 'not_picked_up' })}
            style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {section === 'delivery' ? '↩ Return not delivered' : '✕ Not Picked up'}
          </button>
        </div>
      </td>
    </tr>
  );

  const ColHead = () => (
    <tr style={{ background: '#F3F4F6' }}>
      {['Clinic Name', 'Location', 'Contact', 'Action'].map(h => (
        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
      ))}
    </tr>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#0F2044', color: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.2 }}>Delivery Staffs Portal</div>
            <div style={{ fontSize: 11, opacity: 0.55 }}>Job Order List</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {totalActive > 0 && (
            <span style={{ background: '#DC2626', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
              {totalActive} active
            </span>
          )}
          <div style={{ fontSize: 12, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} /> Live · {user?.name?.split(' ')[0]}
          </div>
          <button onClick={logout}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
            ⏻
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '20px 16px' }}>

        {/* Search / Filter bar */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', border: '1px solid #E5E7EB' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, letterSpacing: 0.5 }}>SEARCH</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 10px', background: '#F9FAFB' }}>
              <span>🔍</span>
              <input placeholder="Clinic name, case no., location…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1, color: '#1F2937' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, letterSpacing: 0.5 }}>FROM</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#1F2937' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginBottom: 4, letterSpacing: 0.5 }}>TO</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#1F2937' }} />
          </div>
          {hasFilter && (
            <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#DC2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>
              ✕ Clear
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 14 }}>Loading your jobs…</div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E5E7EB' }}>

            {/* ── PICK UP LIST ─────────────────────────────── */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {/* Section header — blue (Excel style) */}
                <tr>
                  <td colSpan={4} style={{ background: '#BFDBFE', padding: '9px 14px', fontWeight: 800, fontSize: 13, color: '#1E40AF', letterSpacing: 0.2 }}>
                    Pick up list
                    <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>({pickupList.length})</span>
                  </td>
                </tr>
                <ColHead />
                {pickupList.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '16px 14px', textAlign: 'center', fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>No pickup jobs assigned</td></tr>
                ) : pickupList.map(c => <TR key={c.id} c={c} section="pickup" />)}

                {/* Spacer */}
                <tr><td colSpan={4} style={{ height: 2, background: '#E5E7EB' }} /></tr>

                {/* ── DELIVERY LIST ─────────────────────────── */}
                <tr>
                  <td colSpan={4} style={{ background: '#FEF08A', padding: '9px 14px', fontWeight: 800, fontSize: 13, color: '#854D0E', letterSpacing: 0.2 }}>
                    Delivery list
                    <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>({deliveryList.length})</span>
                  </td>
                </tr>
                <ColHead />
                {deliveryList.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '16px 14px', textAlign: 'center', fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>No deliveries in progress</td></tr>
                ) : deliveryList.map(c => <TR key={c.id} c={c} section="delivery" />)}
              </tbody>
            </table>

            {/* ── DELIVERED (completed today) ─────────────── */}
            {completedList.length > 0 && (
              <>
                <div style={{ height: 2, background: '#E5E7EB' }} />
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td colSpan={4} style={{ background: '#D1FAE5', padding: '9px 14px', fontWeight: 800, fontSize: 13, color: '#065F46', letterSpacing: 0.2 }}>
                        Delivered
                        <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, opacity: 0.8 }}>({completedList.length})</span>
                      </td>
                    </tr>
                    <ColHead />
                    {completedList.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #E5E7EB', background: '#F0FDF4' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{c.clinic?.name}</div>
                          {c.caseNumber && <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#9CA3AF' }}>{c.caseNumber}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 13, color: '#6B7280' }}>{c.clinic?.address ? `📍 ${c.clinic.address}` : '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 13 }}>
                          {c.clinic?.phone ? <a href={`tel:${c.clinic.phone}`} style={{ color: '#1A56A0', fontWeight: 700, textDecoration: 'none' }}>📞 {c.clinic.phone}</a> : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: '#16A34A', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
                            ✅ Delivered {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM') : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {totalActive === 0 && completedList.length === 0 && !hasFilter && (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>All clear!</div>
                <div style={{ color: '#9CA3AF', marginTop: 4 }}>No jobs assigned right now. You'll be notified when a new job is ready.</div>
              </div>
            )}
          </div>
        )}
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
