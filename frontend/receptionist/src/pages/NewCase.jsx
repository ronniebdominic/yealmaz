import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import api from '../api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

// ── Work type groups ──────────────────────────────────────
const WORK_TYPE_GROUPS = [
  { label: 'Zirconia', types: [
    'Zirconia Express', 'Full Contoured Zirconia', 'Layered Zirconia Aesthetic',
    'Zirconia Screw Retained Crown', 'Zirconia Veneer', 'Zirconia Rest',
    'Zirconia Coping', 'Custom Abutment', 'Screw Retained Aesthetic',
  ]},
  { label: 'Lithium Disilicate', types: [
    'Lithium Disilicate Inlays / Onlays / Crown', 'Lithium Disilicate Veneers',
  ]},
  { label: 'Emax', types: ['Emax Crown', 'Emax Veneer', 'Emax Bridge'] },
  { label: 'PFM', types: ['PFM Crown', 'PFM Crown with Metal Try-In', 'PFM Bridge'] },
  { label: 'Metal', types: ['Full Metal Crown', 'Full Metal Bridge', 'Metal Occlusal Crown'] },
  { label: 'Implant', types: [
    'Implant Crown PFM', 'Implant Crown Zirconia',
    'Surgical Guide', 'Implant Planning', 'Temporary Abutment', 'Healing Cap',
  ]},
  { label: 'Dentures', types: [
    'Complete Denture', 'Flexible Denture', 'Cast Partial Denture',
    'Hybrid Denture', 'Implant Overdenture',
  ]},
  { label: 'Temporary', types: ['Temporary Crown PMMA', 'Temporary Bridge PMMA'] },
  { label: 'Composite', types: ['Composite Veneer', 'Composite Crown'] },
  { label: 'Digital / CAD', types: ['Wax-Up Diagnostic', 'CAD Design Service', '3D Printed Model'] },
  { label: 'Guards & Appliances', types: [
    'Orthodontic Retainer', 'Night Guard Soft', 'Night Guard Hard',
    'Sports Guard', 'Bite Splint', 'Bleaching Tray', 'Clear Aligner Setup', 'Gingival Mask',
  ]},
  { label: 'Specialty Prosthetics', types: [
    'Maryland Bridge', 'Precision Attachment', 'Telescopic Crown',
    'Bar Attachment', 'Locator Housing', 'Peek Framework', 'Peek Crown',
  ]},
];

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

  // Midline rendered as a sibling via React.Fragment (not nested inside the tooth div)
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

// ── Auto due-date rules ───────────────────────────────────
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
function calcDueDate(workType) {
  const d = new Date();
  d.setDate(d.getDate() + getDueDays(workType));
  return d.toISOString().split('T')[0]; // yyyy-mm-dd for <input type="date">
}

// Work types priced per full dentition — never multiplied by tooth count
const FLAT_PRICE_TYPES = new Set([
  'Orthodontic Retainer', 'Night Guard Soft', 'Night Guard Hard',
  'Sports Guard', 'Bite Splint', 'Bleaching Tray', 'Clear Aligner Setup', 'Gingival Mask',
]);

// ── Page ──────────────────────────────────────────────────
export default function NewCase() {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [form, setForm] = useState({
    clinicId: '', patientName: '', patientAge: '', doctorName: '',
    doctorPhone: '', doctorGender: '',
    workType: '', shade: '', notes: '', dueDate: '', totalAmount: '',
    deliveryType: 'NORMAL',
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

  // Auto-calculate price whenever workType or tooth count changes
  useEffect(() => {
    if (!form.workType || Object.keys(priceMap).length === 0) return;
    const unitPrice = priceMap[form.workType];
    if (unitPrice === undefined) return;
    const count = FLAT_PRICE_TYPES.has(form.workType) ? 1 : Math.max(1, selectedTeeth.length);
    setForm(prev => ({ ...prev, totalAmount: String(unitPrice * count) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.workType, selectedTeeth.length, priceMap]);

  // Auto-set due date whenever work type changes
  useEffect(() => {
    if (!form.workType) return;
    setForm(prev => ({ ...prev, dueDate: calcDueDate(form.workType) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.workType]);

  useEffect(() => { loadClinics(); }, []);

  const loadClinics = async () => {
    try {
      const res = await api.get('/clinics');
      setClinics(res.data);
    } catch {}
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const toggleTooth = (num) => {
    setSelectedTeeth(prev =>
      prev.includes(num)
        ? prev.filter(t => t !== num)
        : [...prev, num].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clinicId) return toast.error('Please select a clinic');
    if (!form.patientName) return toast.error('Patient name is required');
    if (!form.workType) return toast.error('Work type is required');

    setSubmitting(true);
    try {
      const res = await api.post('/cases', {
        ...form,
        toothNumbers: selectedTeeth.length > 0 ? selectedTeeth.join(', ') : undefined,
      });
      toast.success(`Case ${res.data.caseNumber} created!`);
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
                <select value={form.clinicId} onChange={set('clinicId')} required>
                  <option value="">— Select clinic —</option>
                  {clinics.map(c => <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ''}{c.name}</option>)}
                </select>
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

              {/* Doctor info */}
              <div className="grid-2">
                <div className="form-group">
                  <label>Doctor Name</label>
                  <input placeholder="e.g. Dr. Sarah Ahmed" value={form.doctorName} onChange={set('doctorName')} />
                </div>
                <div className="form-group">
                  <label>Doctor Phone</label>
                  <input type="tel" placeholder="e.g. +251 911 000 000" value={form.doctorPhone} onChange={set('doctorPhone')} />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label>Doctor Gender</label>
                  <select value={form.doctorGender} onChange={set('doctorGender')}>
                    <option value="">— Select —</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Shade</label>
                  <input placeholder="e.g. A2, B1" value={form.shade} onChange={set('shade')} />
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

              {/* Work type */}
              <div className="form-group">
                <label>Work Type *</label>
                <select value={form.workType} onChange={set('workType')} required>
                  <option value="">— Select work type —</option>
                  {WORK_TYPE_GROUPS.map(group => (
                    <optgroup key={group.label} label={group.label}>
                      {group.types.map(t => <option key={t} value={t}>{t}</option>)}
                    </optgroup>
                  ))}
                </select>
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
                  <label>Amount (Br)
                    {form.workType && priceMap[form.workType] !== undefined && (
                      FLAT_PRICE_TYPES.has(form.workType) ? (
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                          flat rate —{' '}
                          <strong style={{ color: 'var(--green)' }}>
                            Br {priceMap[form.workType].toLocaleString('en-US')}
                          </strong>
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                          Br {priceMap[form.workType].toLocaleString('en-US')} × {Math.max(1, selectedTeeth.length)} {selectedTeeth.length > 1 ? 'teeth' : 'tooth'}
                          {' = '}
                          <strong style={{ color: 'var(--green)' }}>
                            Br {(priceMap[form.workType] * Math.max(1, selectedTeeth.length)).toLocaleString('en-US')}
                          </strong>
                        </span>
                      )
                    )}
                  </label>
                  <input
                    type="number"
                    placeholder="Auto-calculated from work type"
                    value={form.totalAmount}
                    onChange={set('totalAmount')}
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
