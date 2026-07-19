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
