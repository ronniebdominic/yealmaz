// Ye-Almaz — Attendance correction modal. Raw punches are never edited or
// deleted (AttendanceEvent is append-only) — this writes an additive
// AttendanceCorrection record instead: original → corrected → reason →
// approved by → timestamp, a full audit trail.
import { useState } from 'react';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function AttendanceCorrectionModal({ employee, date, onClose, onSaved }) {
  const [correctedClockIn, setCorrectedClockIn] = useState(employee.clockIn ? employee.clockIn.slice(0, 16) : '');
  const [correctedClockOut, setCorrectedClockOut] = useState(employee.clockOut ? employee.clockOut.slice(0, 16) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    setSaving(true);
    try {
      await api.post('/attendance/corrections', {
        userId: employee.id, date,
        correctedClockIn: correctedClockIn ? new Date(correctedClockIn).toISOString() : null,
        correctedClockOut: correctedClockOut ? new Date(correctedClockOut).toISOString() : null,
        reason,
      });
      toast.success('Correction recorded');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save correction'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">Correct Attendance — {employee.name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text-2)' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Raw punches (never modified)</div>
            Clock In: {employee.clockIn ? format(new Date(employee.clockIn), 'dd MMM yyyy, h:mm a') : '—'}<br />
            Clock Out: {employee.clockOut ? format(new Date(employee.clockOut), 'dd MMM yyyy, h:mm a') : '—'}<br />
            Working Hours: {employee.workingHours}h · Overtime: {employee.overtimeHours}h
          </div>
          <Field label="Corrected Clock In">
            <input type="datetime-local" style={inputStyle} value={correctedClockIn} onChange={e => setCorrectedClockIn(e.target.value)} />
          </Field>
          <Field label="Corrected Clock Out">
            <input type="datetime-local" style={inputStyle} value={correctedClockOut} onChange={e => setCorrectedClockOut(e.target.value)} />
          </Field>
          <Field label="Reason" hint="required">
            <input style={inputStyle} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Forgot to clock out, device offline" />
          </Field>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : '✓ Save Correction'}
          </button>
        </div>
      </div>
    </div>
  );
}
