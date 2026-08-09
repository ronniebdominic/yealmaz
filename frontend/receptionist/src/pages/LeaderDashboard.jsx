// Ye-Almaz — Team Leader portal. A Leader is a first-stage approver for
// their direct reports' leave requests (EmployeeProfile.managerId) before
// HR's final decision — see TeamLeaveRequests.jsx / attendance.js's
// /leave/team + /leave/:id/manager-decide. Same header-shell pattern as
// HRDashboard.jsx (self-service AttendanceClock/LeaveRequestButton, since
// a Leader is also an employee).
import { useAuth } from '../AuthContext';
import { MdLogout, MdGroups } from 'react-icons/md';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';
import TeamLeaveRequests from '../components/TeamLeaveRequests';

export default function LeaderDashboard() {
  const { user, logout } = useAuth();
  const initials = (user?.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)', letterSpacing: 0.2 }}>Ye-Almaz Dental Lab</div>
            <span style={{ fontSize: 11, background: 'rgba(219,39,119,0.1)', color: '#DB2777', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>Operation Manager</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
          <AttendanceClock /> <LeaveRequestButton />
          <button onClick={logout} title="Logout" className="btn btn-ghost btn-sm">
            <MdLogout size={15} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdGroups size={16} /> Team Leave Requests</div>
          </div>
          <TeamLeaveRequests />
        </div>
      </div>
    </div>
  );
}
