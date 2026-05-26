import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

function NavItems({ active, onNav, newCases }) {
  return (
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
}

export default function Layout({ children, newCases = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav    = (path) => { navigate(path); setOpen(false); };
  const active = (path) => location.pathname === path ? 'nav-item active' : 'nav-item';
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'RX';

  return (
    <div className="app">
      {/* ── Mobile topbar ───────────────────────────────── */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title">Ye-Almaz Dental Lab</span>
        <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12, flexShrink: 0 }}>{initials}</div>
      </div>

      {/* ── Drawer overlay ──────────────────────────────── */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* ── Drawer ──────────────────────────────────────── */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">Receptionist</span>
        </div>
        <nav className="sidebar-nav">
          <NavItems active={active} onNav={nav} newCases={newCases} />
        </nav>
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Receptionist</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </div>

      {/* ── Sidebar (desktop only) ───────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">Receptionist</span>
        </div>
        <nav className="sidebar-nav">
          <NavItems active={active} onNav={(path) => navigate(path)} newCases={newCases} />
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

      {/* ── Main content ────────────────────────────────── */}
      <main className="main">
        {children}
      </main>
    </div>
  );
}
