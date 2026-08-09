// Ye-Almaz — Employee Documents (More → Documents)
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd, MdOpenInNew } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const TYPES = ['CONTRACT', 'ID', 'CERTIFICATE', 'TRAINING', 'SALARY_REVISION', 'PROMOTION', 'PAYSLIP', 'WARNING', 'OTHER'];

export default function DocumentsPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('OTHER');
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: docs = [] } = useQuery({ queryKey: ['hr', 'documents'], queryFn: () => api.get('/documents').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'documents'] });

  const upload = async () => {
    if (!userId || !name.trim() || !file) { toast.error('Employee, name and file are required'); return; }
    setSaving(true);
    try {
      const form = new FormData();
      form.append('file', file); form.append('userId', userId); form.append('type', type); form.append('name', name);
      // No explicit Content-Type — axios sets multipart/form-data with the
      // correct boundary automatically for a FormData body; overriding it
      // manually here would drop that boundary and break parsing server-side.
      await api.post('/documents', form);
      toast.success('Document uploaded');
      setName(''); setFile(null); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not upload document'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Employee Documents</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> Upload</button>
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
          <Field label="Type">
            <select style={inputStyle} value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Employment Contract" /></Field>
          <Field label="File"><input type="file" onChange={e => setFile(e.target.files[0])} style={{ fontSize: 12 }} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={upload} disabled={saving}>{saving ? 'Uploading…' : '✓ Upload'}</button></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th>Name</th><th style={{ textAlign: 'center' }}>Version</th><th>Uploaded</th><th style={{ textAlign: 'right' }}>File</th></tr></thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No documents yet</td></tr>
            ) : docs.map(d => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600 }}>{d.user?.name}</td>
                <td><span className="badge">{d.type.replace('_', ' ')}</span></td>
                <td>{d.name}</td>
                <td style={{ textAlign: 'center' }}>v{d.version}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(d.createdAt), 'dd MMM yyyy')}</td>
                <td style={{ textAlign: 'right' }}>
                  <a href={d.fileUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <MdOpenInNew size={13} /> Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
