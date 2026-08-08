// Ye-Almaz — Advances & Loans (More → Advances). Approving moves an
// advance to ACTIVE; payroll.js's run-creation then deducts the
// installment automatically until outstandingBalance reaches 0.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function AdvancesPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('ADVANCE');
  const [amount, setAmount] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: advances = [] } = useQuery({ queryKey: ['hr', 'advances'], queryFn: () => api.get('/advances').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'advances'] });

  const create = async () => {
    if (!userId || !amount || !installmentAmount) { toast.error('Employee, amount and installment are required'); return; }
    setSaving(true);
    try {
      await api.post('/advances', { userId, type, amount, installmentAmount, reason });
      toast.success('Advance recorded');
      setAmount(''); setInstallmentAmount(''); setReason(''); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not record advance'); }
    finally { setSaving(false); }
  };

  const approve = async (id) => { try { await api.patch(`/advances/${id}/approve`); refresh(); } catch { toast.error('Could not approve'); } };
  const reject = async (id) => { try { await api.patch(`/advances/${id}/reject`); refresh(); } catch { toast.error('Could not reject'); } };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Advances & Loans</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> New Request</button>
      </div>
      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 12px' }}>
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
              <option value="ADVANCE">Advance</option>
              <option value="LOAN">Loan</option>
            </select>
          </Field>
          <Field label="Total Amount (Br)"><input type="number" style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} /></Field>
          <Field label="Installment / Payroll (Br)"><input type="number" style={inputStyle} value={installmentAmount} onChange={e => setInstallmentAmount(e.target.value)} /></Field>
          <Field label="Reason" hint="optional"><input style={inputStyle} value={reason} onChange={e => setReason(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Submit'}</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Type</th><th style={{ textAlign: 'center' }}>Amount</th><th style={{ textAlign: 'center' }}>Installment</th><th style={{ textAlign: 'center' }}>Outstanding</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {advances.length === 0 ? (
              <tr><td colSpan={7} className="empty-state">No advances yet</td></tr>
            ) : advances.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600 }}>{a.user?.name}</td>
                <td>{a.type}</td>
                <td style={{ textAlign: 'center' }}>Br {a.amount.toLocaleString('en-US')}</td>
                <td style={{ textAlign: 'center' }}>Br {a.installmentAmount.toLocaleString('en-US')}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: a.outstandingBalance > 0 ? 'var(--amber)' : 'var(--green)' }}>Br {a.outstandingBalance.toLocaleString('en-US')}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${a.status === 'ACTIVE' || a.status === 'COMPLETED' ? 'badge-verified' : a.status === 'REJECTED' ? 'badge-rejected' : ''}`}>{a.status}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {a.status === 'PENDING' && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => approve(a.id)} style={{ marginRight: 6 }}>Approve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => reject(a.id)}>Reject</button>
                    </>
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
