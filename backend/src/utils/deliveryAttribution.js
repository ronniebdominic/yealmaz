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

// ── Pickup + delivery event classification ───────────────
// A driver's work is really two kinds of trip: PICKUP (bringing something
// TO the lab — either an impression from the clinic, or the finished case
// from the lab floor itself, on their way out to deliver it) and DELIVERY
// (dropping the finished case off at the clinic). Both are real,
// separately credit-worthy actions for performance purposes.
//
// The exact note strings below are what delivery.js's own driver-confirmed
// endpoints write (POST /:caseId/collect-impression and POST /:caseId/pickup)
// — deliberately narrower than just matching stageName, because
// dispatch.js writes CaseStage rows with the SAME stageNames
// (PICKUP_ASSIGNED/OUT_FOR_DELIVERY) for its own actions (assigning a
// driver, sending a case out directly, a clinic's self-drop-off) under
// different note text. Matching on the exact note text is what keeps
// those dispatch-side/non-driver events from being misattributed as a
// driver's own pickup.
const PICKUP_IMPRESSION_NOTE = 'Impression arrived at lab — awaiting receptionist acceptance';
const PICKUP_LAB_NOTE = 'Picked up for delivery';

// In real usage, a driver almost never presses their own "Picked up from
// Lab" button (PICKUP_LAB_NOTE) — dispatch.js's /send-out sends the case
// straight to OUT_FOR_DELIVERY on the driver's behalf instead, writing
// `scannedBy` as the DISPATCHER who performed the action, with the
// driver's name only embedded in the note text ("Dispatched to {name} for
// delivery"). Confirmed against production data: ~1,000+ rows of this
// pattern this year vs. a handful of driver-self-confirmed ones. Without
// recognizing it, the entire lab-pickup leg of driver credit would be
// invisible. matchDeliveryAgent() below extracts the name from notes for
// this specific pattern instead of trusting scannedBy.
const DISPATCHED_TO_PATTERN = /^Dispatched to (.+) for delivery$/i;

// Prisma OR clause matching every CaseStage row that could represent one
// of a driver's own pickup/delivery actions (confirmed by them directly,
// or assigned to them by name via dispatch) — pass straight into a
// `where` alongside any date-range/scannedBy filters.
const DELIVERY_EVENT_STAGE_OR = [
  { stageName: 'DELIVERED' },
  { stageName: 'PICKUP_ASSIGNED', notes: PICKUP_IMPRESSION_NOTE },
  { stageName: 'OUT_FOR_DELIVERY', notes: PICKUP_LAB_NOTE },
  { stageName: 'OUT_FOR_DELIVERY', notes: { startsWith: 'Dispatched to ' } },
];

// Classifies an already-matched CaseStage row (from a DELIVERY_EVENT_STAGE_OR
// query) into the two performance buckets. 'IMPRESSION'/'LAB' distinguish
// the two pickup kinds for display; both count as PICKUP for totals.
function classifyDeliveryEvent(stageName) {
  if (stageName === 'DELIVERED') return { type: 'DELIVERY', pickupKind: null };
  if (stageName === 'PICKUP_ASSIGNED') return { type: 'PICKUP', pickupKind: 'IMPRESSION' };
  if (stageName === 'OUT_FOR_DELIVERY') return { type: 'PICKUP', pickupKind: 'LAB' };
  return null;
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

// Returns the matched agent record, or null if this event isn't a real
// delivery-agent action (self-pickup/admin/import) or can't be matched to
// any current DELIVERY account.
function matchDeliveryAgent(scannedBy, notes, maps) {
  // Dispatch-assigned lab pickup — the real driver's name is in the note
  // text, not scannedBy (that's the dispatcher). See DISPATCHED_TO_PATTERN
  // above for why this exists.
  const dispatchedMatch = DISPATCHED_TO_PATTERN.exec((notes || '').trim());
  const rawName = (dispatchedMatch ? dispatchedMatch[1] : scannedBy || '').trim();

  if (!rawName || NON_AGENT_DELIVERY_MARKERS.has(rawName) || isSelfPickupNote(notes)) return null;
  const cleanRawName = rawName.toLowerCase();
  return maps.byName.get(cleanRawName) || maps.byFirstName.get(cleanRawName.split(/\s+/)[0]) || null;
}

module.exports = {
  NON_AGENT_DELIVERY_MARKERS, isSelfPickupNote, buildAgentNameMaps, matchDeliveryAgent,
  PICKUP_IMPRESSION_NOTE, PICKUP_LAB_NOTE, DELIVERY_EVENT_STAGE_OR, classifyDeliveryEvent,
};
