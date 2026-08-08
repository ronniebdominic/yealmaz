// Ye-Almaz — Holiday Calendar (More → Holidays). Single-lab system, no
// branch scoping. Holidays affect attendance status and leave day-counting
// (see attendanceDaySummary.js / getLeaveDayCount).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd, MdDelete } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function HolidaysPanel() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('PUBLIC');
  const [saving, setSaving] = useState(false);

  const { data: holidays = [] } = useQuery({ queryKey: ['hr', 'holidays'], queryFn: () => api.get('/leave/holidays').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'holidays'] });

  const create = async () => {
    if (!date || !name.trim()) { toast.error('Date and name are required'); return; }
    setSaving(true);
    try {
      await api.post('/leave/holidays', { date, name, type });
      toast.success('Holiday added');
      setShowForm(false); setDate(''); setName('');
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add holiday'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this holiday?')) return;
    try { await api.delete(`/leave/holidays/${id}`); refresh(); } catch { toast.error('Could not remove holiday'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Holiday Calendar</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdAdd size={14} /> Add Holiday
        </button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div><Field label="Date"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field></div>
          <div style={{ minWidth: 180 }}><Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ethiopian New Year" /></Field></div>
          <div>
            <Field label="Type">
              <select style={inputStyle} value={type} onChange={e => setType(e.target.value)}>
                <option value="PUBLIC">Public</option>
                <option value="COMPANY">Company</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-sm" onClick={create} disabled={saving} style={{ marginBottom: 14 }}>{saving ? 'Saving…' : '✓ Add'}</button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th style={{ textAlign: 'center' }}>Type</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No holidays configured</td></tr>
            ) : holidays.map(h => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{format(new Date(h.date), 'dd MMM yyyy')}</td>
                <td>{h.name}</td>
                <td style={{ textAlign: 'center' }}><span className="badge">{h.type}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(h.id)}><MdDelete size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
