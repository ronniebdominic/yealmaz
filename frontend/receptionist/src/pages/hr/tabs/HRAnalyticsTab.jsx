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

const PIE_COLORS = ['#1A56A0', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0EA5E9', '#DB2777'];

function StatCard({ icon: Icon, label, value, warn }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={warn ? { background: 'var(--red-dim)', color: 'var(--red)' } : undefined}><Icon size={16} /></div>
      <div className="stat-value" style={warn && value > 0 ? { color: 'var(--red)' } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function HRAnalyticsTab() {
  const { data, isLoading } = useQuery({ queryKey: ['hr', 'analytics'], queryFn: () => api.get('/hr-analytics').then(r => r.data) });

  if (isLoading || !data) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>;
  const { counts, charts, alerts } = data;
  const pendingTotal = Object.values(alerts.pendingApprovals).reduce((s, n) => s + n, 0);

  return (
    <div>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <StatCard icon={MdGroups} label="Total Employees" value={counts.totalEmployees} />
        <StatCard icon={MdCheckCircle} label="Active" value={counts.active} />
        <StatCard icon={MdEventBusy} label="On Leave Today" value={counts.onLeaveToday} />
        <StatCard icon={MdCancel} label="Absent Today" value={counts.absentToday} warn />
        <StatCard icon={MdSchedule} label="Late Today" value={counts.lateToday} warn />
        <StatCard icon={MdTimer} label="Overtime Today" value={counts.overtimeToday} />
        <StatCard icon={MdPendingActions} label="Pending Leave" value={counts.pendingLeave} warn />
        <StatCard icon={MdPaid} label="Pending Payroll" value={counts.pendingPayroll} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Attendance Trend (14 days)</div></div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={charts.attendanceTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="present" name="Present" stroke="var(--blue)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Department Headcount</div></div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={charts.departmentHeadcount} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name }) => name}>
                  {charts.departmentHeadcount.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
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
              <Bar dataKey="total" name="Net Payroll" fill="var(--green)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdWarning size={15} /> Missing Punches Today</div></div>
          <div style={{ padding: 12 }}>
            {alerts.missingPunches.length === 0 ? <div className="empty-state">None</div> :
              alerts.missingPunches.map(m => <div key={m.id} style={{ padding: '6px 8px', fontSize: 13 }}>{m.name}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdCardMembership size={15} /> Certifications Expiring/Expired</div></div>
          <div style={{ padding: 12 }}>
            {alerts.expiringCertifications.length === 0 ? <div className="empty-state">None</div> :
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
            {alerts.probationEnding.length === 0 ? <div className="empty-state">None</div> :
              alerts.probationEnding.map(p => <div key={p.id} style={{ padding: '6px 8px', fontSize: 13 }}>{p.user?.name} — {format(new Date(p.probationEndDate), 'dd MMM yyyy')}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdDescription size={15} /> Pending Approvals ({pendingTotal})</div></div>
          <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(alerts.pendingApprovals).map(([k, v]) => (
              <span key={k} className={`badge ${v > 0 ? '' : 'badge-verified'}`}>{k}: {v}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
