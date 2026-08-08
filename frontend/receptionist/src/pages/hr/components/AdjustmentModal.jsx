// Ye-Almaz — Add payroll adjustment modal (lifted from old HRDashboard.jsx,
// restyled onto the shared design system; behavior unchanged — Phase 2
// will extend, not rebuild, Payroll).
import { useState } from 'react';
import api from '../../../api';
import toast from 'react-hot-toast';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function AdjustmentModal({ entry, onClose, onSaved }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim() || !amount) { toast.error('Label and amount are required'); return; }
    setSaving(true);
    try {
      await api.post(`/payroll/entries/${entry.id}/adjustments`, { label, amount: parseFloat(amount) });
      toast.success('Adjustment added');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add adjustment'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div className="modal-title">Add Adjustment — {entry.user?.name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Field label="Label">
            <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Transport allowance, Income tax" />
          </Field>
          <Field label="Amount (Br)" hint="positive = bonus, negative = deduction">
            <input type="number" style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 500 or -200" />
          </Field>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Saving…' : '✓ Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
