import { useNavigate } from 'react-router-dom';
import { MdVisibility, MdArrowBack } from 'react-icons/md';

// Sticky strip shown above a role dashboard when the admin account is
// previewing it — these dashboards are self-contained pages with their own
// Logout button (which would end the admin's whole session), so this is the
// only way back to /admin without hitting the browser back button.
export default function AdminViewBanner({ label }) {
  const navigate = useNavigate();
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 1000,
      background: '#F0A500', color: '#0F2044',
      padding: '6px 16px', fontSize: 12, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <MdVisibility size={14} /> Admin view mode — viewing as {label}
      </span>
      <button
        onClick={() => navigate('/admin')}
        style={{
          background: 'rgba(15,32,68,0.15)', border: 'none', color: '#0F2044',
          borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <MdArrowBack size={13} /> Back to Admin
      </button>
    </div>
  );
}
