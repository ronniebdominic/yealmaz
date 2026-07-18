import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MdDashboard, MdMoveToInbox, MdLocalShipping, MdSearch, MdAdd,
  MdAssignment, MdLogout,
} from 'react-icons/md';

function NavItems({ active, onNav }) {
  return (
    <>
      <div className="nav-section-label">Reception</div>
      <button className={active('/')} onClick={() => onNav('/')}>
        <MdDashboard className="mi" size={17} /> Dashboard
      </button>
      <button className={active('/?section=accept')} onClick={() => onNav('/?section=accept')}>
        <MdMoveToInbox className="mi" size={17} /> Accept Case
      </button>
      <button className={active('/?section=ready')} onClick={() => onNav('/?section=ready')}>
        <MdLocalShipping className="mi" size={17} /> Ready Orders
      </button>
      <button className={active('/?section=track')} onClick={() => onNav('/?section=track')}>
        <MdSearch className="mi" size={17} /> Track Order
      </button>

      <div className="nav-section-label">Cases</div>
      <button className={active('/cases/new')} onClick={() => onNav('/cases/new')}>
        <MdAdd className="mi" size={17} /> New Case
      </button>
      <button className={active('/cases')} onClick={() => onNav('/cases')}>
        <MdAssignment className="mi" size={17} /> All Cases
      </button>
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav    = (path) => { navigate(path); setOpen(false); };
  // Mark active for exact path; dashboard sub-sections all resolve to '/'
  const active = (path) => {
    const base = path.split('?')[0];
    return location.pathname === base ? 'nav-item active' : 'nav-item';
  };
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
          <NavItems active={active} onNav={nav} />
        </nav>
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Receptionist</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
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
          <NavItems active={active} onNav={(path) => navigate(path.split('?')[0])} />
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Receptionist</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
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
