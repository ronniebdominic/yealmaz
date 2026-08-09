// Ye-Almaz — Training & Certifications (More → Training)
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const CERT_STATUS_BADGE = { VALID: 'badge-verified', EXPIRING_SOON: '', EXPIRED: 'badge-rejected' };

export default function TrainingPanel({ employees }) {
  const qc = useQueryClient();
  const [section, setSection] = useState('Training');
  const [showForm, setShowForm] = useState(false);

  const { data: records = [] } = useQuery({ queryKey: ['hr', 'training-records'], queryFn: () => api.get('/training/records').then(r => r.data) });
  const { data: certs = [] } = useQuery({ queryKey: ['hr', 'certifications'], queryFn: () => api.get('/training/certifications').then(r => r.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr', 'training-records'] }); qc.invalidateQueries({ queryKey: ['hr', 'certifications'] }); };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="filters">
          {['Training', 'Certifications'].map(s => (
            <button key={s} className={`filter-chip ${section === s ? 'active' : ''}`} onClick={() => { setSection(s); setShowForm(false); }}>{s}</button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdAdd size={14} /> New {section === 'Training' ? 'Training' : 'Certification'}
        </button>
      </div>

      {section === 'Training' && <TrainingSection employees={employees} showForm={showForm} onCreated={() => { setShowForm(false); refresh(); }} records={records} />}
      {section === 'Certifications' && <CertificationsSection employees={employees} showForm={showForm} onCreated={() => { setShowForm(false); refresh(); }} certs={certs} />}
    </div>
  );
}

function TrainingSection({ employees, showForm, onCreated, records }) {
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [trainerName, setTrainerName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationHours, setDurationHours] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!userId || !title.trim()) { toast.error('Employee and title are required'); return; }
    setSaving(true);
    try {
      await api.post('/training/records', { userId, title, trainerName, date, durationHours });
      toast.success('Training logged');
      onCreated();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not log training'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
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
          <div style={{ gridColumn: '1 / -1' }}><Field label="Title"><input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} /></Field></div>
          <Field label="Trainer" hint="optional"><input style={inputStyle} value={trainerName} onChange={e => setTrainerName(e.target.value)} /></Field>
          <Field label="Date"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Duration (hrs)" hint="optional"><input type="number" style={inputStyle} value={durationHours} onChange={e => setDurationHours(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Log Training'}</button></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Title</th><th>Trainer</th><th>Date</th><th style={{ textAlign: 'center' }}>Duration</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No training records yet</td></tr>
            ) : records.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>{r.user?.name}</td>
                <td>{r.title}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.trainerName || '—'}</td>
                <td>{format(new Date(r.date), 'dd MMM yyyy')}</td>
                <td style={{ textAlign: 'center' }}>{r.durationHours ? `${r.durationHours}h` : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${r.status === 'COMPLETED' ? 'badge-verified' : ''}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CertificationsSection({ employees, showForm, onCreated, certs }) {
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!userId || !name.trim()) { toast.error('Employee and name are required'); return; }
    setSaving(true);
    try {
      await api.post('/training/certifications', { userId, name, issueDate, expiryDate: expiryDate || undefined });
      toast.success('Certification recorded');
      onCreated();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not record certification'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card">
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
          <div style={{ gridColumn: '1 / -1' }}><Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field></div>
          <Field label="Issue Date"><input type="date" style={inputStyle} value={issueDate} onChange={e => setIssueDate(e.target.value)} /></Field>
          <Field label="Expiry Date" hint="optional"><input type="date" style={inputStyle} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Record'}</button></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Name</th><th>Issued</th><th>Expires</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
          <tbody>
            {certs.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No certifications yet</td></tr>
            ) : certs.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.user?.name}</td>
                <td>{c.name}</td>
                <td>{format(new Date(c.issueDate), 'dd MMM yyyy')}</td>
                <td>{c.expiryDate ? format(new Date(c.expiryDate), 'dd MMM yyyy') : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${CERT_STATUS_BADGE[c.status]}`}>{c.status.replace('_', ' ')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
