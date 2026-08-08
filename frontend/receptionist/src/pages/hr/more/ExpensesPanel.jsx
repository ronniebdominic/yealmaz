// Ye-Almaz — Expenses (More → Expenses). Submitted → Manager Approved →
// Finance Approved → Reimbursed. A FINANCE_APPROVED claim is picked up
// automatically by the next payroll run.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { MdAdd } from 'react-icons/md';
import { Field, inputStyle } from '../../../utils/adminForms';

const STATUS_LABELS = { SUBMITTED: 'Submitted', MANAGER_APPROVED: 'Manager Approved', FINANCE_APPROVED: 'Finance Approved', REJECTED: 'Rejected', REIMBURSED: 'Reimbursed' };

export default function ExpensesPanel({ employees }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [userId, setUserId] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: claims = [] } = useQuery({ queryKey: ['hr', 'expenses'], queryFn: () => api.get('/expenses').then(r => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['hr', 'expenses'] });

  const create = async () => {
    if (!userId || !category.trim() || !amount) { toast.error('Employee, category and amount are required'); return; }
    setSaving(true);
    try {
      await api.post('/expenses', { userId, category, date, amount, description });
      toast.success('Expense claim submitted');
      setCategory(''); setAmount(''); setDescription(''); setShowForm(false);
      refresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not submit claim'); }
    finally { setSaving(false); }
  };

  const approve = async (id) => { try { await api.patch(`/expenses/${id}/approve`); refresh(); } catch { toast.error('Could not approve'); } };
  const reject = async (id) => { try { await api.patch(`/expenses/${id}/reject`); refresh(); } catch { toast.error('Could not reject'); } };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Expenses</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MdAdd size={14} /> Log Claim</button>
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
          <Field label="Category"><input style={inputStyle} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Travel, Supplies" /></Field>
          <Field label="Date"><input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Amount (Br)"><input type="number" style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} /></Field>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Description" hint="optional"><input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} /></Field>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary btn-sm" onClick={create} disabled={saving}>{saving ? 'Saving…' : '✓ Submit'}</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Employee</th><th>Category</th><th>Date</th><th style={{ textAlign: 'center' }}>Amount</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
          <tbody>
            {claims.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No expense claims yet</td></tr>
            ) : claims.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.user?.name}</td>
                <td>{c.category}</td>
                <td>{format(new Date(c.date), 'dd MMM yyyy')}</td>
                <td style={{ textAlign: 'center' }}>Br {c.amount.toLocaleString('en-US')}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${c.status === 'REIMBURSED' || c.status === 'FINANCE_APPROVED' ? 'badge-verified' : c.status === 'REJECTED' ? 'badge-rejected' : ''}`}>{STATUS_LABELS[c.status]}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {['SUBMITTED', 'MANAGER_APPROVED'].includes(c.status) && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => approve(c.id)} style={{ marginRight: 6 }}>Approve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => reject(c.id)}>Reject</button>
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
