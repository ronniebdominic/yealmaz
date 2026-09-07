import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../AuthContext';
import api, { socket } from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import {
  MdScience, MdContentCut, MdBiotech, MdComputer, MdSettings, MdPrint,
  MdBuild, MdPalette, MdAccountBalance, MdDiamond, MdAutoAwesome,
  MdLocalFireDepartment, MdSearch, MdCheckCircle, MdInventory2, MdPerson,
  MdPhotoCamera, MdBackHand, MdLightbulb, MdInbox, MdLogout,
  MdInsights, MdCalendarToday, MdAddBox, MdCelebration, MdQrCodeScanner,
  MdNotifications, MdChevronRight,
} from 'react-icons/md';
import { todayLocal, toLocalDateString, startOfWeekLocal, startOfMonthLocal } from '../utils/date';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';
import TeamLeaveRequests from '../components/TeamLeaveRequests';
import CaseReviewQueue from '../components/CaseReviewQueue';
import InstallAppBanner from '../components/InstallAppBanner';
import NotificationBell from '../components/NotificationBell';
import MyProfileTab from '../components/MyProfileTab';
import { useNotifications } from '../hooks/useNotifications';

// ── Department config ─────────────────────────────────────
// `color` is a bright hex tuned for the dark theme (identity accent only —
// the *selected* state uses the shared --accent so the portal matches the
// rest of the product). `bg` keeps the "<hex><alpha>" form other code
// appends to. Codes / labels / order / nextDept are unchanged.
const DEPARTMENTS = [
  { code: 'PLASTER',      label: 'Plaster Department',   short: 'PLS', color: '#B98BE8', bg: '#B98BE81F', icon: MdScience,  nextDept: 'Margin Department' },
  { code: 'MARGIN',       label: 'Margin Department',    short: 'MRG', color: '#C58BE0', bg: '#C58BE01F', icon: MdContentCut,  nextDept: 'Scanning' },
  { code: 'SCANNING',     label: 'Scanning',             short: 'SCN', color: '#4C82F7', bg: '#4C82F71F', icon: MdBiotech,  nextDept: 'Designing' },
  { code: 'DESIGNING',    label: 'Designing',            short: 'DES', color: '#3FB6E8', bg: '#3FB6E81F', icon: MdComputer,  nextDept: 'Milling / Printing' },
  { code: 'MILLING',      label: 'Milling / Sintering',  short: 'MIL', color: '#F5934C', bg: '#F5934C1F', icon: MdSettings,  nextDept: 'Metal Finishing' },
  { code: 'RESIN_PRINT',  label: 'Resin 3D Printing',    short: 'R3D', color: '#F2795E', bg: '#F2795E1F', icon: MdPrint,  nextDept: 'Trimming' },
  { code: 'METAL_PRINT',  label: 'Metal 3D Printing',    short: 'M3D', color: '#C9A18F', bg: '#C9A18F1F', icon: MdBuild,  nextDept: 'Metal Finishing' },
  { code: 'METAL_FINISH', label: 'Metal Finishing',      short: 'MFN', color: '#C2A594', bg: '#C2A5941F', icon: MdBuild,  nextDept: 'Opaque Application' },
  { code: 'OPAQUE',       label: 'Opaque Application',   short: 'OPQ', color: '#F5B23F', bg: '#F5B23F1F', icon: MdPalette,  nextDept: 'Ceramic Layering' },
  { code: 'CERAMIC',      label: 'Ceramic Layering',     short: 'CER', color: '#F0855C', bg: '#F0855C1F', icon: MdAccountBalance,  nextDept: 'Glazing' },
  { code: 'ZIRCONIA',     label: 'Zirconia Fitting',     short: 'ZRC', color: '#2DD4BF', bg: '#2DD4BF1F', icon: MdDiamond,  nextDept: 'Glazing' },
  { code: 'GLAZING',      label: 'Glazing',              short: 'GLZ', color: '#4FC3D4', bg: '#4FC3D41F', icon: MdAutoAwesome,  nextDept: 'Quality Control' },
  { code: 'THERMO',       label: 'Thermo Press',         short: 'THP', color: '#F26D6D', bg: '#F26D6D1F', icon: MdLocalFireDepartment,  nextDept: 'Quality Control' },
  { code: 'TRIMMING',     label: 'Trimming',             short: 'TRM', color: '#9CCC65', bg: '#9CCC651F', icon: MdContentCut,  nextDept: 'Quality Control' },
  { code: 'QC',           label: 'Quality Control',      short: 'QC',  color: '#34D399', bg: '#34D3991F', icon: MdSearch,  nextDept: 'Ready to Dispatch' },
];

const STAGE_LABELS = {
  CASE_ACCEPTED: 'Case Accepted', PLASTER_DEPARTMENT: 'Plaster', MARGIN_DEPARTMENT: 'Margin',
  SCANNING: 'Scanning', DESIGNING: 'Designing',
  MILLING_SINTERING: 'Milling', RESIN_3D_PRINTING: 'Resin Print', METAL_3D_PRINTING: 'Metal Print',
  METAL_FINISHING: 'Metal Finish', OPAQUE_APPLICATION: 'Opaque', CERAMIC_LAYERING: 'Ceramic',
  ZIRCONIA_FITTING_FINISHING: 'Zirconia', GLAZING: 'Glazing', THERMO_PRESS: 'Thermo', TRIMMING: 'Trimming',
  QUALITY_CHECK: 'QC', PAYMENT_INVOICING: 'Payment',
  READY_TO_DISPATCH: 'Ready to Ship', OUT_FOR_DELIVERY: 'Out for Delivery', DELIVERED: 'Delivered',
  ON_HOLD: 'On Hold', REMAKE: 'Remake', CANCELLED: 'Cancelled',
};

// Bright, dark-theme-tuned stage hues. Used as chip tints (hex + alpha)
// and card accent edges. Same keys as before.
const STAGE_COLORS = {
  CASE_ACCEPTED: '#7C8BF5', PLASTER_DEPARTMENT: '#B98BE8', MARGIN_DEPARTMENT: '#C58BE0',
  SCANNING: '#4C82F7', DESIGNING: '#3FB6E8',
  MILLING_SINTERING: '#F5934C', RESIN_3D_PRINTING: '#F2795E', METAL_3D_PRINTING: '#C9A18F',
  METAL_FINISHING: '#C2A594', OPAQUE_APPLICATION: '#F5B23F', CERAMIC_LAYERING: '#F0855C',
  ZIRCONIA_FITTING_FINISHING: '#2DD4BF', GLAZING: '#4FC3D4', THERMO_PRESS: '#F26D6D', TRIMMING: '#9CCC65',
  QUALITY_CHECK: '#34D399', PAYMENT_INVOICING: '#2DD4BF',
  READY_TO_DISPATCH: '#3FB6E8', OUT_FOR_DELIVERY: '#F5B23F', DELIVERED: '#7E8BA4',
  ON_HOLD: '#F26D6D', REMAKE: '#B98BE8', CANCELLED: '#5A6683',
};

// Literal hex, not tokens — chart libs can't resolve var(). Mirrors index.css.
const PIE_COLORS = ['#4C82F7', '#34D399', '#F5B23F', '#F26D6D', '#A78BFA', '#5BA8D8', '#EC7FA0', '#2DD4BF'];

// Shared mobile styles for the technician portal. Scoped by the `tp-`
// class prefix so nothing here can reach the Admin or other portals.
function TechStyles() {
  return (
    <style>{`
      .tp-shell{--tp-pad:16px}
      @media (max-width:380px){.tp-shell{--tp-pad:12px}}

      .tp-section-label{
        font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
        color:var(--text-3);margin:0 0 10px;display:flex;align-items:center;gap:6px;
      }

      /* Department grid — 2-up on small phones, more when width allows. */
      .tp-dept-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(146px,1fr));gap:10px}
      .tp-dept{
        --dept:var(--accent);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;
        min-height:76px;padding:12px 10px;border-radius:var(--radius-md);cursor:pointer;
        background:var(--surface-2);border:1px solid var(--border);
        color:var(--text-2);text-align:center;
        transition:transform var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease),background var(--t-fast) var(--ease);
      }
      .tp-dept:active{transform:scale(.97)}
      .tp-dept-ic{
        width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex-shrink:0;
        background:var(--deptbg,var(--surface-3));color:var(--dept);
      }
      .tp-dept-lb{font-size:12px;font-weight:600;line-height:1.3;color:inherit;overflow-wrap:anywhere}
      .tp-dept[data-on="true"]{
        background:var(--accent-dim);border-color:var(--accent);color:var(--text-1);
        box-shadow:0 0 0 3px rgba(45,212,191,.22);
      }
      .tp-dept-check{position:absolute;top:6px;right:6px;color:var(--accent)}

      /* Big tap tiles (Scan / Search) */
      .tp-tile{
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
        min-height:112px;padding:18px 12px;border-radius:var(--radius-md);cursor:pointer;
        border:1px solid var(--border);transition:transform var(--t-fast) var(--ease);
      }
      .tp-tile:active{transform:scale(.98)}
      .tp-tile-primary{background:var(--brand);border-color:var(--brand);color:#fff}
      .tp-tile-ghost{background:var(--surface);color:var(--text-1)}
      .tp-tile-hint{font-size:11px;opacity:.72;font-weight:450}
      .tp-tile-lb{font-size:13.5px;font-weight:600}

      /* Segmented control */
      .tp-seg{display:flex;gap:4px;padding:4px;border-radius:var(--radius);background:var(--surface-2);border:1px solid var(--border)}
      .tp-seg button{
        flex:1;padding:8px 6px;border:none;border-radius:calc(var(--radius) - 4px);cursor:pointer;
        font-size:12.5px;font-weight:600;background:transparent;color:var(--text-3);
        transition:background var(--t-fast) var(--ease),color var(--t-fast) var(--ease);
      }
      .tp-seg button[data-on="true"]{background:var(--surface);color:var(--text-1);box-shadow:var(--shadow-xs)}

      /* KPI mini grid */
      .tp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      @media (max-width:340px){.tp-kpis{grid-template-columns:repeat(2,1fr);row-gap:12px}}
      .tp-kpi-l{font-size:9.5px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--text-3);line-height:1.25;min-height:2.4em}
      .tp-kpi-v{font-size:18px;font-weight:650;color:var(--text-1);font-variant-numeric:tabular-nums;margin-top:2px}

      /* Queue / history rows */
      .tp-row{
        display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:8px;
        border-radius:var(--radius-md);background:var(--surface);border:1px solid var(--border);
        border-left:3px solid var(--row,var(--accent));
      }
      .tp-row-mono{font-family:var(--font-mono);font-size:10.5px;color:var(--text-3);margin-bottom:2px}
      .tp-row-title{font-size:13.5px;font-weight:600;color:var(--text-1);line-height:1.3}
      .tp-row-sub{font-size:11.5px;color:var(--text-2);margin-top:2px}
      .tp-chip{
        display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:600;
        padding:2px 8px;border-radius:var(--radius-pill);white-space:nowrap;
        background:var(--surface-2);color:var(--text-2);border:1px solid var(--border);
      }

      /* Bottom nav */
      .tp-nav{
        position:sticky;bottom:0;z-index:60;display:flex;
        background:var(--surface);border-top:1px solid var(--border);
        padding:6px 4px calc(6px + env(safe-area-inset-bottom));
      }
      .tp-nav button{
        flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
        min-height:52px;padding:6px 4px;border:none;background:none;cursor:pointer;
        color:var(--text-4);transition:color var(--t-fast) var(--ease);
      }
      .tp-nav button[data-on="true"]{color:var(--accent)}
      .tp-nav-ic{position:relative;display:grid;place-items:center;width:44px;height:26px;border-radius:var(--radius-pill);transition:background var(--t-fast) var(--ease)}
      .tp-nav button[data-on="true"] .tp-nav-ic{background:var(--accent-dim)}
      .tp-nav-lb{font-size:10px;font-weight:600}
      .tp-nav-badge{
        position:absolute;top:-3px;right:2px;min-width:15px;height:15px;border-radius:8px;
        background:var(--red);color:#fff;font-size:9px;font-weight:700;
        display:flex;align-items:center;justify-content:center;padding:0 3px;border:1.5px solid var(--surface);
      }

      /* Bottom-sheet modal */
      .tp-sheet-scrim{position:fixed;inset:0;z-index:200;background:var(--scrim);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center}
      .tp-sheet{
        width:100%;max-width:480px;background:var(--surface);
        border-radius:var(--radius-xl) var(--radius-xl) 0 0;border:1px solid var(--border);border-bottom:none;
        padding:16px 16px calc(24px + env(safe-area-inset-bottom));
        animation:slideUp .22s var(--ease);max-height:88vh;overflow-y:auto;
      }
      .tp-sheet-grab{width:36px;height:4px;background:var(--border-2);border-radius:2px;margin:0 auto 14px}
      .tp-sheet-title{font-size:15.5px;font-weight:600;color:var(--text-1);margin-bottom:12px;display:flex;align-items:center;gap:7px}
      .tp-field-l{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-3);margin-bottom:5px}
      .tp-input{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;background:var(--surface-2);color:var(--text-1);font-family:inherit;box-sizing:border-box}
      .tp-input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-ring)}
    `}</style>
  );
}

// ── QR Scanner component (native getUserMedia + jsQR) ────────
function QRScanner({ onScan, onClose }) {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);
  const doneRef    = useRef(false);

  useEffect(() => {
    let active = true;
    const canvas = document.createElement('canvas');
    const ctx    = canvas.getContext('2d');

    const stop = () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };

    const tick = (jsQR) => {
      if (!active || !videoRef.current) return;
      const video = videoRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && !doneRef.current) {
          doneRef.current = true;
          stop();
          let caseId = code.data;
          const match = code.data.match(/\/scan\/([a-f0-9-]{36})/i);
          if (match) caseId = match[1];
          onScan(caseId);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(() => tick(jsQR));
    };

    const start = async () => {
      try {
        const { default: jsQR } = await import('jsqr');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          rafRef.current = requestAnimationFrame(() => tick(jsQR));
        }
      } catch (err) {
        console.error('Camera error:', err);
        toast.error('Could not access camera. Please allow camera permission.');
      }
    };

    start();
    return stop;
  }, [onScan]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(3,7,15,0.94)',
      backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#000', borderRadius: 'var(--radius-xl)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: 15, display: 'flex', alignItems: 'center', gap: 7 }}><MdQrCodeScanner size={18} /> Scan QR Code</div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
        </div>

        {/* Single clean video feed */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#000' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Targeting overlay */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'
          }}>
            <div style={{
              width: 200, height: 200, border: '2px solid rgba(255,255,255,0.85)', borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            }}>
              {/* Corner marks */}
              {[['0','0','auto','auto'],['0','auto','auto','0'],['auto','0','0','auto'],['auto','auto','0','0']].map((pos, i) => (
                <div key={i} style={{
                  position: 'absolute', width: 20, height: 20,
                  top: pos[0], right: pos[1], bottom: pos[2], left: pos[3],
                  borderTop:    (i < 2)  ? '3px solid #fff' : 'none',
                  borderBottom: (i >= 2) ? '3px solid #fff' : 'none',
                  borderLeft:   (i === 0 || i === 2) ? '3px solid #fff' : 'none',
                  borderRight:  (i === 1 || i === 3) ? '3px solid #fff' : 'none',
                }} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 18px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)', background: '#0A0A0A' }}>
          Point camera at the case QR code
        </div>
      </div>
    </div>
  );
}

// ── Manual entry modal ────────────────────────────────────
function ManualEntryModal({ onSubmit, onClose }) {
  const [caseNum, setCaseNum] = useState('');
  const [cases, setCases] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = async () => {
    if (!caseNum.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/cases?search=${caseNum}&limit=10`);
      setCases(res.data.cases);
    } catch { toast.error('Search failed'); }
    finally { setSearching(false); }
  };

  return (
    <div className="tp-sheet-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-sheet">
        <div className="tp-sheet-grab" />
        <div className="tp-sheet-title"><MdSearch size={17} /> Search Case</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="tp-input" placeholder="Case number or patient name…" value={caseNum} onChange={e => setCaseNum(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()} style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={search} disabled={searching} style={{ flexShrink: 0 }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {cases.map(c => (
            <div key={c.id} onClick={() => onSubmit(c.id)} className="tp-row" style={{ cursor: 'pointer', '--row': STAGE_COLORS[c.status] || 'var(--accent)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="tp-row-mono">{c.caseNumber}</div>
                <div className="tp-row-title">{c.patientName}</div>
                <div className="tp-row-sub">{c.workType} · {c.clinic?.name}</div>
              </div>
              <span className="tp-chip" style={{ background: (STAGE_COLORS[c.status] || '#7E8BA4') + '22', color: STAGE_COLORS[c.status] || 'var(--text-2)', borderColor: 'transparent' }}>
                {STAGE_LABELS[c.status]}
              </span>
            </div>
          ))}
          {cases.length === 0 && caseNum && !searching && (
            <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 20, fontSize: 13 }}>No cases found</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Scan Result modal ─────────────────────────────────────
// Departments where a tech comment is offered at scan time — visible to other
// LMS staff (stage history), never exposed to the clinic portal (backend strips
// stage notes from clinic-facing case responses).
const COMMENT_DEPARTMENTS = new Set(['MILLING', 'MARGIN']);

function ScanResultModal({ result, onConfirm, onClose, loading, department, comment, onCommentChange }) {
  if (!result) return null;
  const dept = DEPARTMENTS.find(d => d.code === department);
  const showComment = COMMENT_DEPARTMENTS.has(department);

  return (
    <div className="tp-sheet-scrim">
      <div className="tp-sheet">
        <div className="tp-sheet-grab" />

        <div className="tp-sheet-title" style={{ fontSize: 17 }}><MdCheckCircle size={19} color="var(--green)" /> Case Found</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, marginTop: -6 }}>Confirm scan at {dept?.label}</div>

        {/* Case card */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', padding: '16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{result.caseNumber}</div>
          <div style={{ fontSize: 20, fontWeight: 650, color: 'var(--text-1)', marginBottom: 4 }}>{result.patientName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>{result.workType} · {result.clinic?.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, background: (STAGE_COLORS[result.status] || '#7E8BA4') + '22', color: STAGE_COLORS[result.status] || 'var(--text-2)', padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 600 }}>
              {STAGE_LABELS[result.status]}
            </span>
            <MdChevronRight size={14} style={{ color: 'var(--text-3)' }} />
            <span style={{ fontSize: 12, background: dept?.bg, color: dept?.color, padding: '3px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 600, border: `1px solid ${dept?.color}40`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {dept?.icon && <dept.icon size={13} />} {dept?.label}
            </span>
          </div>
          {result.dueDate && (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: new Date(result.dueDate) < new Date() ? 'var(--red)' : 'var(--text-3)' }}>
              Due: {format(new Date(result.dueDate), 'dd MMM yyyy')}
            </div>
          )}
        </div>

        {/* Stage history */}
        {result.stages?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div className="tp-section-label">Recent Activity</div>
            {result.stages.slice(0, 3).map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', padding: '7px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <span>{STAGE_LABELS[s.stageName]}</span>
                <span style={{ color: 'var(--text-3)' }}>{format(new Date(s.scannedAt), 'dd MMM, h:mm a')}</span>
              </div>
            ))}
          </div>
        )}

        {showComment && (
          <div style={{ marginBottom: 16 }}>
            <div className="tp-field-l" style={{ textTransform: 'none', letterSpacing: 0 }}>
              Comment (optional) — visible to lab staff only, not the clinic
            </div>
            <textarea
              rows={2}
              value={comment}
              onChange={e => onCommentChange(e.target.value)}
              placeholder={`Note for other departments about this ${dept?.label.toLowerCase()} step…`}
              className="tp-input"
              style={{ resize: 'vertical' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing…' : `Confirm — ${dept?.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Performance tab ─────────────────────────────────────────
// A tech's own scan activity — summary stats plus the real scan-by-scan
// history (unlike "Today's Scans" on the Scan tab, which is just an
// in-session list that resets on reload). Self-scoped server-side; no way
// for this screen to show anyone else's data. Was a full-screen modal;
// now lives in its own bottom-tab slot.
// Calendar periods (today / this Mon-Sun week / this month to date), not a
// rolling N-day window — matches the Today/This Month quick filters
// already used elsewhere (e.g. Analytics Dashboard).
const RANGE_PRESETS = [
  { id: 'daily',   label: 'Daily',   from: () => todayLocal() },
  { id: 'weekly',  label: 'Weekly',  from: () => startOfWeekLocal() },
  { id: 'monthly', label: 'Monthly', from: () => startOfMonthLocal() },
];

function MiniSparkline({ dailyCounts, from, to }) {
  const start = new Date(from);
  const end = new Date(to);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const bucketCount = Math.min(totalDays, 18);
  const bucketSize = Math.ceil(totalDays / bucketCount);

  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const bStart = new Date(start); bStart.setDate(bStart.getDate() + i * bucketSize);
    const bEnd = new Date(start); bEnd.setDate(bEnd.getDate() + Math.min((i + 1) * bucketSize, totalDays) - 1);
    if (bStart > end) break;
    let sum = 0;
    for (let d = new Date(bStart); d <= bEnd && d <= end; d.setDate(d.getDate() + 1)) {
      sum += dailyCounts[toLocalDateString(d)] || 0;
    }
    buckets.push({ from: bStart, to: bEnd, count: sum });
  }
  const max = Math.max(1, ...buckets.map(b => b.count));
  const fmt = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
      {buckets.map((b, i) => (
        <div key={i}
          title={`${fmt(b.from)}${b.to > b.from ? ` – ${fmt(b.to)}` : ''}: ${b.count} scan${b.count !== 1 ? 's' : ''}`}
          style={{
            flex: 1, minWidth: 4, borderRadius: '3px 3px 0 0',
            height: `${Math.max((b.count / max) * 100, b.count > 0 ? 12 : 4)}%`,
            background: 'var(--accent)', opacity: i === buckets.length - 1 ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

function PerformanceTab() {
  const [rangeId, setRangeId] = useState('weekly');
  const [page, setPage] = useState(1);
  const toDate = todayLocal();
  const fromDate = RANGE_PRESETS.find(p => p.id === rangeId).from();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lab', 'my-performance', fromDate, toDate, page],
    queryFn: () => api.get('/lab/my-performance', { params: { from: fromDate, to: toDate, page, limit: 15 } }).then(r => r.data),
    staleTime: 30_000,
  });

  const summary = data?.summary;
  const scans = data?.scans ?? [];
  const pagination = data?.pagination ?? {};

  return (
    <div>
      {/* Range presets */}
      <div className="tp-seg" style={{ marginBottom: 16 }}>
        {RANGE_PRESETS.map(p => (
          <button key={p.id} data-on={rangeId === p.id} onClick={() => { setRangeId(p.id); setPage(1); }}>
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>Loading…</div>
      ) : isError ? (
        <div style={{ textAlign: 'center', color: 'var(--red)', padding: 40 }}>Could not load your performance.</div>
      ) : (
        <>
          {/* Summary */}
          <div className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="tp-kpis" style={{ marginBottom: summary?.totalScans ? 14 : 0 }}>
              {[
                ['Scans', summary?.totalScans ?? 0],
                ['Cases', summary?.uniqueCases ?? 0],
                ['Active Days', summary?.activeDays ?? 0],
                ['Avg / Day', summary?.avgPerActiveDay ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="tp-kpi-l">{label}</div>
                  <div className="tp-kpi-v">{value}</div>
                </div>
              ))}
            </div>
            {summary?.totalScans > 0 && <MiniSparkline dailyCounts={summary.dailyCounts} from={fromDate} to={toDate} />}
          </div>

          {/* Lab Share — compact component, calc unchanged */}
          {summary?.shareOfTotalPercent != null && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div className="tp-section-label" style={{ margin: 0 }}>Your Share of the Lab</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{summary.shareOfTotalPercent}%</div>
              </div>
              <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${Math.min(100, summary.shareOfTotalPercent)}%`, background: 'var(--accent)', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {summary.totalScans} of {summary.totalLabScans} lab scans in this range
              </div>
            </div>
          )}

          {/* Department breakdown — pie chart + exact counts */}
          {summary?.departmentBreakdown?.length > 0 && (
            <div className="card" style={{ padding: 16, marginBottom: 12 }}>
              <div className="tp-section-label">Department Breakdown</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={summary.departmentBreakdown} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} stroke="var(--surface)" label={({ label }) => label}>
                    {summary.departmentBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {summary.departmentBreakdown.map(d => (
                  <span key={d.code} className="tp-chip">{d.label} · {d.count}</span>
                ))}
              </div>
            </div>
          )}

          {/* Scan history */}
          <div className="tp-section-label"><MdCalendarToday size={12} /> Scan History</div>
          {scans.length === 0 ? (
            <div className="card" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><MdInbox size={24} /></div>
              <div style={{ fontSize: 13 }}>No scans in this range</div>
            </div>
          ) : (
            scans.map(s => (
              <div key={s.id} className="tp-row" style={{ '--row': STAGE_COLORS[s.stageName] || 'var(--accent)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tp-row-mono">{s.caseNumber || '—'}</div>
                  <div className="tp-row-title">{s.patientName}</div>
                  <div className="tp-row-sub">{s.workType} · {s.clinicName}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="tp-chip" style={{ marginBottom: 4 }}>{STAGE_LABELS[s.stageName] || s.stageName}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{format(new Date(s.scannedAt), 'dd MMM, h:mm a')}</div>
                </div>
              </div>
            ))
          )}
          {pagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Page {page} / {pagination.totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Request Goods (any lab tech, any department) ───────────
function RequestGoodsModal({ onClose }) {
  const { user } = useAuth();
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [department, setDepartment] = useState(user?.departments?.[0] || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ['inventory', 'items', 'active'],
    queryFn: () => api.get('/inventory/items', { params: { activeOnly: true } }).then(r => r.data),
  });

  const departmentOptions = (user?.departments?.length ? user.departments : ['GENERAL'])
    .map(code => DEPARTMENTS.find(d => d.code === code)?.label || code);

  const submit = async () => {
    if (!itemId || !quantity || !department) { toast.error('Item, quantity and department are required'); return; }
    setSaving(true);
    try {
      await api.post('/inventory/requests', { itemId, quantityRequested: parseInt(quantity), department, note: note.trim() || undefined });
      toast.success('Request sent to Inventory Manager');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not submit request');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tp-sheet-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-sheet">
        <div className="tp-sheet-grab" />
        <div className="tp-sheet-title"><MdAddBox size={17} /> Request Goods</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="tp-field-l">Item</div>
            <select className="tp-input" value={itemId} onChange={e => setItemId(e.target.value)}>
              <option value="">Select an item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </div>
          <div>
            <div className="tp-field-l">Quantity</div>
            <input className="tp-input" type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <div className="tp-field-l">Department</div>
            <select className="tp-input" value={department} onChange={e => setDepartment(e.target.value)}>
              {departmentOptions.map(label => <option key={label} value={label}>{label}</option>)}
            </select>
          </div>
          <div>
            <div className="tp-field-l">Note (optional)</div>
            <textarea className="tp-input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the Inventory Manager should know…"
              style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Record Blank Yield (Milling department only) ───────────
function MillingYieldModal({ onClose }) {
  const [blanksUsed, setBlanksUsed] = useState('1');
  const [crownsProduced, setCrownsProduced] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const crowns = parseInt(crownsProduced);
    if (!crowns || crowns <= 0) { toast.error('Enter how many crowns you produced'); return; }
    setSaving(true);
    try {
      const res = await api.post('/milling/yield', { blanksUsed: parseInt(blanksUsed) || 1, crownsProduced: crowns });
      if (res.data.bonusAwarded) {
        toast.success(`🎉 Bonus! +${res.data.bonusPoints} points for ${crowns} crowns from one blank`, { duration: 5000, icon: <MdCelebration size={18} /> });
      } else {
        toast.success('Yield recorded');
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record yield');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tp-sheet-scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tp-sheet">
        <div className="tp-sheet-grab" />
        <div className="tp-sheet-title"><MdSettings size={17} /> Record Blank Yield</div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14, marginTop: -6 }}>Yielding more than 30 crowns from one blank earns a bonus.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="tp-field-l">Blanks Used</div>
            <input className="tp-input" type="number" min="1" value={blanksUsed} onChange={e => setBlanksUsed(e.target.value)} />
          </div>
          <div>
            <div className="tp-field-l">Crowns Produced</div>
            <input className="tp-input" type="number" min="1" value={crownsProduced} onChange={e => setCrownsProduced(e.target.value)} autoFocus />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Yield'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bottom tab bar ────────────────────────────────────────
function TabBar({ tab, setTab, unreadCount }) {
  const TABS = [
    { id: 'scan', label: 'Scan', icon: MdQrCodeScanner },
    { id: 'performance', label: 'Performance', icon: MdInsights },
    { id: 'notifications', label: 'Alerts', icon: MdNotifications, badge: unreadCount },
    { id: 'profile', label: 'Profile', icon: MdPerson },
  ];
  return (
    <nav className="tp-nav">
      {TABS.map(t => (
        <button key={t.id} data-on={tab === t.id} onClick={() => setTab(t.id)}>
          <span className="tp-nav-ic">
            <t.icon size={20} />
            {t.badge > 0 && <span className="tp-nav-badge">{t.badge > 9 ? '9+' : t.badge}</span>}
          </span>
          <span className="tp-nav-lb">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ── Main Lab Tech Dashboard ───────────────────────────────
export default function LabDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('scan');
  const [department, setDepartment] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showRequestGoods, setShowRequestGoods] = useState(false);
  const [showMillingYield, setShowMillingYield] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanComment, setScanComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const confirmingRef = useRef(false); // guard: prevents double-submit

  const { unreadCount } = useNotifications(user?.id);

  useEffect(() => {
    if (!user?.id) return;
    socket.emit('join_user', user.id);
  }, [user?.id]);

  // Empty list = unrestricted (all 15). One department = auto-locked, no
  // picker needed. Multiple = picker shown, but restricted to just these.
  const myDepartments = user?.departments || [];
  const lockedDept = myDepartments.length === 1 ? myDepartments[0] : null;
  const pickableDepartments = myDepartments.length > 0
    ? DEPARTMENTS.filter(d => myDepartments.includes(d.code))
    : DEPARTMENTS;
  const queryClient = useQueryClient();

  // If locked dept from login, use it; otherwise use manually selected
  const activeDept = lockedDept || department;
  const selectedDept = DEPARTMENTS.find(d => d.code === activeDept);

  const handleScan = async (caseId) => {
    setShowScanner(false);
    setShowManual(false);
    if (!activeDept) {
      toast.error('Please select your department first');
      return;
    }
    try {
      const res = await api.get(`/lab/case/${caseId}`);
      setScanResult(res.data);
    } catch (err) {
      toast.error('Case not found. Invalid QR code.');
    }
  };

  const confirmScan = async () => {
    if (!scanResult || !activeDept) return;
    if (confirmingRef.current) return;   // block if already in-flight
    confirmingRef.current = true;
    setProcessing(true);
    try {
      const res = await api.post(`/scan/${scanResult.id}`, {
        department: activeDept,
        techName: user?.name,
        comment: scanComment.trim() || undefined,
      });
      toast.success(`${res.data.statusLabel} — logged successfully!`);
      setRecentScans(prev => [{ ...scanResult, dept: selectedDept?.label, scannedAt: new Date(), newStatus: res.data.newStatus }, ...prev.slice(0, 9)]);
      setScanResult(null);
      setScanComment('');
      queryClient.invalidateQueries({ queryKey: ['lab', 'active'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Scan failed');
    } finally {
      setProcessing(false);
      confirmingRef.current = false;     // release after request completes
    }
  };

  return (
    <div className="tp-shell" style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: 480, margin: '0 auto',
      background: 'var(--bg)',
    }}>
      <TechStyles />
      <InstallAppBanner />

      {/* ── Header — identity + current department + AttendanceClock.
          Everything else (Leave, Request Goods, Performance, Notifications,
          Logout) lives in its own tab / quick action below. ── */}
      <header style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: 'calc(env(safe-area-inset-top) + 10px) var(--tp-pad, 16px) 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--brand-tint)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <MdInventory2 size={19} style={{ color: 'var(--brand)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-1)', fontWeight: 600, fontSize: 13.5, lineHeight: 1.25 }}>Ye-Almaz Lab</div>
            <div style={{ color: 'var(--text-3)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name?.split(' ')[0] || 'Technician'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {selectedDept && (
            <span style={{
              maxWidth: '34vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              background: selectedDept.bg, border: `1px solid ${selectedDept.color}44`, borderRadius: 'var(--radius-pill)',
              padding: '4px 10px', fontSize: 11.5, fontWeight: 600, color: selectedDept.color,
            }}>
              {selectedDept.label}
            </span>
          )}
          <AttendanceClock />
        </div>
      </header>

      <div style={{ flex: 1, padding: 'var(--tp-pad, 16px)', paddingBottom: 28, overflowY: 'auto' }}>

        {tab === 'scan' && (
          <>
            {/* ── Department — locked from login OR selectable ── */}
            {lockedDept ? (
              <div style={{ marginBottom: 16 }}>
                <div className="tp-section-label">Your Department</div>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${selectedDept?.color}`,
                  borderRadius: 'var(--radius-md)', padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center', background: selectedDept?.bg, color: selectedDept?.color }}>
                    {selectedDept?.icon && <selectedDept.icon size={19} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-1)' }}>{selectedDept?.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Next → {selectedDept?.nextDept}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div className="tp-section-label">
                  {myDepartments.length > 0 ? 'Select Your Department' : 'Select Your Department (unrestricted)'}
                </div>
                <div className="tp-dept-grid">
                  {pickableDepartments.map(d => (
                    <button key={d.code} onClick={() => setDepartment(d.code)} className="tp-dept" data-on={department === d.code}
                      style={{ '--dept': d.color, '--deptbg': d.bg, position: 'relative' }}>
                      {department === d.code && <MdCheckCircle size={15} className="tp-dept-check" />}
                      <span className="tp-dept-ic"><d.icon size={17} /></span>
                      <span className="tp-dept-lb">{d.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Team leave requests — only renders anything for accounts
                designated as someone's manager (EmployeeProfile.managerId),
                e.g. an Operation Manager who stays logged in as LAB_TECH ── */}
            <TeamLeaveRequests hideEmpty />

            {/* ── Remake/redo review queue — only renders anything for
                LEADER/ADMIN accounts, same idea as the leave queue above ── */}
            <CaseReviewQueue hideEmpty />

            {/* ── SCAN ── */}
            {!activeDept ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdBackHand size={30} /></div>
                <div className="empty-title" style={{ fontSize: 15 }}>Select a department first</div>
                <p style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', maxWidth: 240, margin: '0 auto' }}>
                  Choose your department above, then scan.
                </p>
              </div>
            ) : (
              <>
                {/* Scan tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <button className="tp-tile tp-tile-primary" onClick={() => setShowScanner(true)}>
                    <MdPhotoCamera size={30} />
                    <span className="tp-tile-lb">Scan QR</span>
                    <span className="tp-tile-hint">Use camera</span>
                  </button>
                  <button className="tp-tile tp-tile-ghost" onClick={() => setShowManual(true)}>
                    <MdSearch size={30} />
                    <span className="tp-tile-lb">Search Case</span>
                    <span className="tp-tile-hint">Manual lookup</span>
                  </button>
                </div>

                {/* Quick actions — Milling-only yield tracking + goods request (any dept) */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {activeDept === 'MILLING' && (
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', gap: 8, borderColor: selectedDept.color, color: selectedDept.color }}
                      onClick={() => setShowMillingYield(true)}>
                      <MdCelebration size={16} /> Record Yield
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', gap: 8 }}
                    onClick={() => setShowRequestGoods(true)}>
                    <MdAddBox size={16} /> Request Goods
                  </button>
                </div>

                {/* Quick tip */}
                <div className="card" style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20, display: 'flex', gap: 8 }}>
                  <MdLightbulb size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--amber)' }} />
                  <span>Scan the QR code on the physical case. Each scan advances it to the <strong style={{ color: 'var(--text-2)' }}>{selectedDept.label}</strong> stage and notifies the clinic.</span>
                </div>

                {/* ── Session scans ── */}
                <div className="tp-section-label">Today's Scans</div>
                {recentScans.length === 0 ? (
                  <div className="card" style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><MdInbox size={24} /></div>
                    <div style={{ fontSize: 13 }}>No scans yet this session</div>
                  </div>
                ) : (
                  recentScans.map((s, i) => (
                    <div key={i} className="tp-row" style={{ '--row': STAGE_COLORS[s.newStatus] || 'var(--green)' }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="tp-row-mono">{s.caseNumber}</div>
                        <div className="tp-row-title">{s.patientName}</div>
                        <div className="tp-row-sub">{s.workType} · {s.clinic?.name}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="tp-chip" style={{ background: 'var(--green-dim)', color: 'var(--green)', borderColor: 'transparent', marginBottom: 4 }}>
                          <MdCheckCircle size={11} /> Scanned
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{format(new Date(s.scannedAt), 'h:mm a')}</div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}

        {tab === 'performance' && <PerformanceTab />}

        {tab === 'notifications' && (
          <div className="card" style={{ padding: 16 }}>
            <NotificationBell variant="full" />
          </div>
        )}

        {tab === 'profile' && (
          <div>
            <MyProfileTab />
            <div className="card" style={{ padding: 16, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <LeaveRequestButton />
              <button onClick={logout} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 12px',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--red-line)', background: 'var(--red-dim)',
                color: 'var(--red)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}>
                <MdLogout size={16} /> Logout
              </button>
            </div>
          </div>
        )}

      </div>

      <TabBar tab={tab} setTab={setTab} unreadCount={unreadCount} />

      {/* ── Modals ── */}
      {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      {showManual && <ManualEntryModal onSubmit={handleScan} onClose={() => setShowManual(false)} />}
      {showRequestGoods && <RequestGoodsModal onClose={() => setShowRequestGoods(false)} />}
      {showMillingYield && <MillingYieldModal onClose={() => setShowMillingYield(false)} />}
      {scanResult && (
        <ScanResultModal
          result={scanResult}
          department={activeDept}
          onConfirm={confirmScan}
          onClose={() => { setScanResult(null); setScanComment(''); }}
          loading={processing}
          comment={scanComment}
          onCommentChange={setScanComment}
        />
      )}
    </div>
  );
}
