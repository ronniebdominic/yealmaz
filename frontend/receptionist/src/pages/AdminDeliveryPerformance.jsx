// Ye-Almaz — Delivery Performance (per-agent pickup + delivery activity)
// Mirrors AdminLabPerformance.jsx's shape/pattern — attributed via
// CaseStage name-matching (see backend/src/utils/deliveryAttribution.js),
// same as lab-performance, not DeliveryLog (barely populated in practice).
import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import { useQuery } from '@tanstack/react-query';
import { MdLocalShipping, MdTwoWheeler, MdInventory2, MdSchedule } from 'react-icons/md';
import { todayLocal, toLocalDateString } from '../utils/date';

const DELIVERY_AMBER = '#D97706';
const DELIVERY_AMBER_DIM = 'rgba(217,119,6,0.1)';

const Stat = ({ label, value, info }) => (
  <div style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 1.25, minHeight: '2.5em', marginBottom: 3 }}>
      <span>{label}</span>
      {info && (
        <span className="info-icon-wrap" tabIndex={0} style={{ flexShrink: 0, marginTop: 1 }}>
          <MdSchedule size={11} style={{ opacity: 0.55 }} />
          <span className="info-tooltip">{info}</span>
        </span>
      )}
    </div>
    <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 'auto' }}>{value}</div>
  </div>
);

// Same bucketed sparkline as AdminLabPerformance.jsx's ActivitySparkline.
function ActivitySparkline({ dailyCounts, from, to }) {
  const start = new Date(from);
  const end = new Date(to);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const bucketCount = Math.min(totalDays, 24);
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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34 }}>
      {buckets.map((b, i) => (
        <div
          key={i}
          title={`${fmt(b.from)}${b.to > b.from ? ` – ${fmt(b.to)}` : ''}: ${b.count} order${b.count !== 1 ? 's' : ''}`}
          style={{
            flex: 1, minWidth: 3, borderRadius: '2px 2px 0 0',
            height: `${Math.max((b.count / max) * 100, b.count > 0 ? 10 : 3)}%`,
            background: i === buckets.length - 1 ? DELIVERY_AMBER : `${DELIVERY_AMBER}55`,
          }}
        />
      ))}
    </div>
  );
}

function AgentCard({ agent, from, to }) {
  return (
    <div className="glass-card" style={{ padding: '16px 18px', opacity: agent.isActive ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: DELIVERY_AMBER, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {agent.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {agent.name}{!agent.isActive && <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-3)' }}> · Inactive</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.station || 'No station set'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
        <Stat label="Picked Up" value={agent.totalPickups.toLocaleString('en-US')} info="Impressions collected from clinics + finished cases collected from the lab, in the selected range." />
        <Stat label="Delivered" value={agent.totalDeliveries.toLocaleString('en-US')} info="Every case they marked Delivered in the selected range." />
        <Stat label="Clinics" value={agent.uniqueClinics.toLocaleString('en-US')} info="Distinct clinics they handled a pickup or delivery for." />
        <Stat label="Active Days" value={agent.activeDays} info="Calendar days with at least one pickup or delivery in the selected range." />
        <Stat label="Total Orders" value={agent.totalOrders.toLocaleString('en-US')} info="Pickups + deliveries combined — their overall order volume in the selected range." />
        <Stat label="Lab Share" value={agent.shareOfTotalPercent != null ? `${agent.shareOfTotalPercent}%` : '—'} info="Their combined pickups + deliveries as a share of every order the whole lab handled in the selected range." />
      </div>

      {agent.totalOrders > 0 && <ActivitySparkline dailyCounts={agent.dailyCounts} from={from} to={to} />}

      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        {agent.lastActiveAt
          ? `Last active ${new Date(agent.lastActiveAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
          : 'No activity in this range'}
      </div>
    </div>
  );
}

export default function AdminDeliveryPerformance() {
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate] = useState(todayLocal());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'delivery-performance', fromDate, toDate],
    queryFn: () => api.get('/dashboard/delivery-performance', { params: { from: fromDate, to: toDate } }).then(r => r.data),
    staleTime: 60_000,
  });

  const agents = data?.agents ?? [];
  const inputStyle = { padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)' };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdLocalShipping className="mi" size={18} /> Delivery Performance</div>
      </div>
      <div className="content">
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, maxWidth: 640 }}>
          Individual pickup and delivery activity for every Delivery account — both legs of the job are logged
          here: picking up (an impression from a clinic, or a finished case from the lab) and delivering
          (dropping a finished case off at a clinic).
        </p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>FROM</div>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>TO</div>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>
        ) : isError ? (
          <div style={{ textAlign: 'center', color: 'var(--red)', padding: 60 }}>Could not load delivery performance.</div>
        ) : agents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon mi"><MdTwoWheeler size={32} /></div>
            <div className="empty-title">No delivery accounts yet</div>
            <p>Add one from Admin → Users to see their activity here.</p>
          </div>
        ) : (
          <>
            {data.totalLabOrders > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
                <strong style={{ color: 'var(--text-1)' }}>{data.totalLabOrders.toLocaleString('en-US')}</strong> total lab orders (pickups + deliveries) in this range — each agent's "Lab Share" below is their portion of that.
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {agents.map(a => <AgentCard key={a.id} agent={a} from={fromDate} to={toDate} />)}
            </div>
            {data.unattributedOrders > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
                <MdInventory2 size={13} />
                {data.unattributedOrders.toLocaleString('en-US')} order{data.unattributedOrders !== 1 ? 's' : ''} in this period couldn't be matched to a current delivery account (removed employee).
              </p>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
