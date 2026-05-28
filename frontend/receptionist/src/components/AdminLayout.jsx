import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

function NavItems({ active, onNav }) {
  return (
    <>
      <div className="nav-section-label">Analytics</div>
      <button className={active('/admin')} onClick={() => onNav('/admin')}>
        <span>📊</span> Analytics Dashboard
      </button>

      <div className="nav-section-label">Management</div>
      <button className={active('/admin/cases')} onClick={() => onNav('/admin/cases')}>
        <span>📋</span> Case Management
      </button>
      <button className={active('/admin/clinics')} onClick={() => onNav('/admin/clinics')}>
        <span>🏥</span> Clinics
      </button>
      <button className={active('/admin/users')} onClick={() => onNav('/admin/users')}>
        <span>👥</span> Users
      </button>
      <button className={active('/admin/pricing')} onClick={() => onNav('/admin/pricing')}>
        <span>💰</span> Work Type Pricing
      </button>
    </>
  );
}

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const nav    = (path) => { navigate(path); setOpen(false); };
  const active = (path) => location.pathname === path ? 'nav-item active' : 'nav-item';
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  return (
    <div className="app">
      {/* ── Mobile topbar ───────────────────────────────── */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title">Ye-Almaz Dental Lab</span>
        <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12, background: '#F0A500', color: '#0F2044', flexShrink: 0 }}>{initials}</div>
      </div>

      {/* ── Drawer overlay ──────────────────────────────── */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* ── Drawer ──────────────────────────────────────── */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(240,165,0,0.15)', color: '#F0A500' }}>Admin</span>
        </div>
        <nav className="sidebar-nav">
          <NavItems active={active} onNav={nav} />
        </nav>
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#F0A500', color: '#0F2044' }}>{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Administrator</div>
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
          <span className="role-badge" style={{ background: 'rgba(240,165,0,0.15)', color: '#F0A500' }}>Admin</span>
        </div>
        <nav className="sidebar-nav">
          <NavItems active={active} onNav={(path) => navigate(path)} />
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

      <main className="main">
        {children}
      </main>
    </div>
  );
}
