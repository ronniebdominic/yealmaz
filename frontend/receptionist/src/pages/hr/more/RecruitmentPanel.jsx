// Ye-Almaz — Recruitment (More → Recruitment). Applied -> Screening ->
// Interview -> Offer -> Hired/Rejected. Hiring creates the real User
// account directly (POST /recruitment/:id/hire).
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle, generatePassword, PasswordInput } from '../../../utils/adminForms';

const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
const NEXT_STAGE = { APPLIED: 'SCREENING', SCREENING: 'INTERVIEW', INTERVIEW: 'OFFER' };

function HireModal({ candidate, onClose, onHired }) {
  const [email, setEmail] = useState(candidate.email || '');
  const [role, setRole] = useState('LAB_TECH');
  const [password, setPassword] = useState(() => generatePassword());
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const hire = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/recruitment/${candidate.id}/hire`, { email, role, password });
      toast.success(`${data.user.name} hired — email ${email}, password ${password}`, { duration: 8000 });
      onHired();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not hire candidate'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header"><div className="modal-title">Hire {candidate.name}</div><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <Field label="Email"><input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Role">
            <select style={inputStyle} value={role} onChange={e => setRole(e.target.value)}>
              <option value="LAB_TECH">Lab Technician</option>
              <option value="RECEPTIONIST">Receptionist</option>
              <option value="DELIVERY">Delivery</option>
              <option value="DISPATCH">Dispatch</option>
              <option value="FINANCE">Finance</option>
              <option value="INVENTORY_MANAGER">Inventory Manager</option>
              <option value="HR_MANAGER">HR Manager</option>
            </select>
          </Field>
          <Field label="Password">
            <PasswordInput value={password} onChange={setPassword} showPass={showPass} onToggleShow={() => setShowPass(s => !s)} onRegenerate={() => setPassword(generatePassword())} />
          </Field>
          <button className="btn btn-primary" onClick={hire} disabled={saving} style={{ width: '100%' }}>{saving ? 'Hiring…' : '✓ Hire & Create Account'}</button>
        </div>
      </div>
    </div>
  );
}

export default function RecruitmentPanel() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [hireTarget, setHireTarget] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: candidates = [] } = useQuery({ queryKey: ['hr', 'candidates'], queryFn: () => api.get('/recruitment').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'candidates'] });

  const create = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      await api.post('/recruitment', { name, email, phone, position, source });
      toast.success('Candidate added');
      setName(''); setEmail(''); setPhone(''); setPosition(''); setSource(''); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add candidate'); }
    finally { setSaving(false); }
  };

  const advance = async (c) => {
    const next = NEXT_STAGE[c.status];
    if (!next) return;
    try { await api.patch(`/recruitment/${c.id}`, { status: next }); refresh(); }
    catch { toast.error('Could not update candidate'); }
  };
  const reject = async (c) => {
    try { await api.patch(`/recruitment/${c.id}`, { status: 'REJECTED' }); refresh(); }
    catch { toast.error('Could not update candidate'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Recruitment</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Candidate</button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
          <Field label="Name"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Email" hint="optional"><input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Phone" hint="optional"><input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Position" hint="optional"><input style={inputStyle} value={position} onChange={e => setPosition(e.target.value)} /></Field>
          <Field label="Source" hint="optional"><input style={inputStyle} value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. Referral" /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Add Candidate'}</button></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Position</th><th>Source</th><th style={{ textAlign: 'center' }}>Stage</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No candidates yet</td></tr>
            ) : candidates.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.position || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{c.source || '—'}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${c.status === 'HIRED' ? 'badge-verified' : c.status === 'REJECTED' ? 'badge-rejected' : ''}`}>{c.status}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {NEXT_STAGE[c.status] && <button className="btn btn-ghost btn-sm" onClick={() => advance(c)} style={{ marginRight: 6 }}>→ {NEXT_STAGE[c.status]}</button>}
                  {c.status === 'OFFER' && <button className="btn btn-primary btn-sm" onClick={() => setHireTarget(c)} style={{ marginRight: 6 }}>Hire</button>}
                  {!['HIRED', 'REJECTED'].includes(c.status) && <button className="btn btn-ghost btn-sm" onClick={() => reject(c)}>Reject</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hireTarget && <HireModal candidate={hireTarget} onClose={() => setHireTarget(null)} onHired={() => { setHireTarget(null); refresh(); }} />}
    </div>
  );
}
