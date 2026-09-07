// Ye-Almaz — HR Analytics Dashboard (Phase 4). Backed by the single
// GET /api/hr-analytics aggregation endpoint — headcount snapshot, trends,
// and an alerts feed, all computed from data that already exists.
import { useQuery } from '@tanstack/react-query';
import api from '../../../api';
import { format } from 'date-fns';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  MdGroups, MdCheckCircle, MdEventBusy, MdCancel, MdSchedule, MdTimer,
  MdPendingActions, MdPaid, MdWarning, MdCardMembership, MdHourglassEmpty, MdDescription,
} from 'react-icons/md';
import CountUp from '../../../components/CountUp';
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion';

// Literal hex, not tokens — chart libs can't resolve var(). Mirrors index.css.
const PIE_COLORS = ['#4C82F7', '#34D399', '#F5B23F', '#F26D6D', '#A78BFA', '#5BA8D8', '#EC7FA0', '#2DD4BF'];

const TONES = {
  green:  { bg: 'var(--green-dim)',  fg: 'var(--green)' },
  blue:   { bg: 'var(--brand-tint)', fg: 'var(--brand)' },
  amber:  { bg: 'var(--amber-dim)',  fg: 'var(--amber)' },
  red:    { bg: 'var(--red-dim)',    fg: 'var(--red)' },
  neutral:{ bg: 'var(--surface-2)',  fg: 'var(--text-3)' },
};

function StatCard({ icon: Icon, label, value, tone = 'neutral', emphasise }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: t.bg, color: t.fg }}><Icon size={16} /></div>
      <div className="stat-value" style={emphasise && value > 0 ? { color: t.fg } : undefined}>
        <CountUp value={value} />
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function HRAnalyticsTab() {
  const reducedMotion = usePrefersReducedMotion();
  const chartAnim = { isAnimationActive: !reducedMotion, animationDuration: 550, animationEasing: 'ease-out' };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['hr', 'analytics'], queryFn: () => api.get('/hr-analytics').then(r => r.data) });

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-title">Couldn't load the dashboard</div>
        <p>{error.response?.data?.error || 'Something went wrong.'}</p>
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()} style={{ marginTop: 10 }}>Retry</button>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div>
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton-card" style={{ height: 104 }} />)}
        </div>
        <div className="skeleton-card" style={{ height: 260 }} />
      </div>
    );
  }
  const { counts, charts, alerts } = data;
  const pendingTotal = Object.values(alerts.pendingApprovals).reduce((s, n) => s + n, 0);

  return (
    <div>
      {/* Workforce overview → today's attendance → things needing attention */}
      <div className="stats-grid stagger-in" style={{ marginBottom: 20 }}>
        <StatCard icon={MdGroups} label="Total Employees" value={counts.totalEmployees} tone="blue" />
        <StatCard icon={MdCheckCircle} label="Active" value={counts.active} tone="green" />
        <StatCard icon={MdEventBusy} label="On Leave Today" value={counts.onLeaveToday} tone="amber" />
        <StatCard icon={MdCancel} label="Absent Today" value={counts.absentToday} tone="red" emphasise />
        <StatCard icon={MdSchedule} label="Late Today" value={counts.lateToday} tone="amber" emphasise />
        <StatCard icon={MdTimer} label="Overtime Today" value={counts.overtimeToday} tone="blue" />
        <StatCard icon={MdPendingActions} label="Pending Leave" value={counts.pendingLeave} tone="amber" emphasise />
        <StatCard icon={MdPaid} label="Pending Payroll" value={counts.pendingPayroll} tone="blue" emphasise />
      </div>

      <div className="grid-wide-narrow" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Attendance Trend (14 days)</div></div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts.attendanceTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="present" name="Present" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3 }} {...chartAnim} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Department Headcount</div></div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                {/* Labels only on slices >= 6% — the rest read from the legend,
                    so department names don't pile up over the chart. */}
                <Pie data={charts.departmentHeadcount} dataKey="count" nameKey="name" cx="50%" cy="50%"
                  innerRadius={44} outerRadius={78} paddingAngle={1.5} stroke="var(--surface)" strokeWidth={1} {...chartAnim}
                  label={({ name, percent }) => (percent >= 0.06 ? name : '')} labelLine={false}>
                  {charts.departmentHeadcount.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v}`, n]} />
                <Legend iconType="circle" iconSize={8} layout="horizontal" verticalAlign="bottom"
                  wrapperStyle={{ maxHeight: 64, overflowY: 'auto', paddingTop: 6, lineHeight: '18px' }}
                  formatter={(v) => <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><div className="card-title">Payroll Trend (last 6 runs)</div></div>
        <div style={{ padding: '16px 16px 8px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.payrollTrend} margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip formatter={v => `Br ${v.toLocaleString('en-US')}`} />
              <Bar dataKey="total" name="Net Payroll" fill="var(--green)" radius={[4, 4, 0, 0]} {...chartAnim} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdWarning size={15} /> Missing Punches Today</div></div>
          <div style={{ padding: 12 }}>
            {alerts.missingPunches.length === 0 ? <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle size={14} style={{ color: 'var(--green)' }} /> Nothing outstanding</div> :
              alerts.missingPunches.map(m => <div key={m.id} style={{ padding: '6px 8px', fontSize: 13 }}>{m.name}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdCardMembership size={15} /> Certifications Expiring/Expired</div></div>
          <div style={{ padding: 12 }}>
            {alerts.expiringCertifications.length === 0 ? <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle size={14} style={{ color: 'var(--green)' }} /> Nothing outstanding</div> :
              alerts.expiringCertifications.map(c => (
                <div key={c.id} style={{ padding: '6px 8px', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{c.user?.name} — {c.name}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 12 }}>{c.expiryDate ? format(new Date(c.expiryDate), 'dd MMM yyyy') : '—'}</span>
                </div>
              ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdHourglassEmpty size={15} /> Probation Ending Soon</div></div>
          <div style={{ padding: 12 }}>
            {alerts.probationEnding.length === 0 ? <div style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle size={14} style={{ color: 'var(--green)' }} /> Nothing outstanding</div> :
              alerts.probationEnding.map(p => <div key={p.id} style={{ padding: '6px 8px', fontSize: 13 }}>{p.user?.name} — {format(new Date(p.probationEndDate), 'dd MMM yyyy')}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdDescription size={15} /> Pending Approvals ({pendingTotal})</div></div>
          <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(alerts.pendingApprovals).map(([k, v]) => (
              <span key={k} className={`badge ${v > 0 ? 'badge-pay-pending' : 'badge-pay-verified'}`}>{k}: {v}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
