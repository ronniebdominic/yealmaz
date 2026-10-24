// Ye-Almaz — sidebar width preference. Expanded (icons + labels) is the default; collapsed is an icon rail.
// The choice is remembered per browser and applied as a class on <html>, so every dashboard's sidebar follows it.
const KEY = 'ya_sidebar';
const EVENT = 'ya-sidebar-change';

export const isSidebarCollapsed = () => {
  try { return localStorage.getItem(KEY) === 'collapsed'; } catch { return false; }
};
export function applySidebar(collapsed = isSidebarCollapsed()) {
  document.documentElement.classList.toggle('sb-collapsed', collapsed);
}
export function setSidebarCollapsed(collapsed) {
  try { localStorage.setItem(KEY, collapsed ? 'collapsed' : 'expanded'); } catch { /* not remembered */ }
  applySidebar(collapsed);
  window.dispatchEvent(new Event(EVENT));
}
export const subscribeSidebar = (cb) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
applySidebar(); // before first paint of the dashboards, so a collapsed rail does not flash open
