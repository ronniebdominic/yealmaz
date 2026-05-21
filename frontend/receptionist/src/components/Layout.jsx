import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Layout({ children, pendingPayments = 0, newCases = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const nav = (path) => navigate(path);
  const active = (path) => location.pathname === path ? 'nav-item active' : 'nav-item';

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'RX';

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">{user?.role === 'ADMIN' ? 'Admin' : 'Receptionist'}</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Overview</div>
          <button className={active('/')} onClick={() => nav('/')}>
            <span>📊</span> Dashboard
          </button>

          <div className="nav-section-label">Cases</div>
          <button className={active('/cases')} onClick={() => nav('/cases')}>
            <span>📋</span> All Cases
            {newCases > 0 && <span className="badge-count">{newCases}</span>}
          </button>
          <button className={active('/cases/new')} onClick={() => nav('/cases/new')}>
            <span>➕</span> New Case
          </button>

          <div className="nav-section-label">Billing</div>
          <button className={active('/billing')} onClick={() => nav('/billing')}>
            <span>💰</span> Billing & Invoicing
            {pendingPayments > 0 && <span className="badge-count">{pendingPayments}</span>}
          </button>
          <button className={active('/payments')} onClick={() => nav('/payments')}>
            <span>💳</span> Verify Payments
          </button>

          <div className="nav-section-label">Delivery</div>
          <button className={active('/delivery')} onClick={() => nav('/delivery')}>
            <span>🚚</span> Ready to Dispatch
          </button>

          {user?.role === 'ADMIN' && (
            <>
              <div className="nav-section-label">Admin</div>
              <button className={active('/admin')} onClick={() => nav('/admin')}>
                <span>📊</span> Analytics Dashboard
              </button>
              <button className={active('/admin/pricing')} onClick={() => nav('/admin/pricing')}>
                <span>💰</span> Work Type Pricing
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role === 'ADMIN' ? 'Administrator' : 'Receptionist'}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main">
        {children}
      </main>
    </div>
  );
}
