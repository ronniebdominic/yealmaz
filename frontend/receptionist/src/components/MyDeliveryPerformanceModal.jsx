import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api';
import { format } from 'date-fns';
import { MdInsights, MdClose, MdLocalHospital, MdInbox, MdCalendarToday } from 'react-icons/md';
import { todayLocal, toLocalDateString, startOfWeekLocal, startOfMonthLocal } from '../utils/date';

function EventTypeBadge({ type, pickupKind }) {
  const isPickup = type === 'PICKUP';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
      background: isPickup ? '#DBEAFE' : '#D1FAE5', color: isPickup ? '#1E40AF' : '#065F46',
    }}>
      {isPickup ? (pickupKind === 'IMPRESSION' ? 'Picked Up · Impression' : 'Picked Up · From Lab') : 'Delivered'}
    </span>
  );
}

// A delivery agent's own activity — summary stats (incl. their share of the
// whole lab's deliveries in the same range) plus a real, paginated delivery
// history. Structural mirror of LabDashboard.jsx's Performance tab (same
// range presets / sparkline / layout), backed by GET /delivery/my-performance.
// Presets are calendar periods (today / this Mon-Sun week / this month to
// date), not a rolling N-day window — matches the Today/This Month quick
// filters already used elsewhere (e.g. Analytics Dashboard).
const RANGE_PRESETS = [
  { id: 'daily',   label: 'Daily',   from: () => todayLocal() },
  { id: 'weekly',  label: 'Weekly',  from: () => startOfWeekLocal() },
  { id: 'monthly', label: 'Monthly', from: () => startOfMonthLocal() },
];

function MiniSparkline({ dailyCounts, from, to }) {
  const start = new Date(from);
  const end = new Date(to);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const bucketCount = Math.min(totalDays, 18);
  const bucketSize = Math.ceil(totalDays / bucketCount);

  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    const bStart = new Date(start); bStart.setDate(bStart.getDate() + i * bucketSize);
    const bEnd = new Date(start); bEnd.setDate(bEnd.getDate() + Math.min((i + 1) * bucketSize, totalDays) - 1);
    if (bStart > end) break;
    let sum = 0;
    for (let d = new Date(bStart); d <= bEnd && d <= end; d.setDate(d.getDate() + 1)) {
      sum += dailyCounts[toLocalDateString(d)] || 0;
    }
    buckets.push({ from: bStart, to: bEnd, count: sum });
  }
  const max = Math.max(1, ...buckets.map(b => b.count));
  const fmt = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
      {buckets.map((b, i) => (
        <div key={i}
          title={`${fmt(b.from)}${b.to > b.from ? ` – ${fmt(b.to)}` : ''}: ${b.count} order${b.count !== 1 ? 's' : ''}`}
          style={{
            flex: 1, minWidth: 4, borderRadius: '3px 3px 0 0',
            height: `${Math.max((b.count / max) * 100, b.count > 0 ? 12 : 4)}%`,
            background: i === buckets.length - 1 ? '#D97706' : '#D9770666',
          }}
        />
      ))}
    </div>
  );
}

export default function MyDeliveryPerformanceModal({ onClose }) {
  const [rangeId, setRangeId] = useState('weekly');
  const [page, setPage] = useState(1);
  const toDate = todayLocal();
  const fromDate = RANGE_PRESETS.find(p => p.id === rangeId).from();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['delivery', 'my-performance', fromDate, toDate, page],
    queryFn: () => api.get('/delivery/my-performance', { params: { from: fromDate, to: toDate, page, limit: 15 } }).then(r => r.data),
    staleTime: 30_000,
  });

  const summary = data?.summary;
  const events = data?.events ?? [];
  const pagination = data?.pagination ?? {};

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 250, display: 'flex', flexDirection: 'column', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ background: 'var(--navy)', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontWeight: 700, fontSize: 15 }}>
          <MdInsights size={19} /> My Performance
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <MdClose size={17} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Range presets */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {RANGE_PRESETS.map(p => (
            <button key={p.id} onClick={() => { setRangeId(p.id); setPage(1); }}
              style={{
                flex: 1, padding: '8px 6px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                border: `2px solid ${rangeId === p.id ? '#D97706' : 'var(--border)'}`,
                background: rangeId === p.id ? 'rgba(217,119,6,0.08)' : 'var(--surface)',
                color: rangeId === p.id ? '#D97706' : 'var(--text-2)',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>Loading…</div>
        ) : isError ? (
          <div style={{ textAlign: 'center', color: 'var(--red)', padding: 40 }}>Could not load your performance.</div>
        ) : (
          <>
            {/* Summary */}
            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: summary?.totalOrders ? 14 : 0 }}>
                {[
                  ['Picked Up', summary?.totalPickups ?? 0],
                  ['Delivered', summary?.totalDeliveries ?? 0],
                  ['Clinics', summary?.uniqueClinics ?? 0],
                  ['Active Days', summary?.activeDays ?? 0],
                  ['Avg / Day', summary?.avgPerActiveDay ?? 0],
                  ['Total Orders', summary?.totalOrders ?? 0],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.25, minHeight: '2.4em' }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 'auto' }}>{value}</div>
                  </div>
                ))}
              </div>
              {summary?.totalOrders > 0 && <MiniSparkline dailyCounts={summary.dailyCounts} from={fromDate} to={toDate} />}
            </div>

            {/* Lab Share — highlighted, matching the app's Collection Rate bar convention */}
            {summary?.shareOfTotalPercent != null && (
              <div style={{ background: '#D97706', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Your Share of the Lab</div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, summary.shareOfTotalPercent)}%`, background: '#fff', borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {summary.shareOfTotalPercent}% — {summary.totalOrders} of {summary.totalLabOrders} lab orders (pickups + deliveries) in this range
                </div>
              </div>
            )}

            {/* Activity history */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MdCalendarToday size={12} /> Activity History
            </div>
            {events.length === 0 ? (
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '28px 16px', textAlign: 'center' }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><MdInbox size={28} /></div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>No activity in this range</div>
              </div>
            ) : (
              events.map(ev => (
                <div key={ev.id} style={{
                  background: 'var(--surface)', borderRadius: 10, padding: '11px 14px', marginBottom: 8,
                  border: '1px solid var(--border)', borderLeft: `3px solid ${ev.type === 'PICKUP' ? '#1A56A0' : '#D97706'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>{ev.caseNumber || '—'}</div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-1)' }}>{ev.patientName}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MdLocalHospital size={12} /> {ev.clinicName}{ev.workType ? ` · ${ev.workType}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                      <EventTypeBadge type={ev.type} pickupKind={ev.pickupKind} />
                      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>
                        {ev.occurredAt ? format(new Date(ev.occurredAt), 'dd MMM, h:mm a') : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {pagination.totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Page {page} / {pagination.totalPages}</span>
                <button className="btn btn-ghost btn-sm" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
