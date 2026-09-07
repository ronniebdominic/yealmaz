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
      background: 'var(--amber-dim)', color: 'var(--amber)',
      borderBottom: '1px solid var(--amber-line)',
      padding: '7px 16px', fontSize: 12, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: 'var(--font-body)',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <MdVisibility size={14} /> Admin view mode — viewing as {label}
      </span>
      <button
        onClick={() => navigate('/admin')}
        style={{
          background: 'var(--surface)', border: '1px solid var(--amber-line)', color: 'var(--amber)',
          borderRadius: 'var(--radius-xs)', padding: '4px 10px', fontSize: 11, fontWeight: 600,
          fontFamily: 'var(--font-body)',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <MdArrowBack size={13} /> Back to Admin
      </button>
    </div>
  );
}
