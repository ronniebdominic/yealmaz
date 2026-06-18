import { useState } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api, { downloadExport } from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);
const fetchReady   = (params = {}) =>
  api.get('/cases', { params: { status: 'READY_TO_DISPATCH', limit: 200, ...params } }).then(r => r.data.cases ?? []);

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const exportReady = async () => {
    setExporting(true);
    try {
      await downloadExport('/cases/export', {
        status: 'READY_TO_DISPATCH',
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }, `ready_for_delivery_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: readyCases = [] } = useQuery({
    queryKey: ['cases', 'ready-to-dispatch', dateFrom, dateTo],
    queryFn: () => fetchReady({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    staleTime: 30_000,
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

  const filteredReady = search
    ? readyCases.filter(c =>
        c.caseNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.clinic?.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.patientName?.toLowerCase().includes(search.toLowerCase())
      )
    : readyCases;

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
            <div className="stat-sub">Currently being redone</div>
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
          <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('ready-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>🚚</div>
            <div className="stat-label">Ready to Dispatch</div>
            <div className="stat-value" style={{ color: stats?.readyToDispatch > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
              {stats?.readyToDispatch ?? '—'}
            </div>
            <div className="stat-sub" style={{ color: 'var(--accent)', fontWeight: 600 }}>View below ↓</div>
          </div>
        </div>

        {/* ── Ready for Delivery ── */}
        <div id="ready-section" className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <div className="card-title">🚚 Ready for Delivery</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-input" style={{ width: 220 }}>
                <span className="icon">🔍</span>
                <input
                  placeholder="Search clinic, patient, case no…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Order date from"
                style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>→</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Order date to"
                style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              {(dateFrom || dateTo) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Clear</button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={exportReady} disabled={exporting}>
                {exporting ? 'Exporting…' : '⬇ Excel'}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                {filteredReady.length} case{filteredReady.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="table-wrap">
            {filteredReady.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎉</div>
                <div className="empty-title">No cases waiting for dispatch</div>
                <p>Cases marked Ready to Dispatch will appear here.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
                    <th>Units</th>
                    <th>Amount</th>
                    <th>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReady.map(c => (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{c.clinic?.name}</td>
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td>{c.workType}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                        {c.payment?.amount != null ? `Br ${c.payment.amount.toLocaleString()}` : c.totalAmount != null ? `Br ${c.totalAmount.toLocaleString()}` : '—'}
                      </td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
