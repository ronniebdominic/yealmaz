// Ye-Almaz — EAT-aware date-range helpers.
// JS parses a bare date-only string ("2026-07-20") as UTC midnight, not local
// midnight — 3 hours ahead of true EAT (UTC+3, process.env.TZ is set to
// 'Africa/Addis_Ababa' in index.js) midnight. Appending "T00:00:00" forces
// local-time parsing instead, which then correctly resolves to EAT midnight
// for any "YYYY-MM-DD" query param (From/To date filters throughout the app).
function startOfDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function endOfDay(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(23, 59, 59, 999);
  return d;
}

module.exports = { startOfDay, endOfDay };
