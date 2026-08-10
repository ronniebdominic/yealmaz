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
  MdNotifications,
} from 'react-icons/md';
import { todayLocal, toLocalDateString } from '../utils/date';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';
import TeamLeaveRequests from '../components/TeamLeaveRequests';
import InstallAppBanner from '../components/InstallAppBanner';
import NotificationBell from '../components/NotificationBell';
import MyProfileTab from '../components/MyProfileTab';
import { useNotifications } from '../hooks/useNotifications';

// ── Department config ─────────────────────────────────────
const DEPARTMENTS = [
  { code: 'PLASTER',      label: 'Plaster Department',   short: 'PLS', color: '#6A1B9A', bg: '#6A1B9A18', icon: MdScience,  nextDept: 'Margin Department' },
  { code: 'MARGIN',       label: 'Margin Department',    short: 'MRG', color: '#7B1FA2', bg: '#7B1FA218', icon: MdContentCut,  nextDept: 'Scanning' },
  { code: 'SCANNING',     label: 'Scanning',             short: 'SCN', color: '#1565C0', bg: '#1565C018', icon: MdBiotech,  nextDept: 'Designing' },
  { code: 'DESIGNING',    label: 'Designing',            short: 'DES', color: '#0277BD', bg: '#0277BD18', icon: MdComputer,  nextDept: 'Milling / Printing' },
  { code: 'MILLING',      label: 'Milling / Sintering',  short: 'MIL', color: '#E65100', bg: '#E6510018', icon: MdSettings,  nextDept: 'Metal Finishing' },
  { code: 'RESIN_PRINT',  label: 'Resin 3D Printing',    short: 'R3D', color: '#BF360C', bg: '#BF360C18', icon: MdPrint,  nextDept: 'Trimming' },
  { code: 'METAL_PRINT',  label: 'Metal 3D Printing',    short: 'M3D', color: '#4E342E', bg: '#4E342E18', icon: MdBuild,  nextDept: 'Metal Finishing' },
  { code: 'METAL_FINISH', label: 'Metal Finishing',      short: 'MFN', color: '#795548', bg: '#79554818', icon: MdBuild,  nextDept: 'Opaque Application' },
  { code: 'OPAQUE',       label: 'Opaque Application',   short: 'OPQ', color: '#F57F17', bg: '#F57F1718', icon: MdPalette,  nextDept: 'Ceramic Layering' },
  { code: 'CERAMIC',      label: 'Ceramic Layering',     short: 'CER', color: '#D84315', bg: '#D8431518', icon: MdAccountBalance,  nextDept: 'Glazing' },
  { code: 'ZIRCONIA',     label: 'Zirconia Fitting',     short: 'ZRC', color: '#00695C', bg: '#00695C18', icon: MdDiamond,  nextDept: 'Glazing' },
  { code: 'GLAZING',      label: 'Glazing',              short: 'GLZ', color: '#00838F', bg: '#00838F18', icon: MdAutoAwesome,  nextDept: 'Quality Control' },
  { code: 'THERMO',       label: 'Thermo Press',         short: 'THP', color: '#C62828', bg: '#C6282818', icon: MdLocalFireDepartment,  nextDept: 'Quality Control' },
  { code: 'TRIMMING',     label: 'Trimming',             short: 'TRM', color: '#558B2F', bg: '#558B2F18', icon: MdContentCut,  nextDept: 'Quality Control' },
  { code: 'QC',           label: 'Quality Control',      short: 'QC',  color: '#15803D', bg: '#15803D18', icon: MdSearch,  nextDept: 'Ready to Dispatch' },
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

const STAGE_COLORS = {
  CASE_ACCEPTED: '#3949AB', PLASTER_DEPARTMENT: '#6A1B9A', MARGIN_DEPARTMENT: '#7B1FA2',
  SCANNING: '#1565C0', DESIGNING: '#0277BD',
  MILLING_SINTERING: '#E65100', RESIN_3D_PRINTING: '#BF360C', METAL_3D_PRINTING: '#4E342E',
  METAL_FINISHING: '#795548', OPAQUE_APPLICATION: '#F57F17', CERAMIC_LAYERING: '#D84315',
  ZIRCONIA_FITTING_FINISHING: '#00695C', GLAZING: '#00838F', THERMO_PRESS: '#C62828', TRIMMING: '#558B2F',
  QUALITY_CHECK: '#15803D', PAYMENT_INVOICING: '#00695C',
  READY_TO_DISPATCH: '#0E7490', OUT_FOR_DELIVERY: '#B45309', DELIVERED: '#0F2044',
  ON_HOLD: '#B71C1C', REMAKE: '#6A1B9A', CANCELLED: '#424242',
};

const PIE_COLORS = ['#1A56A0', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0EA5E9', '#DB2777', '#0D9488'];

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
      position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.92)',
      backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#000', borderRadius: 20, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Scan QR Code</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Cancel
          </button>
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
              width: 200, height: 200, border: '2px solid rgba(255,255,255,0.8)', borderRadius: 12,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
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

        <div style={{ padding: '12px 18px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)', background: '#111' }}>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 20px 36px', animation: 'slideUp 0.2s ease' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><MdSearch size={17} /> Search Case</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input placeholder="Case number or patient name…" value={caseNum} onChange={e => setCaseNum(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14 }} />
          <button className="btn btn-primary" onClick={search} disabled={searching} style={{ flex: 0 }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {cases.map(c => (
            <div key={c.id} onClick={() => onSubmit(c.id)}
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.patientName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{c.caseNumber}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{c.workType} · {c.clinic?.name}</div>
                </div>
                <span style={{ fontSize: 11, background: STAGE_COLORS[c.status] + '20', color: STAGE_COLORS[c.status], padding: '3px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {STAGE_LABELS[c.status]}
                </span>
              </div>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 20px 40px', animation: 'slideUp 0.2s ease' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle size={19} color="var(--green)" /> Case Found</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Confirm scan at {dept?.label}</div>

        {/* Case card */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginBottom: 4 }}>{result.caseNumber}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{result.patientName}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>{result.workType} · {result.clinic?.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, background: STAGE_COLORS[result.status] + '20', color: STAGE_COLORS[result.status], padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
              {STAGE_LABELS[result.status]}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>→</span>
            <span style={{ fontSize: 12, background: dept?.bg, color: dept?.color, padding: '3px 10px', borderRadius: 20, fontWeight: 700, border: `1px solid ${dept?.color}40`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {dept?.icon && <dept.icon size={13} />} {dept?.label}
            </span>
          </div>
          {result.dueDate && (
            <div style={{ marginTop: 8, fontSize: 12, color: new Date(result.dueDate) < new Date() ? 'var(--red)' : 'var(--text-3)' }}>
              Due: {format(new Date(result.dueDate), 'dd MMM yyyy')}
            </div>
          )}
        </div>

        {/* Stage history */}
        {result.stages?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Recent Activity</div>
            {result.stages.slice(0, 3).map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{STAGE_LABELS[s.stageName]}</span>
                <span style={{ color: 'var(--text-3)' }}>{format(new Date(s.scannedAt), 'dd MMM, h:mm a')}</span>
              </div>
            ))}
          </div>
        )}

        {showComment && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Comment (optional) — visible to lab staff only, not the clinic
            </div>
            <textarea
              rows={2}
              value={comment}
              onChange={e => onCommentChange(e.target.value)}
              placeholder={`Note for other departments about this ${dept?.label.toLowerCase()} step…`}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', fontFamily: 'inherit', resize: 'vertical' }}
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
const RANGE_PRESETS = [
  { id: '7',  label: '7 Days' },
  { id: '30', label: '30 Days' },
  { id: '90', label: '90 Days' },
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
            background: i === buckets.length - 1 ? 'var(--accent)' : 'var(--accent)66',
          }}
        />
      ))}
    </div>
  );
}

function PerformanceTab() {
  const [rangeDays, setRangeDays] = useState('30');
  const [page, setPage] = useState(1);
  const toDate = todayLocal();
  const fromDate = (() => {
    const d = new Date(); d.setDate(d.getDate() - (parseInt(rangeDays) - 1));
    return toLocalDateString(d);
  })();

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {RANGE_PRESETS.map(p => (
          <button key={p.id} onClick={() => { setRangeDays(p.id); setPage(1); }}
            style={{
              flex: 1, padding: '8px 6px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: `2px solid ${rangeDays === p.id ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: rangeDays === p.id ? 'rgba(0,196,180,0.12)' : 'rgba(255,255,255,0.4)',
              color: rangeDays === p.id ? 'var(--accent)' : 'var(--text-2)',
            }}>
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
          <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: summary?.totalScans ? 14 : 0 }}>
              {[
                ['Scans', summary?.totalScans ?? 0],
                ['Cases', summary?.uniqueCases ?? 0],
                ['Active Days', summary?.activeDays ?? 0],
                ['Avg / Day', summary?.avgPerActiveDay ?? 0],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.25, minHeight: '2.4em' }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 'auto' }}>{value}</div>
                </div>
              ))}
            </div>
            {summary?.totalScans > 0 && <MiniSparkline dailyCounts={summary.dailyCounts} from={fromDate} to={toDate} />}
          </div>

          {/* Lab Share — highlighted, matching the app's Collection Rate bar convention */}
          {summary?.shareOfTotalPercent != null && (
            <div style={{ background: 'var(--accent)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Your Share of the Lab</div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${Math.min(100, summary.shareOfTotalPercent)}%`, background: '#fff', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {summary.shareOfTotalPercent}% — {summary.totalScans} of {summary.totalLabScans} lab scans in this range
              </div>
            </div>
          )}

          {/* Department breakdown — pie chart + exact counts */}
          {summary?.departmentBreakdown?.length > 0 && (
            <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>Department Breakdown</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={summary.departmentBreakdown} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={70} label={({ label }) => label}>
                    {summary.departmentBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {summary.departmentBreakdown.map(d => (
                  <span key={d.code} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                    {d.label} · {d.count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scan history */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <MdCalendarToday size={12} /> Scan History
          </div>
          {scans.length === 0 ? (
            <div className="glass-card" style={{ padding: '28px 16px', textAlign: 'center' }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><MdInbox size={28} /></div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No scans in this range</div>
            </div>
          ) : (
            scans.map(s => (
              <div key={s.id} className="glass-card" style={{
                padding: '11px 14px', marginBottom: 8, borderLeft: `3px solid ${STAGE_COLORS[s.stageName] || 'var(--accent)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{s.caseNumber || '—'}</div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-1)' }}>{s.patientName}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{s.workType} · {s.clinicName}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                    <div style={{ fontSize: 10.5, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '2px 7px', borderRadius: 20, fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap' }}>
                      {STAGE_LABELS[s.stageName] || s.stageName}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{format(new Date(s.scannedAt), 'dd MMM, h:mm a')}</div>
                  </div>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 20px 36px', animation: 'slideUp 0.2s ease' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}><MdAddBox size={17} /> Request Goods</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>ITEM</div>
            <select value={itemId} onChange={e => setItemId(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
              <option value="">Select an item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>QUANTITY</div>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>DEPARTMENT</div>
            <select value={department} onChange={e => setDepartment(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14 }}>
              {departmentOptions.map(label => <option key={label} value={label}>{label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>NOTE (OPTIONAL)</div>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the Inventory Manager should know…"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,32,68,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '20px 20px 36px', animation: 'slideUp 0.2s ease' }}>
        <div style={{ width: 36, height: 4, background: 'var(--border-2)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><MdSettings size={17} /> Record Blank Yield</div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>Yielding more than 30 crowns from one blank earns a bonus.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>BLANKS USED</div>
            <input type="number" min="1" value={blanksUsed} onChange={e => setBlanksUsed(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>CROWNS PRODUCED</div>
            <input type="number" min="1" value={crownsProduced} onChange={e => setCrownsProduced(e.target.value)} autoFocus
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
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
    <div className="glass-topbar" style={{
      position: 'sticky', bottom: 0, zIndex: 60, display: 'flex',
      padding: '8px 6px calc(6px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--glass-border)', borderBottom: 'none',
    }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 4px',
          background: 'none', border: 'none', cursor: 'pointer', color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
        }}>
          <div style={{ position: 'relative' }}>
            <t.icon size={21} />
            {t.badge > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -7, minWidth: 14, height: 14, borderRadius: 8, background: '#DC2626',
                color: '#fff', fontSize: 8.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              }}>{t.badge > 9 ? '9+' : t.badge}</span>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700 }}>{t.label}</span>
        </button>
      ))}
    </div>
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
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: 520, margin: '0 auto',
      background: 'linear-gradient(180deg, #E9F1FB 0%, #F2F6FB 45%, #ECF1F8 100%)',
    }}>
      <InstallAppBanner />

      {/* ── Header — decluttered to identity + dept badge + AttendanceClock;
          everything else (Leave, Request Goods, Performance, Notifications,
          Logout) moved into its own tab below. ── */}
      <div style={{ background: 'var(--navy)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <MdInventory2 size={20} color="#fff" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Ye-Almaz Lab</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name?.split(' ')[0]}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {selectedDept && (
            <div style={{ background: selectedDept.bg, border: `1px solid ${selectedDept.color}40`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: selectedDept.color }}>
              {selectedDept.label}
            </div>
          )}
          <AttendanceClock />
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>

        {tab === 'scan' && (
          <>
            {/* ── Department — locked from login OR selectable ── */}
            {lockedDept ? (
              <div className="glass-card" style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Your Department
                </div>
                <div style={{
                  background: selectedDept?.bg, border: `2px solid ${selectedDept?.color}40`,
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: selectedDept?.color }}>{selectedDept?.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Next → {selectedDept?.nextDept}</div>
                </div>
              </div>
            ) : (
              <div className="glass-card" style={{ marginBottom: 16, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  {myDepartments.length > 0 ? 'Select Your Department' : 'Select Your Department (unrestricted)'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {pickableDepartments.map(d => (
                    <button key={d.code} onClick={() => setDepartment(d.code)}
                      style={{
                        padding: '10px 8px', borderRadius: 10,
                        border: `2px solid ${department === d.code ? d.color : 'var(--glass-border)'}`,
                        background: department === d.code ? d.bg : 'rgba(255,255,255,0.4)',
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: department === d.code ? d.color : 'var(--text-2)', lineHeight: 1.3 }}>{d.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Team leave requests — only renders anything for accounts
                designated as someone's manager (EmployeeProfile.managerId),
                e.g. an Operation Manager who stays logged in as LAB_TECH ── */}
            <TeamLeaveRequests hideEmpty />

            {/* ── SCAN ── */}
            {!activeDept ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdBackHand size={32} /></div>
                <div className="empty-title" style={{ fontSize: 16 }}>Select Department First</div>
                <p style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', maxWidth: 220 }}>
                  Choose your department above before scanning
                </p>
              </div>
            ) : (
              <>
                {/* Scan buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <button className="btn btn-primary" style={{ flexDirection: 'column', gap: 6, padding: '20px 12px', height: 'auto' }}
                    onClick={() => setShowScanner(true)}>
                    <MdPhotoCamera size={32} />
                    <span style={{ fontSize: 13 }}>Scan QR Code</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Use camera</span>
                  </button>
                  <button className="btn btn-ghost" style={{ flexDirection: 'column', gap: 6, padding: '20px 12px', height: 'auto' }}
                    onClick={() => setShowManual(true)}>
                    <MdSearch size={32} />
                    <span style={{ fontSize: 13 }}>Search Case</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Manual lookup</span>
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
                <div className="glass-card" style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24, display: 'flex', gap: 6 }}>
                  <MdLightbulb size={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Scan the QR code attached to the physical case. Each scan advances the case to <strong style={{ color: 'var(--text-2)' }}>{selectedDept.label}</strong> stage and notifies the clinic.</span>
                </div>

                {/* ── Scan History ── */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Today's Scans
                </div>
                {recentScans.length === 0 ? (
                  <div className="glass-card" style={{ padding: '28px 16px', textAlign: 'center' }}>
                    <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><MdInbox size={28} /></div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No scans yet this session</div>
                  </div>
                ) : (
                  recentScans.map((s, i) => (
                    <div key={i} className="glass-card" style={{
                      padding: '12px 14px', marginBottom: 8, borderLeft: `3px solid ${STAGE_COLORS[s.newStatus] || 'var(--accent)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{s.caseNumber}</div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{s.patientName}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{s.workType} · {s.clinic?.name}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                          <div style={{ fontSize: 11, background: 'var(--green-dim)', color: 'var(--green)', padding: '2px 8px', borderRadius: 20, fontWeight: 700, marginBottom: 4 }}>✓ Scanned</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{format(new Date(s.scannedAt), 'h:mm a')}</div>
                        </div>
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
          <div className="glass-card" style={{ padding: 16 }}>
            <NotificationBell variant="full" />
          </div>
        )}

        {tab === 'profile' && (
          <div>
            <MyProfileTab />
            <div className="glass-card" style={{ padding: 16, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <LeaveRequestButton />
              <button onClick={logout} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 12px',
                borderRadius: 9, border: '1px solid rgba(220,38,38,0.3)', background: 'rgba(220,38,38,0.08)',
                color: '#DC2626', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
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
