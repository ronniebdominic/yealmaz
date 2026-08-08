// Ye-Almaz — Edit Employee Profile modal
// Lifted out of the old HRDashboard.jsx (same behavior), restyled onto the
// shared design system (.modal/.btn/Field/inputStyle) instead of the
// bespoke teal inline styles, and extended with Phase 1's new personal/
// employment-info fields.
import { useState } from 'react';
import api from '../../../api';
import toast from 'react-hot-toast';
import { Field, inputStyle } from '../../../utils/adminForms';

export default function ProfileModal({ employee, managers = [], onClose, onSaved }) {
  const p = employee.employeeProfile || {};
  const [form, setForm] = useState({
    employeeCode: p.employeeCode || '', position: p.position || '',
    hireDate: p.hireDate ? p.hireDate.slice(0, 10) : '', baseSalary: p.baseSalary ?? '',
    bankName: p.bankName || '', bankAccount: p.bankAccount || '',
    employmentStatus: p.employmentStatus || 'ACTIVE',
    preferredName: p.preferredName || '', dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
    emergencyContactName: p.emergencyContactName || '', emergencyContactPhone: p.emergencyContactPhone || '',
    address: p.address || '',
    employmentType: p.employmentType || '', confirmationDate: p.confirmationDate ? p.confirmationDate.slice(0, 10) : '',
    probationEndDate: p.probationEndDate ? p.probationEndDate.slice(0, 10) : '',
    noticePeriodDays: p.noticePeriodDays ?? '', workLocation: p.workLocation || '',
    managerId: p.managerId || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/employees/${employee.id}/profile`, form);
      toast.success('Employee profile saved');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save profile'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{employee.name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 8 }}>EMPLOYMENT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <Field label="Employee Code" hint="biometric badge ID">
              <input style={inputStyle} value={form.employeeCode} onChange={e => set('employeeCode', e.target.value)} placeholder="e.g. EMP001" />
            </Field>
            <Field label="Position">
              <input style={inputStyle} value={form.position} onChange={e => set('position', e.target.value)} placeholder="e.g. Milling Technician" />
            </Field>
            <Field label="Employment Type">
              <select style={inputStyle} value={form.employmentType} onChange={e => set('employmentType', e.target.value)}>
                <option value="">—</option>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
              </select>
            </Field>
            <Field label="Employment Status">
              <select style={inputStyle} value={form.employmentStatus} onChange={e => set('employmentStatus', e.target.value)}>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </Field>
            <Field label="Hire Date">
              <input type="date" style={inputStyle} value={form.hireDate} onChange={e => set('hireDate', e.target.value)} />
            </Field>
            <Field label="Confirmation Date">
              <input type="date" style={inputStyle} value={form.confirmationDate} onChange={e => set('confirmationDate', e.target.value)} />
            </Field>
            <Field label="Probation End Date">
              <input type="date" style={inputStyle} value={form.probationEndDate} onChange={e => set('probationEndDate', e.target.value)} />
            </Field>
            <Field label="Notice Period (days)">
              <input type="number" min="0" style={inputStyle} value={form.noticePeriodDays} onChange={e => set('noticePeriodDays', e.target.value)} />
            </Field>
            <Field label="Manager">
              <select style={inputStyle} value={form.managerId} onChange={e => set('managerId', e.target.value)}>
                <option value="">— None —</option>
                {managers.filter(m => m.id !== employee.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Work Location" hint="optional — internal area">
              <input style={inputStyle} value={form.workLocation} onChange={e => set('workLocation', e.target.value)} placeholder="e.g. Main Lab" />
            </Field>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, margin: '16px 0 8px' }}>PAYROLL</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <Field label="Base Salary" hint="Br/month">
              <input type="number" min="0" style={inputStyle} value={form.baseSalary} onChange={e => set('baseSalary', e.target.value)} />
            </Field>
            <div />
            <Field label="Bank Name">
              <input style={inputStyle} value={form.bankName} onChange={e => set('bankName', e.target.value)} />
            </Field>
            <Field label="Bank Account">
              <input style={inputStyle} value={form.bankAccount} onChange={e => set('bankAccount', e.target.value)} />
            </Field>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, margin: '16px 0 8px' }}>PERSONAL</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <Field label="Preferred Name">
              <input style={inputStyle} value={form.preferredName} onChange={e => set('preferredName', e.target.value)} />
            </Field>
            <Field label="Date of Birth">
              <input type="date" style={inputStyle} value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
            </Field>
            <Field label="Emergency Contact Name">
              <input style={inputStyle} value={form.emergencyContactName} onChange={e => set('emergencyContactName', e.target.value)} />
            </Field>
            <Field label="Emergency Contact Phone">
              <input style={inputStyle} value={form.emergencyContactPhone} onChange={e => set('emergencyContactPhone', e.target.value)} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Address">
                <input style={inputStyle} value={form.address} onChange={e => set('address', e.target.value)} />
              </Field>
            </div>
          </div>

          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: '100%', marginTop: 4 }}>
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
