// Operation Manager's remake/redo review queue — every case whose amount is
// locked to Br 0 pending a decision: Remake (free, stays 0) or Redo (50% of
// the ORIGINAL case's totalAmount, with any discount the receptionist set
// at intake — independent of this decision — applied on top). Structural
// mirror of TeamLeaveRequests.jsx (same hideEmpty convention, same
// fetch-list/decide-mutate/invalidate shape), backed by
// GET /cases/review/queue + PATCH /cases/:id/review-decide.

// Mirrors the backend's applyDiscount() in cases.js — same AMOUNT/PERCENT
// math, clamped at 0 — so the Redo button's preview matches exactly what
// review-decide will actually charge.
function applyDiscount(base, discountType, discountValue) {
  if (!discountType || discountValue == null) return base;
  const discounted = discountType === 'PERCENT' ? base * (1 - discountValue / 100) : base - discountValue;
  return Math.max(0, discounted);
}
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import toast from 'react-hot-toast';
import { MdAutorenew } from 'react-icons/md';

export default function CaseReviewQueue({ hideEmpty = false }) {
  const qc = useQueryClient();
  const { data: cases = [] } = useQuery({
    queryKey: ['case-review-queue'],
    queryFn: () => api.get('/cases/review/queue').then(r => r.data),
  });

  const decide = async (id, decision) => {
    try {
      await api.patch(`/cases/${id}/review-decide`, { decision });
      toast.success(decision === 'REDO' ? 'Marked as Redo — 50% of the original charged' : 'Marked as Remake — free of charge');
      qc.invalidateQueries({ queryKey: ['case-review-queue'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
    } catch (err) { toast.error(err.response?.data?.error || 'Could not record the decision'); }
  };

  if (cases.length === 0) {
    return hideEmpty ? null : <div className="empty-state">No cases awaiting remake/redo review</div>;
  }

  const table = (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Case</th><th>Patient</th><th>Clinic</th><th>Work Type</th>
            <th>Original Case</th><th>Discount</th><th>Reason</th><th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cases.map(c => {
            const hasDiscount = c.discountType != null && c.discountValue != null;
            const redoBase = c.originalCase?.totalAmount != null ? c.originalCase.totalAmount * 0.5 : null;
            const redoAmount = redoBase != null
              ? Math.round(applyDiscount(redoBase, c.discountType, c.discountValue) * 100) / 100
              : null;
            return (
              <tr key={c.id}>
                <td className="case-number">{c.caseNumber || '—'}</td>
                <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                <td>{c.clinic?.name || '—'}</td>
                <td>{c.workType}</td>
                <td>
                  {c.originalCase ? (
                    <>
                      <span className="case-number">{c.originalCase.caseNumber || '—'}</span>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {c.originalCase.totalAmount != null ? `Br ${c.originalCase.totalAmount.toLocaleString('en-US')}` : '—'}
                      </div>
                    </>
                  ) : <span style={{ color: 'var(--red)' }}>Not linked</span>}
                </td>
                <td style={{ color: hasDiscount ? 'var(--red)' : 'var(--text-3)', fontWeight: hasDiscount ? 700 : 400 }}>
                  {hasDiscount
                    ? (c.discountType === 'PERCENT' ? `${c.discountValue}% off` : `Br ${c.discountValue.toLocaleString('en-US')} off`)
                    : '—'}
                </td>
                <td style={{ color: 'var(--text-3)' }}>{c.remakeReason || '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => decide(c.id, 'REMAKE')} style={{ marginRight: 6 }}>
                    Remake (Free)
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => decide(c.id, 'REDO')} disabled={!c.originalCase}
                    title={redoAmount != null ? `Charges Br ${redoAmount.toLocaleString('en-US')}${hasDiscount ? ' (after discount)' : ''}` : 'No original case linked'}>
                    Redo ({redoAmount != null ? `Br ${redoAmount.toLocaleString('en-US')}` : '50%'})
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (!hideEmpty) return table;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdAutorenew size={16} /> Remake/Redo Review</div>
      </div>
      {table}
    </div>
  );
}
