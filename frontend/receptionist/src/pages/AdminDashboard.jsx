import { useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import SearchableSelect from '../components/SearchableSelect';
import ExportMenu from '../components/ExportMenu';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';

const ETB = (v) => 'Br ' + Number(v || 0).toLocaleString('en-US');
const fmtBr = (v) => `Br ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WORK_TYPE_COLORS = [
  '#1A56A0', '#00C4B4', '#F0A500', '#16A34A', '#E53E3E',
  '#7C3AED', '#D97706', '#0EA5E9', '#EC4899', '#6B7280',
];

// All in-production statuses (excludes terminal states)
const PRODUCTION_STATUSES = [
  'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
  'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
  'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
  'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
].join(',');

// ── KPI card (clickable) ──────────────────────────────────
function KpiCard({ icon, label, value, sub, color = 'var(--blue)', bg = '#EEF2FF', onClick, active }) {
  return (
    <div
      className="stat-card"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        outline: active ? `2px solid ${color}` : 'none',
        outlineOffset: 2,
        transition: 'box-shadow .15s',
        boxShadow: active ? `0 0 0 3px ${color}22` : undefined,
      }}
    >
      <div className="stat-icon" style={{ background: bg }}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {onClick && <div style={{ fontSize: 10, color, marginTop: 4, fontWeight: 600 }}>Click to view cases ↓</div>}
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────
const CustomTooltip = ({ active, payload, label, prefix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--blue)' }}>
          {p.name}: {prefix}{Number(p.value).toLocaleString('en-US')}
        </div>
      ))}
    </div>
  );
};

// ── Drill-down case list panel ────────────────────────────
const CASE_COLS = [
  { header: 'Case #',      value: c => c.caseNumber ?? '(no scan #)' },
  { header: 'Clinic',      value: c => c.clinic?.name },
  { header: 'Patient',     value: c => c.patientName },
  { header: 'Work Type',   value: c => c.workType },
  { header: 'Status',      value: c => c.status },
  { header: 'Payment',     value: c => c.paymentStatus },
  { header: 'Amount (Br)', value: c => c.payment?.amount ?? c.totalAmount ?? '' },
  { header: 'Date',        value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
];

function DrillDownPanel({ drill, fromDate, toDate, clinicId, onClose }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const params = {
    ...drill.params,
    page, limit: 25,
    ...(search ? { search } : {}),
    ...(fromDate ? { dateFrom: fromDate } : {}),
    ...(toDate   ? { dateTo: toDate }     : {}),
    ...(clinicId ? { clinicId }           : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['admin-drill', drill.key, page, search, fromDate, toDate, clinicId],
    queryFn: () => api.get('/cases', { params }).then(r => r.data),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const fetchAllForExport = () =>
    api.get('/cases', { params: { ...params, page: 1, limit: 2000 } }).then(r => r.data.cases ?? []);

  const cases = data?.cases ?? [];
  const pagination = data?.pagination ?? {};

  return (
    <div className="card" style={{ marginBottom: 24, border: '2px solid var(--blue)', borderRadius: 12 }}>
      <div className="card-header" style={{ background: 'var(--blue)', color: '#fff', borderRadius: '10px 10px 0 0', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{drill.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{drill.label}</div>
            {pagination.total != null && (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{pagination.total} case{pagination.total !== 1 ? 's' : ''} found</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ExportMenu fetchData={fetchAllForExport} columns={CASE_COLS} filename={`admin-${drill.key}`} title={drill.label} />
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="search-input" style={{ maxWidth: 340, margin: 0 }}>
          <span className="icon">🔍</span>
          <input
            placeholder="Search clinic, patient, case no…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="table-wrap">
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading cases…</div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No cases found</div>
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
                <th>Status</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td>
                    {c.caseNumber
                      ? <span className="case-number">{c.caseNumber}</span>
                      : <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>No # yet</span>
                    }
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                  <td><span className="patient-name">{c.patientName}</span></td>
                  <td style={{ fontSize: 12 }}>{c.workType}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><PaymentBadge status={c.paymentStatus} /></td>
                  <td style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>
                    {c.payment?.amount != null ? ETB(c.payment.amount) : c.totalAmount != null ? ETB(c.totalAmount) : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {format(new Date(c.createdAt), 'dd MMM yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
          <span style={{ color: 'var(--text-3)' }}>Page {page} of {pagination.totalPages}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>← Prev</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Financial Projections Card ────────────────────────────
function FinancialProjections({ kpi, fromDate, toDate, onDrill }) {
  const projected  = kpi?.totalProjectedRevenue || 0;
  const received   = kpi?.totalRevenue           || 0;
  const outstanding = projected - received;
  const collectionRate = projected > 0 ? Math.round((received / projected) * 100) : 0;
  const receivedPct    = projected > 0 ? (received / projected) * 100 : 0;
  const outstandingPct = projected > 0 ? (outstanding / projected) * 100 : 0;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <div className="card-title">💹 Financial Projections</div>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fromDate} — {toDate}</span>
      </div>
      <div style={{ padding: '20px 24px' }}>
        {/* Big numbers row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginBottom: 24 }}>
          {[
            {
              label: 'Total Case Value', value: fmtBr(projected),
              sub: `${(kpi?.totalCases || 0)} cases × avg rate`,
              color: 'var(--blue)', bg: '#EEF2FF', icon: '📊',
              onClick: () => onDrill('totalCases'),
            },
            {
              label: 'Payments Received', value: fmtBr(received),
              sub: `${kpi?.deliveredCases || 0} verified payments`,
              color: 'var(--green)', bg: 'var(--green-dim)', icon: '✅',
              onClick: () => onDrill('paymentsReceived'),
            },
            {
              label: 'Outstanding / Not Received', value: fmtBr(Math.max(0, outstanding)),
              sub: `${kpi?.outstandingCount || 0} cases pending payment`,
              color: outstanding > 0 ? 'var(--red)' : 'var(--green)',
              bg: outstanding > 0 ? '#FFF1F2' : 'var(--green-dim)', icon: outstanding > 0 ? '⏳' : '✅',
              onClick: () => onDrill('outstanding'),
            },
          ].map(item => (
            <div key={item.label}
              onClick={item.onClick}
              style={{
                background: item.bg, borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
                border: `1px solid ${item.color}22`, transition: 'box-shadow .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${item.color}44`}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: item.color, lineHeight: 1.2 }}>{item.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{item.sub}</div>
              <div style={{ fontSize: 10, color: item.color, marginTop: 6, fontWeight: 600 }}>Click to view cases →</div>
            </div>
          ))}
        </div>

        {/* Collection rate bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Collection Rate</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: collectionRate >= 80 ? 'var(--green)' : collectionRate >= 50 ? 'var(--amber)' : 'var(--red)' }}>
              {collectionRate}%
            </div>
          </div>
          <div style={{ height: 14, borderRadius: 7, background: '#FFF1F2', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%', width: `${receivedPct}%`,
              background: 'linear-gradient(90deg, #16A34A, #22C55E)',
              borderRadius: 7, transition: 'width .6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              Received {receivedPct.toFixed(1)}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
              Outstanding {outstandingPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drill-down definitions ────────────────────────────────
const DRILL_MAP = {
  totalCases:       { key: 'totalCases',       icon: '📋', label: 'All Cases',                   params: {} },
  activeCases:      { key: 'activeCases',       icon: '⚙️', label: 'Active Cases (In Production)', params: { status: PRODUCTION_STATUSES } },
  deliveredCases:   { key: 'deliveredCases',    icon: '✅', label: 'Delivered Cases',              params: { status: 'DELIVERED' } },
  pendingPayments:  { key: 'pendingPayments',   icon: '💳', label: 'Pending Payment Approvals',   params: { paymentStatus: 'SCREENSHOT_UPLOADED' } },
  readyToDispatch:  { key: 'readyToDispatch',   icon: '🚚', label: 'Ready to Dispatch',           params: { status: 'READY_TO_DISPATCH' } },
  paymentsReceived: { key: 'paymentsReceived',  icon: '💰', label: 'Payments Received (Verified)', params: { paymentStatus: 'VERIFIED' } },
  outstanding:      { key: 'outstanding',       icon: '⏳', label: 'Outstanding — Not Received',  params: { paymentStatus: 'PENDING,PAYMENT_REQUESTED,SCREENSHOT_UPLOADED' } },
  totalRemakes:     { key: 'totalRemakes',      icon: '🔄', label: 'Remake Cases',               params: { remake: 'true' } },
};

// ── Main component ────────────────────────────────────────
export default function AdminDashboard() {
  const [selectedClinic, setSelectedClinic] = useState('');
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate]     = useState(new Date().toISOString().slice(0, 10));
  const [drillKey, setDrillKey] = useState(null);

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

  const drill = drillKey ? DRILL_MAP[drillKey] : null;

  const handleDrill = (key) => {
    setDrillKey(prev => prev === key ? null : key);
    // Scroll to drill-down panel
    setTimeout(() => document.getElementById('drill-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const summaryRows = [
      ['Metric', 'Value'],
      ['Period', `${fromDate} to ${toDate}`],
      ['Clinic Filter', selectedClinic ? (clinicList?.find(c => c.id === selectedClinic)?.name || selectedClinic) : 'All Clinics'],
      [],
      ['Total Projected Revenue (Br)', kpi?.totalProjectedRevenue ?? 0],
      ['Total Revenue Received (Br)',  kpi?.totalRevenue ?? 0],
      ['Outstanding (Br)', (kpi?.totalProjectedRevenue || 0) - (kpi?.totalRevenue || 0)],
      ['Total Cases',      kpi?.totalCases ?? 0],
      ['Total Units',      kpi?.totalUnits ?? 0],
      ['Active Cases',     kpi?.activeCases ?? 0],
      ['Delivered Cases',  kpi?.deliveredCases ?? 0],
      ['Pending Payments', kpi?.pendingPayments ?? 0],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');
    const trendRows = [['Month', 'Cases', 'Revenue (Br)'], ...(monthlyTrend || []).map(r => [r.month, r.cases, r.revenue])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(trendRows), 'Monthly Trend');
    const totalRev = (revenueByWorkType || []).reduce((s, r) => s + r.revenue, 0);
    const workRows = [['#', 'Work Type', 'Cases', 'Units', 'Revenue (Br)', 'Share (%)'],
      ...(revenueByWorkType || []).map((r, i) => [i + 1, r.workType, r.count, r.units || 0, r.revenue, totalRev > 0 ? ((r.revenue / totalRev) * 100).toFixed(1) : '0.0'])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(workRows), 'By Work Type');
    const clinicRows = [['Clinic', 'Total Cases', 'Units', 'Paid Cases', 'Revenue (Br)'],
      ...(revenueByClinic || []).map(c => [c.name, c.totalCases, c.totalUnits || 0, c.paidCases, c.revenue])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clinicRows), 'By Clinic');
    XLSX.writeFile(wb, `YeAlmaz_Analytics_${fromDate}_to_${toDate}.xlsx`);
  };

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Analytics Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={exportToExcel} disabled={loading || !data}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: loading || !data ? 'var(--border)' : '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: loading || !data ? 'not-allowed' : 'pointer' }}>
            <span>📊</span> Export Excel
          </button>
          <ExportMenu
            data={revenueByClinic || []}
            columns={[
              { header: 'Clinic',       value: c => c.name },
              { header: 'Total Cases',  value: c => c.totalCases },
              { header: 'Total Units',  value: c => c.totalUnits || 0 },
              { header: 'Paid Cases',   value: c => c.paidCases },
              { header: 'Revenue (Br)', value: c => c.revenue.toFixed(2) },
            ]}
            filename="admin-clinic-performance"
            title={`Clinic Performance — ${fromDate} to ${toDate}`}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
            <div className="live-dot" /> Live
          </div>
        </div>
      </div>

      <div className="content">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Filters</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>From</label>
              <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setDrillKey(null); }} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>To</label>
              <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setDrillKey(null); }} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>Clinic</label>
              <SearchableSelect
                value={selectedClinic}
                onChange={v => { setSelectedClinic(v); setDrillKey(null); }}
                options={(clinicList || []).map(c => ({ value: c.id, label: c.name }))}
                placeholder="All Clinics"
                style={{ minWidth: 160 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {[
                { label: 'This Month', f: () => { const n=new Date(); setFromDate(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setToDate(n.toISOString().slice(0,10)); setDrillKey(null); } },
                { label: 'This Year',  f: () => { setFromDate(`${thisYear}-01-01`); setToDate(new Date().toISOString().slice(0,10)); setDrillKey(null); } },
                { label: 'All Time',   f: () => { setFromDate('2020-01-01'); setToDate(new Date().toISOString().slice(0,10)); setDrillKey(null); } },
              ].map(({ label, f }) => <button key={label} className="btn btn-ghost btn-sm" onClick={f}>{label}</button>)}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: '#3d1a1a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, border: '1px solid rgba(229,62,62,.3)', color: '#ef9a9a', fontSize: 13 }}>⚠️ {error}</div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-3)', fontSize: 14 }}>Loading analytics…</div>
        ) : (
          <>
            {/* ── Financial Projections ── */}
            <FinancialProjections kpi={kpi} fromDate={fromDate} toDate={toDate} onDrill={handleDrill} />

            {/* ── KPI Row 1 — Revenue & Volume ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Revenue & Volume</div>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(6,1fr)', marginBottom: 8 }}>
              <KpiCard icon="💰" label="Total Revenue" value={ETB(kpi?.totalRevenue)}
                bg="var(--green-dim)" color="var(--green)" sub="Verified payments"
                active={drillKey === 'paymentsReceived'} onClick={() => handleDrill('paymentsReceived')} />
              <KpiCard icon="📋" label="Total Cases" value={kpi?.totalCases ?? '—'}
                bg="#EEF2FF" color="var(--blue)" sub="In selected range"
                active={drillKey === 'totalCases'} onClick={() => handleDrill('totalCases')} />
              <KpiCard icon="🦷" label="Total Units" value={kpi?.totalUnits ?? '—'}
                bg="var(--accent-dim)" color="var(--accent)" sub="In selected range" />
              <KpiCard icon="⚙️" label="Active Cases" value={kpi?.activeCases ?? '—'}
                bg="var(--amber-dim)" color="var(--amber)" sub="In production"
                active={drillKey === 'activeCases'} onClick={() => handleDrill('activeCases')} />
              <KpiCard icon="✅" label="Delivered" value={kpi?.deliveredCases ?? '—'}
                bg="var(--green-dim)" color="var(--green)" sub="Completed"
                active={drillKey === 'deliveredCases'} onClick={() => handleDrill('deliveredCases')} />
              <KpiCard icon="💳" label="Pending Payments" value={kpi?.pendingPayments ?? '—'}
                bg="var(--accent-dim)" color="var(--navy)" sub="Awaiting review"
                active={drillKey === 'pendingPayments'} onClick={() => handleDrill('pendingPayments')} />
            </div>

            {/* ── KPI Row 2 — Operations ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, margin: '18px 0 10px' }}>Operations</div>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 24 }}>
              <KpiCard icon="🚚" label="Ready Orders" value={kpi?.readyToDispatch ?? '—'}
                bg="var(--accent-dim)" color="var(--accent)" sub="Ready to Dispatch"
                active={drillKey === 'readyToDispatch'} onClick={() => handleDrill('readyToDispatch')} />
              <KpiCard icon="💵" label="Payments Received" value={ETB(kpi?.totalRevenue)}
                bg="var(--green-dim)" color="var(--green)" sub={`${kpi?.deliveredCases ?? 0} verified`}
                active={drillKey === 'paymentsReceived'} onClick={() => handleDrill('paymentsReceived')} />
              <KpiCard icon="⏳" label="Outstanding" value={ETB(kpi?.outstandingAmount)}
                bg="#FFF1F2" color="var(--red)" sub={`${kpi?.outstandingCount ?? 0} unpaid cases`}
                active={drillKey === 'outstanding'} onClick={() => handleDrill('outstanding')} />
              <KpiCard icon="🔄" label="Total Remakes" value={kpi?.totalRemakes ?? '—'}
                bg="var(--amber-dim)" color="var(--amber)" sub="In selected range"
                active={drillKey === 'totalRemakes'} onClick={() => handleDrill('totalRemakes')} />
              <KpiCard icon="🏷️" label="Top Remake Reason"
                value={kpi?.mostCommonRemakeReason ?? '—'}
                bg="#F5F3FF" color="#6D28D9" sub="Most common" />
              <KpiCard icon="⏱️" label="Avg Turnaround"
                value={kpi?.avgTurnaroundDays != null ? `${kpi.avgTurnaroundDays}d` : '—'}
                bg="#EFF6FF" color="var(--blue)" sub="Days to delivery" />
              <KpiCard icon="🎯" label="On-Time Delivery"
                value={kpi?.onTimeDeliveryPct != null ? `${kpi.onTimeDeliveryPct}%` : '—'}
                bg={kpi?.onTimeDeliveryPct >= 80 ? 'var(--green-dim)' : 'var(--amber-dim)'}
                color={kpi?.onTimeDeliveryPct >= 80 ? 'var(--green)' : 'var(--amber)'}
                sub="Within due date" />
            </div>

            {/* ── Drill-down panel ── */}
            {drill && (
              <div id="drill-panel">
                <DrillDownPanel
                  drill={drill}
                  fromDate={fromDate}
                  toDate={toDate}
                  clinicId={selectedClinic}
                  onClose={() => setDrillKey(null)}
                />
              </div>
            )}

            {/* ── Charts ── */}
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

            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><div className="card-title">Cases Processed per Month</div></div>
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

            {/* Revenue by Work Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              <div className="card">
                <div className="card-header"><div className="card-title">Revenue by Product Category</div></div>
                <div style={{ padding: '20px 20px 12px' }}>
                  {revenueByWorkType?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart layout="vertical" data={revenueByWorkType} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => 'Br ' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)} />
                        <YAxis type="category" dataKey="workType" width={110} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                        <Tooltip content={<CustomTooltip prefix="Br " />} />
                        <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                          {revenueByWorkType?.map((_, i) => <Cell key={i} fill={WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Cases by Product Category</div></div>
                <div style={{ padding: '12px 20px 20px' }}>
                  {revenueByWorkType?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={revenueByWorkType} dataKey="count" nameKey="workType" cx="50%" cy="50%" outerRadius={90}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                          {revenueByWorkType?.map((_, i) => <Cell key={i} fill={WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v + ' cases', n]} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Product Category Table */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header"><div className="card-title">Product Category Breakdown</div></div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>Work Type / Category</th><th>Cases</th>
                      <th>Total Units</th><th>Revenue (Verified)</th><th>Share</th>
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
                              <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length] }} />
                              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{row.workType}</span>
                            </div>
                          </td>
                          <td><span style={{ background: '#EEF2FF', color: 'var(--blue)', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{row.count}</span></td>
                          <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{row.units > 0 ? row.units : '—'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--green)' }}>{ETB(row.revenue)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                <div style={{ width: `${share}%`, height: '100%', borderRadius: 3, background: WORK_TYPE_COLORS[i % WORK_TYPE_COLORS.length] }} />
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

            {/* Clinic Performance */}
            {!selectedClinic && (() => {
              const maxRevenue = Math.max(...(revenueByClinic || []).map(c => c.revenue || 0), 1);
              return (
                <div className="card">
                  <div className="card-header"><div className="card-title">Clinic Performance</div></div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Clinic</th><th>Total Cases</th><th>Total Units</th><th>Paid Cases</th><th>Revenue (Verified)</th></tr>
                      </thead>
                      <tbody>
                        {revenueByClinic?.length === 0 ? (
                          <tr><td colSpan={5} className="empty-state">No clinics found</td></tr>
                        ) : revenueByClinic?.map(c => {
                          const pct = Math.round(((c.revenue || 0) / maxRevenue) * 100);
                          return (
                            <tr key={c.id}>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
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
                                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--blue)', transition: 'width 0.4s ease' }} />
                                  </div>
                                  <span style={{ fontWeight: 700, color: 'var(--green)', whiteSpace: 'nowrap' }}>{ETB(c.revenue)}</span>
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

            {/* ── Trusted Partners ── */}
            <TrustedPartnersSummary />
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ── Trusted Partners Summary (shared Finance + Admin) ─────
function TrustedPartnersSummary() {
  const [expanded, setExpanded] = useState(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['trusted-partners-summary'],
    queryFn: () => api.get('/dashboard/trusted-partners-summary').then(r => r.data),
    staleTime: 120_000,
  });

  const totals = summary.reduce((acc, c) => ({
    totalOrders:       acc.totalOrders       + c.totalOrders,
    totalUnits:        acc.totalUnits        + c.totalUnits,
    deliveredOrders:   acc.deliveredOrders   + c.deliveredOrders,
    inProgress:        acc.inProgress        + c.inProgress,
    totalRevenue:      acc.totalRevenue      + c.totalRevenue,
    paymentsReceived:  acc.paymentsReceived  + c.paymentsReceived,
    outstanding:       acc.outstanding       + c.outstanding,
  }), { totalOrders: 0, totalUnits: 0, deliveredOrders: 0, inProgress: 0, totalRevenue: 0, paymentsReceived: 0, outstanding: 0 });

  const ETBa = (v) => `Br ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const n    = (v) => Number(v || 0).toLocaleString('en-US');

  if (isLoading) return null;
  if (!summary.length) return null;

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <div className="card-title">🤝 Trusted Partners Summary</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{summary.length} partners</span>
          <ExportMenu
            data={summary}
            columns={[
              { header: 'Clinic Name',             value: c => c.name },
              { header: 'Total Orders',             value: c => c.totalOrders },
              { header: 'Total Units',              value: c => c.totalUnits },
              { header: 'Delivered Orders',         value: c => c.deliveredOrders },
              { header: 'Orders in Progress',       value: c => c.inProgress },
              { header: 'Total Revenue (Br)',       value: c => c.totalRevenue.toFixed(2) },
              { header: 'Payments Received (Br)',   value: c => c.paymentsReceived.toFixed(2) },
              { header: 'Outstanding (Br)',         value: c => c.outstanding.toFixed(2) },
            ]}
            filename="trusted-partners"
            title="Trusted Partners Summary"
          />
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Clinic Name</th>
              <th style={{ textAlign: 'center' }}>Total Orders</th>
              <th style={{ textAlign: 'center' }}>Total Units</th>
              <th style={{ textAlign: 'center' }}>Delivered</th>
              <th style={{ textAlign: 'center' }}>In Progress</th>
              <th style={{ textAlign: 'right' }}>Total Revenue</th>
              <th style={{ textAlign: 'right' }}>Received</th>
              <th style={{ textAlign: 'right' }}>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {summary.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6D28D9', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      {c.phone && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.phone}</div>}
                    </div>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F5F3FF', color: '#6D28D9', fontWeight: 700 }}>🤝 Trusted</span>
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>{n(c.totalOrders)}</td>
                <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{n(c.totalUnits) || '—'}</td>
                <td style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{n(c.deliveredOrders)}</td>
                <td style={{ textAlign: 'center', color: 'var(--amber)', fontWeight: 600 }}>{n(c.inProgress)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{ETBa(c.totalRevenue)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{ETBa(c.paymentsReceived)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: c.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>{ETBa(c.outstanding)}</td>
              </tr>
            ))}
            <tr style={{ background: 'var(--surface-2)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '12px 16px' }}>TOTAL</td>
              <td style={{ textAlign: 'center', color: 'var(--blue)' }}>{n(totals.totalOrders)}</td>
              <td style={{ textAlign: 'center' }}>{n(totals.totalUnits)}</td>
              <td style={{ textAlign: 'center', color: 'var(--green)' }}>{n(totals.deliveredOrders)}</td>
              <td style={{ textAlign: 'center', color: 'var(--amber)' }}>{n(totals.inProgress)}</td>
              <td style={{ textAlign: 'right' }}>{ETBa(totals.totalRevenue)}</td>
              <td style={{ textAlign: 'right', color: 'var(--green)' }}>{ETBa(totals.paymentsReceived)}</td>
              <td style={{ textAlign: 'right', color: totals.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>{ETBa(totals.outstanding)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle = {
  border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
  fontSize: 13, color: 'var(--text-1)', background: 'var(--surface)',
  outline: 'none', fontFamily: 'DM Sans, sans-serif',
};
