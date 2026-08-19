// Ye-Almaz — Attendance period overview: every employee across a date
// range, backed by GET /api/attendance/overview.
//
// Complements (rather than replaces) AttendanceTab's day view: that answers
// "who is in today", this answers "how has everyone been attending over the
// last month". Both are computed by the same attendanceDaySummary service
// server-side, so a person's day can never read differently between them.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import {
  MdGroups, MdCheckCircle, MdEventBusy, MdSchedule, MdTimer,
  MdWarning, MdHelpOutline, MdInfoOutline,
} from 'react-icons/md';
import { inputStyle } from '../../../utils/adminForms';

function firstOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
}
function today() {
  return new Date().toLocaleDateString('en-CA');
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={16} /></div>
      <div className="stat-value" style={tone ? { color: tone } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// Rate colouring is intentionally muted when clock coverage is poor — a red
// "0%" against someone who simply never had a device to punch reads as an
// accusation the data cannot support.
function rateColor(pct, trustworthy) {
  if (pct == null || !trustworthy) return undefined;
  if (pct >= 90) return 'var(--green)';
  if (pct >= 70) return 'var(--amber)';
  return 'var(--red)';
}

export default function AttendanceOverview({ employees }) {
  const [from, setFrom] = useState(firstOfThisMonth);
  const [to, setTo] = useState(today);
  const [department, setDepartment] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const departments = useMemo(
    () => [...new Set((employees || []).flatMap(e => e.departments || []))].sort(),
    [employees],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['hr', 'attendance', 'overview', from, to, department],
    queryFn: () => api.get('/attendance/overview', {
      params: { from, to, department: department || undefined },
    }).then(r => r.data),
  });

  const totals = data?.totals;
  const dq = data?.dataQuality;
  const lowCoverage = !!dq?.lowCoverage;

  const rows = useMemo(() => {
    const list = [...(data?.employees || [])];
    if (sortBy === 'rate') {
      list.sort((a, b) => (a.attendanceRatePct ?? 999) - (b.attendanceRatePct ?? 999));
    } else if (sortBy === 'late') {
      list.sort((a, b) => b.lateCount - a.lateCount);
    } else if (sortBy === 'hours') {
      list.sort((a, b) => b.totalWorkingHours - a.totalWorkingHours);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [data, sortBy]);

  const apiError = error?.response?.data?.error;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>FROM</div>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>TO</div>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>DEPARTMENT</div>
          <select style={{ ...inputStyle, width: 180 }} value={department} onChange={e => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>SORT BY</div>
          <select style={{ ...inputStyle, width: 170 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="rate">Lowest attendance</option>
            <option value="late">Most late arrivals</option>
            <option value="hours">Most hours worked</option>
          </select>
        </div>
      </div>

      {apiError && (
        <div className="card" style={{ padding: 12, marginBottom: 14, borderLeft: '3px solid var(--red)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <MdWarning size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
            <span>{apiError}</span>
          </div>
        </div>
      )}

      {/* The most important thing on this screen when clock data is thin.
          Without it, "331 absent days" reads as mass absenteeism rather than
          as an unconnected biometric device. */}
      {lowCoverage && (
        <div className="card" style={{ padding: 12, marginBottom: 14, borderLeft: '3px solid var(--amber)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.5 }}>
            <MdInfoOutline size={17} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Clock records cover only {dq.clockCoveragePct}% of expected days in this period.</strong>{' '}
              No biometric device is connected yet, so most attendance is only captured when
              staff clock in themselves. Days with no clock record are counted as
              &ldquo;Absent / no record&rdquo; below &mdash; that usually means nothing was
              logged, not that the person was away. Treat the attendance rates here as a
              measure of <em>recording</em> until a device is wired up.
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <StatCard icon={MdGroups} label="Employees" value={totals?.employees ?? '—'} />
        <StatCard
          icon={MdCheckCircle}
          label={lowCoverage ? 'Recorded Attendance' : 'Attendance Rate'}
          value={totals?.attendanceRatePct != null ? `${totals.attendanceRatePct}%` : '—'}
          tone={rateColor(totals?.attendanceRatePct, !lowCoverage)}
        />
        <StatCard icon={MdCheckCircle} label="Days Present" value={totals?.daysPresent ?? '—'} />
        <StatCard icon={MdHelpOutline} label="Absent / No Record" value={totals?.daysAbsent ?? '—'} />
        <StatCard icon={MdEventBusy} label="Leave Days" value={totals?.daysOnLeave ?? '—'} />
        <StatCard icon={MdSchedule} label="Late Arrivals" value={totals?.lateCount ?? '—'} />
        <StatCard icon={MdWarning} label="Missing Punch" value={totals?.daysMissingPunch ?? '—'} />
        <StatCard icon={MdTimer} label="Overtime Hrs" value={totals?.totalOvertimeHours ?? '—'} />
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th style={{ textAlign: 'center' }}>Present</th>
                <th style={{ textAlign: 'center' }} title="Days with no clock record and no approved leave. With no biometric device connected, this is usually missing data rather than a confirmed absence.">
                  Absent / No Record
                </th>
                <th style={{ textAlign: 'center' }}>Leave</th>
                <th style={{ textAlign: 'center' }} title="Clocked in but never clocked out on a past day.">Missing Punch</th>
                <th style={{ textAlign: 'center' }}>Late</th>
                <th style={{ textAlign: 'center' }}>Worked Hrs</th>
                <th style={{ textAlign: 'center' }}>Overtime</th>
                <th style={{ textAlign: 'center' }} title="Days with at least one clock event, out of days the person was expected in.">
                  Clock Data
                </th>
                <th style={{ textAlign: 'center' }}>Rate</th>
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
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {(r.departments || []).join(', ') || '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {r.daysPresent + (r.daysInProgress || 0)}
                  </td>
                  <td style={{ textAlign: 'center', color: r.daysAbsent > 0 && !lowCoverage ? 'var(--red)' : 'var(--text-3)' }}>
                    {r.daysAbsent}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {r.daysOnLeave + (r.daysHalfDayLeave ? r.daysHalfDayLeave * 0.5 : 0) || '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: r.daysMissingPunch > 0 ? 'var(--amber)' : undefined }}>
                    {r.daysMissingPunch || '—'}
                  </td>
                  <td style={{ textAlign: 'center', color: r.lateCount > 0 ? 'var(--red)' : undefined }}>
                    {r.lateCount ? `${r.lateCount} (${r.totalLateMinutes}m)` : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.totalWorkingHours}h</td>
                  <td style={{ textAlign: 'center', color: r.totalOvertimeHours > 0 ? 'var(--amber)' : undefined, fontWeight: r.totalOvertimeHours > 0 ? 700 : 400 }}>
                    {r.totalOvertimeHours ? `${r.totalOvertimeHours}h` : '—'}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                    {r.daysWithClockData}/{r.expectedDays}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: rateColor(r.attendanceRatePct, !lowCoverage) }}>
                    {r.attendanceRatePct != null ? `${r.attendanceRatePct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data?.range && (
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
          {data.range.days} day{data.range.days === 1 ? '' : 's'} ({data.range.from} to {data.range.to}).
          Holidays and rostered off-days are excluded from the rate, so nobody is penalised for a day they were never due in.
        </div>
      )}
    </div>
  );
}
