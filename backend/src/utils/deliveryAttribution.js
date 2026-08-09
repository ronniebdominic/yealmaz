// Ye-Almaz — Delivery attribution helpers.
//
// DeliveryLog.deliveryById is a real FK, but in practice it's barely
// populated: the live /deliver flow only ever fills it in via a row
// created by a preceding /pickup call, and in real usage almost no
// deliveries go through that step (as of this writing, 5 DeliveryLog rows
// exist total against ~9,000 DELIVERED cases). What's actually reliable is
// CaseStage — every real delivery writes a 'DELIVERED' stage with
// scannedBy set to the driver's account name at that moment — so
// attribution here mirrors dashboard.js's /lab-performance: exact-name
// match with an unambiguous first-name fallback (an account's display
// name can drift over time, e.g. a later full-legal-name update).
//
// Self-pickups and admin/import edits also write a 'DELIVERED' stage, but
// under a non-agent name/note — NON_AGENT_DELIVERY_MARKERS and
// isSelfPickupNote() let callers exclude those outright instead of
// counting them as "couldn't be matched to an agent."
const NON_AGENT_DELIVERY_MARKERS = new Set(['Admin Dashboard', 'Ye-Almaz Admin', 'Ye-Almaz Dispatch', 'Import', 'System']);

function isSelfPickupNote(notes) {
  return /^self pickup/i.test(notes || '');
}

// agents: [{ id, name, isActive, ... }] — typically every User with role DELIVERY.
function buildAgentNameMaps(agents) {
  const byName = new Map();
  for (const a of agents) {
    const key = a.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || (!existing.isActive && a.isActive)) byName.set(key, a);
  }
  const byFirstNameCounts = new Map();
  for (const a of agents) {
    const first = a.name.trim().toLowerCase().split(/\s+/)[0];
    byFirstNameCounts.set(first, (byFirstNameCounts.get(first) || 0) + 1);
  }
  const byFirstName = new Map();
  for (const a of agents) {
    const first = a.name.trim().toLowerCase().split(/\s+/)[0];
    if (byFirstNameCounts.get(first) !== 1) continue; // ambiguous, skip
    const existing = byFirstName.get(first);
    if (!existing || (!existing.isActive && a.isActive)) byFirstName.set(first, a);
  }
  return { byName, byFirstName };
}

// Returns the matched agent record, or null if this scannedBy string isn't
// a real delivery-agent event (self-pickup/admin/import) or can't be
// matched to any current DELIVERY account.
function matchDeliveryAgent(scannedBy, notes, maps) {
  const rawName = (scannedBy || '').trim();
  if (!rawName || NON_AGENT_DELIVERY_MARKERS.has(rawName) || isSelfPickupNote(notes)) return null;
  const cleanRawName = rawName.toLowerCase();
  return maps.byName.get(cleanRawName) || maps.byFirstName.get(cleanRawName.split(/\s+/)[0]) || null;
}

module.exports = { NON_AGENT_DELIVERY_MARKERS, isSelfPickupNote, buildAgentNameMaps, matchDeliveryAgent };
