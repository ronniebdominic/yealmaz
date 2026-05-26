import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const active = (path) => location.pathname === path ? 'nav-item active' : 'nav-item';
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  const nav = (path) => { navigate(path); setDrawerOpen(false); };

  const NavItems = ({ onNav }) => (
    <>
      <div className="nav-section-label">Analytics</div>
      <button className={active('/admin')} onClick={() => onNav('/admin')}>
        <span>📊</span> Analytics Dashboard
      </button>

      <div className="nav-section-label">Management</div>
      <button className={active('/admin/cases')} onClick={() => onNav('/admin/cases')}>
        <span>📋</span> Case Management
      </button>
      <button className={active('/admin/pricing')} onClick={() => onNav('/admin/pricing')}>
        <span>💰</span> Work Type Pricing
      </button>
      <button className={active('/')} onClick={() => onNav('/')}>
        <span>🏠</span> Receptionist View
      </button>
    </>
  );

  return (
    <div className="app">
      {/* ── Sidebar (desktop) ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(240,165,0,0.15)', color: '#F0A500' }}>Admin</span>
        </div>

        <nav className="sidebar-nav">
          <NavItems onNav={nav} />
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#F0A500', color: '#0F2044' }}>{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Administrator</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main">
        {/* Mobile top bar */}
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setDrawerOpen(true)} aria-label="Open menu">☰</button>
          <span className="mobile-topbar-title">🦷 Ye-Almaz</span>
          <div className="mobile-avatar" style={{ background: '#F0A500', color: '#0F2044' }}>{initials}</div>
        </div>

        {children}
      </main>

      {/* ── Mobile drawer overlay ── */}
      <div className={`drawer-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

      {/* ── Mobile drawer ── */}
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="drawer-head">
          <div className="drawer-logo">
            <img src="/logo.png" alt="Ye-Almaz" />
            <div>
              <div className="drawer-lab-name">Ye-Almaz Dental Lab</div>
              <div className="drawer-role" style={{ color: '#F0A500' }}>Admin</div>
            </div>
          </div>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>×</button>
        </div>

        <nav className="drawer-nav">
          <NavItems onNav={nav} />
        </nav>

        <div className="drawer-foot">
          <div className="drawer-user">
            <div className="user-avatar" style={{ background: '#F0A500', color: '#0F2044' }}>{initials}</div>
            <div>
              <div className="drawer-user-name">{user?.name}</div>
              <div className="drawer-user-role">Administrator</div>
            </div>
            <button className="drawer-logout" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </div>
    </div>
  );
}
