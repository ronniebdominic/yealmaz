import { useAuth } from '../AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function AdminLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const active = (path) => location.pathname === path ? 'nav-item active' : 'nav-item';
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(240,165,0,0.15)', color: '#F0A500' }}>Admin</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Analytics</div>
          <button className={active('/admin')} onClick={() => navigate('/admin')}>
            <span>📊</span> Analytics Dashboard
          </button>

          <div className="nav-section-label">Management</div>
          <button className={active('/admin/pricing')} onClick={() => navigate('/admin/pricing')}>
            <span>💰</span> Work Type Pricing
          </button>
          <button className={active('/')} onClick={() => navigate('/')}>
            <span>🏠</span> Receptionist View
          </button>
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
