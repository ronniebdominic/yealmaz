// Ye-Almaz — local-calendar-date helpers.
// `date.toISOString().slice(0, 10)` (or `.split('T')[0]`) extracts the UTC
// calendar date, not the browser's local one — for anyone in Addis Ababa
// (EAT, UTC+3) between midnight and 3am local time, that silently returns
// YESTERDAY's date. Any "Today" button, date-range default, or computed
// due-date (today + N days) should go through these instead, which read the
// browser's local Y/M/D directly.
export function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocal() {
  return toLocalDateString(new Date());
}

// Monday-start calendar week/month, "to date" — used by the Daily/Weekly/
// Monthly performance-range presets (My Performance screens). Calendar-
// period, not a rolling N-day window, matching the app's existing
// Today/This Month quick filters elsewhere (e.g. Analytics Dashboard).
export function startOfWeekLocal(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return toLocalDateString(d);
}

export function startOfMonthLocal(date = new Date()) {
  return toLocalDateString(new Date(date.getFullYear(), date.getMonth(), 1));
}
