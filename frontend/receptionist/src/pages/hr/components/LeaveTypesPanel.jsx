// Ye-Almaz — Leave Types config panel (used by LeaveTab's "Types" section
// and the More → Holiday Calendar-adjacent config screens).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function LeaveTypesPanel() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [days, setDays] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ['hr', 'leave-types'],
    queryFn: () => api.get('/leave/types').then(r => r.data),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'leave-types'] });

  const create = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/leave/types', { name, defaultAnnualDays: days || null, isPaid });
      toast.success('Leave type created');
      setShowForm(false); setName(''); setDays(''); setIsPaid(true);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create leave type'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (t) => {
    try {
      await api.patch(`/leave/types/${t.id}`, { isActive: !t.isActive });
      refresh();
    } catch { toast.error('Could not update leave type'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Leave Types</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdAdd size={14} /> New Type
        </button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 160 }}>
            <Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
          </div>
          <div style={{ width: 140 }}>
            <Field label="Days/Year" hint="optional"><input type="number" style={inputStyle} value={days} onChange={e => setDays(e.target.value)} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} /> Paid
          </label>
          <button className="btn btn-primary btn-sm" onClick={create} disabled={saving} style={{ marginBottom: 14 }}>
            {saving ? 'Saving…' : '✓ Create'}
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th style={{ textAlign: 'center' }}>Days/Year</th><th style={{ textAlign: 'center' }}>Paid</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {types.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No leave types yet</td></tr>
            ) : types.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td style={{ textAlign: 'center' }}>{t.defaultAnnualDays ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>{t.isPaid ? 'Yes' : 'No'}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`badge ${t.isActive ? 'badge-verified' : ''}`}>{t.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(t)}>{t.isActive ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
