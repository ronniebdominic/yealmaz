// Ye-Almaz — HR Manager's own portal. Keeps its own header chrome
// (logo, role pill, AttendanceClock, logout) since that's role-portal
// shell, not HR content — but the header is now restyled onto the shared
// light/blue design tokens instead of the old bespoke navy/teal look, and
// all actual tab content is HRWorkspace.jsx (shared with AdminHR.jsx) so
// nothing is implemented twice.
import { useAuth } from '../AuthContext';
import { MdLogout } from 'react-icons/md';
import AttendanceClock from '../components/AttendanceClock';
import HRWorkspace from './hr/HRWorkspace';

export default function HRDashboard() {
  const { user, logout } = useAuth();
  const initials = (user?.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/logo.png" alt="logo" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-1)', letterSpacing: 0.2 }}>Ye-Almaz Dental Lab</div>
            <span style={{ fontSize: 11, background: 'rgba(26,86,160,0.1)', color: 'var(--blue)', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>HR Manager</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</div>
          <AttendanceClock />
          <button onClick={logout} title="Logout" className="btn btn-ghost btn-sm">
            <MdLogout size={15} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
        <HRWorkspace role="HR_MANAGER" />
      </div>
    </div>
  );
}
