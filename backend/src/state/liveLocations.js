// Ye-Almaz — Live delivery-agent location store.
//
// Deliberately ephemeral and in-process (a plain Map), not persisted to the
// database — this is a "where are they right now" live feature, not route
// history/playback, so there's nothing worth writing to Postgres. A single
// Railway instance holds this in memory; if the process restarts, every
// agent's next location POST (they're sent every ~20s while sharing is on)
// repopulates it within moments, which is an acceptable trade-off for the
// feature this is.
const positions = new Map(); // userId -> { latitude, longitude, accuracy, heading, speed, updatedAt }

function setPosition(userId, data) {
  positions.set(userId, { ...data, updatedAt: new Date() });
}

function removePosition(userId) {
  positions.delete(userId);
}

// Filters out anyone who hasn't posted an update within maxAgeMs — a driver
// who closed the app, lost connectivity, or crashed doesn't linger forever
// as a stale marker; they just silently age out.
function getActivePositions(maxAgeMs = 120_000) {
  const cutoff = Date.now() - maxAgeMs;
  const out = [];
  for (const [userId, pos] of positions) {
    if (pos.updatedAt.getTime() >= cutoff) out.push({ userId, ...pos });
  }
  return out;
}

module.exports = { setPosition, removePosition, getActivePositions };
