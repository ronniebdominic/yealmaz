import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import SearchableSelect from '../components/SearchableSelect';
import api from '../api';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

const ETB = (v) => 'Br ' + Number(v || 0).toLocaleString('en-US');

const WORK_TYPE_COLORS = [
  '#1A56A0', '#00C4B4', '#F0A500', '#16A34A', '#E53E3E',
  '#7C3AED', '#D97706', '#0EA5E9', '#EC4899', '#6B7280',
];

function KpiCard({ icon, label, value, sub, color = 'var(--blue)', bg = '#EEF2FF' }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg }}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label, prefix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
      padding: '8px 14px', fontSize: 13, boxShadow: 'var(--shadow)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--blue)' }}>
          {p.name}: {prefix}{Number(p.value).toLocaleString('en-US')}
        </div>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const [selectedClinic, setSelectedClinic] = useState('');
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['dashboard', 'analytics', fromDate, toDate, selectedClinic],
    queryFn: () => {
      const params = { from: fromDate, to: toDate };
      if (selectedClinic) params.clinicId = selectedClinic;
      return api.get('/dashboard/admin-analytics', { params }).then(r => r.data);
    },
    staleTime: 5 * 60_000,
  });

  const error = queryError ? (queryError.response?.data?.error || 'Failed to load analytics.') : '';
  const { kpi, monthlyTrend, revenueByClinic, revenueByWorkType, clinicList } = data || {};

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Summary KPIs
    const summaryRows = [
      ['Metric', 'Value'],
      ['Period', `${fromDate} to ${toDate}`],
      ['Clinic Filter', selectedClinic ? (clinicList?.find(c => c.id === selectedClinic)?.name || selectedClinic) : 'All Clinics'],
      [],
      ['Total Revenue (Br)', kpi?.totalRevenue ?? 0],
      ['Total Cases', kpi?.totalCases ?? 0],
      ['Total Units', kpi?.totalUnits ?? 0],
      ['Active Cases', kpi?.activeCases ?? 0],
      ['Delivered Cases', kpi?.deliveredCases ?? 0],
      ['Pending Payments', kpi?.pendingPayments ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

    // Sheet 2 — Monthly Trend
    const trendRows = [['Month', 'Cases', 'Revenue (Br)'],
      ...(monthlyTrend || []).map(r => [r.month, r.cases, r.revenue])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trendRows), 'Monthly Trend');

    // Sheet 3 — By Work Type
    const totalRev = (revenueByWorkType || []).reduce((s, r) => s + r.revenue, 0);
    const workRows = [['#', 'Work Type', 'Cases', 'Total Units', 'Revenue (Br)', 'Share (%)'],
      ...(revenueByWorkType || []).map((r, i) => [
        i + 1, r.workType, r.count, r.units || 0, r.revenue,
        totalRev > 0 ? ((r.revenue / totalRev) * 100).toFixed(1) : '0.0',
      ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(workRows), 'By Work Type');

    // Sheet 4 — By Clinic
    const clinicRows = [['Clinic', 'Total Cases', 'Total Units', 'Paid Cases', 'Revenue (Br)'],
      ...(revenueByClinic || []).map(c => [
        c.name, c.totalCases, c.totalUnits || 0, c.paidCases, c.revenue,
      ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clinicRows), 'By Clinic');

    XLSX.writeFile(wb, `YeAlmaz_Analytics_${fromDate}_to_${toDate}.xlsx`);
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Analytics Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={exportToExcel}
            disabled={loading || !data}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: loading || !data ? 'var(--border)' : '#16a34a',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              cursor: loading || !data ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            <span>⬇</span> Export Excel
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
            <div className="live-dot" /> Live
          </div>
        </div>
      </div>

      <div className="content">
        {/* ── Filters ── */}
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Filters</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Clinic</label>
              <SearchableSelect
                value={selectedClinic}
                onChange={v => setSelectedClinic(v)}
                options={(clinicList || []).map(c => ({ value: c.id, label: c.name }))}
                placeholder="All Clinics"
                style={{ minWidth: 160 }}
              />
            </div>

            {/* Quick range buttons */}
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {[
                { label: 'This Month', f: () => { const n=new Date(); setFromDate(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setToDate(n.toISOString().slice(0,10)); } },
                { label: 'This Year',  f: () => { setFromDate(`${thisYear}-01-01`); setToDate(new Date().toISOString().slice(0,10)); } },
                { label: 'All Time',   f: () => { setFromDate('2020-01-01'); setToDate(new Date().toISOString().slice(0,10)); } },
              ].map(({ label, f }) => (
                <button key={label} className="btn btn-ghost btn-sm" onClick={f}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#3d1a1a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, border: '1px solid rgba(229,62,62,.3)', color: '#ef9a9a', fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-3)', fontSize: 14 }}>
            Loading analytics…
          </div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
              <KpiCard icon="💰" label="Total Revenue" value={ETB(kpi?.totalRevenue)} bg="var(--green-dim)" color="var(--green)" sub="Verified payments" />
              <KpiCard icon="📋" label="Total Cases" value={kpi?.totalCases ?? '—'} bg="#EEF2FF" color="var(--blue)" sub="In selected range" />
              <KpiCard icon="🦷" label="Total Units" value={kpi?.totalUnits ?? '—'} bg="var(--accent-dim)" color="var(--accent)" sub="In selected range" />
              <KpiCard icon="⚙️" label="Active Cases" value={kpi?.activeCases ?? '—'} bg="var(--amber-dim)" color="var(--amber)" sub="In production" />
              <KpiCard icon="✅" label="Delivered" value={kpi?.deliveredCases ?? '—'} bg="var(--green-dim)" color="var(--green)" sub="Completed" />
              <KpiCard icon="💳" label="Pending Payments" value={kpi?.pendingPayments ?? '—'} bg="var(--accent-dim)" color="var(--navy)" sub="Awaiting review" />
            </div>

            {/* ── Revenue Trend ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Monthly Revenue Trend{monthlyTrend?.length ? ` (${monthlyTrend.length} month${monthlyTrend.length > 1 ? 's' : ''})` : ''}</div>
              </div>
              <div style={{ padding: '20px 20px 12px' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyTrend} margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => 'Br ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                    <Tooltip content={<CustomTooltip prefix="Br " />} />
                    <Bar dataKey="revenue" name="Revenue" fill="var(--blue)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Cases Processed per Month ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Cases Processed per Month</div>
              </div>
              <div style={{ padding: '20px 20px 12px' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyTrend} margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="cases" name="Cases" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Revenue by Work Type + Pie ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Bar chart */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Revenue by Product Category</div>
                </div>
                <div style={{ padding: '20px 20px 12px' }}>
                  {revenueByWorkType?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart layout="vertical" data={revenueByWorkType}
                        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                          tickFormatter={v => 'Br ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                        <YAxis type="category" dataKey="workType" width={110}
                          tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                        <Tooltip content={<CustomTooltip prefix="Br " />} />
                        <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                          {revenueByWorkType?.map((_, i) => (
                            <Cell key={i} fill={WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Pie chart */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Cases by Product Category</div>
                </div>
                <div style={{ padding: '12px 20px 20px' }}>
                  {revenueByWorkType?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={revenueByWorkType}
                          dataKey="count"
                          nameKey="workType"
                          cx="50%" cy="50%"
                          outerRadius={90}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {revenueByWorkType?.map((_, i) => (
                            <Cell key={i} fill={WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v + ' cases', n]} />
                        <Legend iconType="circle" iconSize={8}
                          formatter={(v) => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* ── Product Category Table ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Product Category Breakdown</div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Work Type / Category</th>
                      <th>Cases Submitted</th>
                      <th>Total Units</th>
                      <th>Revenue (Verified)</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByWorkType?.length === 0 ? (
                      <tr><td colSpan={6} className="empty-state">No data for selected period</td></tr>
                    ) : revenueByWorkType?.map((row, i) => {
                      const totalRev = revenueByWorkType.reduce((s, r) => s + r.revenue, 0);
                      const share = totalRev > 0 ? ((row.revenue / totalRev) * 100).toFixed(1) : 0;
                      return (
                        <tr key={row.workType}>
                          <td style={{ color: 'var(--text-3)', width: 40 }}>{i + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                background: WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length],
                              }} />
                              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{row.workType}</span>
                            </div>
                          </td>
                          <td>
                            <span style={{
                              background: '#EEF2FF', color: 'var(--blue)',
                              padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                            }}>{row.count}</span>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--accent)' }}>
                            {row.units > 0 ? row.units : '—'}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--green)' }}>{ETB(row.revenue)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                <div style={{
                                  width: `${share}%`, height: '100%', borderRadius: 3,
                                  background: WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length],
                                }} />
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 36 }}>{share}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Clinic Performance (hidden when a specific clinic is selected) ── */}
            {!selectedClinic && (() => {
              const maxRevenue = Math.max(...(revenueByClinic || []).map(c => c.revenue || 0), 1);
              return (
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Clinic Performance</div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Clinic</th>
                          <th>Total Cases</th>
                          <th>Total Units</th>
                          <th>Paid Cases</th>
                          <th>Revenue (Verified)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revenueByClinic?.length === 0 ? (
                          <tr><td colSpan={5} className="empty-state">No clinics found</td></tr>
                        ) : revenueByClinic?.map(c => {
                          const pct = Math.round(((c.revenue || 0) / maxRevenue) * 100);
                          return (
                            <tr key={c.id} >
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: 8, background: 'var(--blue)',
                                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                                  }}>
                                    {c.name[0]?.toUpperCase()}
                                  </div>
                                  <span className="patient-name">{c.name}</span>
                                </div>
                              </td>
                              <td>{c.totalCases}</td>
                              <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{c.totalUnits || '—'}</td>
                              <td>{c.paidCases}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border)', minWidth: 60 }}>
                                    <div style={{
                                      width: `${pct}%`, height: '100%', borderRadius: 999,
                                      background: 'var(--blue)', transition: 'width 0.4s ease',
                                    }} />
                                  </div>
                                  <span style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>
                                    {ETB(c.revenue)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

const inputStyle = {
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 13,
  color: 'var(--text-1)',
  background: 'var(--surface)',
  outline: 'none',
  fontFamily: 'DM Sans, sans-serif',
};
