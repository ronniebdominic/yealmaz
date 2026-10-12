// Ye-Almaz — the one place the money rules live.
//
// Every dashboard, statement and payment screen answers "what is this case
// billed for / what is still owed / what has been paid" through these
// functions. Before they existed each screen carried its own copy of the rule,
// the copies drifted apart, and the dashboards stopped agreeing. Change a rule
// here and every screen changes with it.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// What a case is billed for NOW. Case.totalAmount is the source of truth —
// Payment.amount can be stale after a later price edit. A case with no total
// yet falls back to its payment's amount.
function billedOf(c) {
  return c.totalAmount > 0 ? c.totalAmount : (c.payment?.amount ?? 0);
}

// What has been collected so far: the whole bill once VERIFIED, otherwise any
// part payments recorded against it.
function paidOf(c) {
  if (c.payment?.status === 'VERIFIED') return c.payment?.amount ?? billedOf(c);
  return c.payment?.amountReceived || 0;
}

// What is still owed on a case, after part payments (never negative).
function remainingOf(c) {
  return Math.max(round2(billedOf(c) - (c.payment?.amountReceived || 0)), 0);
}

// "Outstanding": a DELIVERED case whose payment isn't VERIFIED and that is
// actually priced. A rejected receipt is still owed. A remake only counts when
// it carries a charge (remakes start at 0). Returns the amount owed, or 0.
// A case object without a `status` is assumed already filtered to delivered.
function outstandingOwed(c) {
  if (c.status != null && c.status !== 'DELIVERED') return 0;
  if ((c.payment?.status || 'PENDING') === 'VERIFIED') return 0;
  if (!(billedOf(c) > 0)) return 0;
  return remainingOf(c);
}

// Sanity limits for dates typed by hand. A delivery date of 2001 once hid a
// case from every dashboard. Returns an error message, or null when fine.
const EARLIEST_YEAR = 2020;
function checkCaseDate(kind, value, { createdAt } = {}) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return `${kind} is not a valid date.`;
  if (d.getFullYear() < EARLIEST_YEAR) return `${kind} year ${d.getFullYear()} looks wrong — please check it.`;
  const now = Date.now();
  if (kind === 'Delivery date') {
    if (d.getTime() > now + 2 * 86_400_000) return 'Delivery date cannot be in the future.';
    if (createdAt && d.getTime() < new Date(createdAt).getTime() - 2 * 86_400_000) {
      return 'Delivery date cannot be before the case was created.';
    }
  } else if (d.getTime() > now + 3 * 365 * 86_400_000) {
    return `${kind} is too far in the future — please check it.`;
  }
  return null;
}

module.exports = { round2, billedOf, paidOf, remainingOf, outstandingOwed, checkCaseDate };
