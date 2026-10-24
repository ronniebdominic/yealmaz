import { fmtBr } from '../utils/balance';

// Invoice / paid so far / still owed — shown as three separate figures wherever a payment is recorded.
export default function BalanceStrip({ bal }) {
  const cell = (label, value, color) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{fmtBr(value)}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', marginBottom: 14 }}>
      {cell('Invoice', bal.invoice, 'var(--text-1)')}
      {cell('Paid so far', bal.paid, 'var(--green)')}
      {cell('Remaining', bal.remaining, bal.remaining > 0 ? 'var(--red)' : 'var(--green)')}
    </div>
  );
}
