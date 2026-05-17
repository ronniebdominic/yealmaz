import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadSummary();
    const interval = setInterval(loadSummary, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadSummary = async () => {
    try {
      const res = await api.get('/dashboard/summary');
      setSummary(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <Layout>
      <div className="topbar"><div className="topbar-title">Dashboard</div></div>
      <div className="content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
        Loading…
      </div>
    </Layout>
  );

  const { stats, recentCases } = summary || {};

  return (
    <Layout pendingPayments={stats?.pendingPayments}>
      <div className="topbar">
        <div className="topbar-title">Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-3)' }}>
          <div className="live-dot" />
          Live
        </div>
      </div>

      <div className="content">
        {notification && (
          <div className="notification-banner">
            🔔 {notification}
            <button onClick={() => setNotification(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>
          </div>
        )}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#EEF2FF' }}>📋</div>
            <div className="stat-label">Total Cases</div>
            <div className="stat-value">{stats?.totalCases ?? '—'}</div>
            <div className="stat-sub">All time</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>⏳</div>
            <div className="stat-label">In Production</div>
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats?.pendingCases ?? '—'}</div>
            <div className="stat-sub">Active in lab</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>💳</div>
            <div className="stat-label">Pending Payments</div>
            <div className="stat-value" style={{ color: stats?.pendingPayments > 0 ? 'var(--blue)' : 'var(--text-1)' }}>
              {stats?.pendingPayments ?? '—'}
            </div>
            <div className="stat-sub">
              {stats?.pendingPayments > 0
                ? <span style={{ color: 'var(--blue)', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/payments')}>Review now →</span>
                : 'All clear'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
            <div className="stat-label">Delivered</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>{stats?.completedCases ?? '—'}</div>
            <div className="stat-sub">Completed cases</div>
          </div>
        </div>

        {/* Recent Cases */}
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
                  <th>Patient</th>
                  <th>Clinic</th>
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
                  <tr key={c.id} style={{ cursor: 'pointer' }}>
                    <td><span className="case-number">{c.caseNumber}</span></td>
                    <td><span className="patient-name">{c.patientName}</span></td>
                    <td>{c.clinic?.name}</td>
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
