// Ye-Almaz — Attendance punch source indicator
// A small colored dot next to a clock-in/out time, so HR can tell a
// biometric device punch from a manual/kiosk/GPS one (or an HR correction)
// at a glance, without opening the correction modal. Shared by AttendanceTab
// (workforce day view) and EmployeeProfileModal (one employee's range view)
// since both render clockInSource/clockOutSource from the same
// computeDaySummary() output.
const SOURCE_LABEL = {
  BIOMETRIC: 'Biometric device', MANUAL: 'Manual entry (HR)', KIOSK: 'Reception PIN kiosk',
  GEOFENCE: 'Self-service (GPS)', CORRECTED: 'HR correction',
};
const SOURCE_COLOR = {
  BIOMETRIC: 'var(--green)', MANUAL: 'var(--text-3)', KIOSK: 'var(--brand)',
  GEOFENCE: 'var(--accent)', CORRECTED: 'var(--amber)',
};

export default function SourceDot({ source }) {
  if (!source || !SOURCE_LABEL[source]) return null;
  return (
    <span
      title={SOURCE_LABEL[source]}
      style={{
        display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
        background: SOURCE_COLOR[source], marginLeft: 5, verticalAlign: 'middle',
      }}
    />
  );
}
