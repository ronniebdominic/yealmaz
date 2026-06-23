import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { PaymentBadge } from '../components/StatusBadge';
import SearchableSelect from '../components/SearchableSelect';
import FilterBar from '../components/FilterBar';
import ExportMenu from '../components/ExportMenu';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const ETB = (v) => v != null ? `Br ${Number(v).toLocaleString('en-US')}` : '—';

// ── Executive assign modal ────────────────────────────────
function AssignModal({ caseData, executives, mode, onConfirm, onClose, loading }) {
  const [selectedExecId, setSelectedExecId] = useState('');
  const title = mode === 'pickup' ? '🛵 Assign Pickup Driver' : '🚚 Assign Delivery Driver';
  const current = caseData.assignedDelivery;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid var(--border)' }}>
            <div className="case-number" style={{ marginBottom: 2 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{caseData.workType} · 🏥 {caseData.clinic?.name}</div>
            {caseData.clinic?.address && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>📍 {caseData.clinic.address}</div>
            )}
          </div>
          {current && (
            <div style={{ background: 'var(--amber-dim)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--amber)' }}>
              ⚠ Currently: <strong>{current.name}</strong>
            </div>
          )}
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 8, letterSpacing: 0.5 }}>
            SELECT DRIVER
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {executives.map(exec => {
              const active = exec.assignedDeliveries?.length || 0;
              const sel = selectedExecId === exec.id;
              return (
                <button key={exec.id} onClick={() => setSelectedExecId(exec.id)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                  background: sel ? 'var(--accent-dim)' : 'var(--surface-2)',
                  transition: 'all .15s',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{sel ? '✓ ' : ''}{exec.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{exec.email}</div>
                  </div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: active === 0 ? 'var(--green-dim)' : active < 3 ? 'var(--amber-dim)' : 'var(--red-dim)',
                    color:      active === 0 ? 'var(--green)' : active < 3 ? 'var(--amber)' : 'var(--red)',
                  }}>
                    {active} active
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => onConfirm(selectedExecId)} disabled={loading || !selectedExecId}>
              {loading ? 'Assigning…' : title}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Request Payment modal ─────────────────────────────────
function PaymentModal({ caseData, onClose, onSuccess }) {
  // Priority: payment.amount → case.totalAmount → work-type price from pricing table
  const preset = caseData.payment?.amount ?? caseData.totalAmount ?? null;
  const [amount, setAmount] = useState(preset !== null ? String(preset) : '');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [priceHint, setPriceHint] = useState('');

  // If no amount is set, fetch the work-type price as the default
  useEffect(() => {
    if (preset !== null) return;               // already have an amount
    if (!caseData.workType) return;
    setLoadingPrice(true);
    api.get('/prices')
      .then(r => {
        const entry = r.data.find(p => p.workType === caseData.workType);
        if (entry?.price) {
          // Multiply by units if available and not a flat-rate type
          const FLAT = new Set(['Orthodontic Retainer','Night Guard Soft','Night Guard Hard','Sports Guard','Bite Splint','Bleaching Tray','Clear Aligner Setup','Gingival Mask']);
          const units = (!FLAT.has(caseData.workType) && caseData.units) ? caseData.units : 1;
          const total = entry.price * units;
          setAmount(String(total));
          setPriceHint(`Auto-filled: Br ${entry.price.toLocaleString('en-US')} × ${units} unit${units !== 1 ? 's' : ''} = Br ${total.toLocaleString('en-US')}`);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPrice(false));
  }, []);

  const submit = async () => {
    if (!amount || parseFloat(amount) <= 0) return toast.error('Enter a valid amount');
    setSaving(true);
    try {
      await api.post(`/payments/${caseData.id}/request`, { amount, notes });
      toast.success('💳 Payment request sent!');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">💳 Request Payment</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Case summary */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, border: '1px solid var(--border)', fontSize: 13 }}>
            <div className="case-number">{caseData.caseNumber}</div>
            <div style={{ fontWeight: 700, color: 'var(--text-1)', marginTop: 4 }}>{caseData.patientName} · {caseData.clinic?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {caseData.workType}{caseData.units ? ` · ${caseData.units} unit${caseData.units !== 1 ? 's' : ''}` : ''}
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Amount (Br) *</span>
              {loadingPrice && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Loading price…</span>}
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setPriceHint(''); }}
              placeholder="0.00"
              style={{ fontSize: 16, fontWeight: 700 }}
            />
            {priceHint && (
              <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4, fontWeight: 600 }}>
                ✓ {priceHint}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note to clinic…" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving || loadingPrice}>
              {saving ? 'Sending…' : '💳 Send Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cell helpers ──────────────────────────────────────────
const Th = ({ children, style }) => (
  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', ...style }}>
    {children}
  </th>
);
const Td = ({ children, style }) => (
  <td style={{ padding: '11px 14px', fontSize: 13, verticalAlign: 'middle', ...style }}>
    {children}
  </td>
);

// ── Phone Order Modal (telephonic intake) ────────────────
function PhoneOrderModal({ executives, onClose, onSuccess }) {
  const [form, setForm] = useState({
    existingClinicId: '', clinicName: '', clinicPhone: '', clinicAddress: '',
    patientName: '', workType: '', doctorName: '', doctorPhone: '', notes: '',
    assignToExecutiveId: '',
  });
  const [clinics, setClinics] = useState([]);
  const [saving, setSaving] = useState(false);
  const [useExisting, setUseExisting] = useState(true);

  useEffect(() => {
    api.get('/clinics').then(r => setClinics(r.data)).catch(() => {});
  }, []);

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }));
  const inp = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontFamily: 'inherit' };
  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 };

  const submit = async () => {
    if (!form.patientName.trim()) return toast.error('Patient name is required');
    if (useExisting && !form.existingClinicId) return toast.error('Select a clinic or switch to manual entry');
    if (!useExisting && !form.clinicName.trim()) return toast.error('Clinic name is required');

    setSaving(true);
    try {
      await api.post('/dispatch/phone-order', {
        clinicId: useExisting ? form.existingClinicId : undefined,
        clinicName:    !useExisting ? form.clinicName    : undefined,
        clinicPhone:   !useExisting ? form.clinicPhone   : undefined,
        clinicAddress: !useExisting ? form.clinicAddress : undefined,
        patientName:   form.patientName,
        workType:      form.workType || undefined,
        doctorName:    form.doctorName || undefined,
        doctorPhone:   form.doctorPhone || undefined,
        notes:         form.notes || undefined,
        assignToExecutiveId: form.assignToExecutiveId || undefined,
      });
      toast.success('📞 Phone order placed!');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to place order');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div className="modal-title">📞 New Phone Order</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Clinic */}
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setUseExisting(true)}
                className={`filter-chip${useExisting ? ' active' : ''}`} style={{ fontSize: 12 }}>
                Select Existing Clinic
              </button>
              <button onClick={() => setUseExisting(false)}
                className={`filter-chip${!useExisting ? ' active' : ''}`} style={{ fontSize: 12 }}>
                New / Manual Entry
              </button>
            </div>
            {useExisting ? (
              <select value={form.existingClinicId} onChange={set('existingClinicId')} style={inp}>
                <option value="">— Select clinic —</option>
                {clinics.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </select>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={lbl}>CLINIC / DENTIST NAME *</label>
                  <input style={inp} placeholder="Dr. Ahmed Dental Clinic" value={form.clinicName} onChange={set('clinicName')} />
                </div>
                <div>
                  <label style={lbl}>CONTACT PHONE</label>
                  <input style={inp} placeholder="+251 911 000 000" value={form.clinicPhone} onChange={set('clinicPhone')} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>LOCATION / ADDRESS</label>
                  <input style={inp} placeholder="Bole, Addis Ababa" value={form.clinicAddress} onChange={set('clinicAddress')} />
                </div>
              </div>
            )}
          </div>

          {/* Patient */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={lbl}>PATIENT NAME *</label>
              <input style={inp} placeholder="Patient name" value={form.patientName} onChange={set('patientName')} />
            </div>
            <div>
              <label style={lbl}>WORK TYPE</label>
              <input style={inp} placeholder="e.g. Zirconia Crown" value={form.workType} onChange={set('workType')} />
            </div>
            <div>
              <label style={lbl}>DOCTOR NAME</label>
              <input style={inp} placeholder="Dr. Sarah" value={form.doctorName} onChange={set('doctorName')} />
            </div>
            <div>
              <label style={lbl}>DOCTOR PHONE</label>
              <input style={inp} placeholder="+251 911 000 000" value={form.doctorPhone} onChange={set('doctorPhone')} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>NOTES FROM CALL</label>
            <textarea rows={2} style={{ ...inp, resize: 'vertical' }}
              placeholder="Any details mentioned on the call…"
              value={form.notes} onChange={set('notes')} />
          </div>

          {/* Assign driver immediately */}
          <div>
            <label style={lbl}>ASSIGN PICKUP DRIVER (optional)</label>
            <select value={form.assignToExecutiveId} onChange={set('assignToExecutiveId')} style={inp}>
              <option value="">— Assign later —</option>
              {executives.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.assignedDeliveries?.length || 0} active jobs
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
              {saving ? 'Placing…' : '📞 Place Phone Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dispatch Dashboard ───────────────────────────────
export default function DispatchDashboard() {
  const navigate     = useNavigate();
  const { user, logout } = useAuth();
  const queryClient  = useQueryClient();

  const [tab, setTab]           = useState('place-order');
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [assignModal, setAssignModal] = useState(null); // { case, mode: 'pickup'|'send-out' }
  const [payModal, setPayModal]           = useState(null);
  const [phoneOrderOpen, setPhoneOrderOpen] = useState(false);
  const [processing, setProcessing]   = useState(false);

  // ── Data ────────────────────────────────────────────────
  const { data: summary = {}, refetch: refetchSummary } = useQuery({
    queryKey: ['dispatch', 'summary'],
    queryFn: () => api.get('/dispatch/summary').then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const { data: allCases = [], refetch: refetchQueue } = useQuery({
    queryKey: ['dispatch', 'queue'],
    queryFn: () => api.get('/dispatch/queue').then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 20_000,
  });

  const { data: executives = [] } = useQuery({
    queryKey: ['dispatch', 'executives'],
    queryFn: () => api.get('/dispatch/executives').then(r => r.data),
    staleTime: 60_000,
  });

  const refetchAll = () => { refetchQueue(); refetchSummary(); };

  // ── Filtering ────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d; })() : null;
    return allCases.filter(c => {
      if (q && !c.clinic?.name?.toLowerCase().includes(q) &&
               !c.caseNumber?.toLowerCase().includes(q) &&
               !c.patientName?.toLowerCase().includes(q)) return false;
      if (from && new Date(c.createdAt) < from) return false;
      if (to   && new Date(c.createdAt) > to)   return false;
      return true;
    });
  }, [allCases, search, dateFrom, dateTo]);

  const placeOrder = filtered.filter(c => c.status === 'PENDING_PICKUP');

  // Ready for Delivery = QC passed (READY_TO_DISPATCH) but payment NOT yet verified
  // Dispatch uses this tab to request payment from the clinic
  const readyDelivery = filtered.filter(c =>
    c.status === 'READY_TO_DISPATCH' &&
    c.paymentStatus !== 'VERIFIED'
  );

  // Ready for Dispatch = READY_TO_DISPATCH AND payment VERIFIED
  // Payment confirmed — dispatch assigns driver to physically send the case out
  const readyDispatch = filtered.filter(c =>
    c.status === 'READY_TO_DISPATCH' &&
    c.paymentStatus === 'VERIFIED'
  );

  const delivered = filtered.filter(c => c.status === 'DELIVERED');

  const tabCount = {
    'place-order':    placeOrder.length,
    'ready-delivery': readyDelivery.length,
    'ready-dispatch': readyDispatch.length,
    'delivered':      delivered.length,
  };

  // ── Actions ──────────────────────────────────────────────
  const handleAssign = async (executiveId) => {
    if (!assignModal || !executiveId) return;
    setProcessing(true);
    try {
      if (assignModal.mode === 'pickup') {
        await api.post(`/dispatch/${assignModal.case.id}/assign-pickup`, { executiveId });
        toast.success('🛵 Pickup driver assigned!');
      } else {
        await api.post(`/dispatch/${assignModal.case.id}/send-out`, { executiveId });
        toast.success('🚚 Case dispatched for delivery!');
      }
      setAssignModal(null);
      refetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Assignment failed');
    } finally {
      setProcessing(false);
    }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'DS';

  const TABS = [
    { id: 'place-order',    label: 'Place Order',              icon: '📋' },
    { id: 'ready-delivery', label: 'Ready for Delivery',       icon: '📦', sub: 'Pending payment' },
    { id: 'ready-dispatch', label: 'Ready for Dispatch',       icon: '🚚', sub: 'Payment verified' },
    { id: 'delivered',      label: 'Delivered',                icon: '✅' },
  ];

  // ── Sidebar nav ──────────────────────────────────────────
  const SidebarNav = ({ close }) => (
    <nav className="sidebar-nav">
      <div className="nav-section-label">Dispatch</div>
      {TABS.map(t => (
        <button key={t.id}
          className={`nav-item${tab === t.id ? ' active' : ''}`}
          onClick={() => { setTab(t.id); if (close) close(); }}
          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <span>{t.icon}</span>
            <span style={{ flex: 1 }}>{t.label}</span>
            {tabCount[t.id] > 0 && <span className="badge-count">{tabCount[t.id]}</span>}
          </div>
          {t.sub && <div style={{ fontSize: 10, color: tab === t.id ? 'rgba(255,255,255,0.65)' : 'var(--text-3)', paddingLeft: 24 }}>{t.sub}</div>}
        </button>
      ))}
      <div className="nav-section-label">Cases</div>
      <button className="nav-item" onClick={() => navigate('/cases/new')}>
        <span>➕</span> New Case
      </button>
    </nav>
  );

  return (
    <div className="app">
      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="hamburger-topbar" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title">{TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}</span>
        <div className="live-dot" />
      </div>

      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>Dispatch</span>
        </div>
        <SidebarNav close={() => setOpen(false)} />
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#3B82F6', color: '#fff' }}>{initials}</div>
            <div><div className="user-name">{user?.name}</div><div className="user-role">Dispatch</div></div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </div>

      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6' }}>Dispatch</span>
        </div>
        <SidebarNav />
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#3B82F6', color: '#fff' }}>{initials}</div>
            <div><div className="user-name">{user?.name}</div><div className="user-role">Dispatch</div></div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          <button className="hamburger-topbar" style={{ display: 'none' }} onClick={() => setOpen(true)}>☰</button>
          <div className="topbar-title">{TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>+ New Case</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
              <div className="live-dot" /> Live · {user?.name?.split(' ')[0]}
            </div>
          </div>
        </div>

        <div className="content">
          {/* ── Summary cards ── */}
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#EEF2FF' }}>📋</div>
              <div className="stat-label">Orders Today</div>
              <div className="stat-value">{summary.totalToday ?? '—'}</div>
              <div className="stat-sub">New cases today</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('ready-delivery')}>
              <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>📦</div>
              <div className="stat-label">Ready for Delivery</div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>{summary.readyToDispatch ?? '—'}</div>
              <div className="stat-sub">
                <span style={{ color: 'var(--amber)' }}>{readyDelivery.length} pending payment</span>
                {' · '}
                <span style={{ color: 'var(--green)' }}>{readyDispatch.length} cleared</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>🚚</div>
              <div className="stat-label">Picked Up / En Route</div>
              <div className="stat-value" style={{ color: 'var(--amber)' }}>{summary.enRoute ?? '—'}</div>
              <div className="stat-sub">Out for delivery</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('place-order')}>
              <div className="stat-icon" style={{ background: '#FFF7ED' }}>🛵</div>
              <div className="stat-label">Pending Pick-up</div>
              <div className="stat-value" style={{ color: '#EA580C' }}>{summary.pendingPickup ?? '—'}</div>
              <div className="stat-sub">Impression collection</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('delivered')}>
              <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
              <div className="stat-label">Delivered Today</div>
              <div className="stat-value" style={{ color: 'var(--green)' }}>{summary.deliveredToday ?? '—'}</div>
              <div className="stat-sub">Completed</div>
            </div>
          </div>

          {/* ── Search / filter bar ── */}
          <div style={{ marginBottom: 16 }}>
            <FilterBar
              search={search} onSearch={setSearch}
              dateFrom={dateFrom} onDateFrom={setDateFrom}
              dateTo={dateTo} onDateTo={setDateTo}
              placeholder="Clinic, case no., patient…"
            />
          </div>

          {/* ── TAB: Place Order (PENDING_PICKUP) ── */}
          {tab === 'place-order' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">📋 Place Order — Client Orders Awaiting Pickup</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setPhoneOrderOpen(true)}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    📞 Phone Order
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{placeOrder.length} pending</span>
                  <ExportMenu
                    data={placeOrder}
                    columns={[
                      { header: 'Clinic Name', value: c => c.clinic?.name },
                      { header: 'Location',    value: c => c.clinic?.address ?? '' },
                      { header: 'Contact',     value: c => c.clinic?.phone ?? '' },
                      { header: 'Case #',      value: c => c.caseNumber },
                      { header: 'Patient',     value: c => c.patientName },
                      { header: 'Registered',  value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
                    ]}
                    filename="place-order"
                    title="Place Order — Impression Pickups"
                  />
                </div>
              </div>
              <div className="table-wrap">
                {placeOrder.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🎉</div>
                    <div className="empty-title">No orders waiting for pickup</div>
                    <p>Orders placed by clinics through the app (and phone orders) appear here. Assign a driver to go collect the impression.</p>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <Th>Clinic Name</Th>
                        <Th>Location</Th>
                        <Th>Contact</Th>
                        <Th>Case #</Th>
                        <Th>Patient</Th>
                        <Th>Registered</Th>
                        <Th>Assign</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {placeOrder.map(c => (
                        <tr key={c.id}>
                          <Td style={{ fontWeight: 600 }}>{c.clinic?.name}</Td>
                          <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {c.clinic?.address ? `📍 ${c.clinic.address}` : '—'}
                          </Td>
                          <Td style={{ fontSize: 12 }}>{c.clinic?.phone || '—'}</Td>
                          <Td><span className="case-number">{c.caseNumber}</span></Td>
                          <Td><span className="patient-name">{c.patientName}</span></Td>
                          <Td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {format(new Date(c.createdAt), 'dd MMM yyyy')}
                          </Td>
                          <Td>
                            <button
                              className="btn btn-sm"
                              style={{ background: '#FFF7ED', color: '#EA580C', border: '1px solid #FDBA74', whiteSpace: 'nowrap' }}
                              onClick={() => setAssignModal({ case: c, mode: 'pickup' })}
                            >
                              🛵 Assign Pickup
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: Ready for Delivery (QC passed, payment pending) ── */}
          {tab === 'ready-delivery' && (
            <div className="card">
              <div style={{ padding: '10px 18px 0', background: 'var(--amber-dim)', borderRadius: '10px 10px 0 0' }}>
                <div style={{ fontSize: 12, color: '#92400E', fontWeight: 600, paddingBottom: 10 }}>
                  📦 These cases have <strong>passed QC and are complete</strong> — payment has not yet been verified. Request payment from the clinic before dispatching.
                </div>
              </div>
              <div className="card-header">
                <div className="card-title">📦 Ready for Delivery <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, marginLeft: 6 }}>— Awaiting Payment</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{readyDelivery.length} cases</span>
                  <ExportMenu
                    data={readyDelivery}
                    columns={[
                      { header: 'Clinic Name',    value: c => c.clinic?.name },
                      { header: 'Patient',        value: c => c.patientName },
                      { header: 'Case No.',       value: c => c.caseNumber },
                      { header: 'Product',        value: c => c.workType },
                      { header: 'Unit',           value: c => c.units ?? '' },
                      { header: 'Total Value(Br)',value: c => c.payment?.amount ?? c.totalAmount ?? '' },
                      { header: 'Payment',        value: c => c.paymentStatus },
                    ]}
                    filename="ready-for-delivery"
                    title="Ready for Delivery"
                  />
                </div>
              </div>
              <div className="table-wrap">
                {readyDelivery.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🎉</div>
                    <div className="empty-title">No cases awaiting payment</div>
                    <p>Cases that passed QC but haven't had payment verified yet appear here. Once payment is confirmed by Finance, they move to Ready for Dispatch.</p>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <Th>Clinic Name</Th>
                        <Th>Patient</Th>
                        <Th>Case No.</Th>
                        <Th>Product</Th>
                        <Th>Unit</Th>
                        <Th>Total Value</Th>
                        <Th>Payment</Th>
                        <Th>Request Payment</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {readyDelivery.map(c => {
                        const amount = c.payment?.amount ?? c.totalAmount;
                        const canRequest = !['PAYMENT_REQUESTED','SCREENSHOT_UPLOADED','VERIFIED'].includes(c.paymentStatus);
                        return (
                          <tr key={c.id}>
                            <Td style={{ fontWeight: 600 }}>{c.clinic?.name}</Td>
                            <Td><span className="patient-name">{c.patientName}</span></Td>
                            <Td><span className="case-number">{c.caseNumber}</span></Td>
                            <Td style={{ fontSize: 12 }}>{c.workType}</Td>
                            <Td style={{ textAlign: 'center' }}>{c.units ?? '—'}</Td>
                            <Td style={{ fontWeight: 700, color: 'var(--green)' }}>{ETB(amount)}</Td>
                            <Td><PaymentBadge status={c.paymentStatus} /></Td>
                            <Td>
                              {canRequest ? (
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', whiteSpace: 'nowrap' }}
                                  onClick={() => setPayModal(c)}
                                >
                                  💳 Request
                                </button>
                              ) : (
                                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: Ready for Dispatch (READY_TO_DISPATCH + payment VERIFIED) ── */}
          {tab === 'ready-dispatch' && (
            <div className="card">
              <div style={{ padding: '10px 18px 0', background: 'var(--green-dim)', borderRadius: '10px 10px 0 0' }}>
                <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, paddingBottom: 10 }}>
                  ✅ These cases are <strong>QC complete and payment verified</strong> — assign a delivery driver to send them out to the clinic.
                </div>
              </div>
              <div className="card-header">
                <div className="card-title">🚚 Ready for Dispatch <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600, marginLeft: 6 }}>— Payment Verified</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{readyDispatch.length} cases</span>
                  <ExportMenu
                    data={readyDispatch}
                    columns={[
                      { header: 'Clinic Name',    value: c => c.clinic?.name },
                      { header: 'Location',       value: c => c.clinic?.address ?? '' },
                      { header: 'Contact',        value: c => c.clinic?.phone ?? '' },
                      { header: 'Case #',         value: c => c.caseNumber },
                      { header: 'Patient',        value: c => c.patientName },
                      { header: 'Due Date',       value: c => c.dueDate ? format(new Date(c.dueDate), 'dd MMM yyyy') : '' },
                      { header: 'Payment Status', value: c => c.paymentStatus },
                    ]}
                    filename="ready-for-dispatch"
                    title="Ready for Dispatch"
                  />
                </div>
              </div>
              <div className="table-wrap">
                {readyDispatch.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🎉</div>
                    <div className="empty-title">No cases cleared for dispatch</div>
                    <p>Cases appear here once their payment is verified by Finance. Check the Ready for Delivery tab for cases still awaiting payment.</p>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <Th>Clinic Name</Th>
                        <Th>Location</Th>
                        <Th>Contact</Th>
                        <Th>Case #</Th>
                        <Th>Patient</Th>
                        <Th>Due</Th>
                        <Th>Payment Status</Th>
                        <Th>Assign</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {readyDispatch.map(c => {
                        const overdue = c.dueDate && new Date(c.dueDate) < new Date();
                        return (
                          <tr key={c.id}>
                            <Td style={{ fontWeight: 600 }}>{c.clinic?.name}</Td>
                            <Td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                              {c.clinic?.address ? `📍 ${c.clinic.address}` : '—'}
                            </Td>
                            <Td style={{ fontSize: 12 }}>{c.clinic?.phone || '—'}</Td>
                            <Td><span className="case-number">{c.caseNumber}</span></Td>
                            <Td><span className="patient-name">{c.patientName}</span></Td>
                            <Td style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text-3)', fontWeight: overdue ? 700 : 400 }}>
                              {c.dueDate ? format(new Date(c.dueDate), 'dd MMM') : '—'}
                              {overdue ? ' ⚠' : ''}
                            </Td>
                            <Td><PaymentBadge status={c.paymentStatus} /></Td>
                            <Td>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ whiteSpace: 'nowrap' }}
                                onClick={() => setAssignModal({ case: c, mode: 'send-out' })}
                              >
                                🚚 Dispatch
                              </button>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── TAB: Delivered ── */}
          {tab === 'delivered' && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">✅ Delivered</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{delivered.length} cases</span>
                  <ExportMenu
                    data={delivered}
                    columns={[
                      { header: 'Clinic Name',     value: c => c.clinic?.name },
                      { header: 'Patient',         value: c => c.patientName },
                      { header: 'Scan No.',        value: c => c.caseNumber },
                      { header: 'Product',         value: c => c.workType },
                      { header: 'Unit',            value: c => c.units ?? '' },
                      { header: 'Total Value(Br)', value: c => c.payment?.amount ?? c.totalAmount ?? '' },
                      { header: 'Payment Status',  value: c => c.paymentStatus },
                      { header: 'Delivery Status', value: () => 'Delivered' },
                    ]}
                    filename="delivered"
                    title="Delivered Cases"
                  />
                </div>
              </div>
              <div className="table-wrap">
                {delivered.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📦</div>
                    <div className="empty-title">No deliveries yet today</div>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <Th>Clinic Name</Th>
                        <Th>Patient</Th>
                        <Th>Scan No.</Th>
                        <Th>Product</Th>
                        <Th>Unit</Th>
                        <Th>Total Value</Th>
                        <Th>Payment Status</Th>
                        <Th>Delivery Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {delivered.map(c => {
                        const amount = c.payment?.amount ?? c.totalAmount;
                        return (
                          <tr key={c.id}>
                            <Td style={{ fontWeight: 600 }}>{c.clinic?.name}</Td>
                            <Td><span className="patient-name">{c.patientName}</span></Td>
                            <Td><span className="case-number">{c.caseNumber}</span></Td>
                            <Td style={{ fontSize: 12 }}>{c.workType}</Td>
                            <Td style={{ textAlign: 'center' }}>{c.units ?? '—'}</Td>
                            <Td style={{ fontWeight: 700, color: 'var(--green)' }}>{ETB(amount)}</Td>
                            <Td><PaymentBadge status={c.paymentStatus} /></Td>
                            <Td>
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'var(--green-dim)', color: 'var(--green)' }}>
                                ✅ Delivered
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Assign modal */}
      {assignModal && (
        <AssignModal
          caseData={assignModal.case}
          executives={executives}
          mode={assignModal.mode}
          onConfirm={handleAssign}
          onClose={() => setAssignModal(null)}
          loading={processing}
        />
      )}

      {/* Payment modal */}
      {payModal && (
        <PaymentModal
          caseData={payModal}
          onClose={() => setPayModal(null)}
          onSuccess={() => { setPayModal(null); refetchAll(); queryClient.invalidateQueries({ queryKey: ['dispatch'] }); }}
        />
      )}

      {/* Phone Order modal */}
      {phoneOrderOpen && (
        <PhoneOrderModal
          executives={executives}
          onClose={() => setPhoneOrderOpen(false)}
          onSuccess={() => { setPhoneOrderOpen(false); refetchAll(); setTab('place-order'); }}
        />
      )}
    </div>
  );
}
