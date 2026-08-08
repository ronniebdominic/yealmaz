// Ye-Almaz — Timesheets (More → Timesheets). Manual time-activity entries;
// for LAB_TECH employees, existing CaseStage scan history is available
// read-only via the Employee Profile's Timesheets tab (not duplicated
// here — this panel is the org-wide manual entry log).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function TimesheetsPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: categories = { productive: [], nonProductive: [] } } = useQuery({
    queryKey: ['hr', 'timesheet-categories'],
    queryFn: () => api.get('/timesheets/categories').then(r => r.data),
  });
  const { data: entries = [] } = useQuery({
    queryKey: ['hr', 'timesheets'],
    queryFn: () => api.get('/timesheets').then(r => r.data),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'timesheets'] });

  const create = async () => {
    if (!userId || !date || !startTime || !endTime || !category) { toast.error('All fields except notes are required'); return; }
    setSaving(true);
    try {
      await api.post('/timesheets', {
        userId, date, category, notes,
        startTime: new Date(`${date}T${startTime}`).toISOString(),
        endTime: new Date(`${date}T${endTime}`).toISOString(),
      });
      toast.success('Entry logged');
      setShowForm(false); setStartTime(''); setEndTime(''); setCategory(''); setNotes('');
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not log entry'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Timesheets</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdAdd size={14} /> Log Entry
        </button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Employee">
              <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Date"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Start"><input type="time" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
          <Field label="End"><input type="time" style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Category">
              <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">— Select —</option>
                <optgroup label="Productive">{categories.productive.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
                <optgroup label="Non-productive">{categories.nonProductive.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
              </select>
            </Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Notes" hint="optional"><input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Log Entry'}</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Date</th><th>Time</th><th>Category</th><th style={{ textAlign: 'center' }}>Productive</th><th>Notes</th></tr></thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No timesheet entries yet</td></tr>
            ) : entries.map(e => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600 }}>{e.user?.name}</td>
                <td>{format(new Date(e.date), 'dd MMM yyyy')}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(e.startTime), 'h:mm a')}–{format(new Date(e.endTime), 'h:mm a')}</td>
                <td>{e.category}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${e.productive ? 'badge-verified' : ''}`}>{e.productive ? 'Yes' : 'No'}</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{e.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
