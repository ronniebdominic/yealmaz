// Ye-Almaz — Attendance tab: workforce day view backed by
// GET /api/attendance/summary (the attendanceDaySummary.js service under
// the hood) — KPI cards + a date/employee/department-filtered table, one
// row per employee for the selected day.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import { format } from 'date-fns';
import { MdAdd, MdCheckCircle, MdCancel, MdEventBusy, MdSchedule, MdLogout, MdWarning, MdTimer } from 'react-icons/md';
import { inputStyle } from '../../../utils/adminForms';
import AttendanceCorrectionModal from '../components/AttendanceCorrectionModal';
import AttendanceOverview from './AttendanceOverview';

const STATUS_LABELS = {
  PRESENT: 'Present', IN_PROGRESS: 'In Progress', ABSENT: 'Absent', ON_LEAVE: 'On Leave',
  HALF_DAY_LEAVE: 'Half-Day Leave', HOLIDAY: 'Holiday', OFF: 'Off', MISSING_PUNCH: 'Missing Punch',
};
const STATUS_BADGE = {
  PRESENT: 'badge-verified', IN_PROGRESS: 'badge-verified', ABSENT: '', ON_LEAVE: '',
  HALF_DAY_LEAVE: '', HOLIDAY: '', OFF: '', MISSING_PUNCH: 'badge-rejected',
};

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={16} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function AttendanceTab({ employees, onOpenClockEvent }) {
  // Two lenses on the same server-side day summaries: a single day across
  // everyone, or a date range across everyone. Kept in one tab because they
  // answer the same question at different zoom levels.
  const [view, setView] = useState('day');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [department, setDepartment] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [correctionTarget, setCorrectionTarget] = useState(null);

  const departments = useMemo(() => [...new Set(employees.flatMap(e => e.departments || []))].sort(), [employees]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hr', 'attendance', 'summary', date, department],
    queryFn: () => api.get('/attendance/summary', { params: { date, department: department || undefined } }).then(r => r.data),
  });

  const counts = data?.counts || { present: 0, absent: 0, onLeave: 0, late: 0, earlyDeparture: 0, missingPunch: 0, overtime: 0 };
  const rows = (data?.employees || []).filter(e => !employeeId || e.id === employeeId);

  const viewToggle = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
      <button
        className={`btn btn-sm ${view === 'day' ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => setView('day')}
      >Day View</button>
      <button
        className={`btn btn-sm ${view === 'period' ? 'btn-primary' : 'btn-ghost'}`}
        onClick={() => setView('period')}
      >Period Overview</button>
    </div>
  );

  if (view === 'period') {
    return (
      <div>
        {viewToggle}
        <AttendanceOverview employees={employees} />
      </div>
    );
  }

  return (
    <div>
      {viewToggle}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>DATE</div>
          <input type="date" style={{ ...inputStyle, width: 160 }} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>EMPLOYEE</div>
          <select style={{ ...inputStyle, width: 180 }} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">All employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>DEPARTMENT</div>
          <select style={{ ...inputStyle, width: 180 }} value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onOpenClockEvent} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MdAdd size={15} /> Log Clock Event
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <StatCard icon={MdCheckCircle} label="Present Today" value={counts.present} />
        <StatCard icon={MdCancel} label="Absent" value={counts.absent} />
        <StatCard icon={MdEventBusy} label="On Leave" value={counts.onLeave} />
        <StatCard icon={MdSchedule} label="Late" value={counts.late} />
        <StatCard icon={MdLogout} label="Early Departure" value={counts.earlyDeparture} />
        <StatCard icon={MdWarning} label="Missing Punch" value={counts.missingPunch} />
        <StatCard icon={MdTimer} label="Overtime" value={counts.overtime} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>Shift</th><th>Clock In</th><th>Clock Out</th><th style={{ textAlign: 'center' }}>Break</th>
                <th style={{ textAlign: 'center' }}>Working Hrs</th><th style={{ textAlign: 'center' }}>Regular</th>
                <th style={{ textAlign: 'center' }}>Overtime</th><th style={{ textAlign: 'center' }}>Late</th>
                <th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="empty-state">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="empty-state">No employees match this filter</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.shift?.name || '—'}</td>
                  <td>{r.clockIn ? format(new Date(r.clockIn), 'h:mm a') : '—'}</td>
                  <td>{r.clockOut ? format(new Date(r.clockOut), 'h:mm a') : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{r.breakMinutes}m</td>
                  <td style={{ textAlign: 'center' }}>{r.workingHours}h</td>
                  <td style={{ textAlign: 'center' }}>{r.regularHours}h</td>
                  <td style={{ textAlign: 'center', color: r.overtimeHours > 0 ? 'var(--amber)' : undefined, fontWeight: r.overtimeHours > 0 ? 700 : 400 }}>{r.overtimeHours}h</td>
                  <td style={{ textAlign: 'center', color: r.late ? 'var(--red)' : undefined }}>{r.late ? `${r.lateMinutes}m` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${STATUS_BADGE[r.status] || ''}`}>{STATUS_LABELS[r.status] || r.status}</span>
                    {r.hasCorrection && <span title="Has a correction" style={{ marginLeft: 5, fontSize: 11 }}>✎</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setCorrectionTarget(r)}>Correct</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {correctionTarget && (
        <AttendanceCorrectionModal
          employee={correctionTarget} date={date}
          onClose={() => setCorrectionTarget(null)}
          onSaved={() => { setCorrectionTarget(null); refetch(); }}
        />
      )}
    </div>
  );
}
