// Ye-Almaz — HR Manager's own portal. Keeps its own header chrome
// (logo, role pill, AttendanceClock, logout) since that's role-portal
// shell, not HR content — but the header is now restyled onto the shared
// light/blue design tokens instead of the old bespoke navy/teal look, and
// all actual tab content is HRWorkspace.jsx (shared with AdminHR.jsx) so
// nothing is implemented twice.
import { useAuth } from '../AuthContext';
import { MdLogout } from 'react-icons/md';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';
import HRWorkspace from './hr/HRWorkspace';

export default function HRDashboard() {
  const { user, logout } = useAuth();
  const initials = (user?.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font-body)' }}>
      <style>{`
        @media (max-width:640px){
          .hr-hide-sm{display:none}
        }
        @media (max-width:400px){
          .hr-shell-pad{padding-left:12px!important;padding-right:12px!important}
        }
      `}</style>
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        height: 56, position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <img src="/logo.png" alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', letterSpacing: '-.01em', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ye-Almaz Dental Lab</div>
            <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500 }}>HR &amp; Payroll</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Primary + secondary workflow actions */}
          <AttendanceClock />
          <LeaveRequestButton />
          {/* User controls — quieter, set off by a divider */}
          <span style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--brand-tint)', color: 'var(--brand-soft)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600 }}>{initials}</div>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="hr-hide-sm">{user?.name?.split(' ')[0]}</span>
            <button onClick={logout} title="Logout" className="btn btn-tertiary btn-sm" style={{ padding: 7 }}>
              <MdLogout size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="hr-shell-pad" style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px' }}>
        <HRWorkspace role="HR_MANAGER" />
      </div>
    </div>
  );
}
