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
  MdLocalShipping,
} from 'react-icons/md';
import { toLocalDateString } from '../utils/date';

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
    archUpper: false, archLower: false,
  });

  // Digital-scan intake fee: Br 500 per arch, on top of the work-type price.
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

  // Base price before remake/redo modifier
  const basePrice = useMemo(() => {
    if (!form.workType || Object.keys(priceMap).length === 0) return null;
    const useExpress = form.deliveryType === 'EXPRESS' && expressPriceMap[form.workType] != null;
    const unitPrice = useExpress ? expressPriceMap[form.workType] : priceMap[form.workType];
    if (unitPrice === undefined) return null;
    const count = flatRateMap[form.workType] ? 1 : Math.max(1, selectedTeeth.length);
    return unitPrice * count;
  }, [form.workType, form.deliveryType, selectedTeeth.length, priceMap, expressPriceMap]);

  // Auto-calculate price with remake/redo modifier — includes the arch scan
  // fee (Br 500/arch) on top of the work-type price for 3D-file intake.
  useEffect(() => {
    if (basePrice === null) return;
    const combined = basePrice + archFee;
    let amount;
    if (form.remake) {
      amount = '0';
    } else if (form.redo) {
      amount = String(Math.round(combined * 0.5 * 100) / 100);
    } else {
      amount = String(combined);
    }
    setForm(prev => ({ ...prev, totalAmount: amount }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePrice, archFee, form.remake, form.redo]);

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
  const handleWorkTypeChange = (e) => {
    const wt = e.target.value;
    const aligner = isAlignerWorkType(wt);
    setForm(prev => ({ ...prev, workType: wt, ...(aligner ? { shade: '' } : {}) }));
    // Aligner cases are tracked by tray count, not tooth position or shade —
    // clear any odontogram selection so units falls back to the tray-count
    // dropdown, and clear shade since it isn't shown/required.
    if (aligner && selectedTeeth.length > 0) setSelectedTeeth([]);
  };
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
    if (!isAlignerWorkType(form.workType) && !form.shade.trim())
                                   e.shade      = 'Shade is required';
    if (!form.doctorName.trim())  e.doctorName  = "Doctor's name is required";
    if (!form.doctorPhone.trim()) e.doctorPhone = 'Contact / phone is required';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clinicId)    return toast.error('Please select a clinic');
    if (!form.patientName) return toast.error('Patient name is required');
    if (!form.workType)    return toast.error('Work type is required');
    if (form.intakeMethod === 'EMAIL_3D_FILE' && !form.archUpper && !form.archLower) {
      return toast.error('Select at least one arch (Upper/Lower) that was scanned');
    }

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
      const isEmailFile = form.intakeMethod === 'EMAIL_3D_FILE';
      const archLabel = [form.archUpper && 'Upper', form.archLower && 'Lower'].filter(Boolean).join(' & ');
      const scanNote = isEmailFile
        ? `3D file intake — Arches scanned: ${archLabel || 'none selected'}${archFee > 0 ? ` (Br ${archFee.toLocaleString('en-US')} scan fee)` : ''}`
        : null;
      const res = await api.post('/cases', {
        ...form,
        notes: [scanNote, form.notes].filter(Boolean).join('\n'),
        toothNumbers: selectedTeeth.length > 0 ? selectedTeeth.join(', ') : undefined,
        units: resolvedUnits,
        deliveryDate: form.deliveryDate || undefined,
        // Digital-file intake has no physical pickup step — accept immediately, same as a lab drop-off.
        dropOffAtLab: form.intakeMethod === 'DROP_OFF' || isEmailFile,
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
    const count = flatRateMap[form.workType] ? 1 : Math.max(1, selectedTeeth.length);
    const workTypeFull = unitPrice * count;
    const full = workTypeFull + archFee;
    const archNote = archFee > 0
      ? <> + Br {archFee.toLocaleString('en-US')} scan fee</>
      : null;
    if (form.remake) {
      return <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>Remake — <strong style={{ color: 'var(--red)' }}>Free (Br 0)</strong></span>;
    }
    if (form.redo) {
      return <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        Redo 50% — <strong style={{ color: 'var(--amber)' }}>Br {(full * 0.5).toLocaleString('en-US')}</strong>
      </span>;
    }
    return flatRateMap[form.workType] ? (
      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        {useExpress ? <MdBolt className="mi" size={11} style={{ marginRight: 2 }} /> : ''}flat — Br {unitPrice.toLocaleString('en-US')}{archNote} = <strong style={{ color: 'var(--green)' }}>Br {full.toLocaleString('en-US')}</strong>
      </span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
        {useExpress ? <MdBolt className="mi" size={11} style={{ marginRight: 2 }} /> : ''}Br {unitPrice.toLocaleString('en-US')} × {count}{archNote} = <strong style={{ color: useExpress ? '#92400E' : 'var(--green)' }}>Br {full.toLocaleString('en-US')}</strong>
      </span>
    );
  })();

  const isAligner = isAlignerWorkType(form.workType);

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

              <div className={isAligner ? '' : 'grid-2'}>
                <div className="form-group">
                  <label>Patient Gender</label>
                  <select value={form.patientGender} onChange={set('patientGender')}>
                    <option value="">— Select —</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                {!isAligner && (
                  <div className="form-group">
                    <label>Shade *</label>
                    <input
                      placeholder="e.g. A2, B1"
                      value={form.shade}
                      onChange={e => { set('shade')(e); setErrors(prev => ({ ...prev, shade: '' })); }}
                      style={errors.shade ? { borderColor: 'var(--red)' } : {}}
                    />
                    {errors.shade && <div style={errStyle}><MdWarning className="mi" size={12} /> {errors.shade}</div>}
                  </div>
                )}
              </div>

              {/* Odontogram — aligner cases track tray count instead */}
              {!isAligner && (
                <div className="form-group">
                  <label>Tooth Selection <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(FDI numbering — click to select)</span></label>
                  <div style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '14px 16px', overflowX: 'auto',
                  }}>
                    <Odontogram selected={selectedTeeth} onToggle={toggleTooth} onClear={() => setSelectedTeeth([])} />
                  </div>
                </div>
              )}

              {/* Units */}
              <div className="form-group">
                {isAligner ? (
                  <>
                    <label>Number of Trays</label>
                    <select value={manualUnits} onChange={e => setManualUnits(e.target.value)}>
                      <option value="">— Select tray count —</option>
                      {TRAY_COUNT_OPTIONS.map(n => <option key={n} value={n}>{n} tray{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              {/* Work type — driven by pricing DB */}
              <div className="form-group">
                <label>Work Type *</label>
                <select value={form.workType} onChange={handleWorkTypeChange} required>
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
                      label: 'Remake', icon: MdAutorenew, desc: 'Free — no charge to clinic',
                      color: 'var(--red)', bg: '#FFF1F2', border: '#FECACA',
                    },
                    {
                      field: 'redo', checked: form.redo,
                      label: 'Redo', icon: MdAutorenew, desc: '50% of work-type price',
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: opt.checked ? opt.color : 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <opt.icon size={13} /> {opt.label}
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
                            onChange={e => setForm(prev => ({ ...prev, [opt.field]: e.target.checked }))}
                            style={{ width: 16, height: 16, accentColor: 'var(--blue)', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 700, color: opt.checked ? 'var(--blue)' : 'var(--text-1)' }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    {archFee > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 8, fontWeight: 600 }}>
                        Scan fee: Br {archFee.toLocaleString('en-US')} — added on top of the work-type price below.
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
