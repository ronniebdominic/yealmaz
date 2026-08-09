import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import FilterBar from '../components/FilterBar';
import ExportMenu from '../components/ExportMenu';
import Odontogram from '../components/Odontogram';
import CaseDetailModal from '../components/CaseDetailModal';
import { printCaseLabel } from '../utils/printLabel';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  MdLocalShipping, MdBolt, MdSearch, MdBlock, MdAutorenew, MdLocalHospital,
  MdLocationOn, MdCall, MdPalette, MdInventory2, MdAssignment, MdTwoWheeler,
  MdPrecisionManufacturing, MdCelebration, MdCheckCircle, MdAutoAwesome,
  MdVisibility, MdPrint, MdDashboard, MdMoveToInbox, MdAdd,
  MdMedicalServices, MdLogout, MdPendingActions,
} from 'react-icons/md';
import { todayLocal, toLocalDateString } from '../utils/date';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';

// Common dental shade options
const SHADE_OPTIONS = [
  'A1','A2','A3','A3.5','A4',
  'B1','B2','B3','B4',
  'C1','C2','C3','C4',
  'D2','D3','D4',
  'BL1','BL2','BL3','BL4',
  'OM1','OM2','OM3',
  'W1','W2','W3',
  '0M1','0M2','0M3',
  'To Be Advised Later',
];

// ─── Stable sub-forms (module-level so React never unmounts on parent re-render) ─

// AcceptForm — owns all its form state locally so typing doesn't re-render parent
// Some legacy/imported cases carry a reference code or placeholder instead of a
// real patient name — treat those as "not provided" so the field starts blank
// and prompts the receptionist to fill in the actual name.
const PLACEHOLDER_NAME_RE = /^[A-Z]{2,4}-\d{4}-\d+$/;
const isPlaceholderName = (name) => !name || PLACEHOLDER_NAME_RE.test(name) || name === 'Imported Patient';

// Aligner cases (Clear Aligner, Clear Aligner Setup, …) are tracked by tray
// count, not tooth position — the odontogram doesn't apply to them.
const isAlignerWorkType = (wt) => /aligner/i.test(wt || '');
const TRAY_COUNT_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

// Debounced search-as-you-type picker for linking a remake/redo to the
// original case it's branching from (by scan number or patient name).
function OriginalCasePicker({ selected, onSelect, onClear }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/cases', { params: { search: query.trim(), limit: 8 } })
        .then(res => setResults(res.data.cases ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  if (selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <MdAssignment size={14} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="case-number">{selected.caseNumber || 'No scan #'}</span>{' '}
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{selected.patientName}{selected.workType ? ` · ${selected.workType}` : ''}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} style={{ color: 'var(--red)' }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        style={{ width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit' }}
        placeholder="Search scan number or patient name…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && query.trim() && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {searching ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>No matching cases</div>
          ) : results.map(rc => (
            <div key={rc.id}
              onMouseDown={() => { onSelect(rc); setQuery(''); setOpen(false); }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="case-number">{rc.caseNumber || 'No scan #'}</span>{' '}
              <strong>{rc.patientName}</strong>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {rc.clinic?.name}{rc.workType ? ` · ${rc.workType}` : ''}{rc.units ? ` · ${rc.units}u` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AcceptForm({ c, pricesData, priceMap, expressPriceMap, durationMap, expressDurMap, onAccept, onCancel, submitting }) {
  const [patientName, setPatientName] = useState(isPlaceholderName(c.patientName) ? '' : c.patientName);
  const [shade,       setShade]       = useState(c.shade        || '');
  const [workType,    setWorkType]    = useState((c.workType !== 'TBD' ? c.workType : '') || '');
  const [doctorName,  setDoctorName]  = useState(c.doctorName   || '');
  const [doctorPhone, setDoctorPhone] = useState(c.doctorPhone  || '');
  const [manualUnits, setManualUnits] = useState(c.units ? String(c.units) : '');
  // Pre-select teeth on the chart if the clinic already submitted a tooth list.
  const [selectedTeeth, setSelectedTeeth] = useState(() => {
    if (!c.toothNumbers) return [];
    return c.toothNumbers.split(',').map(t => parseInt(t.trim(), 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
  });
  const [orderType,   setOrderType]   = useState(c.deliveryType || 'NORMAL');
  const [totalAmount, setTotalAmount] = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [notes,       setNotes]       = useState('');
  // Remake/redo lineage — set when this newly-accepted case is actually a
  // remake/redo of an earlier (already delivered) case. This case still gets
  // its own new scan number; originalCase just links back to the earlier one.
  const [showLineage,   setShowLineage]   = useState(false);
  const [remake,        setRemake]        = useState(false);
  const [redo,          setRedo]          = useState(false);
  const [isRedo,        setIsRedo]        = useState(false);
  const [remakeReason,  setRemakeReason]  = useState('');
  const [originalCase,  setOriginalCase]  = useState(null);

  const flatRateMap = useMemo(
    () => Object.fromEntries(pricesData.map(p => [p.workType, !!p.isFlatRate])),
    [pricesData]
  );

  // Units follow the odontogram selection once teeth are picked (same rule as
  // New Case's tooth chart) — manual entry only applies when nothing's selected.
  const units = selectedTeeth.length > 0 ? String(selectedTeeth.length) : manualUnits;

  const calcPriceAndDate = (wt, ot, u) => {
    if (!wt || !priceMap[wt]) return;
    const isExp = ot === 'EXPRESS';
    const unitPrice = isExp && expressPriceMap[wt] != null ? expressPriceMap[wt] : (priceMap[wt] ?? null);
    if (unitPrice != null) {
      const count = flatRateMap[wt] ? 1 : Math.max(1, parseInt(u) || 1);
      setTotalAmount(String(unitPrice * count));
    }
    const days = isExp && expressDurMap[wt] ? expressDurMap[wt] : (durationMap[wt] ?? 5);
    const d = new Date(); d.setDate(d.getDate() + days);
    setDueDate(toLocalDateString(d));
  };

  const handleWT = (wt)  => {
    setWorkType(wt);
    if (isAlignerWorkType(wt)) {
      // Aligner cases are tracked by tray count, not tooth position or
      // shade — clear any odontogram selection so units falls back to the
      // tray-count dropdown, and clear shade since it isn't shown/required.
      if (selectedTeeth.length > 0) setSelectedTeeth([]);
      if (shade) setShade('');
    }
    calcPriceAndDate(wt, orderType, units);
  };
  const handleOT = (ot)  => { setOrderType(ot);   calcPriceAndDate(workType, ot, units); };
  const handleManualUnits = (u) => { setManualUnits(u); calcPriceAndDate(workType, orderType, u); };
  const toggleTooth = (num) => {
    setSelectedTeeth(prev => {
      const next = prev.includes(num) ? prev.filter(t => t !== num) : [...prev, num].sort((a, b) => a - b);
      calcPriceAndDate(workType, orderType, String(next.length || parseInt(manualUnits) || 1));
      return next;
    });
  };
  const clearTeeth = () => { setSelectedTeeth([]); calcPriceAndDate(workType, orderType, manualUnits); };

  // Picking the original/reference case pulls its patient & clinical details
  // straight into this form — it's the same patient and (usually) the same
  // work being redone, so there's no reason to re-type it. Price/due date are
  // still computed fresh from the current work type + units, not copied from
  // the old case (a remake is free, a redo is 50% — copying the old price
  // would be wrong).
  const handleSelectOriginal = (rc) => {
    setOriginalCase(rc);

    if (rc.patientName && !isPlaceholderName(rc.patientName)) setPatientName(rc.patientName);
    if (rc.doctorName) setDoctorName(rc.doctorName);
    if (rc.doctorPhone) setDoctorPhone(rc.doctorPhone);

    const wt = rc.workType && rc.workType !== 'TBD' ? rc.workType : workType;
    if (wt) setWorkType(wt);
    if (!isAlignerWorkType(wt) && rc.shade) setShade(rc.shade); else if (isAlignerWorkType(wt)) setShade('');

    const teeth = (!isAlignerWorkType(wt) && rc.toothNumbers)
      ? rc.toothNumbers.split(',').map(t => parseInt(t.trim(), 10)).filter(n => !isNaN(n)).sort((a, b) => a - b)
      : [];
    setSelectedTeeth(teeth);
    if (teeth.length === 0 && rc.units) setManualUnits(String(rc.units));

    const ot = rc.deliveryType || orderType;
    setOrderType(ot);

    const u = teeth.length > 0 ? String(teeth.length) : (rc.units ? String(rc.units) : units);
    calcPriceAndDate(wt, ot, u);
  };

  const inputSt = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit' };
  const lbl     = { fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 };

  const selWorkType = workType || c.workType || '';
  const isAligner   = isAlignerWorkType(selWorkType);
  const isExpress   = orderType === 'EXPRESS';
  const unitPrice   = isExpress && expressPriceMap[selWorkType] != null ? expressPriceMap[selWorkType] : (priceMap[selWorkType] ?? null);
  const count       = selWorkType && flatRateMap[selWorkType] ? 1 : Math.max(1, parseInt(units) || 1);
  const calcAmt     = unitPrice != null ? unitPrice * count : null;

  const submit = () => onAccept({
    shade, patientName, workType: selWorkType, doctorName, doctorPhone, units,
    toothNumbers: selectedTeeth.length > 0 ? selectedTeeth.join(', ') : undefined,
    orderType, totalAmount, dueDate, notes,
    remake: showLineage && remake, redo: showLineage && redo, isRedo: showLineage && isRedo,
    remakeReason: showLineage ? remakeReason : undefined,
    originalCaseId: showLineage ? originalCase?.id : undefined,
  });

  return (
    <div style={{ marginTop: 14, padding: '16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>
        ✓ Accept Case — Fill in Details & Assign Scan Number
      </div>
      {/* Patient Name */}
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>PATIENT NAME *</label>
        <input style={inputSt} placeholder="Patient's full name" value={patientName} onChange={e => setPatientName(e.target.value)} />
      </div>
      {/* Shade + Work Type */}
      <div style={{ display: 'grid', gridTemplateColumns: isAligner ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {!isAligner && (
          <div>
            <label style={lbl}>SHADE *</label>
            <select style={inputSt} value={shade} onChange={e => setShade(e.target.value)}>
              <option value="">— Select shade —</option>
              {SHADE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={lbl}>WORK TYPE *</label>
          <select style={inputSt} value={selWorkType} onChange={e => handleWT(e.target.value)}>
            <option value="">— Select work type —</option>
            {pricesData.map(p => <option key={p.workType} value={p.workType}>{p.workType} — Br {p.price?.toLocaleString('en-US')}</option>)}
          </select>
        </div>
      </div>
      {/* Tooth Numbers — odontogram (aligner cases track tray count instead) */}
      {!isAligner && (
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>TOOTH NUMBERS (ODONTOGRAM)</label>
          <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <Odontogram selected={selectedTeeth} onToggle={toggleTooth} onClear={clearTeeth} />
          </div>
          {c.toothNumbers && selectedTeeth.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Clinic submitted: "{c.toothNumbers}" — couldn't auto-mark on the chart, verify manually
            </div>
          )}
        </div>
      )}
      {/* Units + Order Type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          {isAligner ? (
            <>
              <label style={lbl}>NUMBER OF TRAYS</label>
              <select style={inputSt} value={units || ''} onChange={e => handleManualUnits(e.target.value)}>
                <option value="">— Select tray count —</option>
                {TRAY_COUNT_OPTIONS.map(n => <option key={n} value={n}>{n} tray{n > 1 ? 's' : ''}</option>)}
              </select>
            </>
          ) : (
            <>
              <label style={lbl}>UNITS{selectedTeeth.length > 0 && <span style={{ marginLeft: 6, fontWeight: 400 }}>(from chart)</span>}</label>
              <input type="number" min="1" style={{ ...inputSt, ...(selectedTeeth.length > 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
                placeholder="1" value={units} readOnly={selectedTeeth.length > 0}
                onChange={e => handleManualUnits(e.target.value)} />
            </>
          )}
        </div>
        <div>
          <label style={lbl}>ORDER TYPE</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: 'NORMAL', label: 'Normal', icon: MdLocalShipping }, { val: 'EXPRESS', label: 'Express', icon: MdBolt }].map(opt => (
              <button key={opt.val} type="button" onClick={() => handleOT(opt.val)} style={{
                flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                border: `2px solid ${orderType === opt.val ? (opt.val === 'EXPRESS' ? 'var(--amber)' : 'var(--blue)') : 'var(--border)'}`,
                background: orderType === opt.val ? (opt.val === 'EXPRESS' ? 'rgba(240,165,0,0.1)' : 'var(--blue-dim,#EEF2FF)') : 'var(--surface)',
                color: orderType === opt.val ? (opt.val === 'EXPRESS' ? 'var(--amber)' : 'var(--blue)') : 'var(--text-2)',
              }}><opt.icon size={14} /> {opt.label}</button>
            ))}
          </div>
        </div>
      </div>
      {/* Amount + Due Date */}
      {selWorkType && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>AMOUNT (BR){calcAmt != null && <span style={{ marginLeft: 6, fontWeight: 400, color: isExpress ? 'var(--amber)' : 'var(--green)' }}>auto: Br {calcAmt.toLocaleString('en-US')}</span>}</label>
            <input type="number" style={inputSt} placeholder="Auto-calculated" value={totalAmount || (calcAmt ?? '')} onChange={e => setTotalAmount(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>DUE DATE (auto)</label>
            <input type="date" style={inputSt} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
      )}
      {/* Doctor + Phone */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>DOCTOR'S NAME *{c.doctorName && !doctorName.trim() && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--green)' }}>✓ pre-filled</span>}</label>
          <input style={{ ...inputSt, ...(c.doctorName && !doctorName.trim() ? { background: 'var(--green-dim)', color: 'var(--green)' } : {}) }}
            placeholder="Dr. Ahmed" value={doctorName} onChange={e => setDoctorName(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>CONTACT / PHONE *{c.doctorPhone && !doctorPhone.trim() && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--green)' }}>✓ pre-filled</span>}</label>
          <input type="tel" style={{ ...inputSt, ...(c.doctorPhone && !doctorPhone.trim() ? { background: 'var(--green-dim)', color: 'var(--green)' } : {}) }}
            placeholder="+251 911 000 000" value={doctorPhone} onChange={e => setDoctorPhone(e.target.value)} />
        </div>
      </div>
      {/* Notes */}
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>NOTES / ACCEPTANCE NOTE</label>
        <textarea rows={3} style={{ ...inputSt, resize: 'vertical' }}
          placeholder="Additional instructions, observations, shade confirmation…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      {/* Remake/Redo lineage — new scan number, but linked back to the original case */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showLineage} onChange={e => setShowLineage(e.target.checked)} />
          <MdAutorenew size={14} /> This is a Remake / Redo of an earlier case
        </label>
        {showLineage && (
          <div style={{ marginTop: 10, padding: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={remake} onChange={e => setRemake(e.target.checked)} /> Remake (free)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={redo} onChange={e => setRedo(e.target.checked)} /> Redo (50%)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={isRedo} onChange={e => setIsRedo(e.target.checked)} /> Redo / Replacement (50%)
              </label>
            </div>
            {remake && (
              <input
                style={{ ...inputSt, marginBottom: 10 }}
                placeholder="Remake reason (e.g. shade mismatch, fit issue)…"
                value={remakeReason}
                onChange={e => setRemakeReason(e.target.value)}
              />
            )}
            <label style={lbl}>ORIGINAL / REFERENCE CASE</label>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
              Selecting a case fills in patient name, shade, doctor, and teeth/units from it automatically — review before accepting.
            </div>
            <OriginalCasePicker selected={originalCase} onSelect={handleSelectOriginal} onClear={() => setOriginalCase(null)} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
          {submitting ? 'Accepting…' : '✓ Accept & Assign Scan Number'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ReviewForm / RejectForm — same pattern: local state avoids parent re-renders
function SimpleNoteForm({ color, bg, border, title, placeholder, confirmLabel, onConfirm, onCancel, submitting }) {
  const [note, setNote] = useState('');
  return (
    <div style={{ marginTop: 14, padding: '16px', background: bg, borderRadius: 10, border: `1px solid ${border}` }}>
      <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 10 }}>{title}</div>
      <textarea rows={3} placeholder={placeholder} value={note} onChange={e => setNote(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: `1px solid ${border}`, background: '#fff', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-sm" onClick={() => onConfirm(note)} disabled={submitting}
          style={{ flex: 1, justifyContent: 'center', background: color, color: '#fff', border: 'none' }}>
          {submitting ? 'Saving…' : confirmLabel}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Data fetchers ────────────────────────────────────────
const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);

const PRODUCTION_STATUSES = [
  'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
  'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
  'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
  'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
].join(',');

// ─── Accept Cases Section ─────────────────────────────────
const inputSt = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit' };
const textareaSt = { ...inputSt, resize: 'vertical' };

function AcceptCasesSection({ queryClient }) {
  const [openId, setOpenId]         = useState(null);
  const [action, setAction]         = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [arrivedSearch, setArrivedSearch] = useState('');
  // NOTE: form state for the accept form now lives in <AcceptForm> (module-level component)
  // so typing in any field no longer re-renders AcceptCasesSection or remounts CaseCard.

  const { data: pricesData = [] } = useQuery({
    queryKey: ['prices'],
    queryFn: () => api.get('/prices').then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const priceMap        = useMemo(() => Object.fromEntries(pricesData.map(p => [p.workType, p.price])),               [pricesData]);
  const expressPriceMap = useMemo(() => Object.fromEntries(pricesData.filter(p => p.expressPrice).map(p => [p.workType, p.expressPrice])), [pricesData]);
  const durationMap     = useMemo(() => Object.fromEntries(pricesData.filter(p => p.durationDays).map(p => [p.workType, p.durationDays])), [pricesData]);
  const expressDurMap   = useMemo(() => Object.fromEntries(pricesData.filter(p => p.expressDurationDays).map(p => [p.workType, p.expressDurationDays])), [pricesData]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cases', 'to-accept'],
    queryFn: () => api.get('/cases', {
      params: { status: 'PENDING_PICKUP,PICKUP_ASSIGNED,UNDER_REVIEW', limit: 100 }
    }).then(r => r.data),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    refetch();
  };

  // Optimistically remove a case from the visible list immediately — no waiting for refetch
  const removeFromList = (caseId) => {
    queryClient.setQueryData(['cases', 'to-accept'], (old) => {
      if (!old) return old;
      return { ...old, cases: (old.cases ?? []).filter(c => c.id !== caseId) };
    });
  };

  const open = (id, act) => { setOpenId(openId === id && action === act ? null : id); setAction(act); };

  // handleAccept receives formData from <AcceptForm> — no closure over local state
  const handleAccept = async (c, formData) => {
    const effectivePatientName = formData.patientName?.trim() || (isPlaceholderName(c.patientName) ? '' : c.patientName.trim());
    const effectiveDoctorName  = formData.doctorName?.trim()  || c.doctorName?.trim();
    const effectiveDoctorPhone = formData.doctorPhone?.trim() || c.doctorPhone?.trim();

    if (!effectivePatientName)                     return toast.error('Patient name is required');
    if (!isAlignerWorkType(formData.workType || c.workType) && !formData.shade)
                                                    return toast.error('Shade is required');
    if (!formData.workType && !c.workType)         return toast.error('Work type is required');
    if (!effectiveDoctorName)                      return toast.error("Doctor's name is required");
    if (!effectiveDoctorPhone)                     return toast.error("Doctor's contact is required");

    setSubmitting(true);
    removeFromList(c.id);
    setOpenId(null);

    try {
      await api.post(`/cases/${c.id}/accept`, {
        shade:        formData.shade,
        patientName:  effectivePatientName,
        doctorName:   effectiveDoctorName,
        doctorPhone:  effectiveDoctorPhone,
        workType:     formData.workType || c.workType,
        units:        formData.units ? parseInt(formData.units) : undefined,
        toothNumbers: formData.toothNumbers || undefined,
        deliveryType: formData.orderType || 'NORMAL',
        totalAmount:  formData.totalAmount != null && formData.totalAmount !== '' ? parseFloat(formData.totalAmount) : undefined,
        dueDate:      formData.dueDate || undefined,
        notes:        formData.notes,
        remake:         formData.remake || undefined,
        redo:           formData.redo || undefined,
        isRedo:         formData.isRedo || undefined,
        remakeReason:   formData.remakeReason || undefined,
        originalCaseId: formData.originalCaseId || undefined,
      });
      toast.success('✓ Case accepted — scan number assigned');
      invalidate();
    } catch (err) {
      refetch();
      toast.error(err.response?.data?.error || 'Failed to accept case');
    } finally {
      setSubmitting(false);
    }
  };

  // handleReview / handleReject receive the note text directly from <SimpleNoteForm>
  const handleReview = async (c, note) => {
    setSubmitting(true);
    try {
      await api.patch(`/cases/${c.id}/status`, { status: 'UNDER_REVIEW', notes: note || 'Needs clarification from dentist' });
      toast.success('Case marked Under Review');
      setOpenId(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (c, note) => {
    if (!note?.trim()) return toast.error('Please enter a rejection reason');
    setSubmitting(true);
    try {
      await api.patch(`/cases/${c.id}/status`, { status: 'REJECTED', notes: note });
      toast.success('Case rejected');
      setOpenId(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const cases = data?.cases ?? [];
  const pending      = cases.filter(c => c.status === 'PENDING_PICKUP');
  // PICKUP_ASSIGNED + driver still assigned = still in transit (going to collect clinic)
  // Use assignedDeliveryId (scalar always on model) rather than assignedDelivery (relation)
  // to avoid false "arrived" when relation join is missing from the API response.
  const inTransit    = cases.filter(c => c.status === 'PICKUP_ASSIGNED' && (c.assignedDeliveryId || c.assignedDelivery?.id));
  // PICKUP_ASSIGNED + no driver = impression arrived at lab, driver was cleared after delivery
  const arrivedAtLabAll = cases.filter(c => c.status === 'PICKUP_ASSIGNED' && !c.assignedDeliveryId && !c.assignedDelivery?.id);
  const arrivedSearchQ = arrivedSearch.trim().toLowerCase();
  const arrivedAtLab = arrivedSearchQ
    ? arrivedAtLabAll.filter(c =>
        c.caseNumber?.toLowerCase().includes(arrivedSearchQ) ||
        c.patientName?.toLowerCase().includes(arrivedSearchQ) ||
        c.clinic?.name?.toLowerCase().includes(arrivedSearchQ))
    : arrivedAtLabAll;
  const underReview  = cases.filter(c => c.status === 'UNDER_REVIEW');

  const CaseCard = ({ c, canAct }) => {
    const isOpen  = openId === c.id;
    const accentColor = c.status === 'UNDER_REVIEW' ? '#1D4ED8'
      : c.status === 'PICKUP_ASSIGNED' ? 'var(--accent)' : 'var(--text-3)';

    return (
      <div style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${accentColor}`, padding: '14px 18px' }}>
        {/* Case info row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              {c.caseNumber
                ? <span className="case-number">{c.caseNumber}</span>
                : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--amber-dim)', color: 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>No Scan # Yet</span>
              }
              <StatusBadge status={c.status} />
              {c.deliveryType === 'EXPRESS' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(240,165,0,0.12)', color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><MdBolt size={12} /> Express</span>}
              {c.remake && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#FFF1F2', color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><MdAutorenew size={12} /> Remake</span>}
              {c.redo   && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><MdAutorenew size={12} /> Redo</span>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>
              {isPlaceholderName(c.patientName)
                ? <span style={{ color: 'var(--amber)', fontStyle: 'italic' }}>Patient name not provided</span>
                : c.patientName}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {c.workType && c.workType !== 'TBD' ? c.workType : <span style={{ color: 'var(--amber)' }}>Work type TBD</span>}
              {c.units != null ? ` · ${c.units} unit${c.units !== 1 ? 's' : ''}` : ''}{' · '}<MdLocalHospital size={12} /> {c.clinic?.name}
            </div>
            {c.clinic?.station && <div style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}><MdLocationOn size={12} /> Station: {c.clinic.station}</div>}
            {c.clinic?.phone && <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}><MdCall size={12} /> {c.clinic.phone}</div>}
            {c.clinic?.address && <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}><MdLocationOn size={12} /> {c.clinic.address}</div>}
            {c.doctorName && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><MdMedicalServices size={12} /> {c.doctorName}{c.doctorPhone ? ` · ${c.doctorPhone}` : ''}</div>}
            {c.shade && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><MdPalette size={12} /> Shade: <strong>{c.shade}</strong></div>}
            {c.toothNumbers && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><MdInventory2 size={12} /> Teeth: <strong>{c.toothNumbers}</strong></div>}
            {c.notes && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><MdAssignment size={12} /> {c.notes}</div>}
            {c.assignedDelivery && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}><MdTwoWheeler size={12} /> {c.assignedDelivery.name.replace('Yealmaz Delivery Executive ', 'Driver ')}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Registered {format(new Date(c.createdAt), 'dd MMM yyyy, h:mm a')}
            </div>
          </div>

          {/* Action buttons */}
          {canAct && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => open(c.id, 'accept')}
                style={{ whiteSpace: 'nowrap' }}
              >
                <MdCheckCircle className="mi" size={14} /> Accept
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => open(c.id, 'review')}
                style={{ color: '#1D4ED8', whiteSpace: 'nowrap' }}
              >
                <MdSearch className="mi" size={14} /> Under Review
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => open(c.id, 'reject')}
                style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}
              >
                <MdBlock className="mi" size={14} /> Reject
              </button>
            </div>
          )}
          {!canAct && (
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', flexShrink: 0 }}>Awaiting pickup</span>
          )}
        </div>

        {/* ── Accept form — rendered as a stable module-level component so typing
             doesn't re-render AcceptCasesSection and remount CaseCard ── */}
        {isOpen && action === 'accept' && (() => {
          // This IIFE only evaluates once when action==='accept', not on typing.
          // All typing state lives inside <AcceptForm>.
          return (

            <AcceptForm
              c={c}
              pricesData={pricesData}
              priceMap={priceMap}
              expressPriceMap={expressPriceMap}
              durationMap={durationMap}
              expressDurMap={expressDurMap}
              submitting={submitting}
              onAccept={(formData) => handleAccept(c, formData)}
              onCancel={() => setOpenId(null)}
            />
          );
        })()}

        {/* ── Under Review form ── */}
        {isOpen && action === 'review' && (
          <SimpleNoteForm
            color="#1D4ED8" bg="#EFF6FF" border="#BFDBFE"
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdSearch size={14} /> Under Review — What information is needed from the dentist?</span>}
            placeholder="e.g. Shade not specified. Need confirmation of tooth 14 preparation type."
            confirmLabel="Mark Under Review"
            submitting={submitting}
            onConfirm={(note) => handleReview(c, note)}
            onCancel={() => setOpenId(null)}
          />
        )}

        {/* ── Reject form ── */}
        {isOpen && action === 'reject' && (
          <SimpleNoteForm
            color="var(--red)" bg="#FFF1F2" border="#FECACA"
            title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdBlock size={14} /> Reject Case — Please enter the reason</span>}
            placeholder="e.g. Impression quality too poor to work with. Please retake."
            confirmLabel="Confirm Rejection"
            submitting={submitting}
            onConfirm={(note) => handleReject(c, note)}
            onCancel={() => setOpenId(null)}
          />
        )}
      </div>
    );
  };

  if (isLoading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>;

  return (
    <>
      {/* Under Review */}
      {underReview.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdSearch className="mi" size={15} /> Under Review</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{underReview.length} awaiting dentist info</span>
          </div>
          <div>{underReview.map(c => <CaseCard key={c.id} c={c} canAct />)}</div>
        </div>
      )}

      {/* Arrived at Lab — highest priority, needs immediate acceptance */}
      {arrivedAtLabAll.length > 0 && (
        <div className="card" style={{ marginBottom: 16, border: '2px solid var(--blue)' }}>
          <div className="card-header" style={{ background: 'var(--blue)', borderRadius: '10px 10px 0 0' }}>
            <div className="card-title" style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}><MdPrecisionManufacturing className="mi" size={15} /> Arrived at Lab — Needs Acceptance</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                {arrivedAtLab.length} case{arrivedAtLab.length !== 1 ? 's' : ''} awaiting review
              </span>
              <ExportMenu
                data={arrivedAtLab}
                columns={[
                  { header: 'Case #',    value: c => c.caseNumber ?? '' },
                  { header: 'Clinic',    value: c => c.clinic?.name },
                  { header: 'Patient',   value: c => c.patientName },
                  { header: 'Work Type', value: c => c.workType },
                  { header: 'Units',     value: c => c.units ?? '' },
                  { header: 'Status',    value: c => c.status },
                  { header: 'Payment',   value: c => c.paymentStatus },
                  { header: 'Amount',    value: c => c.totalAmount ?? '' },
                ]}
                filename="arrived-at-lab"
                title="Arrived at Lab"
              />
            </div>
          </div>
          <div style={{ background: '#EFF6FF', padding: '8px 16px', fontSize: 12, color: '#1D4ED8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MdInventory2 size={14} /> The delivery driver has brought these impressions to the lab. Please review and Accept, reject, or put Under Review.
          </div>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="search-input" style={{ margin: 0, maxWidth: 320 }}>
              <span className="icon mi"><MdSearch size={16} /></span>
              <input
                placeholder="Case number, patient, or clinic…"
                value={arrivedSearch}
                onChange={e => setArrivedSearch(e.target.value)}
              />
            </div>
          </div>
          {arrivedAtLab.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon mi"><MdSearch size={28} /></div>
              <div className="empty-title">No matches</div>
              <p>No arrived case matches "{arrivedSearch}".</p>
            </div>
          ) : (
            <div>{arrivedAtLab.map(c => <CaseCard key={c.id} c={c} canAct />)}</div>
          )}
        </div>
      )}

      {/* In Transit — driver is still going to the clinic */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdTwoWheeler className="mi" size={15} /> In Transit</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{inTransit.length} case{inTransit.length !== 1 ? 's' : ''}</span>
        </div>
        {inTransit.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon mi"><MdCelebration size={32} /></div>
            <div className="empty-title">No cases in transit</div>
            <p>Cases where a driver is on the way to collect the impression will appear here.</p>
          </div>
        ) : (
          <div>{inTransit.map(c => <CaseCard key={c.id} c={c} canAct={false} />)}</div>
        )}
      </div>

      {/* Awaiting Pickup — no driver assigned yet */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdAssignment className="mi" size={15} /> Awaiting Pickup</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pending.length} case{pending.length !== 1 ? 's' : ''}</span>
        </div>
        {pending.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon mi"><MdCheckCircle size={32} /></div>
            <div className="empty-title">No cases waiting for pickup</div>
          </div>
        ) : (
          <div>{pending.map(c => <CaseCard key={c.id} c={c} canAct={false} />)}</div>
        )}
      </div>
    </>
  );
}

// ─── Ready Orders Section ─────────────────────────────────
// Mirrors Dispatch dashboard exactly:
// FINAL DEFINITION:
// Ready for Delivery = READY_TO_DISPATCH + payment NOT yet verified (QC done, awaiting payment)
// Ready for Dispatch = READY_TO_DISPATCH + payment VERIFIED (can be dispatched at any time)

const CASE_COLS = [
  { header: 'Case #',        value: c => c.caseNumber ?? '' },
  { header: 'Clinic',        value: c => c.clinic?.name },
  { header: 'Patient',       value: c => c.patientName },
  { header: 'Work Type',     value: c => c.workType },
  { header: 'Units',         value: c => c.units ?? '' },
  { header: 'Amount (Br)',   value: c => c.payment?.amount ?? c.totalAmount ?? '' },
  { header: 'Payment',       value: c => c.paymentStatus },
  { header: 'Delivery Date', value: c => c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '' },
  { header: 'Order Date',    value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
];

function OrdersTab({ status, paymentVerified, title, icon, emptyText, emptyNote, accentColor, applied, page, setPage }) {
  const params = (extra = {}) => ({
    status,
    // paymentVerified: true → VERIFIED only; false → everything else; undefined → all
    ...(paymentVerified === true  ? { paymentStatus: 'VERIFIED' }                                          : {}),
    ...(paymentVerified === false ? { paymentStatus: 'PENDING,PAYMENT_REQUESTED,SCREENSHOT_UPLOADED,REJECTED' } : {}),
    ...(applied.search   ? { search: applied.search }     : {}),
    ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
    ...(applied.dateTo   ? { dateTo: applied.dateTo }     : {}),
    ...extra,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ready-orders', status, paymentVerified, applied, page],
    queryFn: () => api.get('/cases', { params: params({ limit: 20, page }) }).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const fetchAll = () => api.get('/cases', { params: params({ limit: 1000 }) }).then(r => r.data.cases ?? []);
  const cases      = data?.cases ?? [];
  const pagination = data?.pagination ?? {};
  const Icon = icon;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title" style={{ color: accentColor, display: 'flex', alignItems: 'center', gap: 6 }}>{Icon && <Icon className="mi" size={15} />} {title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {pagination.total != null && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pagination.total} case{pagination.total !== 1 ? 's' : ''}</span>
          )}
          <ExportMenu fetchData={fetchAll} columns={CASE_COLS} filename={title.toLowerCase().replace(/ /g, '-')} title={title} />
        </div>
      </div>
      <div className="table-wrap">
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon mi"><MdCelebration size={32} /></div>
            <div className="empty-title">{emptyText}</div>
            <p>{emptyNote}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case #</th><th>Clinic</th><th>Patient</th><th>Work Type</th>
                <th>Units</th><th>Amount</th><th>Payment</th><th>Delivery Date</th><th>Order Date</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td>{c.caseNumber ? <span className="case-number">{c.caseNumber}</span> : <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>—</span>}</td>
                  <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                  <td><span className="patient-name">{c.patientName}</span></td>
                  <td style={{ fontSize: 13 }}>{c.workType}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{c.units ?? '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--green)' }}>
                    {c.payment?.amount != null ? `Br ${c.payment.amount.toLocaleString('en-US')}` :
                     c.totalAmount != null ? `Br ${c.totalAmount.toLocaleString('en-US')}` : '—'}
                  </td>
                  <td><PaymentBadge status={c.paymentStatus} /></td>
                  <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)', fontWeight: c.deliveryDate ? 600 : 400 }}>
                    {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(c.createdAt), 'dd MMM yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
          <span style={{ color: 'var(--text-3)' }}>Page {page} of {pagination.totalPages}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>← Prev</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadyOrdersSection() {
  const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch' | 'delivery'
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [applied, setApplied]   = useState({ search: '', dateFrom: '', dateTo: '' });
  const [pageDispatch, setPageDispatch] = useState(1);
  const [pageDelivery, setPageDelivery] = useState(1);

  const apply = () => { setApplied({ search, dateFrom, dateTo }); setPageDispatch(1); setPageDelivery(1); };
  const clear  = () => { setSearch(''); setDateFrom(''); setDateTo(''); setApplied({ search: '', dateFrom: '', dateTo: '' }); setPageDispatch(1); setPageDelivery(1); };

  return (
    <>
      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FilterBar
            search={search} onSearch={setSearch}
            dateFrom={dateFrom} onDateFrom={setDateFrom}
            dateTo={dateTo} onDateTo={setDateTo}
            placeholder="Clinic name, case no., patient…"
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={apply}>Apply</button>
            {(applied.search || applied.dateFrom || applied.dateTo) && (
              <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher — mirrors Dispatch dashboard exactly */}
      <div className="filters" style={{ marginBottom: 14 }}>
        <button
          className={`filter-chip${activeTab === 'dispatch' ? ' active' : ''}`}
          onClick={() => setActiveTab('dispatch')}
          style={activeTab === 'dispatch' ? { background: 'var(--amber)', color: '#fff' } : {}}
        >
          <MdInventory2 className="mi" size={14} /> Ready for Delivery
          <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.8 }}>QC done · awaiting payment</span>
        </button>
        <button
          className={`filter-chip${activeTab === 'delivery' ? ' active' : ''}`}
          onClick={() => setActiveTab('delivery')}
          style={activeTab === 'delivery' ? { background: 'var(--green)', color: '#fff' } : {}}
        >
          <MdLocalShipping className="mi" size={14} /> Ready for Dispatch
          <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.8 }}>Payment verified · assign driver</span>
        </button>
      </div>

      {/* Ready for Delivery = READY_TO_DISPATCH + payment NOT yet verified */}
      {activeTab === 'dispatch' && (
        <OrdersTab
          status="READY_TO_DISPATCH"
          paymentVerified={false}
          title="Ready for Delivery"
          icon={MdInventory2}
          accentColor="var(--amber)"
          emptyText="No cases awaiting payment"
          emptyNote="Cases that passed QC will appear here. Finance needs to request and verify payment before dispatch."
          applied={applied}
          page={pageDispatch}
          setPage={setPageDispatch}
        />
      )}

      {/* Ready for Dispatch = READY_TO_DISPATCH + payment VERIFIED */}
      {activeTab === 'delivery' && (
        <OrdersTab
          status="READY_TO_DISPATCH"
          paymentVerified={true}
          title="Ready for Dispatch"
          icon={MdLocalShipping}
          accentColor="var(--green)"
          emptyText="No cases cleared for dispatch"
          emptyNote="Cases appear here once payment is verified by Finance. Dispatch will assign a driver."
          applied={applied}
          page={pageDelivery}
          setPage={setPageDelivery}
        />
      )}
    </>
  );
}

// ─── In Finishing Section ─────────────────────────────────
// Informational only — notifies reception once a case REACHES a finishing
// stage (Metal Finishing for metal/PFM work, Zirconia Fitting & Finishing
// for zirconia work). Backed by a rolling log of finishing scans (last 3
// days), not the case's live status — techs often scan a case through
// several stages within minutes, so filtering on "current status" would
// make it disappear from this list before reception ever sees it.
const FINISHING_LABELS = { METAL_FINISHING: 'Metal Finishing', ZIRCONIA_FITTING_FINISHING: 'Zirconia Fitting & Finishing' };

function FinishingSection() {
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [viewCase, setViewCase] = useState(null);

  const { data: log = [], isLoading } = useQuery({
    queryKey: ['cases', 'finishing-log'],
    queryFn: () => api.get('/cases/finishing-log').then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d; })() : null;
    return log.filter(c => {
      if (q && !c.clinic?.name?.toLowerCase().includes(q) &&
               !c.caseNumber?.toLowerCase().includes(q) &&
               !c.patientName?.toLowerCase().includes(q)) return false;
      if (from && new Date(c.finishingScannedAt) < from) return false;
      if (to   && new Date(c.finishingScannedAt) > to)   return false;
      return true;
    });
  }, [log, search, dateFrom, dateTo]);

  return (
    <>
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FilterBar
            search={search} onSearch={setSearch}
            dateFrom={dateFrom} onDateFrom={setDateFrom}
            dateTo={dateTo} onDateTo={setDateTo}
            placeholder="Clinic name, case no., patient…"
            style={{ flex: 1 }}
          />
        </div>
      </div>

      <div style={{ padding: '10px 18px', background: '#F5F3FF', borderRadius: 10, marginBottom: 14, fontSize: 12, color: '#5B21B6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <MdAutoAwesome size={14} /> These cases have <strong>reached a finishing stage</strong> (Metal Finishing or Zirconia Fitting & Finishing) in the last 3 days — informational only. They stay listed here even after moving on to Ceramic/Glazing/QC, so you don't miss one that moved through quickly.
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 6 }}><MdAutoAwesome className="mi" size={15} /> In Finishing</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{filtered.length} case{filtered.length !== 1 ? 's' : ''}</span>
            <ExportMenu
              data={filtered}
              columns={[
                { header: 'Clinic',            value: c => c.clinic?.name },
                { header: 'Patient',            value: c => c.patientName },
                { header: 'Case #',             value: c => c.caseNumber },
                { header: 'Work Type',          value: c => c.workType },
                { header: 'Units',              value: c => c.units ?? '' },
                { header: 'Zone',                value: c => c.clinic?.zone?.name ?? '' },
                { header: 'Finishing Stage',    value: c => FINISHING_LABELS[c.finishingStage] || c.finishingStage },
                { header: 'Reached Finishing',  value: c => format(new Date(c.finishingScannedAt), 'dd MMM yyyy, h:mm a') },
                { header: 'Scanned By',         value: c => c.finishingScannedBy },
                { header: 'Current Status',     value: c => c.status },
              ]}
              filename="in-finishing"
              title="In Finishing"
            />
          </div>
        </div>
        <div className="table-wrap">
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon mi"><MdAutoAwesome size={32} /></div>
              <div className="empty-title">No cases in finishing right now</div>
              <p>Cases will show up here as soon as the lab scans them into Metal Finishing or Zirconia Fitting & Finishing, and stay listed for 3 days.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Case #</th><th>Clinic</th><th>Patient</th><th>Work Type</th>
                  <th>Units</th><th>Zone</th><th>Finishing Stage</th><th>Reached Finishing</th><th>Scanned By</th><th>Current Status</th>
                  <th style={{ minWidth: 170 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td>{c.caseNumber ? <span className="case-number">{c.caseNumber}</span> : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                    <td><span className="patient-name">{c.patientName}</span></td>
                    <td style={{ fontSize: 13 }}>{c.workType}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{c.units ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{c.clinic?.zone?.name || '—'}</td>
                    <td style={{ fontSize: 12 }}>{FINISHING_LABELS[c.finishingStage] || c.finishingStage}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(c.finishingScannedAt), 'dd MMM yyyy, h:mm a')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.finishingScannedBy || '—'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setViewCase(c)}><MdVisibility className="mi" size={14} /> View</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={!c.qrCodeUrl}
                          title={c.qrCodeUrl ? 'Print production label' : 'No QR code on this case yet'}
                          onClick={() => printCaseLabel(c)}
                        >
                          <MdPrint className="mi" size={14} /> Print Label
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {viewCase && (
        <CaseDetailModal caseId={viewCase.id} onClose={() => setViewCase(null)} />
      )}
    </>
  );
}

// ─── Track Order Section ──────────────────────────────────
function TrackOrderSection() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['track-order', submitted],
    queryFn: () => submitted
      ? api.get('/cases', { params: { search: submitted, limit: 100 } }).then(r => r.data)
      : null,
    enabled: !!submitted,
    staleTime: 30_000,
  });

  const cases = data?.cases ?? [];

  return (
    <>
      <div className="card" style={{ marginBottom: 16, padding: '18px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><MdSearch size={16} /> Search / Track Order Status</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="search-input" style={{ flex: 1, margin: 0 }}>
            <span className="icon mi"><MdSearch size={16} /></span>
            <input
              placeholder="Case number, patient name, or clinic…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setSubmitted(search)}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setSubmitted(search)} disabled={!search.trim()}>
            Search
          </button>
          {submitted && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSubmitted(''); }}>Clear</button>
          )}
        </div>
      </div>

      {submitted && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Results for "{submitted}"</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {data && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.pagination?.total ?? cases.length} found</span>}
              <ExportMenu
                data={cases}
                columns={[
                  { header: 'Case #',         value: c => c.caseNumber ?? '' },
                  { header: 'Clinic',         value: c => c.clinic?.name },
                  { header: 'Patient',        value: c => c.patientName },
                  { header: 'Work Type',      value: c => c.workType },
                  { header: 'Units',          value: c => c.units ?? '' },
                  { header: 'Status',         value: c => c.status },
                  { header: 'Payment',        value: c => c.paymentStatus },
                  { header: 'Delivery Date',  value: c => c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '' },
                  { header: 'Registered',     value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
                ]}
                filename={`case-search-${submitted}`}
                title={`Search: ${submitted}`}
              />
            </div>
          </div>
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Searching…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdSearch size={32} /></div>
                <div className="empty-title">No cases found</div>
                <p>Try a different case number, patient name, or clinic.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
                    <th>Units</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Delivery Date</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td>
                        {c.caseNumber
                          ? <span className="case-number">{c.caseNumber}</span>
                          : <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>—</span>
                        }
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                      <td>
                        <span className="patient-name">
                          {c.patientName && c.patientName.match(/^[A-Z]{2,3}-\d{4}-\d+$/)
                            ? <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11 }}>—</span>
                            : c.patientName || '—'
                          }
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{c.workType}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{c.units ?? '—'}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                      <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)', fontWeight: c.deliveryDate ? 600 : 400 }}>
                        {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Reception Dashboard ─────────────────────────────
const SECTIONS = [
  { id: 'dashboard',  label: 'Dashboard',      icon: MdDashboard },
  { id: 'accept',     label: 'Accept Case',    icon: MdMoveToInbox },
  { id: 'finishing',  label: 'In Finishing',   icon: MdAutoAwesome },
  { id: 'ready',      label: 'Ready Orders',   icon: MdLocalShipping },
  { id: 'track',      label: 'Track Order',    icon: MdSearch },
];

export default function Dashboard() {
  const navigate    = useNavigate();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [section, setSection] = useState('dashboard');
  const [open, setOpen]       = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Counts for badges
  const { data: acceptBadge } = useQuery({
    queryKey: ['cases', 'accept-badge'],
    queryFn: () => api.get('/cases', { params: { status: 'PICKUP_ASSIGNED', limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: readyBadge } = useQuery({
    queryKey: ['cases', 'ready-badge'],
    // Badge shows total of READY_TO_DISPATCH + OUT_FOR_DELIVERY
    queryFn: async () => {
      const [dispatch, delivery] = await Promise.all([
        api.get('/cases', { params: { status: 'READY_TO_DISPATCH', limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
        api.get('/cases', { params: { status: 'OUT_FOR_DELIVERY',  limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
      ]);
      return dispatch + delivery;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  // Same queryKey + queryFn shape as FinishingSection's own useQuery below —
  // React Query dedupes by key alone, so a mismatched shape here (e.g.
  // returning a count instead of the array) would silently clobber the other
  // observer's data and crash FinishingSection's log.filter(...).
  const { data: finishingLog = [] } = useQuery({
    queryKey: ['cases', 'finishing-log'],
    queryFn: () => api.get('/cases/finishing-log').then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
  const finishingBadge = finishingLog.length;

  const { stats } = summary || {};
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'RX';

  const nav = (id) => { setSection(id); setOpen(false); };

  const badges = {
    accept:    acceptBadge    || 0,
    finishing: finishingBadge || 0,
    ready:     readyBadge     || 0,
  };

  const NavList = ({ close }) => (
    <nav className="sidebar-nav">
      <div className="nav-section-label">Reception</div>
      {SECTIONS.map(s => (
        <button
          key={s.id}
          className={`nav-item${section === s.id ? ' active' : ''}`}
          onClick={() => { setSection(s.id); if (close) close(); }}
        >
          <s.icon className="mi" size={17} /> {s.label}
          {badges[s.id] > 0 && <span className="badge-count">{badges[s.id]}</span>}
        </button>
      ))}

      <div className="nav-section-label">Cases</div>
      <button className="nav-item" onClick={() => navigate('/cases/new')}>
        <MdAdd className="mi" size={17} /> New Case
      </button>
      <button className="nav-item" onClick={() => navigate('/cases')}>
        <MdAssignment className="mi" size={17} /> All Cases
      </button>
    </nav>
  );

  return (
    <div className="app">
      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {(() => { const Icon = SECTIONS.find(s => s.id === section)?.icon; return Icon ? <Icon className="mi" size={16} /> : null; })()}
          {SECTIONS.find(s => s.id === section)?.label ?? 'Reception'}
        </span>
        <div className="live-dot" />
      </div>

      {/* Drawer overlay */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* Drawer */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">Receptionist</span>
        </div>
        <NavList close={() => setOpen(false)} />
        <div className="drawer-footer">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}><AttendanceClock /> <LeaveRequestButton /></div>
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div><div className="user-name">{user?.name}</div><div className="user-role">Receptionist</div></div>
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
          </div>
        </div>
      </div>

      {/* Sidebar (desktop) */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">Receptionist</span>
        </div>
        <NavList />
        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}><AttendanceClock /> <LeaveRequestButton /></div>
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div><div className="user-name">{user?.name}</div><div className="user-role">Receptionist</div></div>
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main">
        <div className="topbar">
          <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(() => { const Icon = SECTIONS.find(s => s.id === section)?.icon; return Icon ? <Icon className="mi" size={17} /> : null; })()}
            {SECTIONS.find(s => s.id === section)?.label ?? 'Dashboard'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>+ New Case</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
              <div className="live-dot" /> Live
            </div>
          </div>
        </div>

        <div className="content">

          {/* ── Dashboard ── */}
          {section === 'dashboard' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Today's Overview
              </div>
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = todayLocal();
                  navigate(`/cases?dateFrom=${today}&dateTo=${today}&label=Orders+Today`);
                }}>
                  <div className="stat-icon" style={{ background: '#EEF2FF' }}><MdAssignment size={18} /></div>
                  <div className="stat-label">Orders Today</div>
                  <div className="stat-value">{stats?.todayCases ?? '—'}</div>
                  <div className="stat-sub" style={{ color: 'var(--blue)', fontWeight: 600 }}>View today's orders ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = todayLocal();
                  navigate(`/cases?remake=true&dateFrom=${today}&dateTo=${today}&label=Remakes+Today`);
                }}>
                  <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdAutorenew size={18} /></div>
                  <div className="stat-label">Remake Today</div>
                  <div className="stat-value" style={{ color: stats?.remakeCount > 0 ? 'var(--red)' : 'var(--text-1)' }}>
                    {stats?.remakeCount ?? '—'}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--red)', fontWeight: 600 }}>View remakes ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = todayLocal();
                  navigate(`/cases?redo=true&dateFrom=${today}&dateTo=${today}&label=Redo+Today`);
                }}>
                  <div className="stat-icon" style={{ background: '#FFF7ED' }}><MdAutorenew size={18} /></div>
                  <div className="stat-label">Redo Today</div>
                  <div className="stat-value" style={{ color: stats?.redoCases > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
                    {stats?.redoCases ?? '—'}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>View redo cases ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = todayLocal();
                  navigate(`/cases?status=DELIVERED&dateFrom=${today}&dateTo=${today}&dateBy=delivery&label=Delivered+Today`);
                }}>
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdCheckCircle size={18} /></div>
                  <div className="stat-label">Delivered Today</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{stats?.deliveredToday ?? '—'}</div>
                  <div className="stat-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>View delivered ↗</div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Current Workload
              </div>
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setSection('accept')}>
                  <div className="stat-icon" style={{ background: '#FFF7ED' }}><MdTwoWheeler size={18} /></div>
                  <div className="stat-label">Awaiting Pickup</div>
                  <div className="stat-value" style={{ color: '#EA580C' }}>{stats?.pendingPickups ?? '—'}</div>
                  <div className="stat-sub" style={{ color: '#EA580C', fontWeight: 600 }}>View Accept Cases ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cases?multiStatus=${encodeURIComponent(PRODUCTION_STATUSES)}&label=In+Production`)}>
                  <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}><MdPendingActions size={18} /></div>
                  <div className="stat-label">In Production</div>
                  <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats?.pendingCases ?? '—'}</div>
                  <div className="stat-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>View in-production ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setSection('ready')}>
                  <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}><MdLocalShipping size={18} /></div>
                  <div className="stat-label">Ready to Dispatch</div>
                  <div className="stat-value" style={{ color: stats?.readyToDispatch > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
                    {stats?.readyToDispatch ?? '—'}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--accent)', fontWeight: 600 }}>View Ready Orders ↗</div>
                </div>
              </div>
            </>
          )}

          {/* ── Accept Case ── */}
          {section === 'accept' && (
            <AcceptCasesSection queryClient={queryClient} />
          )}

          {/* ── In Finishing ── */}
          {section === 'finishing' && (
            <FinishingSection />
          )}

          {/* ── Ready Orders ── */}
          {section === 'ready' && (
            <ReadyOrdersSection />
          )}

          {/* ── Track Order ── */}
          {section === 'track' && (
            <TrackOrderSection />
          )}

        </div>
      </main>
    </div>
  );
}
