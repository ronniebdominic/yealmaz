import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import SearchableSelect from '../components/SearchableSelect';
import api from '../api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

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

// ── Odontogram ────────────────────────────────────────────
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function Odontogram({ selected, onToggle, onClear }) {
  const toothStyle = (num, isUpper) => {
    const active = selected.includes(num);
    return {
      width: 34, height: 40,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1.5px solid ${active ? '#1A56A0' : '#E2E8F0'}`,
      borderRadius: isUpper ? '5px 5px 0 0' : '0 0 5px 5px',
      background: active ? '#1A56A0' : '#fff',
      cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      color: active ? '#fff' : '#94A3B8',
      margin: '0 1px',
      transition: 'background .1s, border-color .1s',
      fontFamily: 'DM Mono, monospace',
      flexShrink: 0,
      outline: 'none',
    };
  };

  const midlineStyle = {
    width: 10, alignSelf: 'stretch',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  };

  const renderRow = (teeth, isUpper) => (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {teeth.map((num) => {
        const isMidline = (isUpper && num === 21) || (!isUpper && num === 31);
        return (
          <React.Fragment key={num}>
            {isMidline && (
              <div style={midlineStyle}>
                <div style={{ width: 1.5, background: '#CBD5E0', alignSelf: 'stretch' }} />
              </div>
            )}
            <button type="button" onClick={() => onToggle(num)} title={`Tooth ${num}`}
              style={toothStyle(num, isUpper)}>
              {num}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div style={{ userSelect: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.5 }}>← R (Patient Right)</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.5 }}>(Patient Left) L →</span>
      </div>
      {renderRow(UPPER_TEETH, true)}
      <div style={{
        height: 22, margin: '3px 0',
        background: '#F0F4F9', border: '1px solid #E2E8F0', borderRadius: 2,
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.8 }}>UPPER</span>
        <div style={{ flex: 1, height: 1, background: '#CBD5E0' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', letterSpacing: 0.8 }}>LOWER</span>
      </div>
      {renderRow(LOWER_TEETH, false)}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        {selected.length > 0 ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              Selected: <strong style={{ color: 'var(--blue)' }}>{selected.join(', ')}</strong>
            </span>
            <button type="button" onClick={onClear}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--red)', fontWeight: 600, padding: 0 }}>
              Clear all
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
            No teeth selected — click to mark affected teeth
          </span>
        )}
      </div>
    </div>
  );
}

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
  return d.toISOString().split('T')[0];
}

// Work types priced per full dentition — never multiplied by tooth count
const FLAT_PRICE_TYPES = new Set([
  'Orthodontic Retainer', 'Night Guard Soft', 'Night Guard Hard',
  'Sports Guard', 'Bite Splint', 'Bleaching Tray', 'Clear Aligner Setup', 'Gingival Mask',
]);

const errStyle = { fontSize: 11, color: 'var(--red)', marginTop: 3, fontWeight: 500 };

// ── Page ──────────────────────────────────────────────────
export default function NewCase() {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [manualUnits, setManualUnits] = useState('');
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    clinicId: '', patientName: '', patientAge: '', doctorName: '',
    doctorPhone: '', patientGender: '',
    workType: '', shade: '', notes: '', dueDate: '', totalAmount: '',
    deliveryType: 'NORMAL', deliveryDate: '', intakeMethod: 'PICKUP',
    remake: false, redo: false, remakeReason: '',
  });

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

  // Base price before remake/redo modifier
  const basePrice = useMemo(() => {
    if (!form.workType || Object.keys(priceMap).length === 0) return null;
    const useExpress = form.deliveryType === 'EXPRESS' && expressPriceMap[form.workType] != null;
    const unitPrice = useExpress ? expressPriceMap[form.workType] : priceMap[form.workType];
    if (unitPrice === undefined) return null;
    const count = FLAT_PRICE_TYPES.has(form.workType) ? 1 : Math.max(1, selectedTeeth.length);
    return unitPrice * count;
  }, [form.workType, form.deliveryType, selectedTeeth.length, priceMap, expressPriceMap]);

  // Auto-calculate price with remake/redo modifier
  useEffect(() => {
    if (basePrice === null) return;
    let amount;
    if (form.remake) {
      amount = '0';
    } else if (form.redo) {
      amount = String(Math.round(basePrice * 0.5 * 100) / 100);
    } else {
      amount = String(basePrice);
    }
    setForm(prev => ({ ...prev, totalAmount: amount }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePrice, form.remake, form.redo]);

  // Auto-set due date
  useEffect(() => {
    if (!form.workType) return;
    const isExpress = form.deliveryType === 'EXPRESS';
    const days = isExpress && expressDurationMap[form.workType] != null
      ? expressDurationMap[form.workType]
      : durationMap[form.workType] ?? null;
    setForm(prev => ({ ...prev, dueDate: calcDueDate(form.workType, days) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.workType, form.deliveryType, durationMap, expressDurationMap]);

  useEffect(() => { loadClinics(); }, []);

  const loadClinics = async () => {
    try {
      const res = await api.get('/clinics');
      setClinics(res.data);
    } catch {}
  };

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const setCheck = (field) => (e) => {
    const checked = e.target.checked;
    setForm(prev => {
      if (field === 'remake' && checked) return { ...prev, remake: true, redo: false };
      if (field === 'redo'   && checked) return { ...prev, redo: true, remake: false };
      return { ...prev, [field]: checked };
    });
  };

  const toggleTooth = (num) => {
    setSelectedTeeth(prev =>
      prev.includes(num)
        ? prev.filter(t => t !== num)
        : [...prev, num].sort((a, b) => a - b)
    );
  };

  const validate = () => {
    const e = {};
    if (!form.shade.trim())       e.shade      = 'Shade is required';
    if (!form.doctorName.trim())  e.doctorName  = "Doctor's name is required";
    if (!form.doctorPhone.trim()) e.doctorPhone = 'Contact / phone is required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clinicId)    return toast.error('Please select a clinic');
    if (!form.patientName) return toast.error('Patient name is required');
    if (!form.workType)    return toast.error('Work type is required');

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error(Object.values(errs)[0]);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const resolvedUnits = selectedTeeth.length > 0
        ? selectedTeeth.length
        : manualUnits ? parseInt(manualUnits) : undefined;
      const res = await api.post('/cases', {
        ...form,
        toothNumbers: selectedTeeth.length > 0 ? selectedTeeth.join(', ') : undefined,
        units: resolvedUnits,
        deliveryDate: form.deliveryDate || undefined,
        dropOffAtLab: form.intakeMethod === 'DROP_OFF',
      });
      toast.success(`Case ${res.data.caseNumber} created!`);
      navigate('/cases');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create case');
    } finally {
      setSubmitting(false);
    }
  };

  // Price label shown next to Amount field
  const priceLabel = (() => {
    if (!form.workType || priceMap[form.workType] == null) return null;
    const useExpress = form.deliveryType === 'EXPRESS' && expressPriceMap[form.workType] != null;
    const unitPrice  = useExpress ? expressPriceMap[form.workType] : priceMap[form.workType];
    const count = FLAT_PRICE_TYPES.has(form.workType) ? 1 : Math.max(1, selectedTeeth.length);
    const full  = unitPrice * count;
    if (form.remake) {
      return <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>Remake — <strong style={{ color: 'var(--red)' }}>Free (Br 0)</strong></span>;
    }
    if (form.redo) {
      return <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        Redo 50% — <strong style={{ color: 'var(--amber)' }}>Br {(full * 0.5).toLocaleString('en-US')}</strong>
      </span>;
    }
    return FLAT_PRICE_TYPES.has(form.workType) ? (
      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        {useExpress ? '⚡ ' : ''}flat — <strong style={{ color: 'var(--green)' }}>Br {unitPrice.toLocaleString('en-US')}</strong>
      </span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        {useExpress ? '⚡ ' : ''}Br {unitPrice.toLocaleString('en-US')} × {count} = <strong style={{ color: useExpress ? '#92400E' : 'var(--green)' }}>Br {full.toLocaleString('en-US')}</strong>
      </span>
    );
  })();

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
                  {errors.doctorName && <div style={errStyle}>⚠ {errors.doctorName}</div>}
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
                  {errors.doctorPhone && <div style={errStyle}>⚠ {errors.doctorPhone}</div>}
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Patient Gender</label>
                  <select value={form.patientGender} onChange={set('patientGender')}>
                    <option value="">— Select —</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Shade *</label>
                  <input
                    placeholder="e.g. A2, B1"
                    value={form.shade}
                    onChange={e => { set('shade')(e); setErrors(prev => ({ ...prev, shade: '' })); }}
                    style={errors.shade ? { borderColor: 'var(--red)' } : {}}
                  />
                  {errors.shade && <div style={errStyle}>⚠ {errors.shade}</div>}
                </div>
              </div>

              {/* Odontogram */}
              <div className="form-group">
                <label>Tooth Selection <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(FDI numbering — click to select)</span></label>
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 10, padding: '14px 16px', overflowX: 'auto',
                }}>
                  <Odontogram selected={selectedTeeth} onToggle={toggleTooth} onClear={() => setSelectedTeeth([])} />
                </div>
              </div>

              {/* Units */}
              <div className="form-group">
                <label>Units
                  {selectedTeeth.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                      auto-filled from tooth selection
                    </span>
                  )}
                </label>
                <input
                  type="number" min="1"
                  placeholder="Enter number of units"
                  value={selectedTeeth.length > 0 ? selectedTeeth.length : manualUnits}
                  onChange={e => { if (selectedTeeth.length === 0) setManualUnits(e.target.value); }}
                  readOnly={selectedTeeth.length > 0}
                  style={selectedTeeth.length > 0 ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                />
              </div>

              {/* Work type — driven by pricing DB */}
              <div className="form-group">
                <label>Work Type *</label>
                <select value={form.workType} onChange={set('workType')} required>
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

              {/* Remake / Redo flags */}
              <div className="form-group">
                <label>Case Type</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    {
                      field: 'remake', checked: form.remake,
                      label: '🔄 Remake', desc: 'Free — no charge to clinic',
                      color: 'var(--red)', bg: '#FFF1F2', border: '#FECACA',
                    },
                    {
                      field: 'redo', checked: form.redo,
                      label: '♻️ Redo', desc: '50% of work-type price',
                      color: 'var(--amber)', bg: 'var(--amber-dim)', border: '#FCD34D',
                    },
                  ].map(opt => (
                    <label
                      key={opt.field}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${opt.checked ? opt.border : 'var(--border)'}`,
                        background: opt.checked ? opt.bg : 'var(--surface)',
                        transition: 'border-color .15s, background .15s',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={opt.checked}
                        onChange={setCheck(opt.field)}
                        style={{ width: 16, height: 16, accentColor: opt.color, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: opt.checked ? opt.color : 'var(--text-1)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {form.remake && (
                  <div style={{ marginTop: 10 }}>
                    <input
                      placeholder="Remake reason (optional)"
                      value={form.remakeReason}
                      onChange={set('remakeReason')}
                      style={{ width: '100%' }}
                    />
                  </div>
                )}
              </div>

              {/* Intake Method */}
              <div className="form-group">
                <label>Intake Method</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { value: 'PICKUP',   label: 'To Be Picked Up', icon: '🛵', desc: 'Delivery exec will collect from clinic' },
                    { value: 'DROP_OFF', label: 'Dropped at Lab',  icon: '📥', desc: 'Impression already received at lab' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, intakeMethod: opt.value }))}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                        border: `2px solid ${form.intakeMethod === opt.value ? 'var(--blue)' : 'var(--border)'}`,
                        background: form.intakeMethod === opt.value ? 'var(--blue-dim, #EEF2FF)' : 'var(--surface)',
                        transition: 'border-color .15s, background .15s',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{opt.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: form.intakeMethod === opt.value ? 'var(--blue)' : 'var(--text-1)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Delivery Type */}
              <div className="form-group">
                <label>Delivery Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { value: 'NORMAL',  label: 'Normal Delivery',  icon: '🚚', desc: 'Standard turnaround' },
                    { value: 'EXPRESS', label: 'Express Delivery', icon: '⚡', desc: 'Priority / urgent' },
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
                      <span style={{ fontSize: 20 }}>{opt.icon}</span>
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

              <div className="grid-2">
                <div className="form-group">
                  <label>
                    Due Date
                    {form.workType && (
                      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                        auto · {getDueDays(form.workType)} days from today
                      </span>
                    )}
                  </label>
                  <input type="date" value={form.dueDate} onChange={set('dueDate')} />
                </div>
                <div className="form-group">
                  <label>Delivery Date
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>for historical cases</span>
                  </label>
                  <input type="date" value={form.deliveryDate} onChange={set('deliveryDate')} />
                </div>
                <div className="form-group">
                  <label>Amount (Br) {priceLabel}</label>
                  <input
                    type="number"
                    placeholder="Auto-calculated from work type"
                    value={form.totalAmount}
                    onChange={set('totalAmount')}
                    style={form.remake ? { color: 'var(--text-3)' } : form.redo ? { color: 'var(--amber)', fontWeight: 600 } : {}}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea rows={3} placeholder="Special instructions, preferences…" value={form.notes} onChange={set('notes')} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : '+ Create Case & Generate QR'}
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
