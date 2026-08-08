// Ye-Almaz — Manual clock event modal (lifted from old HRDashboard.jsx,
// restyled onto the shared design system).
import { useState } from 'react';
import api from '../../../api';
import toast from 'react-hot-toast';
import { Field, inputStyle } from '../../../utils/adminForms';

const TYPES = [
  { value: 'CLOCK_IN', label: 'Clock In' },
  { value: 'CLOCK_OUT', label: 'Clock Out' },
  { value: 'BREAK_START', label: 'Start Break' },
  { value: 'BREAK_END', label: 'End Break' },
];

export default function ClockEventModal({ employees, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('CLOCK_IN');
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!userId) { toast.error('Select an employee'); return; }
    setSaving(true);
    try {
      await api.post('/attendance/manual', { userId, type, timestamp: new Date(timestamp).toISOString() });
      toast.success('Attendance recorded');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not record attendance'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">Log Clock Event</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Field label="Employee">
            <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TYPES.map(t => (
                <button key={t.value} type="button"
                  className={`btn btn-sm ${type === t.value ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setType(t.value)}>{t.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Time">
            <input type="datetime-local" style={inputStyle} value={timestamp} onChange={e => setTimestamp(e.target.value)} />
          </Field>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : '✓ Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
