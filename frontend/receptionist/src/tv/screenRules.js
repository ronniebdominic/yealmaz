// Ye-Almaz TV — how long a screen stays up. Pure functions, shared by the rotation and the screens.
export const MIN_PAGE_SECONDS = 8;
export const PERF_PER_PAGE = 8;

// The configured time, stretched so every page of a long list is shown for at least MIN_PAGE_SECONDS.
// Nothing is ever dropped because it did not fit.
export function pageCount(id, snap, cfg) {
  if (!snap) return 1;
  if (id === 'employees') return Math.max(1, Math.ceil(snap.employees.length / cfg.employeesPerPage));
  if (id === 'performance') return Math.max(1, Math.ceil((snap.performance.ranked.length + snap.performance.unranked.length) / PERF_PER_PAGE));
  return 1;
}
export function screenSeconds(screen, snap, cfg) {
  return Math.max(screen.seconds, pageCount(screen.id, snap, cfg) * MIN_PAGE_SECONDS);
}
