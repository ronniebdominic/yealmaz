import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MdAnalytics, MdPrecisionManufacturing, MdAssignment, MdLocalHospital,
  MdGroup, MdAttachMoney, MdCardGiftcard, MdLogout, MdMap, MdBadge, MdWarehouse, MdGroups,
  MdDesk, MdPointOfSale, MdLocalShipping, MdTwoWheeler, MdScience, MdSupervisorAccount, MdInventory,
  MdPeopleAlt, MdDelete,
} from 'react-icons/md';

// Dashboards each staff role normally logs into directly — the admin
// account can open any of these to view/operate them without a separate
// login. Routed under /view/*, gated to the admin account (see App.jsx).
const VIEW_AS_ITEMS = [
  { path: '/view/receptionist', label: 'Receptionist',  icon: MdDesk },
  { path: '/view/finance',      label: 'Finance',       icon: MdPointOfSale },
  { path: '/view/dispatch',     label: 'Dispatch',      icon: MdLocalShipping },
  { path: '/view/delivery',     label: 'Delivery',      icon: MdTwoWheeler },
  { path: '/view/lab',          label: 'Lab',           icon: MdScience },
  { path: '/view/hr',           label: 'HR Portal',     icon: MdSupervisorAccount },
  { path: '/view/leader',       label: 'Operation Manager', icon: MdPeopleAlt },
  { path: '/view/inventory',    label: 'Inventory',     icon: MdInventory },
];

function NavItems({ active, onNav }) {
  return (
    <>
      <div className="nav-section-label">Analytics</div>
      <button className={active('/admin')} onClick={() => onNav('/admin')}>
        <MdAnalytics className="mi" size={17} /> Analytics Dashboard
      </button>
      <button className={active('/admin/case-status')} onClick={() => onNav('/admin/case-status')}>
        <MdPrecisionManufacturing className="mi" size={17} /> Case Status Board
      </button>
      <button className={active('/admin/lab-performance')} onClick={() => onNav('/admin/lab-performance')}>
        <MdBadge className="mi" size={17} /> Lab Performance
      </button>
      <button className={active('/admin/delivery-performance')} onClick={() => onNav('/admin/delivery-performance')}>
        <MdLocalShipping className="mi" size={17} /> Delivery Performance
      </button>

      <div className="nav-section-label">Management</div>
      <button className={active('/admin/cases')} onClick={() => onNav('/admin/cases')}>
        <MdAssignment className="mi" size={17} /> Case Management
      </button>
      <button className={active('/admin/trash')} onClick={() => onNav('/admin/trash')}>
        <MdDelete className="mi" size={17} /> Trash
      </button>
      <button className={active('/admin/clinics')} onClick={() => onNav('/admin/clinics')}>
        <MdLocalHospital className="mi" size={17} /> Clinics
      </button>
      <button className={active('/admin/users')} onClick={() => onNav('/admin/users')}>
        <MdGroup className="mi" size={17} /> Users
      </button>
      <button className={active('/admin/zones')} onClick={() => onNav('/admin/zones')}>
        <MdMap className="mi" size={17} /> Zones
      </button>
      <button className={active('/admin/pricing')} onClick={() => onNav('/admin/pricing')}>
        <MdAttachMoney className="mi" size={17} /> Work Type Pricing
      </button>
      <button className={active('/admin/rewards')} onClick={() => onNav('/admin/rewards')}>
        <MdCardGiftcard className="mi" size={17} /> Rewards
      </button>
      <button className={active('/admin/inventory')} onClick={() => onNav('/admin/inventory')}>
        <MdWarehouse className="mi" size={17} /> Inventory
      </button>
      <button className={active('/admin/hr')} onClick={() => onNav('/admin/hr')}>
        <MdGroups className="mi" size={17} /> HR & Payroll
      </button>

      <div className="nav-section-label">Switch Dashboard</div>
      {VIEW_AS_ITEMS.map(item => (
        <button key={item.path} className={active(item.path)} onClick={() => onNav(item.path)}>
          <item.icon className="mi" size={17} /> {item.label}
        </button>
      ))}
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
      <div className={`drawer glass-sidebar${open ? ' open' : ''}`}>
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
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
          </div>
        </div>
      </div>

      {/* ── Sidebar (desktop only) ───────────────────────── */}
      <aside className="sidebar glass-sidebar">
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
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main">
        {children}
      </main>
    </div>
  );
}
