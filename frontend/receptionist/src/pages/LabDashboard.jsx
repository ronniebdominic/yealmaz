import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

// ── Department config ─────────────────────────────────────
const DEPARTMENTS = [
  { code: 'PLASTER',      label: 'Plaster Department',   short: 'PLS', color: '#6A1B9A', bg: '#6A1B9A18', icon: '🏺',  nextDept: 'Margin Department' },
  { code: 'MARGIN',       label: 'Margin Department',    short: 'MRG', color: '#7B1FA2', bg: '#7B1FA218', icon: '✂️',  nextDept: 'Scanning' },
  { code: 'SCANNING',     label: 'Scanning',             short: 'SCN', color: '#1565C0', bg: '#1565C018', icon: '🔬',  nextDept: 'Designing' },
  { code: 'DESIGNING',    label: 'Designing',            short: 'DES', color: '#0277BD', bg: '#0277BD18', icon: '🖥️',  nextDept: 'Milling / Printing' },
  { code: 'MILLING',      label: 'Milling / Sintering',  short: 'MIL', color: '#E65100', bg: '#E6510018', icon: '⚙️',  nextDept: 'Metal Finishing' },
  { code: 'RESIN_PRINT',  label: 'Resin 3D Printing',    short: 'R3D', color: '#BF360C', bg: '#BF360C18', icon: '🖨️',  nextDept: 'Trimming' },
  { code: 'METAL_PRINT',  label: 'Metal 3D Printing',    short: 'M3D', color: '#4E342E', bg: '#4E342E18', icon: '🔩',  nextDept: 'Metal Finishing' },
  { code: 'METAL_FINISH', label: 'Metal Finishing',      short: 'MFN', color: '#795548', bg: '#79554818', icon: '🔨',  nextDept: 'Opaque Application' },
  { code: 'OPAQUE',       label: 'Opaque Application',   short: 'OPQ', color: '#F57F17', bg: '#F57F1718', icon: '🎨',  nextDept: 'Ceramic Layering' },
  { code: 'CERAMIC',      label: 'Ceramic Layering',     short: 'CER', color: '#D84315', bg: '#D8431518', icon: '🏛️',  nextDept: 'Glazing' },
  { code: 'ZIRCONIA',     label: 'Zirconia Fitting',     short: 'ZRC', color: '#00695C', bg: '#00695C18', icon: '💎',  nextDept: 'Glazing' },
  { code: 'GLAZING',      label: 'Glazing',              short: 'GLZ', color: '#00838F', bg: '#00838F18', icon: '✨',  nextDept: 'Quality Control' },
  { code: 'THERMO',       label: 'Thermo Press',         short: 'THP', color: '#C62828', bg: '#C6282818', icon: '🔥',  nextDept: 'Quality Control' },
  { code: 'TRIMMING',     label: 'Trimming',             short: 'TRM', color: '#558B2F', bg: '#558B2F18', icon: '✂️',  nextDept: 'Quality Control' },
  { code: 'QC',           label: 'Quality Control',      short: 'QC',  color: '#15803D', bg: '#15803D18', icon: '🔍',  nextDept: 'Ready to Dispatch' },
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
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>🔍 Search Case</div>
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

        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>✅ Case Found</div>
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
            <span style={{ fontSize: 12, background: dept?.bg, color: dept?.color, padding: '3px 10px', borderRadius: 20, fontWeight: 700, border: `1px solid ${dept?.color}40` }}>
              {dept?.icon} {dept?.label}
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

// ── Main Lab Tech Dashboard ───────────────────────────────
export default function LabDashboard() {
  const { user, logout } = useAuth();
  const [department, setDepartment] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanComment, setScanComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [recentScans, setRecentScans] = useState([]);
  const confirmingRef = useRef(false); // guard: prevents double-submit

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
      toast.success(`✅ ${res.data.statusLabel} — logged successfully!`);
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', maxWidth: 520, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ background: 'var(--navy)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🦷</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Ye-Almaz Lab</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Lab Floor Dashboard</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {selectedDept && (
            <div style={{ background: selectedDept.bg, border: `1px solid ${selectedDept.color}40`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: selectedDept.color }}>
              {selectedDept.label}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            👤 {user?.name?.split(' ')[0]}
          </div>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }} title="Logout">⏻</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>

        {/* ── Department — locked from login OR selectable ── */}
        {lockedDept ? (
          // Locked: dept comes from this account's login
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
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
          // Multiple departments (or none/flexible) — show selector, scoped to
          // this account's assigned departments if any are set.
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              {myDepartments.length > 0 ? 'Select Your Department' : 'Select Your Department (unrestricted)'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {pickableDepartments.map(d => (
                <button key={d.code} onClick={() => setDepartment(d.code)}
                  style={{
                    padding: '10px 8px', borderRadius: 10,
                    border: `2px solid ${department === d.code ? d.color : 'var(--border)'}`,
                    background: department === d.code ? d.bg : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: department === d.code ? d.color : 'var(--text-2)', lineHeight: 1.3 }}>{d.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}


        {/* ── SCAN ── */}
        <div>
            {!activeDept ? (
              <div className="empty-state">
                <div className="empty-icon">☝️</div>
                <div className="empty-title" style={{ fontSize: 16 }}>Select Department First</div>
                <p style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', maxWidth: 220 }}>
                  Choose your department above before scanning
                </p>
              </div>
            ) : (
              <>
                {/* Scan buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <button className="btn btn-primary" style={{ flexDirection: 'column', gap: 6, padding: '20px 12px', height: 'auto' }}
                    onClick={() => setShowScanner(true)}>
                    <span style={{ fontSize: 32 }}>📷</span>
                    <span style={{ fontSize: 13 }}>Scan QR Code</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Use camera</span>
                  </button>
                  <button className="btn btn-ghost" style={{ flexDirection: 'column', gap: 6, padding: '20px 12px', height: 'auto' }}
                    onClick={() => setShowManual(true)}>
                    <span style={{ fontSize: 32 }}>🔍</span>
                    <span style={{ fontSize: 13 }}>Search Case</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Manual lookup</span>
                  </button>
                </div>

                {/* Quick tip */}
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
                  💡 Scan the QR code attached to the physical case. Each scan advances the case to <strong style={{ color: 'var(--text-2)' }}>{selectedDept.label}</strong> stage and notifies the clinic.
                </div>

                {/* ── Scan History ── */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Today's Scans
                </div>
                {recentScans.length === 0 ? (
                  <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No scans yet this session</div>
                  </div>
                ) : (
                  recentScans.map((s, i) => (
                    <div key={i} style={{
                      background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                      border: '1px solid var(--border)', borderLeft: `3px solid ${STAGE_COLORS[s.newStatus] || 'var(--accent)'}`,
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
        </div>

      </div>

      {/* ── Modals ── */}
      {showScanner && <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      {showManual && <ManualEntryModal onSubmit={handleScan} onClose={() => setShowManual(false)} />}
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
