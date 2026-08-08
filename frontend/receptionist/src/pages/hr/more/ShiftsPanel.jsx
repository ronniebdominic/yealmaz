// Ye-Almaz — Shift Management (More → Shifts). Create/edit shift
// templates and assign them to employees — assignment always closes out
// the prior open row server-side, never overwrites it.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY = {
  name: '', startTime: '09:00', endTime: '18:00', breakMinutes: 60,
  gracePeriodMinutes: 10, lateThresholdMinutes: 0, earlyDepartureThresholdMinutes: 0,
  overtimeThresholdMinutes: '', workingDays: [1, 2, 3, 4, 5, 6],
};

export default function ShiftsPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [assignShiftId, setAssignShiftId] = useState('');
  const [assignUserId, setAssignUserId] = useState('');

  const { data: shifts = [] } = useQuery({ queryKey: ['hr', 'shifts'], queryFn: () => api.get('/shifts').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'shifts'] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDay = (d) => setForm(f => ({ ...f, workingDays: f.workingDays.includes(d) ? f.workingDays.filter(x => x !== d) : [...f.workingDays, d].sort() }));

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/shifts', { ...form, overtimeThresholdMinutes: form.overtimeThresholdMinutes || null });
      toast.success('Shift created');
      setShowForm(false); setForm(EMPTY);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create shift'); }
    finally { setSaving(false); }
  };

  const assign = async () => {
    if (!assignShiftId || !assignUserId) { toast.error('Pick a shift and an employee'); return; }
    try {
      await api.post('/shifts/assign', { shiftId: assignShiftId, userId: assignUserId });
      toast.success('Shift assigned');
      setAssignUserId('');
    } catch (err) { toast.error(err.response?.data?.error || 'Could not assign shift'); }
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Shifts</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MdAdd size={14} /> New Shift
          </button>
        </div>
        {showForm && (
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px' }}>
              <div style={{ gridColumn: '1 / -1' }}><Field label="Name"><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Morning Shift" /></Field></div>
              <Field label="Start Time"><input type="time" style={inputStyle} value={form.startTime} onChange={e => set('startTime', e.target.value)} /></Field>
              <Field label="End Time"><input type="time" style={inputStyle} value={form.endTime} onChange={e => set('endTime', e.target.value)} /></Field>
              <Field label="Break (min)"><input type="number" style={inputStyle} value={form.breakMinutes} onChange={e => set('breakMinutes', parseInt(e.target.value) || 0)} /></Field>
              <Field label="Grace Period (min)"><input type="number" style={inputStyle} value={form.gracePeriodMinutes} onChange={e => set('gracePeriodMinutes', parseInt(e.target.value) || 0)} /></Field>
              <Field label="Late Threshold (min)"><input type="number" style={inputStyle} value={form.lateThresholdMinutes} onChange={e => set('lateThresholdMinutes', parseInt(e.target.value) || 0)} /></Field>
              <Field label="Early Departure Threshold (min)"><input type="number" style={inputStyle} value={form.earlyDepartureThresholdMinutes} onChange={e => set('earlyDepartureThresholdMinutes', parseInt(e.target.value) || 0)} /></Field>
              <Field label="Overtime Threshold (min)" hint="optional — defaults to shift length minus break"><input type="number" style={inputStyle} value={form.overtimeThresholdMinutes} onChange={e => set('overtimeThresholdMinutes', e.target.value)} /></Field>
            </div>
            <Field label="Working Days">
              <div style={{ display: 'flex', gap: 6 }}>
                {DAY_LABELS.map((d, i) => (
                  <button key={i} type="button" className={`btn btn-sm ${form.workingDays.includes(i) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleDay(i)}>{d}</button>
                ))}
              </div>
            </Field>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Create Shift'}</button>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Hours</th><th>Working Days</th><th style={{ textAlign: 'center' }}>Grace</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
            <tbody>
              {shifts.length === 0 ? (
                <tr><td colSpan={5} className="empty-state">No shifts yet</td></tr>
              ) : shifts.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.startTime}–{s.endTime}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.workingDays.map(d => DAY_LABELS[d]).join(', ')}</td>
                  <td style={{ textAlign: 'center' }}>{s.gracePeriodMinutes}m</td>
                  <td style={{ textAlign: 'center' }}><span className={`badge ${s.isActive ? 'badge-verified' : ''}`}>{s.isActive ? 'Active' : 'Disabled'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Assign Shift</div></div>
        <div style={{ padding: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 180 }}>
            <Field label="Employee">
              <select style={inputStyle} value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ minWidth: 180 }}>
            <Field label="Shift">
              <select style={inputStyle} value={assignShiftId} onChange={e => setAssignShiftId(e.target.value)}>
                <option value="">— Select —</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-sm" onClick={assign} style={{ marginBottom: 14 }}>Assign</button>
        </div>
      </div>
    </div>
  );
}
