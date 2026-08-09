// Ye-Almaz — Offboarding (More → Offboarding). Resignation -> Notice ->
// Asset Return -> Access Revocation -> Leave Settlement -> Final Payroll
// -> Exit Interview -> Archived. Never deletes the employee — Archived
// just sets EmploymentStatus=TERMINATED + deactivates the account.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd, MdArrowForward } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const WORKFLOW = ['RESIGNATION', 'NOTICE', 'ASSET_RETURN', 'ACCESS_REVOCATION', 'LEAVE_SETTLEMENT', 'FINAL_PAYROLL', 'EXIT_INTERVIEW', 'ARCHIVED'];
const LABELS = { RESIGNATION: 'Resignation', NOTICE: 'Notice', ASSET_RETURN: 'Asset Return', ACCESS_REVOCATION: 'Access Revocation', LEAVE_SETTLEMENT: 'Leave Settlement', FINAL_PAYROLL: 'Final Payroll', EXIT_INTERVIEW: 'Exit Interview', ARCHIVED: 'Archived' };

export default function OffboardingPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [resignationDate, setResignationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: cases = [] } = useQuery({ queryKey: ['hr', 'offboarding'], queryFn: () => api.get('/offboarding').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'offboarding'] });

  const start = async () => {
    if (!userId) { toast.error('Pick an employee'); return; }
    setSaving(true);
    try {
      await api.post('/offboarding', { userId, resignationDate, lastWorkingDate: lastWorkingDate || undefined, reason });
      toast.success('Offboarding started');
      setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not start offboarding'); }
    finally { setSaving(false); }
  };

  const advance = async (c) => {
    const idx = WORKFLOW.indexOf(c.status);
    const next = WORKFLOW[idx + 1];
    if (next === 'ARCHIVED' && !window.confirm(`Archive ${c.user?.name}? This deactivates their account and marks them Terminated.`)) return;
    try {
      await api.patch(`/offboarding/${c.id}/advance`, {});
      toast.success(`Moved to ${LABELS[next]}`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not advance'); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Offboarding</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> Start Offboarding</button>
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
          <Field label="Resignation Date"><input type="date" style={inputStyle} value={resignationDate} onChange={e => setResignationDate(e.target.value)} /></Field>
          <Field label="Last Working Date" hint="optional"><input type="date" style={inputStyle} value={lastWorkingDate} onChange={e => setLastWorkingDate(e.target.value)} /></Field>
          <Field label="Reason" hint="optional"><input style={inputStyle} value={reason} onChange={e => setReason(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}><button className="btn btn-primary btn-sm" onClick={start} disabled={saving}>{saving ? 'Starting…' : '✓ Start'}</button></div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Resignation Date</th><th>Last Working Date</th><th style={{ textAlign: 'center' }}>Stage</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {cases.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No offboarding cases</td></tr>
            ) : cases.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.user?.name}</td>
                <td>{format(new Date(c.resignationDate), 'dd MMM yyyy')}</td>
                <td>{c.lastWorkingDate ? format(new Date(c.lastWorkingDate), 'dd MMM yyyy') : '—'}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${c.status === 'ARCHIVED' ? 'badge-verified' : ''}`}>{LABELS[c.status]}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {c.status !== 'ARCHIVED' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => advance(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MdArrowForward size={13} /> {LABELS[WORKFLOW[WORKFLOW.indexOf(c.status) + 1]]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
