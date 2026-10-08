// Ye-Almaz — "Export Attendance Log" button: the entire per-employee,
// per-day attendance detail (clock in/out, break, hours worked, expected/
// regular/overtime hours, late/early-departure minutes, correction flag,
// punch source) for a date range, as Excel or PDF.
//
// Reuses the existing GET /api/reports/attendance-detail — the same report
// already listed under HR > More > Reports — so this is just a more direct
// door into it from the two places people actually look for it (the
// Attendance tab itself, and Payroll Runs, since payroll is computed from
// this same data). Nothing here duplicates that endpoint's query.
import api from '../../../api';
import ExportMenu from '../../../components/ExportMenu';
import { inputStyle } from '../../../utils/adminForms';

const COLUMNS = [
  { header: 'Employee',               value: r => r.employee },
  { header: 'Date',                   value: r => r.date },
  { header: 'Day',                    value: r => r.day },
  { header: 'Status',                 value: r => r.status },
  { header: 'Shift',                  value: r => r.shift },
  { header: 'Clock In',               value: r => r.clockIn },
  { header: 'Clock Out',              value: r => r.clockOut },
  { header: 'Break (min)',            value: r => r.breakMinutes },
  { header: 'Hours Present',          value: r => r.hoursPresent },
  { header: 'Expected Hours',         value: r => r.expectedHours ?? '—' },
  { header: 'Regular Hours',          value: r => r.regularHours },
  { header: 'Overtime Hours',         value: r => r.overtimeHours },
  { header: 'Late',                   value: r => r.late },
  { header: 'Late (min)',             value: r => r.lateMinutes },
  { header: 'Early Departure (min)',  value: r => r.earlyDepartureMinutes },
  { header: 'Corrected',              value: r => r.corrected },
  { header: 'Source',                 value: r => r.source },
];

export default function AttendanceLogExport({ from, to, onFromChange, onToChange, label = 'Attendance Log' }) {
  const fetchData = async () => {
    const { data } = await api.get('/reports/attendance-detail', { params: { from, to, format: 'json' } });
    return data;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      {onFromChange && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>FROM</div>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={from} onChange={e => onFromChange(e.target.value)} />
        </div>
      )}
      {onToChange && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>TO</div>
          <input type="date" style={{ ...inputStyle, width: 150 }} value={to} onChange={e => onToChange(e.target.value)} />
        </div>
      )}
      <ExportMenu fetchData={fetchData} columns={COLUMNS} filename={`attendance-log_${from}_to_${to}`} title={`${label} — ${from} to ${to}`} />
    </div>
  );
}
