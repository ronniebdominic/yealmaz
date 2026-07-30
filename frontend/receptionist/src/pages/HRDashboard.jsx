import { useState } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { printPayslip } from '../utils/printPayslip';
import {
  MdLogout, MdEdit, MdClose, MdAdd, MdPeople, MdAccessTime, MdEventBusy,
  MdPaid, MdPrint, MdCheckCircle, MdInfo,
} from 'react-icons/md';

const TABS = [
  { id: 'employees', label: 'Employees', icon: MdPeople },
  { id: 'attendance', label: 'Attendance', icon: MdAccessTime },
  { id: 'leave', label: 'Leave', icon: MdEventBusy },
  { id: 'payroll', label: 'Payroll', icon: MdPaid },
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid #D1D5DB', boxSizing: 'border-box' };
const pillStyle = { flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#F9FAFB', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 };
const actionBtn = { padding: '5px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' };

// ── Edit employee profile modal ───────────────────────────
function ProfileModal({ employee, onClose, onSaved }) {
  const p = employee.employeeProfile || {};
  const [form, setForm] = useState({
    employeeCode: p.employeeCode || '', position: p.position || '',
    hireDate: p.hireDate ? p.hireDate.slice(0, 10) : '', baseSalary: p.baseSalary ?? '',
    bankName: p.bankName || '', bankAccount: p.bankAccount || '',
    employmentStatus: p.employmentStatus || 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, overflow: 'hidden' }}>
        <div style={{ background: '#0E7490', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {employee.name}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>EMPLOYEE CODE (biometric badge ID)</div>
            <input value={form.employeeCode} onChange={e => setForm(p => ({ ...p, employeeCode: e.target.value }))} placeholder="e.g. EMP001" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>POSITION</div>
            <input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} placeholder="e.g. Milling Technician" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>HIRE DATE</div>
              <input type="date" value={form.hireDate} onChange={e => setForm(p => ({ ...p, hireDate: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>BASE SALARY (Br/month)</div>
              <input type="number" min="0" value={form.baseSalary} onChange={e => setForm(p => ({ ...p, baseSalary: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>BANK NAME</div>
              <input value={form.bankName} onChange={e => setForm(p => ({ ...p, bankName: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>BANK ACCOUNT</div>
              <input value={form.bankAccount} onChange={e => setForm(p => ({ ...p, bankAccount: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>EMPLOYMENT STATUS</div>
            <select value={form.employmentStatus} onChange={e => setForm(p => ({ ...p, employmentStatus: e.target.value }))} style={inputStyle}>
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual clock event modal ───────────────────────────────
function ClockEventModal({ employees, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('CLOCK_IN');
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString().slice(0, 16));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!userId) { toast.error('Select an employee'); return; }
    setSaving(true);
    try {
      await api.post('/attendance/manual', { userId, type, timestamp: new Date(timestamp).toISOString() });
      toast.success('Attendance recorded');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not record attendance'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ background: '#0E7490', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Log Clock Event
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>EMPLOYEE</div>
            <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setType('CLOCK_IN')} style={{ ...pillStyle, ...(type === 'CLOCK_IN' ? { background: '#DCFCE7', color: '#166534', border: '1.5px solid #16A34A' } : {}) }}>Clock In</button>
            <button onClick={() => setType('CLOCK_OUT')} style={{ ...pillStyle, ...(type === 'CLOCK_OUT' ? { background: '#FEF3C7', color: '#92400E', border: '1.5px solid #D97706' } : {}) }}>Clock Out</button>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>TIME</div>
            <input type="datetime-local" value={timestamp} onChange={e => setTimestamp(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Log leave modal ────────────────────────────────────────
function LeaveModal({ employees, onClose, onSaved }) {
  const [userId, setUserId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!userId || !fromDate || !toDate) { toast.error('Employee, from and to dates are required'); return; }
    setSaving(true);
    try {
      await api.post('/attendance/leave', { userId, fromDate, toDate, reason });
      toast.success('Leave logged');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not log leave'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ background: '#0E7490', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Log Leave
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>EMPLOYEE</div>
            <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
              <option value="">— Select employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>FROM</div>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>TO</div>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>REASON (OPTIONAL)</div>
            <input value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add payroll adjustment modal ───────────────────────────
function AdjustmentModal({ entry, onClose, onSaved }) {
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ background: '#0E7490', color: '#fff', padding: '14px 18px', fontWeight: 800, fontSize: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Add Adjustment — {entry.user?.name}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><MdClose size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>LABEL</div>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Transport allowance, Income tax" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>AMOUNT (Br) — positive = bonus, negative = deduction</div>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 500 or -200" style={inputStyle} />
          </div>
          <button onClick={save} disabled={saving}
            style={{ marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HRDashboard() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('employees');
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [showClockEvent, setShowClockEvent] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const [adjustmentEntry, setAdjustmentEntry] = useState(null);
  const [periodMonth, setPeriodMonth] = useState(new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [activeRunId, setActiveRunId] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['hr', 'employees'],
    queryFn: () => api.get('/employees').then(r => r.data),
  });
  const { data: attendance = { events: [], dailySummary: [] } } = useQuery({
    queryKey: ['hr', 'attendance'],
    queryFn: () => api.get('/attendance').then(r => r.data),
    enabled: tab === 'attendance',
  });
  const { data: leaveRecords = [] } = useQuery({
    queryKey: ['hr', 'leave'],
    queryFn: () => api.get('/attendance/leave').then(r => r.data),
    enabled: tab === 'leave',
  });
  const { data: runs = [] } = useQuery({
    queryKey: ['hr', 'payroll', 'runs'],
    queryFn: () => api.get('/payroll/runs').then(r => r.data),
    enabled: tab === 'payroll',
  });
  const { data: activeRun } = useQuery({
    queryKey: ['hr', 'payroll', 'run', activeRunId],
    queryFn: () => api.get(`/payroll/runs/${activeRunId}`).then(r => r.data),
    enabled: !!activeRunId,
  });

  const refreshAll = () => qc.invalidateQueries({ queryKey: ['hr'] });
  const initials = (user?.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const biometricCount = attendance.events.filter(e => e.source === 'BIOMETRIC').length;

  const createRun = async () => {
    try {
      const res = await api.post('/payroll/runs', { periodMonth, periodYear });
      toast.success(`Payroll run created — ${res.data.employeeCount} employees` + (res.data.missingSalaryCount ? ` (${res.data.missingSalaryCount} missing a salary)` : ''));
      setActiveRunId(res.data.run.id);
      refreshAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create run'); }
  };

  const finalizeRun = async (runId) => {
    if (!window.confirm('Finalize this payroll run? No further adjustments can be added afterward.')) return;
    try {
      await api.patch(`/payroll/runs/${runId}/finalize`);
      toast.success('Payroll run finalized');
      refreshAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not finalize run'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ background: '#0F2044', color: '#fff', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.2 }}>Ye-Almaz Dental Lab</div>
            <span style={{ fontSize: 11, background: 'rgba(14,116,144,0.25)', color: '#67E8F9', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>HR Manager</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#0E7490', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
          <button onClick={logout} title="Logout"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
            <MdLogout size={15} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: tab === t.id ? '1.5px solid #0E7490' : '1px solid #E5E7EB',
                background: tab === t.id ? '#ECFEFF' : '#fff', color: tab === t.id ? '#0E7490' : '#6B7280',
              }}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'employees' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', fontWeight: 800, fontSize: 14 }}>Employees</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>Name</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>Employee Code</th>
                  <th style={{ padding: '9px 14px', textAlign: 'left' }}>Position</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>Base Salary</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '9px 14px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{e.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{e.role}</td>
                    <td style={{ padding: '10px 14px' }}>{e.employeeProfile?.employeeCode || '—'}</td>
                    <td style={{ padding: '10px 14px' }}>{e.employeeProfile?.position || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>{e.employeeProfile?.baseSalary != null ? `Br ${e.employeeProfile.baseSalary.toLocaleString('en-US')}` : '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>{e.employeeProfile?.employmentStatus || 'ACTIVE'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button onClick={() => setProfileEmployee(e)} style={actionBtn}><MdEdit size={13} /> Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'attendance' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={() => setShowClockEvent(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <MdAdd size={15} /> Log Clock Event
              </button>
            </div>
            {biometricCount === 0 && (
              <div style={{ padding: '12px 16px', background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 10, marginBottom: 14, fontSize: 12, color: '#0E7490', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <MdInfo size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>No biometric device connected yet — clock events entered manually here will appear below. Once a device is chosen, its events will show up automatically alongside manual entries.</span>
              </div>
            )}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>Employee</th>
                    <th style={{ padding: '9px 14px', textAlign: 'center' }}>Type</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '9px 14px', textAlign: 'center' }}>Source</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.events.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>No attendance events yet</td></tr>
                  ) : attendance.events.map(ev => (
                    <tr key={ev.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{ev.user?.name}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>{ev.type === 'CLOCK_IN' ? 'Clock In' : 'Clock Out'}</td>
                      <td style={{ padding: '9px 14px', color: '#6B7280' }}>{format(new Date(ev.timestamp), 'dd MMM yyyy, h:mm a')}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>{ev.source}</td>
                      <td style={{ padding: '9px 14px', color: ev.note ? '#DC2626' : '#9CA3AF', fontSize: 12 }}>{ev.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'leave' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={() => setShowLeave(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <MdAdd size={15} /> Log Leave
              </button>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>Employee</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>From</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>To</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>Reason</th>
                    <th style={{ padding: '9px 14px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveRecords.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>No leave logged yet</td></tr>
                  ) : leaveRecords.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{r.user?.name}</td>
                      <td style={{ padding: '9px 14px' }}>{format(new Date(r.fromDate), 'dd MMM yyyy')}</td>
                      <td style={{ padding: '9px 14px' }}>{format(new Date(r.toDate), 'dd MMM yyyy')}</td>
                      <td style={{ padding: '9px 14px', color: '#6B7280' }}>{r.reason || '—'}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: r.status === 'APPROVED' ? '#16A34A' : '#DC2626' }}>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'payroll' && (
          <div>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 16, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>MONTH</div>
                <select value={periodMonth} onChange={e => setPeriodMonth(parseInt(e.target.value))} style={{ ...inputStyle, width: 160 }}>
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4 }}>YEAR</div>
                <input type="number" value={periodYear} onChange={e => setPeriodYear(parseInt(e.target.value))} style={{ ...inputStyle, width: 100 }} />
              </div>
              <button onClick={createRun}
                style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0E7490', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                + Create Run
              </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', fontWeight: 800, fontSize: 14 }}>Payroll Runs</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                    <th style={{ padding: '9px 14px', textAlign: 'left' }}>Period</th>
                    <th style={{ padding: '9px 14px', textAlign: 'center' }}>Employees</th>
                    <th style={{ padding: '9px 14px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#9CA3AF' }}>No payroll runs yet</td></tr>
                  ) : runs.map(r => (
                    <tr key={r.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{MONTH_NAMES[r.periodMonth - 1]} {r.periodYear}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>{r._count?.entries ?? 0}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: r.status === 'FINALIZED' ? '#16A34A' : '#D97706' }}>{r.status}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        <button onClick={() => setActiveRunId(r.id)} style={actionBtn}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activeRun && (
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{MONTH_NAMES[activeRun.periodMonth - 1]} {activeRun.periodYear} — Entries</div>
                  {activeRun.status === 'DRAFT' && (
                    <button onClick={() => finalizeRun(activeRun.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#16A34A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <MdCheckCircle size={14} /> Finalize Run
                    </button>
                  )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>
                      <th style={{ padding: '9px 14px', textAlign: 'left' }}>Employee</th>
                      <th style={{ padding: '9px 14px', textAlign: 'center' }}>Base Salary</th>
                      <th style={{ padding: '9px 14px', textAlign: 'center' }}>Adjustments</th>
                      <th style={{ padding: '9px 14px', textAlign: 'center' }}>Net Pay</th>
                      <th style={{ padding: '9px 14px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRun.entries.map(entry => (
                      <tr key={entry.id} style={{ borderTop: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600 }}>{entry.user?.name}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'center' }}>Br {entry.baseSalarySnapshot.toLocaleString('en-US')}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'center', fontSize: 12, color: '#6B7280' }}>
                          {entry.adjustments.length === 0 ? '—' : entry.adjustments.map(a => `${a.label} (${a.amount >= 0 ? '+' : ''}${a.amount})`).join(', ')}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: '#0E7490' }}>Br {entry.netPay.toLocaleString('en-US')}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                          {activeRun.status === 'DRAFT' && (
                            <button onClick={() => setAdjustmentEntry(entry)} style={{ ...actionBtn, marginRight: 6 }}><MdAdd size={13} /> Adjust</button>
                          )}
                          <button onClick={() => printPayslip(entry, activeRun)} style={actionBtn}><MdPrint size={13} /> Payslip</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {profileEmployee && <ProfileModal employee={profileEmployee} onClose={() => setProfileEmployee(null)} onSaved={() => { setProfileEmployee(null); refreshAll(); }} />}
      {showClockEvent && <ClockEventModal employees={employees} onClose={() => setShowClockEvent(false)} onSaved={() => { setShowClockEvent(false); refreshAll(); }} />}
      {showLeave && <LeaveModal employees={employees} onClose={() => setShowLeave(false)} onSaved={() => { setShowLeave(false); refreshAll(); }} />}
      {adjustmentEntry && <AdjustmentModal entry={adjustmentEntry} onClose={() => setAdjustmentEntry(null)} onSaved={() => { setAdjustmentEntry(null); refreshAll(); }} />}
    </div>
  );
}
