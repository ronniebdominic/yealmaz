import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import SearchableSelect from '../components/SearchableSelect';
import Odontogram from '../components/Odontogram';
import api from '../api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MdEmail, MdBolt, MdWarning, MdAutorenew, MdTwoWheeler, MdMoveToInbox,
  MdLocalShipping, MdAdd, MdDeleteOutline,
} from 'react-icons/md';
import { toLocalDateString } from '../utils/date';
import OriginalCasePicker from '../components/OriginalCasePicker';

// ── Visual group ordering for the work-type dropdown ─────
// Types present in the pricing DB will be slotted into these groups.
// Any DB type not listed here falls into "Other" at the bottom.
const GROUP_ORDER = [
  'Zirconia', 'Lithium Disilicate', 'Emax', 'PFM', 'Metal',
  'Implant', 'Dentures', 'Temporary', 'Composite', 'Digital / CAD',
  'Guards & Appliances', 'Specialty Prosthetics',
];

const TYPE_TO_GROUP = {
  'Zirconia Express':                    'Zirconia',
  'Full Contoured Zirconia':             'Zirconia',
  'Layered Zirconia Aesthetic':          'Zirconia',
  'Zirconia Screw Retained Crown':       'Zirconia',
  'Zirconia Veneer':                     'Zirconia',
  'Zirconia Rest':                       'Zirconia',
  'Zirconia Coping':                     'Zirconia',
  'Custom Abutment':                     'Zirconia',
  'Screw Retained Aesthetic':            'Zirconia',
  'Lithium Disilicate Inlays / Onlays / Crown': 'Lithium Disilicate',
  'Lithium Disilicate Veneers':          'Lithium Disilicate',
  'Emax Crown':  'Emax',
  'Emax Veneer': 'Emax',
  'Emax Bridge': 'Emax',
  'PFM Crown':                   'PFM',
  'PFM Crown with Metal Try-In': 'PFM',
  'PFM Bridge':                  'PFM',
  'Full Metal Crown':      'Metal',
  'Full Metal Bridge':     'Metal',
  'Metal Occlusal Crown':  'Metal',
  'Implant Crown PFM':     'Implant',
  'Implant Crown Zirconia':'Implant',
  'Surgical Guide':        'Implant',
  'Implant Planning':      'Implant',
  'Temporary Abutment':    'Implant',
  'Healing Cap':           'Implant',
  'Complete Denture':      'Dentures',
  'Flexible Denture':      'Dentures',
  'Cast Partial Denture':  'Dentures',
  'Hybrid Denture':        'Dentures',
  'Implant Overdenture':   'Dentures',
  'Temporary Crown PMMA':  'Temporary',
  'Temporary Bridge PMMA': 'Temporary',
  'Composite Veneer':      'Composite',
  'Composite Crown':       'Composite',
  'Wax-Up Diagnostic':     'Digital / CAD',
  'CAD Design Service':    'Digital / CAD',
  '3D Printed Model':      'Digital / CAD',
  'Orthodontic Retainer':  'Guards & Appliances',
  'Night Guard Soft':      'Guards & Appliances',
  'Night Guard Hard':      'Guards & Appliances',
  'Sports Guard':          'Guards & Appliances',
  'Bite Splint':           'Guards & Appliances',
  'Bleaching Tray':        'Guards & Appliances',
  'Clear Aligner Setup':   'Guards & Appliances',
  'Gingival Mask':         'Guards & Appliances',
  'Maryland Bridge':       'Specialty Prosthetics',
  'Precision Attachment':  'Specialty Prosthetics',
  'Telescopic Crown':      'Specialty Prosthetics',
  'Bar Attachment':        'Specialty Prosthetics',
  'Locator Housing':       'Specialty Prosthetics',
  'Peek Framework':        'Specialty Prosthetics',
  'Peek Crown':            'Specialty Prosthetics',
};


// ── Auto due-date rules (fallback when DB has no durationDays) ───
function getDueDays(workType) {
  const w = (workType || '').toLowerCase();
  if (w.includes('coping'))    return 3;
  if (w.includes('aligner'))   return 6;
  if (w.includes('zirconia'))  return 4;
  if (w.includes('ceramic'))   return 6;
  if (w.includes('emax'))      return 6;
  if (w.includes('guard') || w.includes('splint') || w.includes('retainer') ||
      w.includes('bleaching') || w.includes('gingival')) return 4;
  return 5;
}
function calcDueDate(workType, days) {
  const d = new Date();
  d.setDate(d.getDate() + (days ?? getDueDays(workType)));
  return toLocalDateString(d);
}

const errStyle = { fontSize: 11, color: 'var(--red)', marginTop: 3, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 3 };

// Aligner cases (Clear Aligner, Clear Aligner Setup, …) are tracked by tray
// count, not tooth position — the odontogram doesn't apply to them.
const isAlignerWorkType = (wt) => /aligner/i.test(wt || '');
const TRAY_COUNT_OPTIONS = Array.from({ length: 50 }, (_, i) => i + 1);

let itemKeySeq = 0;
const emptyItem = () => ({
  key: `item-${++itemKeySeq}`,
  workType: '', shade: '', totalAmount: '', dueDate: '',
  remake: false, remakeReason: '', originalCase: null,
  selectedTeeth: [], manualUnits: '',
  discountType: '', discountValue: '',
});

// ── One work-type item within a (possibly multi-item) order ──────────
// Everything that used to be a single set of top-level fields on the New
// Case form (Work Type, Shade, Tooth Selection, Units, Remake/Redo, Amount)
// now lives here, repeated once per item — each item becomes its own
// independently-tracked Case (own case number/QR) on submit.
function WorkItemForm({
  item, index, onChange, onRemove, canRemove,
  priceMap, expressPriceMap, flatRateMap, durationMap, expressDurationMap,
  workTypeGroups, deliveryType, archFee, applyArchFee, error, clearError,
}) {
  const isAligner = isAlignerWorkType(item.workType);

  const handleWorkTypeChange = (e) => {
    const wt = e.target.value;
    const aligner = isAlignerWorkType(wt);
    onChange({ workType: wt, ...(aligner ? { shade: '' } : {}), ...(aligner && item.selectedTeeth.length > 0 ? { selectedTeeth: [] } : {}) });
  };

  const toggleTooth = (num) => {
    const next = item.selectedTeeth.includes(num)
      ? item.selectedTeeth.filter(t => t !== num)
      : [...item.selectedTeeth, num].sort((a, b) => a - b);
    onChange({ selectedTeeth: next });
  };

  const setRemakeCheck = (e) => {
    const checked = e.target.checked;
    onChange({ remake: checked, ...(checked ? {} : { originalCase: null, remakeReason: '' }) });
  };

  // Base price before remake/redo modifier
  const basePrice = useMemo(() => {
    if (!item.workType || Object.keys(priceMap).length === 0) return null;
    const useExpress = deliveryType === 'EXPRESS' && expressPriceMap[item.workType] != null;
    const unitPrice = useExpress ? expressPriceMap[item.workType] : priceMap[item.workType];
    if (unitPrice === undefined) return null;
    const count = flatRateMap[item.workType]
      ? 1
      : item.selectedTeeth.length > 0
        ? item.selectedTeeth.length
        : Math.max(1, parseInt(item.manualUnits) || 1);
    return unitPrice * count;
  }, [item.workType, deliveryType, item.selectedTeeth.length, item.manualUnits, priceMap, expressPriceMap, flatRateMap]);

  // Auto-calculate price — includes the arch scan fee (Br 500/arch) on this
  // item only when it's the one carrying it — then applies any discount on
  // top, same order of operations as Accept Case's discount
  // (POST /:id/accept). A remake/redo item is forced to 0 instead — the
  // Operation Manager decides Remake (free) vs Redo (50% of the original
  // case) later, at review, not here — so no discount applies to it either.
  useEffect(() => {
    if (basePrice === null) return;
    if (item.remake) { onChange({ totalAmount: '0' }); return; }
    const fee = applyArchFee ? archFee : 0;
    const combined = basePrice + fee;
    let amount = combined;
    const discountNum = parseFloat(item.discountValue);
    if (item.discountType && !isNaN(discountNum) && discountNum >= 0) {
      amount = Math.max(0, item.discountType === 'PERCENT' ? amount * (1 - discountNum / 100) : amount - discountNum);
    }
    onChange({ totalAmount: String(Math.round(amount * 100) / 100) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePrice, applyArchFee, archFee, item.remake, item.discountType, item.discountValue]);

  // Auto-set due date
  useEffect(() => {
    if (!item.workType) return;
    const isExpress = deliveryType === 'EXPRESS';
    const days = isExpress && expressDurationMap[item.workType] != null
      ? expressDurationMap[item.workType]
      : durationMap[item.workType] ?? null;
    onChange({ dueDate: calcDueDate(item.workType, days) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.workType, deliveryType, durationMap, expressDurationMap]);

  // Price label shown next to Amount field
  const priceLabel = (() => {
    if (!item.workType || priceMap[item.workType] == null) return null;
    const useExpress = deliveryType === 'EXPRESS' && expressPriceMap[item.workType] != null;
    const unitPrice  = useExpress ? expressPriceMap[item.workType] : priceMap[item.workType];
    const count = flatRateMap[item.workType]
      ? 1
      : item.selectedTeeth.length > 0
        ? item.selectedTeeth.length
        : Math.max(1, parseInt(item.manualUnits) || 1);
    const workTypeFull = unitPrice * count;
    const fee = applyArchFee ? archFee : 0;
    const full = workTypeFull + fee;
    const archNote = fee > 0
      ? <> + Br {fee.toLocaleString('en-US')} scan fee</>
      : null;
    if (item.remake) {
      return <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>Remake/Redo — <strong style={{ color: 'var(--red)' }}>Br 0, pending review</strong></span>;
    }
    return flatRateMap[item.workType] ? (
      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        {useExpress ? <MdBolt className="mi" size={11} style={{ marginRight: 2 }} /> : ''}flat — Br {unitPrice.toLocaleString('en-US')}{archNote} = <strong style={{ color: 'var(--green)' }}>Br {full.toLocaleString('en-US')}</strong>
      </span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        {useExpress ? <MdBolt className="mi" size={11} style={{ marginRight: 2 }} /> : ''}Br {unitPrice.toLocaleString('en-US')} × {count}{archNote} = <strong style={{ color: useExpress ? '#92400E' : 'var(--green)' }}>Br {full.toLocaleString('en-US')}</strong>
      </span>
    );
  })();

  const discountNum = parseFloat(item.discountValue);
  const hasDiscount = item.discountType && !isNaN(discountNum) && discountNum >= 0;
  const discountNote = hasDiscount
    ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginLeft: 6 }}>
        − {item.discountType === 'PERCENT' ? `${discountNum}%` : `Br ${discountNum.toLocaleString('en-US')}`}
      </span>
    : null;

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14,
      background: 'var(--surface-2)', position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Item {index + 1}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove}
            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700 }}>
            <MdDeleteOutline size={15} /> Remove
          </button>
        )}
      </div>

      <div className="form-group">
        <label>Work Type *</label>
        <select value={item.workType} onChange={handleWorkTypeChange} required>
          <option value="">— Select work type —</option>
          {workTypeGroups.length === 0 ? (
            <option disabled>Loading work types…</option>
          ) : workTypeGroups.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.types.map(t => (
                <option key={t} value={t}>
                  {t}{priceMap[t] != null ? ` — Br ${priceMap[t].toLocaleString('en-US')}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {!isAligner && (
        <div className="form-group">
          <label>Shade *</label>
          <input
            placeholder="e.g. A2, B1"
            value={item.shade}
            onChange={e => { onChange({ shade: e.target.value }); clearError(); }}
            style={error ? { borderColor: 'var(--red)' } : {}}
          />
          {error && <div style={errStyle}><MdWarning className="mi" size={12} /> {error}</div>}
        </div>
      )}

      {!isAligner && (
        <div className="form-group">
          <label>Tooth Selection <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(FDI numbering — click to select)</span></label>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px', overflowX: 'auto',
          }}>
            <Odontogram selected={item.selectedTeeth} onToggle={toggleTooth} onClear={() => onChange({ selectedTeeth: [] })} />
          </div>
        </div>
      )}

      <div className="form-group">
        {isAligner ? (
          <>
            <label>Number of Trays</label>
            <select value={item.manualUnits} onChange={e => onChange({ manualUnits: e.target.value })}>
              <option value="">— Select tray count —</option>
              {TRAY_COUNT_OPTIONS.map(n => <option key={n} value={n}>{n} tray{n > 1 ? 's' : ''}</option>)}
            </select>
          </>
        ) : (
          <>
            <label>Units
              {item.selectedTeeth.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                  auto-filled from tooth selection
                </span>
              )}
            </label>
            <input
              type="number" min="1"
              placeholder="Enter number of units"
              value={item.selectedTeeth.length > 0 ? item.selectedTeeth.length : item.manualUnits}
              onChange={e => { if (item.selectedTeeth.length === 0) onChange({ manualUnits: e.target.value }); }}
              readOnly={item.selectedTeeth.length > 0}
              style={item.selectedTeeth.length > 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
            />
          </>
        )}
      </div>

      <div className="form-group">
        <label>Item Type</label>
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
            border: `2px solid ${item.remake ? '#FECACA' : 'var(--border)'}`,
            background: item.remake ? '#FFF1F2' : 'var(--surface)',
            transition: 'border-color .15s, background .15s',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={item.remake}
            onChange={setRemakeCheck}
            style={{ width: 16, height: 16, accentColor: 'var(--red)', cursor: 'pointer' }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: item.remake ? 'var(--red)' : 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <MdAutorenew size={13} /> Remake / Redo of an earlier case
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Amount locked to Br 0 — Operation Manager decides Remake (free) or Redo (50%) at review</div>
          </div>
        </label>
        {item.remake && (
          <div style={{ marginTop: 10 }}>
            <input
              placeholder="Remake reason (optional)"
              value={item.remakeReason}
              onChange={e => onChange({ remakeReason: e.target.value })}
              style={{ width: '100%', marginBottom: 10 }}
            />
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>ORIGINAL / REFERENCE CASE *</label>
            <OriginalCasePicker selected={item.originalCase} onSelect={rc => onChange({ originalCase: rc })} onClear={() => onChange({ originalCase: null })} />
          </div>
        )}
      </div>

      {item.workType && !item.remake && (
        <div className="form-group">
          <label>Discount</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: '', label: 'None' }, { val: 'AMOUNT', label: 'Br Off' }, { val: 'PERCENT', label: '% Off' }].map(opt => (
              <button key={opt.val} type="button"
                onClick={() => onChange({ discountType: opt.val, ...(opt.val ? {} : { discountValue: '' }) })}
                style={{
                  flex: 1, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${item.discountType === opt.val ? 'var(--red)' : 'var(--border)'}`,
                  background: item.discountType === opt.val ? 'var(--red-dim)' : 'var(--surface)',
                  color: item.discountType === opt.val ? 'var(--red)' : 'var(--text-2)',
                }}>{opt.label}</button>
            ))}
            {item.discountType && (
              <input type="number" min="0" max={item.discountType === 'PERCENT' ? 100 : undefined}
                placeholder={item.discountType === 'PERCENT' ? 'e.g. 10' : 'e.g. 500'}
                value={item.discountValue} onChange={e => onChange({ discountValue: e.target.value })}
                style={{ flex: 1.2 }} autoFocus />
            )}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="form-group">
          <label>
            Due Date
            {item.workType && (
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                auto · {getDueDays(item.workType)} days from today
              </span>
            )}
          </label>
          <input type="date" value={item.dueDate} onChange={e => onChange({ dueDate: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Amount (Br) {priceLabel}{discountNote}</label>
          <input
            type="number"
            placeholder="Auto-calculated from work type"
            value={item.remake ? '0' : item.totalAmount}
            onChange={e => onChange({ totalAmount: e.target.value })}
            readOnly={item.remake}
            style={item.remake ? { color: 'var(--text-3)', background: 'var(--surface-2)', cursor: 'not-allowed' } : {}}
          />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────
export default function NewCase() {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [itemErrors, setItemErrors] = useState({});
  const [items, setItems] = useState([emptyItem()]);
  const [form, setForm] = useState({
    clinicId: '', patientName: '', patientAge: '', doctorName: '',
    doctorPhone: '', patientGender: '', notes: '',
    deliveryType: 'NORMAL', deliveryDate: '', intakeMethod: 'PICKUP',
    archUpper: false, archLower: false,
  });

  // Digital-scan intake fee: Br 500 per arch, on top of the work-type price.
  // Applied to the first item only — one scan session covers the whole visit.
  const ARCH_FEE = 500;
  const archFee = (form.intakeMethod === 'EMAIL_3D_FILE')
    ? (form.archUpper ? ARCH_FEE : 0) + (form.archLower ? ARCH_FEE : 0)
    : 0;

  const { data: pricesData = [] } = useQuery({
    queryKey: ['prices'],
    queryFn: () => api.get('/prices').then(r => r.data),
    staleTime: 60_000,
  });

  const priceMap = useMemo(
    () => Object.fromEntries(pricesData.map(p => [p.workType, p.price])),
    [pricesData]
  );

  const expressPriceMap = useMemo(
    () => Object.fromEntries(pricesData.filter(p => p.expressPrice != null).map(p => [p.workType, p.expressPrice])),
    [pricesData]
  );

  const expressDurationMap = useMemo(
    () => Object.fromEntries(pricesData.filter(p => p.expressDurationDays != null).map(p => [p.workType, p.expressDurationDays])),
    [pricesData]
  );

  const durationMap = useMemo(
    () => Object.fromEntries(pricesData.filter(p => p.durationDays != null).map(p => [p.workType, p.durationDays])),
    [pricesData]
  );

  // Work types priced per full dentition — never multiplied by tooth count.
  // Sourced from WorkTypePrice.isFlatRate (Admin > Work Type Pricing), not a
  // hardcoded list, so it stays in sync with the same flag the backend uses
  // to decide whether a units edit should adjust the billed amount.
  const flatRateMap = useMemo(
    () => Object.fromEntries(pricesData.map(p => [p.workType, !!p.isFlatRate])),
    [pricesData]
  );

  // Build grouped work-type list from DB (single source of truth)
  const workTypeGroups = useMemo(() => {
    const dbTypes = new Set(pricesData.map(p => p.workType));
    const grouped = {};
    for (const wt of dbTypes) {
      const group = TYPE_TO_GROUP[wt] || 'Other';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(wt);
    }
    for (const g of Object.keys(grouped)) grouped[g].sort();
    const result = [];
    for (const g of GROUP_ORDER) {
      if (grouped[g]?.length) result.push({ label: g, types: grouped[g] });
    }
    if (grouped['Other']?.length) result.push({ label: 'Other', types: grouped['Other'] });
    return result;
  }, [pricesData]);

  useEffect(() => { loadClinics(); }, []);

  const loadClinics = async () => {
    try {
      const res = await api.get('/clinics');
      setClinics(res.data);
    } catch {}
  };

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const setCheck = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

  const updateItem = (index, patch) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const validate = () => {
    const e = {};
    if (!form.doctorName.trim())  e.doctorName  = "Doctor's name is required";
    if (!form.doctorPhone.trim()) e.doctorPhone = 'Contact / phone is required';

    const ie = {};
    items.forEach((item, i) => {
      if (!isAlignerWorkType(item.workType) && !item.shade.trim()) {
        ie[i] = 'Shade is required';
      }
    });
    return { e, ie };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clinicId)    return toast.error('Please select a clinic');
    if (!form.patientName) return toast.error('Patient name is required');
    if (items.some(it => !it.workType)) return toast.error('Work type is required for every item');
    if (items.some(it => it.remake && !it.originalCase)) return toast.error('Select the original case for every Remake/Redo item');
    if (form.intakeMethod === 'EMAIL_3D_FILE' && !form.archUpper && !form.archLower) {
      return toast.error('Select at least one arch (Upper/Lower) that was scanned');
    }

    const { e: fieldErrs, ie: itemErrs } = validate();
    if (Object.keys(fieldErrs).length > 0 || Object.keys(itemErrs).length > 0) {
      setErrors(fieldErrs);
      setItemErrors(itemErrs);
      toast.error(Object.values(fieldErrs)[0] || Object.values(itemErrs)[0]);
      return;
    }
    setErrors({});
    setItemErrors({});

    setSubmitting(true);
    try {
      const isEmailFile = form.intakeMethod === 'EMAIL_3D_FILE';
      const archLabel = [form.archUpper && 'Upper', form.archLower && 'Lower'].filter(Boolean).join(' & ');
      const scanNote = isEmailFile
        ? `3D file intake — Arches scanned: ${archLabel || 'none selected'}${archFee > 0 ? ` (Br ${archFee.toLocaleString('en-US')} scan fee)` : ''}`
        : null;
      const sharedNotes = [scanNote, form.notes].filter(Boolean).join('\n');
      const dropOffAtLab = form.intakeMethod === 'DROP_OFF' || isEmailFile;

      const buildItemPayload = (item) => {
        const resolvedUnits = item.selectedTeeth.length > 0
          ? item.selectedTeeth.length
          : item.manualUnits ? parseInt(item.manualUnits) : undefined;
        const discountNum = parseFloat(item.discountValue);
        const hasDiscount = item.discountType && !isNaN(discountNum) && discountNum >= 0;
        return {
          workType: item.workType,
          shade: item.shade,
          toothNumbers: item.selectedTeeth.length > 0 ? item.selectedTeeth.join(', ') : undefined,
          units: resolvedUnits,
          remake: item.remake,
          remakeReason: item.remake ? item.remakeReason : undefined,
          originalCaseId: item.remake ? item.originalCase?.id : undefined,
          dueDate: item.dueDate,
          totalAmount: item.remake ? '0' : item.totalAmount,
          discountType: item.remake ? undefined : (hasDiscount ? item.discountType : undefined),
          discountValue: item.remake ? undefined : (hasDiscount ? discountNum : undefined),
        };
      };

      const shared = {
        clinicId: form.clinicId,
        patientName: form.patientName,
        patientAge: form.patientAge,
        doctorName: form.doctorName,
        doctorPhone: form.doctorPhone,
        patientGender: form.patientGender,
        notes: sharedNotes,
        deliveryType: form.deliveryType,
        deliveryDate: form.deliveryDate || undefined,
        dropOffAtLab,
      };

      if (items.length === 1) {
        const res = await api.post('/cases', { ...shared, ...buildItemPayload(items[0]) });
        toast.success(`Case ${res.data.caseNumber} created!`);
      } else {
        const res = await api.post('/cases/bulk', { ...shared, items: items.map(buildItemPayload) });
        const numbers = res.data.cases.map(c => c.caseNumber).join(', ');
        toast.success(`${res.data.cases.length} cases created! ${numbers}`);
      }
      navigate('/cases');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create case');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="topbar">
        <div className="topbar-title">New Case</div>
      </div>

      <div className="content">
        <div className="card" style={{ maxWidth: '720px' }}>
          <div className="card-header">
            <div className="card-title">Create a New Lab Case</div>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>

              {/* Clinic */}
              <div className="form-group">
                <label>Clinic *</label>
                <SearchableSelect
                  value={form.clinicId}
                  onChange={v => setForm(f => ({ ...f, clinicId: v }))}
                  options={clinics.map(c => ({ value: c.id, label: `${c.code ? `[${c.code}] ` : ''}${c.name}` }))}
                  placeholder="— Select clinic —"
                />
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  New clinic? Ask them to register via the clinic app first.
                </div>
              </div>

              {/* Patient info */}
              <div className="grid-2">
                <div className="form-group">
                  <label>Patient Name *</label>
                  <input placeholder="e.g. Ahmed Al-Rashid" value={form.patientName} onChange={set('patientName')} required />
                </div>
                <div className="form-group">
                  <label>Patient Age</label>
                  <input type="number" placeholder="e.g. 34" value={form.patientAge} onChange={set('patientAge')} />
                </div>
              </div>

              {/* Doctor info — mandatory */}
              <div className="grid-2">
                <div className="form-group">
                  <label>Doctor's Name *</label>
                  <input
                    placeholder="e.g. Dr. Sarah Ahmed"
                    value={form.doctorName}
                    onChange={e => { set('doctorName')(e); setErrors(prev => ({ ...prev, doctorName: '' })); }}
                    style={errors.doctorName ? { borderColor: 'var(--red)' } : {}}
                  />
                  {errors.doctorName && <div style={errStyle}><MdWarning className="mi" size={12} /> {errors.doctorName}</div>}
                </div>
                <div className="form-group">
                  <label>Contact / Phone *</label>
                  <input
                    type="tel"
                    placeholder="e.g. +251 911 000 000"
                    value={form.doctorPhone}
                    onChange={e => { set('doctorPhone')(e); setErrors(prev => ({ ...prev, doctorPhone: '' })); }}
                    style={errors.doctorPhone ? { borderColor: 'var(--red)' } : {}}
                  />
                  {errors.doctorPhone && <div style={errStyle}><MdWarning className="mi" size={12} /> {errors.doctorPhone}</div>}
                </div>
              </div>

              <div className="form-group">
                <label>Patient Gender</label>
                <select value={form.patientGender} onChange={set('patientGender')}>
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Work items — one work type per item; add more for a
                  multi-item order (e.g. 2 Zirconia crowns + a PFM crown)
                  for the same patient visit. */}
              <div className="form-group">
                <label>Work Order{items.length > 1 ? `s (${items.length})` : ''}</label>
                {items.map((item, i) => (
                  <WorkItemForm
                    key={item.key}
                    item={item}
                    index={i}
                    onChange={patch => updateItem(i, patch)}
                    onRemove={() => removeItem(i)}
                    canRemove={items.length > 1}
                    priceMap={priceMap}
                    expressPriceMap={expressPriceMap}
                    flatRateMap={flatRateMap}
                    durationMap={durationMap}
                    expressDurationMap={expressDurationMap}
                    workTypeGroups={workTypeGroups}
                    deliveryType={form.deliveryType}
                    archFee={archFee}
                    applyArchFee={i === 0}
                    error={itemErrors[i]}
                    clearError={() => setItemErrors(prev => ({ ...prev, [i]: '' }))}
                  />
                ))}
                <button type="button" onClick={addItem} className="btn btn-ghost"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MdAdd size={16} /> Add another work item
                </button>
              </div>

              {/* Intake Method */}
              <div className="form-group">
                <label>Intake Method</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {[
                    { value: 'PICKUP',        label: 'To Be Picked Up',  icon: MdTwoWheeler, desc: 'Delivery exec will collect from clinic' },
                    { value: 'DROP_OFF',      label: 'Dropped at Lab',   icon: MdMoveToInbox, desc: 'Impression already received at lab' },
                    { value: 'EMAIL_3D_FILE', label: '3D File (Emailed)', icon: MdEmail, desc: 'Digital scan file sent by dentist via email' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, intakeMethod: opt.value }))}
                      style={{
                        flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${form.intakeMethod === opt.value ? 'var(--blue)' : 'var(--border)'}`,
                        background: form.intakeMethod === opt.value ? 'var(--blue-dim, #EEF2FF)' : 'var(--surface)',
                        transition: 'border-color .15s, background .15s',
                      }}
                    >
                      <opt.icon size={20} className="mi" />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: form.intakeMethod === opt.value ? 'var(--blue)' : 'var(--text-1)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {form.intakeMethod === 'EMAIL_3D_FILE' && (
                  <div style={{ marginTop: 10, padding: '12px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>
                      Arch(es) Scanned — Br {ARCH_FEE.toLocaleString('en-US')} per arch
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {[
                        { field: 'archUpper', label: 'Upper Arch', checked: form.archUpper },
                        { field: 'archLower', label: 'Lower Arch', checked: form.archLower },
                      ].map(opt => (
                        <label key={opt.field} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                          border: `2px solid ${opt.checked ? 'var(--blue)' : 'var(--border)'}`,
                          background: opt.checked ? '#fff' : 'var(--surface)',
                        }}>
                          <input
                            type="checkbox"
                            checked={opt.checked}
                            onChange={setCheck(opt.field)}
                            style={{ width: 16, height: 16, accentColor: 'var(--blue)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 700, color: opt.checked ? 'var(--blue)' : 'var(--text-1)' }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    {archFee > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 8, fontWeight: 600 }}>
                        Scan fee: Br {archFee.toLocaleString('en-US')} — added on top of the {items.length > 1 ? 'first item’s' : 'work-type'} price above.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery Type */}
              <div className="form-group">
                <label>Delivery Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { value: 'NORMAL',  label: 'Normal Delivery',  icon: MdLocalShipping, desc: 'Standard turnaround' },
                    { value: 'EXPRESS', label: 'Express Delivery', icon: MdBolt, desc: 'Priority / urgent' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, deliveryType: opt.value }))}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${form.deliveryType === opt.value ? (opt.value === 'EXPRESS' ? 'var(--amber)' : 'var(--blue)') : 'var(--border)'}`,
                        background: form.deliveryType === opt.value ? (opt.value === 'EXPRESS' ? 'rgba(240,165,0,0.08)' : 'var(--blue-dim, #EEF2FF)') : 'var(--surface)',
                        transition: 'border-color .15s, background .15s',
                      }}
                    >
                      <opt.icon size={20} className="mi" />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: form.deliveryType === opt.value ? (opt.value === 'EXPRESS' ? 'var(--amber)' : 'var(--blue)') : 'var(--text-1)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Delivery Date
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>for historical cases</span>
                </label>
                <input type="date" value={form.deliveryDate} onChange={set('deliveryDate')} />
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea rows={3} placeholder="Special instructions, preferences…" value={form.notes} onChange={set('notes')} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting
                    ? 'Creating…'
                    : items.length > 1
                      ? `+ Create ${items.length} Cases & Generate QRs`
                      : '+ Create Case & Generate QR'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate('/cases')}>
                  Cancel
                </button>
              </div>

            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
