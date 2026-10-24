// What a case is billed for, what has been paid, and what is left — the same rule the server uses
// (services/financeRules.js). The server sends billed / paid / remaining on trusted-partner rows; otherwise this works
// them out from the case's payment record.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function balanceOf(c) {
  const invoice = c.billed ?? (c.totalAmount > 0 ? c.totalAmount : (c.payment?.amount ?? 0));
  const paid = c.paid ?? (c.payment?.status === 'VERIFIED' ? (c.payment?.amount ?? invoice) : (c.payment?.amountReceived || 0));
  const remaining = c.remaining ?? Math.max(round2(invoice - (c.payment?.amountReceived || 0)), 0);
  return { invoice, paid, remaining };
}
export const fmtBr = (v) => `Br ${Number(v || 0).toLocaleString('en-US')}`;
