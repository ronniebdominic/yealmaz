import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../components/AdminLayout';
import api from '../api';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

const INR = (v) => '₹' + Number(v || 0).toLocaleString('en-IN');

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
          {p.name}: {prefix}{Number(p.value).toLocaleString('en-IN')}
        </div>
      ))}
    </div>
  );
};

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedClinic, setSelectedClinic] = useState('');
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { from: fromDate, to: toDate };
      if (selectedClinic) params.clinicId = selectedClinic;
      const res = await api.get('/dashboard/admin-analytics', { params });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, selectedClinic]);

  useEffect(() => { load(); }, [load]);

  const { kpi, monthlyTrend, revenueByClinic, revenueByWorkType, clinicList } = data || {};

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Analytics Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
          <div className="live-dot" /> Live
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
              <select value={selectedClinic} onChange={e => setSelectedClinic(e.target.value)}
                style={{ ...inputStyle, minWidth: 160 }}>
                <option value="">All Clinics</option>
                {clinicList?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
              <KpiCard icon="💰" label="Total Revenue" value={INR(kpi?.totalRevenue)} bg="var(--green-dim)" color="var(--green)" sub="Verified payments" />
              <KpiCard icon="📋" label="Total Cases" value={kpi?.totalCases ?? '—'} bg="#EEF2FF" color="var(--blue)" sub="All time" />
              <KpiCard icon="⚙️" label="Active Cases" value={kpi?.activeCases ?? '—'} bg="var(--amber-dim)" color="var(--amber)" sub="In production" />
              <KpiCard icon="✅" label="Delivered" value={kpi?.deliveredCases ?? '—'} bg="var(--green-dim)" color="var(--green)" sub="Completed" />
              <KpiCard icon="💳" label="Pending Payments" value={kpi?.pendingPayments ?? '—'} bg="var(--accent-dim)" color="var(--navy)" sub="Awaiting review" />
            </div>

            {/* ── Revenue Trend ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Monthly Revenue Trend (12 months)</div>
              </div>
              <div style={{ padding: '20px 20px 12px' }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlyTrend} margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                    <Tooltip content={<CustomTooltip prefix="₹" />} />
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
                          tickFormatter={v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                        <YAxis type="category" dataKey="workType" width={110}
                          tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                        <Tooltip content={<CustomTooltip prefix="₹" />} />
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
                      <th>Revenue (Verified)</th>
                      <th>Avg per Case</th>
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
                          <td style={{ fontWeight: 700, color: 'var(--green)' }}>{INR(row.revenue)}</td>
                          <td style={{ color: 'var(--text-2)' }}>
                            {row.count > 0 ? INR(Math.round(row.revenue / row.count)) : '—'}
                          </td>
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

            {/* ── Revenue by Clinic ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Revenue by Clinic</div>
              </div>
              <div style={{ padding: '20px 20px 12px' }}>
                {revenueByClinic?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, (revenueByClinic?.length || 1) * 44)}>
                    <BarChart layout="vertical" data={revenueByClinic}
                      margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                        tickFormatter={v => '₹' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                      <YAxis type="category" dataKey="name" width={130}
                        tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                      <Tooltip content={<CustomTooltip prefix="₹" />} />
                      <Bar dataKey="revenue" name="Revenue" fill="var(--navy)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Clinic table ── */}
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
                      <th>Paid Cases</th>
                      <th>Revenue (Verified)</th>
                      <th>Avg per Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueByClinic?.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No clinics found</td></tr>
                    ) : revenueByClinic?.map(c => (
                      <tr key={c.id}>
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
                        <td>{c.paidCases}</td>
                        <td style={{ fontWeight: 700, color: 'var(--green)' }}>{INR(c.revenue)}</td>
                        <td style={{ color: 'var(--text-2)' }}>
                          {c.paidCases > 0 ? INR(Math.round(c.revenue / c.paidCases)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
