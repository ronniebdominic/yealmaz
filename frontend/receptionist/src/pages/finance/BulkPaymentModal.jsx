// Ye-Almaz — Finance: record a payment against several of a trusted
// clinic's cases.
//
// Trusted partners pay whatever they send, whenever they send it — a lump
// sum against a bill, a part payment, then the rest next week. So every
// case gets its own editable amount (defaulting to its whole balance), and
// a lump sum can be entered once and spread across the selected cases
// oldest-first. A case is only marked collected when the payments on it add
// up to what it owes; a smaller amount leaves it outstanding with a running
// balance, and the payment that finishes it is what closes it out.
import { useMemo, useState } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { MdPaid, MdWarning } from 'react-icons/md';

const br = (n) => `Br ${(Math.round((n || 0) * 100) / 100).toLocaleString('en-US')}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const dueOf = (c) => c.payment?.amount ?? c.totalAmount ?? 0;
export const remainingOf = (c) => round2(dueOf(c) - (c.payment?.amountReceived || 0));

const labelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: '.04em', textTransform: 'uppercase' };
const inputStyle = { padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', width: '100%' };

export default function BulkPaymentModal({ clinic, clinicId, cases, onClose, onDone }) {
  // Kept as strings while editing so a half-typed "12." isn't rewritten under the cursor.
  const [amounts, setAmounts] = useState(() => Object.fromEntries(cases.map(c => [c.id, String(remainingOf(c))])));
  const [lump, setLump] = useState('');
  const [whPct, setWhPct] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => cases.map(c => {
    const remaining = remainingOf(c);
    const raw = amounts[c.id];
    const amount = raw === '' || raw == null ? NaN : round2(parseFloat(raw));
    let error = null;
    if (isNaN(amount) || amount <= 0) error = 'Enter an amount';
    else if (amount > remaining + 0.005) error = `More than the ${br(remaining)} owed`;
    return { c, remaining, amount, error, completes: !error && amount >= remaining - 0.005 };
  }), [cases, amounts]);

  const hasError = rows.some(r => r.error);
  const pct = parseFloat(whPct);
  const pctValid = whPct === '' || (!isNaN(pct) && pct >= 0 && pct <= 100);
  const totalApplied = round2(rows.reduce((s, r) => s + (r.error ? 0 : r.amount), 0));
  const totalTax = pctValid && whPct !== '' ? round2(rows.reduce((s, r) => s + (r.error ? 0 : round2(r.amount * pct / 100)), 0)) : 0;
  const completing = rows.filter(r => r.completes).length;
  const part = rows.filter(r => !r.error && !r.completes).length;
  const stillOwed = round2(rows.reduce((s, r) => s + (r.error ? 0 : r.remaining - r.amount), 0));

  const setAmount = (id, v) => setAmounts(a => ({ ...a, [id]: v }));

  // Spread one lump sum across the selected cases, oldest first (the list
  // arrives ordered by creation date). Anything left over after every case
  // is fully covered is reported rather than silently dropped.
  const [leftover, setLeftover] = useState(0);
  const allocate = () => {
    let left = round2(parseFloat(lump));
    if (isNaN(left) || left <= 0) return toast.error('Enter the amount the clinic paid');
    const next = {};
    for (const c of cases) {
      const take = Math.min(left, remainingOf(c));
      next[c.id] = take > 0 ? String(round2(take)) : '';
      left = round2(left - take);
    }
    setAmounts(next);
    setLeftover(left);
    if (left > 0.005) toast(`${br(left)} is more than these cases owe — select more cases or reduce the amount.`, { icon: '⚠️', duration: 6000 });
  };

  const submit = async () => {
    if (hasError || !pctValid) return;
    setSaving(true);
    try {
      const { data } = await api.post('/payments/collect-bulk', {
        clinicId,
        items: rows.map(r => ({ caseId: r.c.id, amount: r.amount })),
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        taxWithheldPct: whPct !== '' ? pct : undefined,
      });
      toast.success(
        data.partial
          ? `Recorded ${br(data.totalApplied)} — ${data.completed} collected, ${data.partial} part-paid`
          : `Recorded ${br(data.totalApplied)} — ${data.completed} case${data.completed === 1 ? '' : 's'} collected`
      );
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record the payment');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 820, width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdPaid className="mi" size={16} /> Record Payment</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{clinic.name} · {cases.length} case{cases.length === 1 ? '' : 's'} selected</div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={saving}>×</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {/* Lump sum -> spread */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={labelStyle}>Clinic paid a lump sum of (Br)</div>
              <input style={inputStyle} inputMode="decimal" value={lump} placeholder="e.g. 50000"
                onChange={e => setLump(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={e => e.key === 'Enter' && allocate()} />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={allocate} disabled={!lump}>Spread oldest-first</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAmounts(Object.fromEntries(cases.map(c => [c.id, String(remainingOf(c))]))); setLeftover(0); }}>
              Reset to full balances
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-3)', flexBasis: '100%' }}>
              Fills the amounts below, which you can still edit case by case. Oldest cases are covered first.
            </div>
          </div>

          {leftover > 0.005 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--amber)', fontSize: 12, marginBottom: 10 }}>
              <MdWarning size={15} /> {br(leftover)} of the lump sum is not applied — it is more than these cases owe.
            </div>
          )}

          {/* Per-case amounts */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', maxHeight: 300 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
                  {['Case #', 'Patient', 'Owed', 'Paying now', 'After this'].map((h, i) => (
                    <th key={h} style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: i >= 2 ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, remaining, amount, error, completes }) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{c.caseNumber}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.patientName}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {br(remaining)}
                      {(c.payment?.amountReceived || 0) > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>of {br(dueOf(c))}</div>
                      )}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '3px 7px', fontSize: 10 }} onClick={() => setAmount(c.id, String(remaining))} title="Pay the whole remaining balance">Full</button>
                        <input inputMode="decimal" value={amounts[c.id] ?? ''}
                          onChange={e => setAmount(c.id, e.target.value.replace(/[^0-9.]/g, ''))}
                          style={{ ...inputStyle, width: 110, textAlign: 'right', padding: '5px 8px', borderColor: error ? 'var(--red)' : 'var(--border)' }} />
                      </div>
                      {error && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>{error}</div>}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {error ? '—' : completes
                        ? <span style={{ color: 'var(--green)', fontWeight: 700 }}>✓ Collected</span>
                        : <span style={{ color: 'var(--amber)' }}>{br(remaining - amount)} still owed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
            <div>
              <div style={labelStyle}>Bank / receipt reference</div>
              <input style={inputStyle} value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. CBE transfer no." />
            </div>
            <div>
              <div style={labelStyle}>Withholding tax (%)</div>
              <input style={{ ...inputStyle, borderColor: pctValid ? 'var(--border)' : 'var(--red)' }} inputMode="decimal" value={whPct} placeholder="0 — none withheld"
                onChange={e => setWhPct(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>Notes (optional)</div>
              <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Summary */}
          <div style={{ marginTop: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <div><div style={labelStyle}>Applied to balances</div><div style={{ fontSize: 20, fontWeight: 700 }}>{br(totalApplied)}</div></div>
            {totalTax > 0 && <div><div style={labelStyle}>Withheld by clinic</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)' }}>{br(totalTax)}</div></div>}
            {totalTax > 0 && <div><div style={labelStyle}>Cash to bank</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{br(totalApplied - totalTax)}</div></div>}
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12, color: 'var(--text-2)', alignSelf: 'center', lineHeight: 1.6 }}>
              <div><strong>{completing}</strong> case{completing === 1 ? '' : 's'} will be marked collected</div>
              {part > 0 && <div><strong>{part}</strong> part-paid · {br(stillOwed)} still owed</div>}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || hasError || !pctValid || cases.length === 0}>
            {saving ? 'Recording…' : `Record ${br(totalApplied)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
