// Ye-Almaz — Employee Profile: the comprehensive per-employee detail view.
// Glass modal (per CaseDetailModal.jsx's visual language) with an internal
// tab strip. Phase 1 fully implements Overview/Attendance/Timesheets/
// Leave/Overtime/Payroll/Activity; everything outside Phase 1's scope
// (Performance/Incentives/Expenses/Advances/Goals/Skills/Training/
// Certifications/Assets) is a disabled "Coming soon" tab so the structure
// is future-proof for Phases 2-3.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api';
import { format } from 'date-fns';
import { MdEdit, MdEventBusy } from 'react-icons/md';
import ProfileModal from './components/ProfileModal';
import LeaveModal from './components/LeaveModal';

const LIVE_TABS = ['Overview', 'Attendance', 'Timesheets', 'Leave', 'Overtime', 'Incentives', 'Advances', 'Expenses', 'Payroll', 'Activity'];
const FUTURE_TABS = ['Performance', 'Goals', 'Skills', 'Training', 'Certifications', 'Documents', 'Assets'];

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{value ?? '—'}</span>
    </div>
  );
}

export default function EmployeeProfileModal({ employeeId, employees, onClose, refresh }) {
  const [tab, setTab] = useState('Overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const { data: employee, refetch } = useQuery({
    queryKey: ['hr', 'employee', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then(r => r.data),
    enabled: !!employeeId,
  });

  const onSaved = () => { setShowEdit(false); setShowLeave(false); refetch(); refresh?.(); };

  if (!employee) return null;
  const p = employee.employeeProfile || {};

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 880, width: '100%' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
              {p.photoUrl ? <img src={p.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : employee.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="modal-title">{employee.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {p.position || employee.role} · {p.employmentStatus || 'ACTIVE'} · {p.employmentType ? p.employmentType.replace('_', ' ') : employee.role}
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '10px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowEdit(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MdEdit size={13} /> Edit
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowLeave(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MdEventBusy size={13} /> Request Leave
          </button>
        </div>

        <div className="filters" style={{ padding: '12px 24px 0' }}>
          {LIVE_TABS.map(t => (
            <button key={t} className={`filter-chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
          {FUTURE_TABS.map(t => (
            <button key={t} className="filter-chip" disabled title="Coming in a later phase" style={{ opacity: 0.4, cursor: 'not-allowed' }}>{t}</button>
          ))}
        </div>

        <div className="modal-body" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
          {tab === 'Overview' && <OverviewTab employee={employee} profile={p} />}
          {tab === 'Attendance' && <AttendanceTabInner employeeId={employeeId} />}
          {tab === 'Timesheets' && <TimesheetsTabInner employeeId={employeeId} role={employee.role} />}
          {tab === 'Leave' && <LeaveTabInner employeeId={employeeId} />}
          {tab === 'Overtime' && <OvertimeTabInner employeeId={employeeId} />}
          {tab === 'Incentives' && <IncentivesTabInner employeeId={employeeId} />}
          {tab === 'Advances' && <AdvancesTabInner employeeId={employeeId} />}
          {tab === 'Expenses' && <ExpensesTabInner employeeId={employeeId} />}
          {tab === 'Payroll' && <PayrollTabInner employeeId={employeeId} />}
          {tab === 'Activity' && <ActivityTabInner employeeId={employeeId} />}
        </div>
      </div>

      {showEdit && <ProfileModal employee={employee} managers={employees} onClose={() => setShowEdit(false)} onSaved={onSaved} />}
      {showLeave && <LeaveModal employees={[employee]} onClose={() => setShowLeave(false)} onSaved={onSaved} />}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────
function OverviewTab({ employee, profile: p }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 6 }}>EMPLOYMENT</div>
        <InfoRow label="Employee Code" value={p.employeeCode} />
        <InfoRow label="Department" value={(employee.departments || []).join(', ') || null} />
        <InfoRow label="Manager" value={p.manager?.name} />
        <InfoRow label="Direct Reports" value={employee.directReportCount} />
        <InfoRow label="Joining Date" value={p.hireDate ? format(new Date(p.hireDate), 'dd MMM yyyy') : null} />
        <InfoRow label="Work Location" value={p.workLocation} />
        <InfoRow label="Shift" value={employee.activeShift?.name} />
        <InfoRow label="Base Salary" value={p.baseSalary != null ? `Br ${p.baseSalary.toLocaleString('en-US')}` : null} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, marginBottom: 6 }}>PERSONAL</div>
        <InfoRow label="Email" value={employee.email} />
        <InfoRow label="Phone" value={employee.phone} />
        <InfoRow label="Preferred Name" value={p.preferredName} />
        <InfoRow label="Date of Birth" value={p.dateOfBirth ? format(new Date(p.dateOfBirth), 'dd MMM yyyy') : null} />
        <InfoRow label="Emergency Contact" value={p.emergencyContactName ? `${p.emergencyContactName}${p.emergencyContactPhone ? ` (${p.emergencyContactPhone})` : ''}` : null} />
        <InfoRow label="Address" value={p.address} />
      </div>
    </div>
  );
}

// ── Attendance ──────────────────────────────────────────
function AttendanceTabInner({ employeeId }) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 13); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data } = useQuery({
    queryKey: ['hr', 'employee-attendance', employeeId, from, to],
    queryFn: () => api.get('/attendance/summary/range', { params: { userId: employeeId, from, to } }).then(r => r.data),
  });
  const days = data?.days || [];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Clock In</th><th>Clock Out</th><th style={{ textAlign: 'center' }}>Hours</th><th style={{ textAlign: 'center' }}>OT</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
          <tbody>
            {days.length === 0 ? (
              <tr><td colSpan={6} className="empty-state">No data in range</td></tr>
            ) : days.map(d => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{d.clockIn ? format(new Date(d.clockIn), 'h:mm a') : '—'}</td>
                <td>{d.clockOut ? format(new Date(d.clockOut), 'h:mm a') : '—'}</td>
                <td style={{ textAlign: 'center' }}>{d.workingHours}h</td>
                <td style={{ textAlign: 'center', color: d.overtimeHours > 0 ? 'var(--amber)' : undefined }}>{d.overtimeHours || '—'}</td>
                <td style={{ textAlign: 'center' }}><span className="badge">{d.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Timesheets (manual entries + read-only lab-tech scan enrichment) ────
function TimesheetsTabInner({ employeeId, role }) {
  const { data: entries = [] } = useQuery({
    queryKey: ['hr', 'employee-timesheets', employeeId],
    queryFn: () => api.get('/timesheets', { params: { userId: employeeId } }).then(r => r.data),
  });
  const { data: enrichment } = useQuery({
    queryKey: ['hr', 'employee-scan-activity', employeeId],
    queryFn: () => api.get('/timesheets/lab-tech-enrichment', { params: { userId: employeeId } }).then(r => r.data),
    enabled: role === 'LAB_TECH',
  });

  return (
    <div>
      <div className="table-wrap" style={{ marginBottom: role === 'LAB_TECH' ? 20 : 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, margin: '4px 0 8px' }}>MANUAL ENTRIES</div>
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Category</th><th>Notes</th></tr></thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No manual entries</td></tr>
            ) : entries.map(e => (
              <tr key={e.id}>
                <td>{format(new Date(e.date), 'dd MMM yyyy')}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(e.startTime), 'h:mm a')}–{format(new Date(e.endTime), 'h:mm a')}</td>
                <td>{e.category}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{e.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {role === 'LAB_TECH' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, margin: '4px 0 8px' }}>
            SCAN ACTIVITY (from case scans — read-only)
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Department</th></tr></thead>
              <tbody>
                {(enrichment?.scans || []).length === 0 ? (
                  <tr><td colSpan={2} className="empty-state">No scan activity</td></tr>
                ) : enrichment.scans.slice(0, 50).map(s => (
                  <tr key={s.id}>
                    <td>{format(new Date(s.scannedAt), 'dd MMM yyyy, h:mm a')}</td>
                    <td>{s.department || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Leave ───────────────────────────────────────────────
function LeaveTabInner({ employeeId }) {
  const { data: balances = [] } = useQuery({
    queryKey: ['hr', 'employee-leave-balances', employeeId],
    queryFn: () => api.get('/leave/balances', { params: { userId: employeeId } }).then(r => r.data),
  });
  const { data: records = [] } = useQuery({
    queryKey: ['hr', 'employee-leave-records', employeeId],
    queryFn: () => api.get('/attendance/leave', { params: { userId: employeeId } }).then(r => r.data),
  });
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {balances.map(b => (
          <div key={b.leaveTypeId} className="stat-card" style={{ minWidth: 120 }}>
            <div className="stat-value">{b.available}</div>
            <div className="stat-label">{b.name}</div>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>From</th><th>To</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={4} className="empty-state">No leave records</td></tr>
            ) : records.map(r => (
              <tr key={r.id}>
                <td>{r.leaveType?.name || '—'}</td>
                <td>{format(new Date(r.fromDate), 'dd MMM yyyy')}</td>
                <td>{format(new Date(r.toDate), 'dd MMM yyyy')}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${r.status === 'APPROVED' ? 'badge-verified' : 'badge-rejected'}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Overtime ────────────────────────────────────────────
function OvertimeTabInner({ employeeId }) {
  const { data: records = [] } = useQuery({
    queryKey: ['hr', 'employee-overtime', employeeId],
    queryFn: () => api.get('/overtime', { params: { userId: employeeId } }).then(r => r.data),
  });
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Date</th><th style={{ textAlign: 'center' }}>Hours</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
        <tbody>
          {records.length === 0 ? (
            <tr><td colSpan={3} className="empty-state">No overtime records</td></tr>
          ) : records.map(r => (
            <tr key={r.id}>
              <td>{format(new Date(r.date), 'dd MMM yyyy')}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--amber)' }}>{r.overtimeHours}h</td>
              <td style={{ textAlign: 'center' }}><span className={`badge ${r.approvalStatus === 'APPROVED' ? 'badge-verified' : ''}`}>{r.approvalStatus}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Incentives ────────────────────────────────────────────
function IncentivesTabInner({ employeeId }) {
  const { data: awards = [] } = useQuery({
    queryKey: ['hr', 'employee-incentives', employeeId],
    queryFn: () => api.get('/incentives/awards', { params: { userId: employeeId } }).then(r => r.data),
  });
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Rule</th><th>Period</th><th style={{ textAlign: 'center' }}>Actual</th><th style={{ textAlign: 'center' }}>Target</th><th style={{ textAlign: 'center' }}>Amount</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
        <tbody>
          {awards.length === 0 ? (
            <tr><td colSpan={6} className="empty-state">No incentive awards</td></tr>
          ) : awards.map(a => (
            <tr key={a.id}>
              <td style={{ fontWeight: 600 }}>{a.rule?.name}</td>
              <td>{a.periodMonth}/{a.periodYear}</td>
              <td style={{ textAlign: 'center' }}>{a.actualValue}</td>
              <td style={{ textAlign: 'center' }}>{a.targetValue}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--green)' }}>Br {a.awardedAmount.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'center' }}><span className={`badge ${a.status !== 'PENDING' ? 'badge-verified' : ''}`}>{a.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Advances & Loans ──────────────────────────────────────
function AdvancesTabInner({ employeeId }) {
  const { data: advances = [] } = useQuery({
    queryKey: ['hr', 'employee-advances', employeeId],
    queryFn: () => api.get('/advances', { params: { userId: employeeId } }).then(r => r.data),
  });
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Type</th><th style={{ textAlign: 'center' }}>Amount</th><th style={{ textAlign: 'center' }}>Installment</th><th style={{ textAlign: 'center' }}>Outstanding</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
        <tbody>
          {advances.length === 0 ? (
            <tr><td colSpan={5} className="empty-state">No advances or loans</td></tr>
          ) : advances.map(a => (
            <tr key={a.id}>
              <td style={{ fontWeight: 600 }}>{a.type}</td>
              <td style={{ textAlign: 'center' }}>Br {a.amount.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'center' }}>Br {a.installmentAmount.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: a.outstandingBalance > 0 ? 'var(--amber)' : 'var(--green)' }}>Br {a.outstandingBalance.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'center' }}><span className={`badge ${['ACTIVE', 'COMPLETED'].includes(a.status) ? 'badge-verified' : ''}`}>{a.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Expenses ──────────────────────────────────────────────
function ExpensesTabInner({ employeeId }) {
  const { data: claims = [] } = useQuery({
    queryKey: ['hr', 'employee-expenses', employeeId],
    queryFn: () => api.get('/expenses', { params: { userId: employeeId } }).then(r => r.data),
  });
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Category</th><th>Date</th><th style={{ textAlign: 'center' }}>Amount</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
        <tbody>
          {claims.length === 0 ? (
            <tr><td colSpan={4} className="empty-state">No expense claims</td></tr>
          ) : claims.map(c => (
            <tr key={c.id}>
              <td style={{ fontWeight: 600 }}>{c.category}</td>
              <td>{format(new Date(c.date), 'dd MMM yyyy')}</td>
              <td style={{ textAlign: 'center' }}>Br {c.amount.toLocaleString('en-US')}</td>
              <td style={{ textAlign: 'center' }}><span className={`badge ${['REIMBURSED', 'FINANCE_APPROVED'].includes(c.status) ? 'badge-verified' : ''}`}>{c.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Payroll (read-only link into existing payroll data) ──
function PayrollTabInner({ employeeId }) {
  const { data: runs = [] } = useQuery({ queryKey: ['hr', 'payroll', 'runs'], queryFn: () => api.get('/payroll/runs').then(r => r.data) });
  return (
    <div style={{ color: 'var(--text-3)', fontSize: 13 }}>
      <p>Payroll entries are managed from the Payroll Runs tab. This employee appears in any run created while their profile was active.</p>
      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table>
          <thead><tr><th>Period</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
          <tbody>
            {runs.length === 0 ? (
              <tr><td colSpan={2} className="empty-state">No payroll runs yet</td></tr>
            ) : runs.map(r => (
              <tr key={r.id}>
                <td>{r.periodMonth}/{r.periodYear}</td>
                <td style={{ textAlign: 'center' }}><span className={`badge ${r.status === 'FINALIZED' ? 'badge-verified' : ''}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Activity (EmploymentHistory) ─────────────────────────
function ActivityTabInner({ employeeId }) {
  const { data: history = [] } = useQuery({
    queryKey: ['hr', 'employee-history', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}/history`).then(r => r.data),
  });
  if (history.length === 0) return <div className="empty-state">No changes recorded yet</div>;
  return (
    <div className="timeline">
      {history.map(h => (
        <div key={h.id} className="timeline-item">
          <div className="timeline-dot done" />
          <div className="timeline-content">
            <div className="timeline-label">
              {h.field} changed: {h.oldValue || '—'} → {h.newValue || '—'}
            </div>
            <div className="timeline-time">{format(new Date(h.effectiveDate), 'dd MMM yyyy, h:mm a')} · by {h.changedBy?.name}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
