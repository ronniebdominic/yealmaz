import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import api, { socket } from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import {
  MdCheckCircle, MdUndo, MdLocalHospital, MdLocationOn, MdCall, MdWarning,
  MdSearch, MdClose, MdLogout, MdArchive, MdExpandLess, MdExpandMore,
  MdMenu, MdInsights, MdMyLocation,
} from 'react-icons/md';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useLiveLocationSharing } from '../hooks/useLiveLocationSharing';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';
import InstallAppBanner from '../components/InstallAppBanner';
import MyDeliveryPerformanceModal from '../components/MyDeliveryPerformanceModal';

// ── Confirm modal — unchanged from before (already full-screen/touch-
// friendly); only the card list feeding it changed. ────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');

  const CFG = {
    picked_up:          { title: 'Mark as Picked Up',         color: '#16A34A', needsReason: false, btn: 'Confirm Picked Up', btnIcon: MdCheckCircle },
    not_picked_up:      { title: 'Not Picked Up — Return to Dispatch', color: '#DC2626', needsReason: true, btn: 'Return to Dispatch Queue', btnIcon: MdUndo, placeholder: 'Reason (e.g. clinic closed, patient absent)…',
      note: 'The driver assignment will be cleared. Dispatch will be notified to assign a new driver.' },
    lab_pickup:         { title: 'Collected from Lab',         color: '#16A34A', needsReason: false, btn: 'Confirm Collected from Lab', btnIcon: MdCheckCircle },
    not_picked_lab:     { title: 'Could Not Collect — Return to Dispatch', color: '#DC2626', needsReason: true, btn: 'Return to Dispatch Queue', btnIcon: MdUndo, placeholder: 'Reason (e.g. not ready at lab)…',
      note: 'This case will return to the Ready for Dispatch queue. Dispatch will assign a new driver.' },
    delivered:          { title: 'Mark as Delivered',          color: '#16A34A', needsReason: false, btn: 'Confirm Delivered', btnIcon: MdCheckCircle },
    not_delivered:      { title: 'Could Not Deliver — Return to Dispatch', color: '#DC2626', needsReason: true, btn: 'Return to Dispatch Queue', btnIcon: MdUndo, placeholder: 'Reason (e.g. clinic closed)…',
      note: 'This case will return to the Ready for Dispatch queue. Dispatch will assign a new driver.' },
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
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1F2937', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <MdLocalHospital size={15} /> {caseData.clinic?.name}
              {caseData.clinic?.station && <span style={{ color: '#1A56A0', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}> · <MdLocationOn size={13} /> {caseData.clinic.station}</span>}
            </div>
            {caseData.clinic?.address && <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocationOn size={13} /> {caseData.clinic.address}</div>}
            {caseData.clinic?.phone  && <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}><MdCall size={13} /> <a href={`tel:${caseData.clinic.phone}`} style={{ color: '#1A56A0', fontWeight: 700 }}>{caseData.clinic.phone}</a></div>}
            {(caseData.caseNumber || caseData.workType) && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E5E7EB', fontSize: 12, color: '#6B7280' }}>
                {caseData.caseNumber && <span style={{ fontFamily: 'monospace', marginRight: 8 }}>{caseData.caseNumber}</span>}
                {caseData.workType}
              </div>
            )}
          </div>
          {cfg.note && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#92400E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MdWarning size={13} /> {cfg.note}
            </div>
          )}
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
              style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: cfg.color, color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? 'Processing…' : <>{cfg.btnIcon && <cfg.btnIcon size={15} />} {cfg.btn}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Job card — a touch-friendly card replacing the old table row ───────
function JobCard({ c, section, onAction }) {
  const isDelivery = section === 'delivery';
  const primaryAction   = isDelivery ? 'delivered'     : c.status === 'READY_TO_DISPATCH' ? 'lab_pickup'     : 'picked_up';
  const primaryLabel    = isDelivery ? 'Mark as Deliver' : c.status === 'READY_TO_DISPATCH' ? 'Picked up from Lab' : 'Mark as Pick up';
  const secondaryAction = isDelivery ? 'not_delivered'  : c.status === 'READY_TO_DISPATCH' ? 'not_picked_lab' : 'not_picked_up';
  const secondaryLabel  = isDelivery ? 'Return not delivered' : 'Not Picked up';

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{c.clinic?.name || '—'}</div>
          {c.clinic?.station && <div style={{ fontSize: 11, color: '#1A56A0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}><MdLocationOn size={11} /> {c.clinic.station}</div>}
        </div>
        {c.caseNumber && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#9CA3AF', flexShrink: 0, whiteSpace: 'nowrap' }}>{c.caseNumber}</span>}
      </div>
      {c.workType && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>{c.workType}{c.units ? ` · ${c.units}u` : ''}</div>}
      {c.clinic?.address && (
        <div style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 6 }}>
          <MdLocationOn size={14} color="#9CA3AF" style={{ marginTop: 1, flexShrink: 0 }} /> {c.clinic.address}
        </div>
      )}
      {c.clinic?.phone && (
        <a href={`tel:${c.clinic.phone}`} style={{ fontSize: 13, color: '#1A56A0', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <MdCall size={14} /> {c.clinic.phone}
        </a>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={() => onAction(c, primaryAction)}
          style={{ flex: 2, background: '#16A34A', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <MdCheckCircle size={15} /> {primaryLabel}
        </button>
        <button onClick={() => onAction(c, secondaryAction)} title={secondaryLabel}
          style={{ flex: 1, background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 9, padding: '11px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <MdUndo size={14} />
        </button>
      </div>
    </div>
  );
}

function DeliveredCard({ c }) {
  return (
    <div style={{ background: '#F0FDF4', borderRadius: 12, border: '1px solid #BBF7D0', padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: '#111827' }}>{c.clinic?.name}</div>
          {c.caseNumber && <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6B7280', marginTop: 2 }}>{c.caseNumber}</div>}
        </div>
        <span style={{ background: '#16A34A', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <MdCheckCircle size={12} /> {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM') : 'Delivered'}
        </span>
      </div>
      {c.clinic?.address && <div style={{ fontSize: 12, color: '#4B5563', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocationOn size={12} /> {c.clinic.address}</div>}
    </div>
  );
}

const SECTION_STYLES = {
  pickup:    { bg: '#DBEAFE', color: '#1E40AF', label: 'Pick-up List' },
  delivery:  { bg: '#FEF9C3', color: '#854D0E', label: 'Delivery List' },
  delivered: { bg: '#D1FAE5', color: '#065F46', label: 'Delivered' },
};
function SectionHeader({ section, count }) {
  const s = SECTION_STYLES[section];
  return (
    <div style={{ background: s.bg, color: s.color, borderRadius: 10, padding: '9px 14px', fontWeight: 800, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{s.label}</span><span style={{ fontWeight: 700, fontSize: 12, opacity: 0.85 }}>{count}</span>
    </div>
  );
}

// ── Archive — a delivery agent's full delivery history, card-styled ────
// GET /delivery/assigned (the live board above) only ever shows today's
// completed deliveries; anything older is otherwise invisible to the
// person who delivered it. Independently-paginated fetch so browsing
// history never disturbs the live board's own polling/state.
const EVENT_TYPE_FILTERS = [
  { id: '',         label: 'All' },
  { id: 'PICKUP',   label: 'Picked Up' },
  { id: 'DELIVERY', label: 'Delivered' },
];

function EventTypeBadge({ type, pickupKind }) {
  const isPickup = type === 'PICKUP';
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
      background: isPickup ? '#DBEAFE' : '#D1FAE5', color: isPickup ? '#1E40AF' : '#065F46',
    }}>
      {isPickup ? (pickupKind === 'IMPRESSION' ? 'Picked Up · Impression' : 'Picked Up · From Lab') : 'Delivered'}
    </span>
  );
}

function DeliveryArchive() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/delivery/history', {
        params: { page: p, limit: 20, search: search || undefined, from: dateFrom || undefined, to: dateTo || undefined, type: type || undefined },
      });
      setItems(res.data.events ?? []);
      setPagination(res.data.pagination ?? { total: 0, page: 1, totalPages: 1 });
      setPage(p);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [search, dateFrom, dateTo, type]);

  useEffect(() => { if (open) load(1); }, [open, load]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #E5E7EB', marginTop: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#374151' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MdArchive size={16} /> My Delivery Archive{pagination.total > 0 ? ` (${pagination.total})` : ''}</span>
        {open ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #E5E7EB', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 10px', background: '#F9FAFB' }}>
              <MdSearch size={14} color="#9CA3AF" />
              <input placeholder="Clinic, case no., patient…" value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load(1)}
                style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {EVENT_TYPE_FILTERS.map(f => (
                <button key={f.id} onClick={() => setType(f.id)} style={{
                  flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${type === f.id ? '#1A56A0' : '#E5E7EB'}`,
                  background: type === f.id ? '#EFF6FF' : '#fff', color: type === f.id ? '#1A56A0' : '#6B7280',
                }}>{f.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: 1, padding: '7px 8px', fontSize: 12.5, borderRadius: 8, border: '1px solid #E5E7EB' }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: 1, padding: '7px 8px', fontSize: 12.5, borderRadius: 8, border: '1px solid #E5E7EB' }} />
              <button onClick={() => load(1)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1A56A0', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Go</button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No activity found</div>
          ) : (
            items.map(ev => (
              <div key={ev.id} style={{ borderTop: '1px solid #F3F4F6', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{ev.clinicName}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{ev.patientName || '—'}</div>
                  {ev.caseNumber && <div style={{ fontFamily: 'monospace', fontSize: 10.5, color: '#9CA3AF', marginTop: 1 }}>{ev.caseNumber}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <EventTypeBadge type={ev.type} pickupKind={ev.pickupKind} />
                  <div style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap', marginTop: 4 }}>
                    {ev.occurredAt ? format(new Date(ev.occurredAt), 'dd MMM yyyy, h:mm a') : '—'}
                  </div>
                </div>
              </div>
            ))
          )}

          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingTop: 12, marginTop: 4, borderTop: '1px solid #F3F4F6' }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>‹ Prev</button>
              <span style={{ fontSize: 12, color: '#6B7280', alignSelf: 'center' }}>Page {page} of {pagination.totalPages}</span>
              <button onClick={() => load(page + 1)} disabled={page >= pagination.totalPages}
                style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, cursor: page >= pagination.totalPages ? 'not-allowed' : 'pointer', opacity: page >= pagination.totalPages ? 0.5 : 1 }}>Next ›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Decluttered header's overflow menu — Attendance/Leave/Performance/
// Location sharing/Logout all live here instead of crowding the top bar. ──
function MenuPanel({ onClose, user, sharing, locError, onToggleLocation, onOpenPerformance, onLogout }) {
  const sectionLabel = { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 };
  const menuItem = { width: '100%', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 9, padding: '11px 12px', fontSize: 13.5, fontWeight: 700, color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 150 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 290, maxWidth: '86vw', background: '#fff', zIndex: 151, boxShadow: '-6px 0 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', padding: '18px 16px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>{user?.name}</div>
            <div style={{ fontSize: 11.5, color: '#9CA3AF' }}>Delivery Executive</div>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><MdClose size={16} /></button>
        </div>

        <div style={sectionLabel}>Attendance</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><AttendanceClock /></div>

        <div style={sectionLabel}>Leave</div>
        <LeaveRequestButton />

        <div style={sectionLabel}>Live Location</div>
        <button onClick={onToggleLocation}
          style={{ ...menuItem, background: sharing ? '#DCFCE7' : '#F9FAFB', borderColor: sharing ? '#86EFAC' : '#E5E7EB', color: sharing ? '#15803D' : '#374151' }}>
          <MdMyLocation size={16} /> {sharing ? 'Sharing — tap to stop' : 'Share my live location'}
        </button>
        {locError && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 6 }}>{locError}</div>}

        <div style={sectionLabel}>Performance</div>
        <button onClick={onOpenPerformance} style={menuItem}><MdInsights size={16} /> My Performance</button>

        <div style={{ borderTop: '1px solid #E5E7EB', marginTop: 18, paddingTop: 14 }}>
          <button onClick={onLogout} style={{ ...menuItem, background: '#FEF2F2', borderColor: '#FECACA', color: '#DC2626' }}>
            <MdLogout size={16} /> Logout
          </button>
        </div>
      </div>
    </>
  );
}

export default function DeliveryDashboard() {
  const { user, logout } = useAuth();
  const [cases, setCases]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null);
  const [processing, setProcessing] = useState(false);
  const [search, setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);

  const { sharing, error: locError, toggle: toggleLocation } = useLiveLocationSharing();

  usePushNotifications(!!user?.id);

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
    socket.emit('join_delivery', user.id);
    socket.on('case_assigned', loadCases);
    return () => socket.off('case_assigned', loadCases);
  }, [user?.id, loadCases]);

  const handleAction = async (reason = '') => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { case: c, action } = modal;
      if (action === 'picked_up') {
        await api.post(`/delivery/${c.id}/collect-impression`);
        toast.success('Impression collected — heading to lab');

      } else if (action === 'not_picked_up') {
        // Impression pickup failed → PENDING_PICKUP + clear driver → dispatch reassigns
        await api.post(`/delivery/${c.id}/return-to-pickup-queue`, { reason });
        toast.success('Returned to dispatch — driver cleared, case ready for reassignment');

      } else if (action === 'lab_pickup') {
        await api.post(`/delivery/${c.id}/pickup`);
        toast.success('Collected from lab — heading to clinic');

      } else if (action === 'not_picked_lab') {
        // Lab pickup failed → READY_TO_DISPATCH + clear driver → dispatch reassigns
        await api.post(`/delivery/${c.id}/return-to-dispatch`, { reason });
        toast.success('Returned to dispatch queue — driver cleared, case ready for reassignment');

      } else if (action === 'delivered') {
        await api.post(`/delivery/${c.id}/deliver`);
        toast.success('Delivery confirmed!');

      } else if (action === 'not_delivered') {
        // Delivery failed → READY_TO_DISPATCH + clear driver → dispatch reassigns
        await api.post(`/delivery/${c.id}/return-to-dispatch`, { reason });
        toast.success('Returned to dispatch queue — driver cleared, case ready for reassignment');
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
  const hasFilter = search || dateFrom || dateTo;

  const iconBtn = { background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'DM Sans, sans-serif', maxWidth: 520, margin: '0 auto' }}>
      <InstallAppBanner />

      {/* ── Header — decluttered to logo/title + active badge + menu ── */}
      <div style={{ background: '#0F2044', color: '#fff', padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <img src="/logo.png" alt="logo" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>Delivery Portal</div>
            <div style={{ fontSize: 10, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} /> {user?.name?.split(' ')[0]}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {totalActive > 0 && (
            <span style={{ background: '#DC2626', color: '#fff', borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 700 }}>
              {totalActive}
            </span>
          )}
          <button onClick={() => setSearchOpen(o => !o)} style={iconBtn} aria-label="Search"><MdSearch size={18} /></button>
          <button onClick={() => setMenuOpen(true)} style={iconBtn} aria-label="Menu"><MdMenu size={20} /></button>
        </div>
      </div>

      {/* ── Live-sharing status strip — always visible while on, so it's
          never a surprise that the app is transmitting location ── */}
      {sharing && (
        <div style={{ background: '#DCFCE7', borderBottom: '1px solid #BBF7D0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#15803D' }}>
          <MdMyLocation size={14} /> Sharing your live location
          <button onClick={toggleLocation} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#15803D', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5 }}>Stop</button>
        </div>
      )}

      {/* ── Collapsible search/filter ── */}
      {searchOpen && (
        <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', background: '#F9FAFB' }}>
            <MdSearch size={15} color="#9CA3AF" />
            <input autoFocus placeholder="Clinic name, case no., location…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1, color: '#1F2937' }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><MdClose size={14} color="#9CA3AF" /></button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ flex: 1, padding: '7px 8px', fontSize: 12.5, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB' }} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ flex: 1, padding: '7px 8px', fontSize: 12.5, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB' }} />
            {hasFilter && (
              <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
                style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#FEE2E2', color: '#DC2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: 14 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 14 }}>Loading your jobs…</div>
        ) : totalActive === 0 && completedList.length === 0 && !hasFilter ? (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><MdCheckCircle size={36} color="#16A34A" /></div>
            <div style={{ fontWeight: 700, color: '#374151', fontSize: 16 }}>All clear!</div>
            <div style={{ color: '#9CA3AF', marginTop: 4, fontSize: 13 }}>No jobs assigned right now. You'll be notified when a new job is ready.</div>
          </div>
        ) : (
          <>
            <SectionHeader section="pickup" count={pickupList.length} />
            {pickupList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>No pickup jobs assigned</div>
            ) : pickupList.map(c => <JobCard key={c.id} c={c} section="pickup" onAction={(c, action) => setModal({ case: c, action })} />)}

            <div style={{ marginTop: 8 }}>
              <SectionHeader section="delivery" count={deliveryList.length} />
            </div>
            {deliveryList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '14px 0', fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>No deliveries in progress</div>
            ) : deliveryList.map(c => <JobCard key={c.id} c={c} section="delivery" onAction={(c, action) => setModal({ case: c, action })} />)}

            {completedList.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <SectionHeader section="delivered" count={completedList.length} />
                {completedList.map(c => <DeliveredCard key={c.id} c={c} />)}
              </div>
            )}
          </>
        )}

        <DeliveryArchive />
      </div>

      {menuOpen && (
        <MenuPanel
          onClose={() => setMenuOpen(false)}
          user={user}
          sharing={sharing}
          locError={locError}
          onToggleLocation={toggleLocation}
          onOpenPerformance={() => { setMenuOpen(false); setShowPerformance(true); }}
          onLogout={logout}
        />
      )}

      {modal && (
        <ConfirmModal
          caseData={modal.case}
          action={modal.action}
          onConfirm={handleAction}
          onClose={() => setModal(null)}
          loading={processing}
        />
      )}

      {showPerformance && <MyDeliveryPerformanceModal onClose={() => setShowPerformance(false)} />}
    </div>
  );
}
