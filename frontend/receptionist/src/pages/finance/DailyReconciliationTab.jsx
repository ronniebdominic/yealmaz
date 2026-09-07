// Ye-Almaz — Finance: Daily Reconciliation
//
// End-of-day close-out: every case DELIVERED in the selected range, split
// into Cash Sales (pays per case) and Credit Sales / Trusted Partners
// (billed later on account) — the same isExcluded distinction used
// everywhere else in this app, applied here to a single day's deliveries
// so finance can balance it against physical cash/bank records.
//
// Remake/redo cases are deliberately INCLUDED (unlike the admin
// dashboard's Total Case Value, which excludes them to avoid double-
// counting projected business) — this is real money that needs
// reconciling today regardless of why the case exists.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api';
import { format } from 'date-fns';
import { todayLocal } from '../../utils/date';
import SearchableSelect from '../../components/SearchableSelect';
import { PaymentBadge } from '../../components/StatusBadge';
import ExportMenu from '../../components/ExportMenu';
import { MdPointOfSale, MdHandshake, MdSearch, MdReceiptLong } from 'react-icons/md';

const fmtBr = (n) => `Br ${Math.round(n || 0).toLocaleString('en-US')}`;

export default function DailyReconciliationTab() {
  // Same queryKey as InvoicesPanel's clinic list, so react-query dedupes
  // the request when both are mounted rather than fetching twice.
  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const clinicOptions = [{ value: '', label: 'All Clinics' }, ...clinicList.map(c => ({ value: c.id, label: c.name }))];

  const [dateFrom, setDateFrom] = useState(todayLocal());
  const [dateTo, setDateTo] = useState(todayLocal());
  const [clinicId, setClinicId] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  // Clicking a summary card filters the table to that sales type; click
  // the same card again (or the ✕) to go back to showing both.
  const [salesTypeFilter, setSalesTypeFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['finance', 'daily-reconciliation', dateFrom, dateTo, clinicId, caseNumber],
    queryFn: () => api.get('/payments/daily-reconciliation', {
      params: {
        from: dateFrom, to: dateTo,
        clinicId: clinicId || undefined,
        caseNumber: caseNumber.trim() || undefined,
      },
    }).then(r => r.data),
    staleTime: 15_000,
  });

  const cash = data?.cashSales || { count: 0, billedTotal: 0, collectedTotal: 0, outstandingTotal: 0 };
  const credit = data?.creditSales || { count: 0, billedTotal: 0, collectedTotal: 0, outstandingTotal: 0 };
  const cases = data?.cases || [];
  const visibleCases = salesTypeFilter ? cases.filter(c => c.salesType === salesTypeFilter) : cases;
  const isSingleDay = dateFrom === dateTo;

  const toggleFilter = (type) => setSalesTypeFilter(f => f === type ? '' : type);

  const exportColumns = [
    { header: 'Case',      value: c => c.caseNumber || '' },
    { header: 'Patient',   value: c => c.patientName || '' },
    { header: 'Clinic',    value: c => c.clinicName || '' },
    { header: 'Type',      value: c => c.salesType === 'CASH' ? 'Cash' : 'Credit' },
    { header: 'Work Type', value: c => c.workType || '' },
    { header: 'Amount (Br)', value: c => c.billedAmount ?? '' },
    { header: 'Payment',   value: c => c.paymentStatus || '' },
    { header: 'Delivered', value: c => c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy, h:mm a') : '' },
  ];

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MdReceiptLong className="mi" size={15} /> Daily Reconciliation
          </div>
        </div>
        <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>FROM</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>TO</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)' }} />
          </div>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>CLINIC</div>
            <SearchableSelect value={clinicId} onChange={setClinicId} options={clinicOptions} placeholder="All Clinics" />
          </div>
          <div style={{ position: 'relative', minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>CASE NUMBER</div>
            <MdSearch size={16} style={{ position: 'absolute', left: 10, top: 34, color: 'var(--text-3)' }} />
            <input
              value={caseNumber} onChange={e => setCaseNumber(e.target.value)}
              placeholder="e.g. YDL26007600"
              style={{ padding: '8px 10px 8px 32px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', width: '100%' }}
            />
          </div>
          {(dateFrom !== todayLocal() || dateTo !== todayLocal() || clinicId || caseNumber) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(todayLocal()); setDateTo(todayLocal()); setClinicId(''); setCaseNumber(''); setSalesTypeFilter(''); }}>
              Reset to today
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <ExportMenu
              data={visibleCases}
              columns={exportColumns}
              filename="daily-reconciliation"
              title={`Daily Reconciliation${salesTypeFilter ? ` — ${salesTypeFilter === 'CASH' ? 'Cash' : 'Credit'} Sales` : ''}`}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '3px solid var(--red)', color: 'var(--red)' }}>
          {error.response?.data?.error || 'Could not load the reconciliation.'}
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 16 }}>
        <div
          className="stat-card"
          onClick={() => toggleFilter('CASH')}
          title={salesTypeFilter === 'CASH' ? 'Click to show all cases' : 'Click to show only cash cases'}
          style={{
            cursor: 'pointer',
            outline: salesTypeFilter === 'CASH' ? '2px solid var(--green)' : 'none',
            outlineOffset: -2,
          }}
        >
          <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdPointOfSale size={18} /></div>
          <div className="stat-label">Cash Sales</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{fmtBr(cash.billedTotal)}</div>
          <div className="stat-sub">
            {cash.count} case{cash.count === 1 ? '' : 's'} · {fmtBr(cash.collectedTotal)} collected
            {cash.outstandingTotal > 0 && <> · <span style={{ color: 'var(--red)' }}>{fmtBr(cash.outstandingTotal)} outstanding</span></>}
          </div>
        </div>
        <div
          className="stat-card"
          onClick={() => toggleFilter('CREDIT')}
          title={salesTypeFilter === 'CREDIT' ? 'Click to show all cases' : 'Click to show only credit cases'}
          style={{
            cursor: 'pointer',
            outline: salesTypeFilter === 'CREDIT' ? '2px solid var(--blue, var(--brand))' : 'none',
            outlineOffset: -2,
          }}
        >
          <div className="stat-icon" style={{ background: 'var(--brand-tint)' }}><MdHandshake size={18} /></div>
          <div className="stat-label">Credit Sales · Trusted Partners</div>
          <div className="stat-value" style={{ color: 'var(--blue, var(--brand))' }}>{fmtBr(credit.billedTotal)}</div>
          <div className="stat-sub">
            {credit.count} case{credit.count === 1 ? '' : 's'} · {fmtBr(credit.collectedTotal)} collected
            {credit.outstandingTotal > 0 && <> · <span style={{ color: 'var(--red)' }}>{fmtBr(credit.outstandingTotal)} outstanding</span></>}
          </div>
        </div>
      </div>

      {salesTypeFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12.5, color: 'var(--text-3)' }}>
          Showing only <strong style={{ color: 'var(--text-1)' }}>{salesTypeFilter === 'CASH' ? 'Cash' : 'Credit'}</strong> cases
          <button className="btn btn-ghost btn-sm" onClick={() => setSalesTypeFilter('')} style={{ padding: '2px 8px' }}>✕ Clear filter</button>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case</th><th>Patient</th><th>Clinic</th><th>Type</th><th>Work Type</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Payment</th>
                {!isSingleDay && <th>Delivered</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={isSingleDay ? 7 : 8} className="empty-state">Loading…</td></tr>
              ) : visibleCases.length === 0 ? (
                <tr><td colSpan={isSingleDay ? 7 : 8} className="empty-state">
                  No {salesTypeFilter ? (salesTypeFilter === 'CASH' ? 'cash' : 'credit') + ' ' : ''}cases delivered {isSingleDay ? 'on this date' : 'in this range'}
                  {clinicId || caseNumber ? ' matching this filter' : ''}.
                </td></tr>
              ) : visibleCases.map(c => (
                <tr key={c.id}>
                  <td><span className="case-number">{c.caseNumber || '—'}</span></td>
                  <td><span className="patient-name">{c.patientName || '—'}</span></td>
                  <td style={{ fontSize: 13 }}>{c.clinicName || '—'}</td>
                  <td>
                    <span className="badge" style={c.salesType === 'CASH'
                      ? { background: 'var(--green-dim)', color: 'var(--green)' }
                      : { background: 'var(--brand-tint)', color: 'var(--blue, var(--brand))' }}>
                      {c.salesType === 'CASH' ? 'Cash' : 'Credit'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>{c.workType || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtBr(c.billedAmount)}</td>
                  <td><PaymentBadge status={c.paymentStatus} isExcluded={c.salesType === 'CREDIT'} isRemake={c.remake} /></td>
                  {!isSingleDay && (
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM, h:mm a') : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
