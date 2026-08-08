// Ye-Almaz — Log Leave modal (lifted from old HRDashboard.jsx, restyled +
// extended with Phase 1's leave type / half-day support).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function LeaveModal({ employees, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [dayPortion, setDayPortion] = useState('FULL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['hr', 'leave-types'],
    queryFn: () => api.get('/leave/types').then(r => r.data),
  });

  const save = async () => {
    if (!userId || !fromDate || !toDate) { toast.error('Employee, from and to dates are required'); return; }
    setSaving(true);
    try {
      await api.post('/attendance/leave', { userId, fromDate, toDate, reason, leaveTypeId: leaveTypeId || undefined, dayPortion });
      toast.success('Leave logged');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not log leave'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title">Log Leave</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Field label="Employee">
            <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Leave Type" hint="optional">
            <select style={inputStyle} value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)}>
              <option value="">— None —</option>
              {leaveTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="From">
                <input type="date" style={inputStyle} value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="To">
                <input type="date" style={inputStyle} value={toDate} onChange={e => setToDate(e.target.value)} />
              </Field>
            </div>
          </div>
          <Field label="Day Portion">
            <div style={{ display: 'flex', gap: 6 }}>
              {[['FULL', 'Full Day'], ['HALF_AM', 'Half — AM'], ['HALF_PM', 'Half — PM']].map(([v, l]) => (
                <button key={v} type="button" className={`btn btn-sm ${dayPortion === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDayPortion(v)}>{l}</button>
              ))}
            </div>
          </Field>
          <Field label="Reason" hint="optional">
            <input style={inputStyle} value={reason} onChange={e => setReason(e.target.value)} />
          </Field>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : '✓ Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
