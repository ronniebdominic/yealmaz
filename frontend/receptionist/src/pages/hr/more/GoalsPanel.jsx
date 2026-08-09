// Ye-Almaz — Goals / KPIs (More → Goals)
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function GoalsPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: goals = [] } = useQuery({ queryKey: ['hr', 'goals'], queryFn: () => api.get('/goals').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'goals'] });

  const create = async () => {
    if (!userId || !title.trim()) { toast.error('Employee and title are required'); return; }
    setSaving(true);
    try {
      await api.post('/goals', { userId, title, targetValue, unit, dueDate: dueDate || undefined });
      toast.success('Goal created');
      setTitle(''); setTargetValue(''); setUnit(''); setDueDate(''); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create goal'); }
    finally { setSaving(false); }
  };

  const updateActual = async (goal, actualValue) => {
    try {
      const status = goal.targetValue != null && parseFloat(actualValue) >= goal.targetValue ? 'ACHIEVED' : goal.status;
      await api.patch(`/goals/${goal.id}`, { actualValue, status });
      refresh();
    } catch { toast.error('Could not update goal'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Goals & KPIs</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Goal</button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Employee">
              <select style={inputStyle} value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}><Field label="Title"><input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. 100 designs/month" /></Field></div>
          <Field label="Target" hint="optional"><input type="number" style={inputStyle} value={targetValue} onChange={e => setTargetValue(e.target.value)} /></Field>
          <Field label="Unit" hint="optional"><input style={inputStyle} value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. designs" /></Field>
          <Field label="Due Date" hint="optional"><input type="date" style={inputStyle} value={dueDate} onChange={e => setDueDate(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Create Goal'}</button></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Title</th><th style={{ textAlign: 'center' }}>Target</th><th style={{ textAlign: 'center' }}>Actual</th><th>Due</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
          <tbody>
            {goals.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No goals yet</td></tr>
            ) : goals.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.user?.name}</td>
                <td>{g.title}</td>
                <td style={{ textAlign: 'center' }}>{g.targetValue ?? '—'} {g.unit}</td>
                <td style={{ textAlign: 'center' }}>
                  <input type="number" defaultValue={g.actualValue ?? ''} onBlur={e => e.target.value !== '' && updateActual(g, e.target.value)}
                    style={{ width: 70, padding: '3px 6px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }} />
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{g.dueDate ? format(new Date(g.dueDate), 'dd MMM yyyy') : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${g.status === 'ACHIEVED' ? 'badge-verified' : g.status === 'MISSED' ? 'badge-rejected' : ''}`}>{g.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
