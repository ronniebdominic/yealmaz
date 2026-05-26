import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Layout({ children, newCases = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = (path) => { navigate(path); setDrawerOpen(false); };
  const active = (path) => location.pathname === path ? 'nav-item active' : 'nav-item';

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'RX';

  const NavItems = ({ onNav }) => (
    <>
      <div className="nav-section-label">Overview</div>
      <button className={active('/')} onClick={() => onNav('/')}>
        <span>📊</span> Dashboard
      </button>

      <div className="nav-section-label">Cases</div>
      <button className={active('/cases')} onClick={() => onNav('/cases')}>
        <span>📋</span> All Cases
        {newCases > 0 && <span className="badge-count">{newCases}</span>}
      </button>
      <button className={active('/cases/new')} onClick={() => onNav('/cases/new')}>
        <span>➕</span> New Case
      </button>

      <div className="nav-section-label">Delivery</div>
      <button className={active('/delivery')} onClick={() => onNav('/delivery')}>
        <span>🚚</span> Ready to Dispatch
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
          <span className="role-badge">Receptionist</span>
        </div>

        <nav className="sidebar-nav">
          <NavItems onNav={nav} />
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Receptionist</div>
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
          <div className="mobile-avatar">{initials}</div>
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
              <div className="drawer-role">Receptionist</div>
            </div>
          </div>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>×</button>
        </div>

        <nav className="drawer-nav">
          <NavItems onNav={nav} />
        </nav>

        <div className="drawer-foot">
          <div className="drawer-user">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="drawer-user-name">{user?.name}</div>
              <div className="drawer-user-role">Receptionist</div>
            </div>
            <button className="drawer-logout" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </div>
    </div>
  );
}
