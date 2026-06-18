import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (isLoading) return (
    <Layout>
      <div className="topbar"><div className="topbar-title">Dashboard</div></div>
      <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
        Loading…
      </div>
    </Layout>
  );

  const { stats, recentCases } = summary || {};

  return (
    <Layout>
      <div className="topbar">
        <div className="topbar-title">Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-3)' }}>
          <div className="live-dot" />
          Live
        </div>
      </div>

      <div className="content">

        {/* ── Today's KPIs ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Today's Overview
        </div>
        <div className="stats-grid" style={{ marginBottom: 8 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#EEF2FF' }}>📋</div>
            <div className="stat-label">Orders Today</div>
            <div className="stat-value">{stats?.todayCases ?? '—'}</div>
            <div className="stat-sub">New cases registered</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#FFF1F2' }}>🔄</div>
            <div className="stat-label">Remake</div>
            <div className="stat-value" style={{ color: stats?.remakeCount > 0 ? 'var(--red)' : 'var(--text-1)' }}>
              {stats?.remakeCount ?? '—'}
            </div>
            <div className="stat-sub">Active remake cases</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#FFF7ED' }}>♻️</div>
            <div className="stat-label">Redo</div>
            <div className="stat-value" style={{ color: stats?.redoCases > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
              {stats?.redoCases ?? '—'}
            </div>
            <div className="stat-sub">Replacement cases</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
            <div className="stat-label">Delivered Today</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{stats?.deliveredToday ?? '—'}</div>
            <div className="stat-sub">Completed today</div>
          </div>
        </div>

        {/* ── Current workload (live operational counts — not all-time totals) ── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 10px' }}>
          Current Workload
        </div>
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#FFF7ED' }}>🛵</div>
            <div className="stat-label">Awaiting Pickup</div>
            <div className="stat-value" style={{ color: '#EA580C' }}>{stats?.pendingPickups ?? '—'}</div>
            <div className="stat-sub">Impression collection</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>⏳</div>
            <div className="stat-label">In Production</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats?.pendingCases ?? '—'}</div>
            <div className="stat-sub">Active in lab</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>🚚</div>
            <div className="stat-label">Ready to Dispatch</div>
            <div className="stat-value" style={{ color: stats?.readyToDispatch > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
              {stats?.readyToDispatch ?? '—'}
            </div>
            <div className="stat-sub">Handled by Dispatch</div>
          </div>
        </div>

        {/* ── Recent Cases ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Cases</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/cases')}>View all →</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case #</th>
                  <th>Clinic</th>
                  <th>Patient</th>
                  <th>Work Type</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentCases?.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">No cases yet</td></tr>
                ) : recentCases?.map(c => (
                  <tr key={c.id}>
                    <td><span className="case-number">{c.caseNumber}</span></td>
                    <td>{c.clinic?.name}</td>
                    <td><span className="patient-name">{c.patientName}</span></td>
                    <td>{c.workType}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><PaymentBadge status={c.paymentStatus} /></td>
                    <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>
                      {format(new Date(c.createdAt), 'dd MMM yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  );
}
