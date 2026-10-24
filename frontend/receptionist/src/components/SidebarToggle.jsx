import { useEffect, useSyncExternalStore } from 'react';
import { isSidebarCollapsed, setSidebarCollapsed, subscribeSidebar } from '../utils/sidebar';

// The collapse / expand button at the top of a dashboard sidebar. While collapsed, every menu item gets its name as a
// tooltip (the labels are hidden), so the icon rail stays usable.
export default function SidebarToggle() {
  const collapsed = useSyncExternalStore(subscribeSidebar, isSidebarCollapsed, () => false);
  useEffect(() => {
    const label = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const set = () => document.querySelectorAll('.sidebar .nav-item').forEach(el => {
      if (collapsed) el.setAttribute('title', label(el)); else el.removeAttribute('title');
    });
    set();
    if (!collapsed) return undefined;
    const nav = document.querySelector('.sidebar .sidebar-nav');
    const mo = nav ? new MutationObserver(set) : null; // menus that re-render (badges, sections) keep their tooltips
    mo?.observe(nav, { childList: true, subtree: true, characterData: true });
    return () => mo?.disconnect();
  }, [collapsed]);
  return (
    <button type="button" className="sb-toggle" onClick={() => setSidebarCollapsed(!collapsed)}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand menu' : 'Collapse menu'}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {collapsed ? <polyline points="9 18 15 12 9 6" /> : <polyline points="15 18 9 12 15 6" />}
      </svg>
    </button>
  );
}
