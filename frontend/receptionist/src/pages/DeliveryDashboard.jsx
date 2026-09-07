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

// Portal-scoped styles — `dp-` prefix, so nothing here reaches the
// Admin / HR / Inventory / Technician / Clinic portals.
function DPStyles() {
  return (
    <style>{`
      .dp-shell{min-height:100vh;background:var(--bg);display:flex;flex-direction:column}
      .dp-wrap{width:100%;max-width:min(1040px,100%);margin:0 auto}

      /* Header */
      .dp-header{
        position:sticky;top:0;z-index:50;height:56px;
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:0 clamp(10px,3vw,18px);
        background:var(--surface);border-bottom:1px solid var(--border);
      }
      .dp-icon-btn{
        display:grid;place-items:center;flex-shrink:0;
        width:36px;height:36px;border-radius:var(--radius-sm);
        border:1px solid var(--border);background:var(--surface-2);color:var(--text-2);cursor:pointer;
        transition:transform var(--t-fast) var(--ease-out),background var(--t-fast) var(--ease),color var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease);
      }
      @media (hover:hover){.dp-icon-btn:hover{background:var(--surface-3);color:var(--text-1);border-color:var(--border-2)}}
      .dp-icon-btn:active{transform:translateY(1px) scale(.94)}
      .dp-count{
        display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;
        padding:0 7px;border-radius:var(--radius-pill);
        background:var(--red-dim);border:1px solid var(--red-line);color:var(--red);
        font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;
      }

      /* Content */
      .dp-body{flex:1;padding:clamp(12px,3vw,20px);container-type:inline-size;
        padding-bottom:calc(28px + env(safe-area-inset-bottom))}
      .dp-summary{
        display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;
      }
      .dp-stat{
        flex:1;min-width:96px;display:flex;flex-direction:column;gap:2px;
        padding:10px 12px;border-radius:var(--radius-md);
        background:var(--surface);border:1px solid var(--border);
      }
      .dp-stat b{font-size:20px;font-weight:650;color:var(--text-1);font-variant-numeric:tabular-nums;line-height:1.1}
      .dp-stat span{font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3)}

      .dp-section{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
        color:var(--text-3);margin:14px 0 10px;display:flex;align-items:center;gap:8px}
      .dp-section:first-child{margin-top:0}
      .dp-section .n{color:var(--text-4);font-weight:600}
      .dp-section-accent{width:8px;height:8px;border-radius:2px;background:var(--acc,var(--text-4));flex-shrink:0}

      /* Card grid — 1-up phone, tiles when width allows. */
      .dp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:10px}

      /* Job card */
      .dp-card{
        background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);
        border-left:3px solid var(--acc,var(--brand));
        padding:12px 14px;
        box-shadow:var(--shadow-xs);
        animation:fadeInUp var(--t-slow) var(--ease-out) both;
        transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast) var(--ease-out),border-color var(--t-fast) var(--ease-out);
      }
      @media (hover:hover){.dp-card:hover{transform:translateY(-1px);box-shadow:var(--shadow-md)}}
      .dp-card:active{transform:scale(.99)}
      .dp-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
      .dp-clinic{font-size:14.5px;font-weight:600;color:var(--text-1);line-height:1.25;overflow-wrap:anywhere}
      .dp-station{font-size:11px;color:var(--brand-soft);font-weight:600;display:inline-flex;align-items:center;gap:3px;margin-top:2px}
      .dp-case{font-family:var(--font-mono);font-size:10.5px;color:var(--text-4);white-space:nowrap;flex-shrink:0}
      .dp-meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;font-size:12.5px;color:var(--text-2)}
      .dp-meta a{color:var(--brand-soft);font-weight:600;text-decoration:none}
      .dp-meta .row{display:inline-flex;align-items:flex-start;gap:5px;min-width:0}
      .dp-meta .row svg{color:var(--text-4);margin-top:1px;flex-shrink:0}
      .dp-actions{display:flex;gap:8px;margin-top:12px}
      .dp-btn-primary{
        flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;
        min-height:42px;padding:0 12px;border:none;border-radius:var(--radius-sm);cursor:pointer;
        background:var(--green);color:#062114;font:inherit;font-size:13px;font-weight:600;
        box-shadow:0 4px 14px rgba(52,211,153,.24);
        transition:transform var(--t-fast) var(--ease-out),box-shadow var(--t-fast) var(--ease-out),filter var(--t-fast) var(--ease-out);
      }
      .dp-btn-primary:active{transform:translateY(1.5px) scale(.965);box-shadow:0 1px 4px rgba(52,211,153,.2)}
      .dp-btn-undo{
        flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;
        min-width:46px;min-height:42px;padding:0 12px;border-radius:var(--radius-sm);cursor:pointer;
        background:var(--red-dim);border:1px solid var(--red-line);color:var(--red);
        transition:transform var(--t-fast) var(--ease-out),background var(--t-fast) var(--ease);
      }
      .dp-btn-undo:active{transform:translateY(1px) scale(.95)}
      .dp-btn-undo:active svg{transform:rotate(-40deg);transition:transform var(--t) var(--ease-in-out)}

      /* Delivered card */
      .dp-done{
        background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--green);
        border-radius:var(--radius-md);padding:12px 14px;
        animation:fadeInUp var(--t-slow) var(--ease-out) both;
      }

      /* Panel (archive, empty state) */
      .dp-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden}
      .dp-field{width:100%;padding:8px 10px;font-size:13px;border-radius:var(--radius-sm);
        border:1px solid var(--border);background:var(--surface-2);color:var(--text-1);box-sizing:border-box}
      .dp-field:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-ring)}

      /* Live-location strip */
      .dp-loc-strip{
        display:flex;align-items:center;gap:8px;padding:8px clamp(10px,3vw,16px);
        background:var(--green-dim);border-bottom:1px solid var(--green-line);
        font-size:12.5px;font-weight:600;color:var(--green);
      }

      /* ── Drawer ─────────────────────────────────────────────────────
         Layer order: app < backdrop(300) < drawer(301) < content. Dark
         surface, intentional width, safe-area aware, slides in. */
      .dp-scrim{position:fixed;inset:0;z-index:300;background:var(--scrim);
        -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);
        animation:overlayIn var(--t-slow) var(--ease-out)}
      .dp-drawer{
        position:fixed;top:0;right:0;bottom:0;z-index:301;
        width:min(340px,90vw);
        display:flex;flex-direction:column;
        background:var(--surface);border-left:1px solid var(--border);
        box-shadow:var(--shadow-overlay);
        padding:calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 20px);
        overflow-y:auto;overscroll-behavior:contain;
        animation:dpDrawerIn var(--t-slow) var(--ease-out);
      }
      @keyframes dpDrawerIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
      .dp-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:6px}
      .dp-drawer-name{font-size:15px;font-weight:600;color:var(--text-1);line-height:1.2}
      .dp-drawer-role{font-size:11.5px;color:var(--text-3);margin-top:2px}
      .dp-drawer-sec{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
        color:var(--text-4);margin:16px 0 8px}
      .dp-drawer-item{
        width:100%;display:flex;align-items:center;gap:9px;text-align:left;
        padding:11px 12px;border-radius:var(--radius-sm);cursor:pointer;
        background:var(--surface-2);border:1px solid var(--border);
        font:inherit;font-size:13.5px;font-weight:550;color:var(--text-2);
        transition:transform var(--t-fast) var(--ease-out),background var(--t-fast) var(--ease),color var(--t-fast) var(--ease);
      }
      @media (hover:hover){.dp-drawer-item:hover{background:var(--surface-3);color:var(--text-1)}}
      .dp-drawer-item:active{transform:scale(.98)}

      /* Success flash — visual only, non-blocking. */
      .dp-flash{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;
        pointer-events:none;animation:fadeIn 140ms var(--ease-out)}
      .dp-flash-badge{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;
        color:var(--green);background:var(--green-dim);border:2px solid var(--green);
        box-shadow:0 12px 40px rgba(0,0,0,.4);
        animation:checkPop var(--t-success) var(--ease-emphasal) both}
    `}</style>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────
function ConfirmModal({ caseData, action, onConfirm, onClose, loading }) {
  const [reason, setReason] = useState('');

  const CFG = {
    picked_up:          { title: 'Mark as Picked Up',         color: 'var(--green)', needsReason: false, btn: 'Confirm Picked Up', btnIcon: MdCheckCircle },
    not_picked_up:      { title: 'Not Picked Up — Return to Dispatch', color: 'var(--red)', needsReason: true, btn: 'Return to Dispatch Queue', btnIcon: MdUndo, placeholder: 'Reason (e.g. clinic closed, patient absent)…',
      note: 'The driver assignment will be cleared. Dispatch will be notified to assign a new driver.' },
    lab_pickup:         { title: 'Collected from Lab',         color: 'var(--green)', needsReason: false, btn: 'Confirm Collected from Lab', btnIcon: MdCheckCircle },
    not_picked_lab:     { title: 'Could Not Collect — Return to Dispatch', color: 'var(--red)', needsReason: true, btn: 'Return to Dispatch Queue', btnIcon: MdUndo, placeholder: 'Reason (e.g. not ready at lab)…',
      note: 'This case will return to the Ready for Dispatch queue. Dispatch will assign a new driver.' },
    delivered:          { title: 'Mark as Delivered',          color: 'var(--green)', needsReason: false, btn: 'Confirm Delivered', btnIcon: MdCheckCircle },
    not_delivered:      { title: 'Could Not Deliver — Return to Dispatch', color: 'var(--red)', needsReason: true, btn: 'Return to Dispatch Queue', btnIcon: MdUndo, placeholder: 'Reason (e.g. clinic closed)…',
      note: 'This case will return to the Ready for Dispatch queue. Dispatch will assign a new driver.' },
  };
  const cfg = CFG[action] || {};
  const danger = cfg.color === 'var(--red)';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: danger ? 'var(--red)' : 'var(--text-1)' }}>{cfg.title}</div>
          <button className="modal-close" onClick={onClose}><MdClose size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: '12px 14px', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--text-1)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <MdLocalHospital size={15} style={{ color: 'var(--text-3)' }} /> {caseData.clinic?.name}
              {caseData.clinic?.station && <span style={{ color: 'var(--brand-soft)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}> · <MdLocationOn size={13} /> {caseData.clinic.station}</span>}
            </div>
            {caseData.clinic?.address && <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocationOn size={13} /> {caseData.clinic.address}</div>}
            {caseData.clinic?.phone && <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}><MdCall size={13} style={{ color: 'var(--text-4)' }} /> <a href={`tel:${caseData.clinic.phone}`} style={{ color: 'var(--brand-soft)', fontWeight: 600, textDecoration: 'none' }}>{caseData.clinic.phone}</a></div>}
            {(caseData.caseNumber || caseData.workType) && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
                {caseData.caseNumber && <span style={{ fontFamily: 'var(--font-mono)', marginRight: 8 }}>{caseData.caseNumber}</span>}
                {caseData.workType}
              </div>
            )}
          </div>
          {cfg.note && (
            <div style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber-line)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: 12, color: 'var(--amber)', fontWeight: 550, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <MdWarning size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {cfg.note}
            </div>
          )}
          {cfg.needsReason && (
            <textarea rows={2} placeholder={cfg.placeholder} value={reason} onChange={e => setReason(e.target.value)}
              className="dp-field" style={{ resize: 'vertical' }} />
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-success'}`} onClick={() => onConfirm(reason)}
            disabled={loading || (cfg.needsReason && !reason.trim())} style={{ gap: 6 }}>
            {loading ? 'Processing…' : <>{cfg.btnIcon && <cfg.btnIcon size={15} />} {cfg.btn}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Job card ─────────────────────────────────────────────────────────
function JobCard({ c, section, onAction }) {
  const isDelivery = section === 'delivery';
  const primaryAction   = isDelivery ? 'delivered'     : c.status === 'READY_TO_DISPATCH' ? 'lab_pickup'     : 'picked_up';
  const primaryLabel    = isDelivery ? 'Mark as Deliver' : c.status === 'READY_TO_DISPATCH' ? 'Picked up from Lab' : 'Mark as Pick up';
  const secondaryAction = isDelivery ? 'not_delivered'  : c.status === 'READY_TO_DISPATCH' ? 'not_picked_lab' : 'not_picked_up';
  const secondaryLabel  = isDelivery ? 'Return not delivered' : 'Not Picked up';
  const acc = isDelivery ? 'var(--amber)' : c.status === 'READY_TO_DISPATCH' ? 'var(--brand)' : 'var(--text-4)';

  return (
    <div className="dp-card" style={{ '--acc': acc }}>
      <div className="dp-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="dp-clinic">{c.clinic?.name || '—'}</div>
          {c.clinic?.station && <div className="dp-station"><MdLocationOn size={11} /> {c.clinic.station}</div>}
        </div>
        {c.caseNumber && <span className="dp-case">{c.caseNumber}</span>}
      </div>
      {c.workType && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{c.workType}{c.units ? ` · ${c.units}u` : ''}</div>}
      <div className="dp-meta">
        {c.clinic?.address && (
          <span className="row"><MdLocationOn size={14} /> {c.clinic.address}</span>
        )}
        {c.clinic?.phone && (
          <a href={`tel:${c.clinic.phone}`} className="row" style={{ color: 'var(--brand-soft)', fontWeight: 600 }}>
            <MdCall size={14} style={{ color: 'var(--brand-soft)' }} /> {c.clinic.phone}
          </a>
        )}
      </div>
      <div className="dp-actions">
        <button className="dp-btn-primary" onClick={() => onAction(c, primaryAction)}>
          <MdCheckCircle size={15} /> {primaryLabel}
        </button>
        <button className="dp-btn-undo" onClick={() => onAction(c, secondaryAction)} title={secondaryLabel} aria-label={secondaryLabel}>
          <MdUndo size={15} />
        </button>
      </div>
    </div>
  );
}

function DeliveredCard({ c }) {
  return (
    <div className="dp-done">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-1)' }}>{c.clinic?.name}</div>
          {c.caseNumber && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)', marginTop: 2 }}>{c.caseNumber}</div>}
        </div>
        <span className="badge badge-pay-verified" style={{ flexShrink: 0 }}>
          <MdCheckCircle size={11} /> {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM') : 'Delivered'}
        </span>
      </div>
      {c.clinic?.address && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocationOn size={12} /> {c.clinic.address}</div>}
    </div>
  );
}

const SECTION_ACCENT = { pickup: 'var(--text-4)', delivery: 'var(--amber)', delivered: 'var(--green)' };
const SECTION_LABEL = { pickup: 'Pick-up List', delivery: 'Delivery List', delivered: 'Delivered' };
function SectionHeader({ section, count }) {
  return (
    <div className="dp-section">
      <span className="dp-section-accent" style={{ '--acc': SECTION_ACCENT[section] }} />
      {SECTION_LABEL[section]} <span className="n">· {count}</span>
    </div>
  );
}

// ── Archive ──────────────────────────────────────────────────────────
const EVENT_TYPE_FILTERS = [
  { id: '',         label: 'All' },
  { id: 'PICKUP',   label: 'Picked Up' },
  { id: 'DELIVERY', label: 'Delivered' },
];

function EventTypeBadge({ type, pickupKind }) {
  const isPickup = type === 'PICKUP';
  return (
    <span className={`badge ${isPickup ? 'badge-received' : 'badge-pay-verified'}`} style={{ whiteSpace: 'nowrap' }}>
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
    <div className="dp-panel" style={{ marginTop: 12 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MdArchive size={16} /> My Delivery Archive{pagination.total > 0 ? ` (${pagination.total})` : ''}</span>
        {open ? <MdExpandLess size={18} /> : <MdExpandMore size={18} />}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', background: 'var(--surface-2)' }}>
              <MdSearch size={14} color="var(--text-4)" />
              <input placeholder="Clinic, case no., patient…" value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load(1)}
                style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1, color: 'var(--text-1)', minWidth: 0 }} />
            </div>
            <div className="seg" style={{ width: '100%' }}>
              {EVENT_TYPE_FILTERS.map(f => (
                <button key={f.id} className={type === f.id ? 'active' : ''} style={{ flex: 1 }} onClick={() => setType(f.id)}>{f.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="dp-field" style={{ flex: 1 }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="dp-field" style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={() => load(1)} style={{ whiteSpace: 'nowrap' }}>Go</button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>No activity found</div>
          ) : (
            items.map(ev => (
              <div key={ev.id} style={{ borderTop: '1px solid var(--border-soft)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{ev.clinicName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{ev.patientName || '—'}</div>
                  {ev.caseNumber && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-4)', marginTop: 1 }}>{ev.caseNumber}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <EventTypeBadge type={ev.type} pickupKind={ev.pickupKind} />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', marginTop: 4 }}>
                    {ev.occurredAt ? format(new Date(ev.occurredAt), 'dd MMM yyyy, h:mm a') : '—'}
                  </div>
                </div>
              </div>
            ))
          )}

          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingTop: 12, marginTop: 4, borderTop: '1px solid var(--border-soft)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => load(page - 1)} disabled={page <= 1}>‹ Prev</button>
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>Page {page} of {pagination.totalPages}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => load(page + 1)} disabled={page >= pagination.totalPages}>Next ›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Navigation drawer ────────────────────────────────────────────────
function MenuPanel({ onClose, user, sharing, locError, onToggleLocation, onOpenPerformance, onLogout }) {
  return (
    <>
      <div className="dp-scrim" onClick={onClose} />
      <div className="dp-drawer" role="dialog" aria-label="Menu">
        <div className="dp-drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="dp-drawer-name">{user?.name}</div>
            <div className="dp-drawer-role">Delivery Executive</div>
          </div>
          <button onClick={onClose} className="dp-icon-btn" aria-label="Close menu"><MdClose size={16} /></button>
        </div>

        <div className="dp-drawer-sec">Attendance</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><AttendanceClock /></div>

        <div className="dp-drawer-sec">Leave</div>
        <LeaveRequestButton />

        <div className="dp-drawer-sec">Live Location</div>
        <button onClick={onToggleLocation} className="dp-drawer-item"
          style={sharing ? { background: 'var(--green-dim)', borderColor: 'var(--green-line)', color: 'var(--green)' } : undefined}>
          <MdMyLocation size={16} /> {sharing ? 'Sharing — tap to stop' : 'Share my live location'}
        </button>
        {locError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{locError}</div>}

        <div className="dp-drawer-sec">Performance</div>
        <button onClick={onOpenPerformance} className="dp-drawer-item"><MdInsights size={16} /> My Performance</button>

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button onClick={onLogout} className="dp-drawer-item"
            style={{ background: 'var(--red-dim)', borderColor: 'var(--red-line)', color: 'var(--red)' }}>
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
  const [flash, setFlash] = useState(false);

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
      const wasSuccess = modal.action === 'picked_up' || modal.action === 'lab_pickup' || modal.action === 'delivered';
      setModal(null);
      if (wasSuccess) { setFlash(true); setTimeout(() => setFlash(false), 900); }
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

  return (
    <div className="dp-shell">
      <DPStyles />
      <div className="dp-wrap">
        <InstallAppBanner />

        {/* ── Header ── */}
        <header className="dp-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', letterSpacing: '-.01em', whiteSpace: 'nowrap', lineHeight: 1.2 }}>Delivery Portal</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} /> {user?.name?.split(' ')[0]}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {totalActive > 0 && <span className="dp-count">{totalActive}</span>}
            <button onClick={() => setSearchOpen(o => !o)} className="dp-icon-btn" aria-label="Search"
              style={searchOpen ? { background: 'var(--brand-tint)', borderColor: 'var(--brand)', color: 'var(--brand)' } : undefined}>
              <MdSearch size={18} />
            </button>
            <button onClick={() => setMenuOpen(true)} className="dp-icon-btn" aria-label="Menu"><MdMenu size={20} /></button>
          </div>
        </header>

        {/* ── Live-sharing strip ── */}
        {sharing && (
          <div className="dp-loc-strip">
            <MdMyLocation size={14} /> Sharing your live location
            <button onClick={toggleLocation} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--green)', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5 }}>Stop</button>
          </div>
        )}

        {/* ── Collapsible search/filter ── */}
        {searchOpen && (
          <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px clamp(10px,3vw,16px)', display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeInUp var(--t-slow) var(--ease-out) both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', background: 'var(--surface-2)' }}>
              <MdSearch size={15} color="var(--text-4)" />
              <input autoFocus placeholder="Clinic name, case no., location…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', background: 'none', outline: 'none', fontSize: 13, flex: 1, color: 'var(--text-1)', minWidth: 0 }} />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><MdClose size={14} color="var(--text-4)" /></button>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="dp-field" style={{ flex: 1 }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="dp-field" style={{ flex: 1 }} />
              {hasFilter && (
                <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }} className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        <div className="dp-body">
          {loading ? (
            <div className="dp-grid">
              {[0, 1, 2].map(i => <div key={i} className="skeleton-card" style={{ height: 168 }} />)}
            </div>
          ) : totalActive === 0 && completedList.length === 0 && !hasFilter ? (
            <div className="dp-panel" style={{ padding: '44px 20px', textAlign: 'center' }}>
              <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><MdCheckCircle size={34} color="var(--green)" /></div>
              <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: 15 }}>All clear</div>
              <div style={{ color: 'var(--text-3)', marginTop: 4, fontSize: 13 }}>No jobs assigned right now. You'll be notified when a new job is ready.</div>
            </div>
          ) : (
            <>
              {/* Task summary — what needs handling, up top */}
              <div className="dp-summary">
                <div className="dp-stat"><b>{pickupList.length}</b><span>Pick-ups</span></div>
                <div className="dp-stat"><b>{deliveryList.length}</b><span>Deliveries</span></div>
                {completedList.length > 0 && <div className="dp-stat"><b>{completedList.length}</b><span>Done today</span></div>}
              </div>

              <SectionHeader section="pickup" count={pickupList.length} />
              {pickupList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12.5, color: 'var(--text-4)' }}>No pickup jobs assigned</div>
              ) : (
                <div className="dp-grid">
                  {pickupList.map(c => <JobCard key={c.id} c={c} section="pickup" onAction={(c, action) => setModal({ case: c, action })} />)}
                </div>
              )}

              <SectionHeader section="delivery" count={deliveryList.length} />
              {deliveryList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 12.5, color: 'var(--text-4)' }}>No deliveries in progress</div>
              ) : (
                <div className="dp-grid">
                  {deliveryList.map(c => <JobCard key={c.id} c={c} section="delivery" onAction={(c, action) => setModal({ case: c, action })} />)}
                </div>
              )}

              {completedList.length > 0 && (
                <>
                  <SectionHeader section="delivered" count={completedList.length} />
                  <div className="dp-grid">
                    {completedList.map(c => <DeliveredCard key={c.id} c={c} />)}
                  </div>
                </>
              )}
            </>
          )}

          <DeliveryArchive />
        </div>
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

      {flash && (
        <div className="dp-flash" aria-hidden="true">
          <div className="dp-flash-badge"><MdCheckCircle size={44} /></div>
        </div>
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
