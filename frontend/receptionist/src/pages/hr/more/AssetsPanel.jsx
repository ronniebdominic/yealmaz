// Ye-Almaz — Employee Assets (More → Assets)
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const STATUS_BADGE = { AVAILABLE: 'badge-verified', ASSIGNED: '', RETURNED: 'badge-verified', LOST: 'badge-rejected' };

export default function AssetsPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: assets = [] } = useQuery({ queryKey: ['hr', 'assets'], queryFn: () => api.get('/assets').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'assets'] });

  const create = async () => {
    if (!name.trim() || !type.trim()) { toast.error('Name and type are required'); return; }
    setSaving(true);
    try {
      await api.post('/assets', { name, type, serialNumber });
      toast.success('Asset added');
      setName(''); setType(''); setSerialNumber(''); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add asset'); }
    finally { setSaving(false); }
  };

  const assign = async () => {
    if (!assignUserId) { toast.error('Pick an employee'); return; }
    try {
      await api.post(`/assets/${assignTarget.id}/assign`, { userId: assignUserId });
      toast.success('Asset assigned');
      setAssignTarget(null); setAssignUserId('');
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not assign asset'); }
  };

  const returnAsset = async (asset) => {
    try {
      await api.post(`/assets/${asset.id}/return`, {});
      toast.success('Asset returned');
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not process return'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Company Assets</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Asset</button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
          <Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dell Laptop #4" /></Field>
          <Field label="Type"><input style={inputStyle} value={type} onChange={e => setType(e.target.value)} placeholder="e.g. Laptop, Phone, PPE" /></Field>
          <Field label="Serial Number" hint="optional"><input style={inputStyle} value={serialNumber} onChange={e => setSerialNumber(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Add Asset'}</button></div>
        </div>
      )}
      {assignTarget && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Field label={`Assign "${assignTarget.name}" to`}>
              <select style={inputStyle} value={assignUserId} onChange={e => setAssignUserId(e.target.value)}>
                <option value="">— Select employee —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-sm" onClick={assign} style={{ marginBottom: 14 }}>Assign</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAssignTarget(null)} style={{ marginBottom: 14 }}>Cancel</button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Serial</th><th>Assigned To</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {assets.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No assets yet</td></tr>
            ) : assets.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.name}</td>
                <td>{a.type}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{a.serialNumber || '—'}</td>
                <td>{a.assignments?.[0]?.user?.name || '—'}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {a.status === 'AVAILABLE' && <button className="btn btn-ghost btn-sm" onClick={() => setAssignTarget(a)}>Assign</button>}
                  {a.status === 'ASSIGNED' && <button className="btn btn-ghost btn-sm" onClick={() => returnAsset(a)}>Return</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
