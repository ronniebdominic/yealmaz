import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import SearchableSelect from '../components/SearchableSelect';
import ExportMenu from '../components/ExportMenu';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api, { downloadExport } from '../api';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { todayLocal } from '../utils/date';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  MdAssignment, MdSettings, MdCheckCircle, MdCreditCard, MdLocalShipping,
  MdPaid, MdPendingActions, MdAutorenew, MdInventory2, MdBarChart,
  MdSchedule, MdTrackChanges, MdSearch, MdFileDownload, MdCancel,
  MdErrorOutline, MdScience, MdHandshake, MdClose, MdCheck, MdChevronLeft,
  MdChevronRight, MdInfoOutline, MdHelpOutline, MdWarning, MdEmojiEvents,
} from 'react-icons/md';

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

// Everything not in production, not ready to dispatch, and not delivered —
// awaiting pickup, out for delivery, on hold, flagged REMAKE, cancelled,
// under review, or rejected. Mirrors the backend's otherCases exclusion.
const OTHER_STATUSES = [
  'PENDING_PICKUP', 'PICKUP_ASSIGNED', 'OUT_FOR_DELIVERY', 'ON_HOLD',
  'REMAKE', 'CANCELLED', 'UNDER_REVIEW', 'REJECTED',
].join(',');

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
function DrillDownPanel({ drill, fromDate, toDate, clinicId, onClose }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

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

  // Full-dataset export (all matching rows, not just the current page) —
  // hits the backend /cases/export route so a 230-page result set downloads in one click.
  const exportAll = async () => {
    setExporting(true);
    try {
      const exportParams = { ...params };
      delete exportParams.page;
      delete exportParams.limit;
      await downloadExport('/cases/export', exportParams, `admin-${drill.key}_${todayLocal()}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const cases = data?.cases ?? [];
  const pagination = data?.pagination ?? {};

  const DrillIcon = drill.icon;

  return (
    <div className="glass-card" style={{ marginBottom: 24, border: '2px solid var(--blue)', borderRadius: 12 }}>
      <div className="card-header" style={{ background: 'var(--blue)', color: '#fff', borderRadius: '10px 10px 0 0', padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DrillIcon className="mi" size={22} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{drill.label}</div>
            {pagination.total != null && (
              <div style={{ fontSize: 12, opacity: 0.8 }}>{pagination.total} case{pagination.total !== 1 ? 's' : ''} found</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportAll} disabled={exporting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
            <MdFileDownload className="mi" size={16} /> {exporting ? 'Exporting…' : 'Export All (Excel)'}
          </button>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MdClose className="mi" size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
        <div className="search-input" style={{ maxWidth: 340, margin: 0 }}>
          <span className="icon mi"><MdSearch size={16} /></span>
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
            <div className="empty-icon mi" style={{ margin: '0 auto 12px' }}><MdSearch size={32} /></div>
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
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MdChevronLeft className="mi" size={16} /> Prev</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Next <MdChevronRight className="mi" size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section header (matches the 3-block mockup: Financial Projection /
// Revenue Vs Volume / Operation) ──────────────────────────
function SectionHeader({ children }) {
  return <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '4px 0 12px' }}>{children}</div>;
}

// ── Colored KPI tile (mockup uses flat green/red/yellow/blue blocks) ─────
// Glassmorphic: keeps the semantic tint (bg) but frosts it with a blur +
// soft inset highlight, rather than flattening every card to neutral white.
function ColorTile({ icon: Icon, label, value, sub, color, bg, onClick, active, info }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: bg, borderRadius: 12, padding: '14px 16px', cursor: onClick ? 'pointer' : 'default',
        border: `1px solid ${color}33`, outline: active ? `2px solid ${color}` : 'none', outlineOffset: 2,
        WebkitBackdropFilter: 'blur(12px) saturate(160%)', backdropFilter: 'blur(12px) saturate(160%)',
        boxShadow: active ? `0 0 0 2px ${color}44, inset 0 1px 0 rgba(255,255,255,.5)` : 'inset 0 1px 0 rgba(255,255,255,.5)',
        transition: 'box-shadow .15s, transform .15s',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = `0 0 0 2px ${color}44, inset 0 1px 0 rgba(255,255,255,.5)`; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = active ? `0 0 0 2px ${color}44, inset 0 1px 0 rgba(255,255,255,.5)` : 'inset 0 1px 0 rgba(255,255,255,.5)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        <Icon className="mi" size={16} />
        <span style={{ flex: 1 }}>{label}</span>
        {info && (
          <span className="info-icon-wrap" tabIndex={0} onClick={e => e.stopPropagation()}>
            <MdInfoOutline size={13} style={{ opacity: 0.55 }} />
            <span className="info-tooltip">{info}</span>
          </span>
        )}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Drill-down definitions ────────────────────────────────
const DRILL_MAP = {
  totalCases:       { key: 'totalCases',       icon: MdAssignment,     label: 'All Cases',                   params: {} },
  activeCases:      { key: 'activeCases',       icon: MdSettings,       label: 'Active Cases (In Production)', params: { status: PRODUCTION_STATUSES } },
  // These three share the Revenue vs Volume section's cohort: cases DELIVERED
  // within the selected range (dateBy: 'delivery'), not created in it — must
  // match how the backend computes deliveredCases/deliveredCaseValue/
  // totalRevenue/outstandingAmount, or the drill-down list won't match the
  // tile you clicked.
  deliveredCases:   { key: 'deliveredCases',    icon: MdCheckCircle,    label: 'Delivered Cases',              params: { status: 'DELIVERED', dateBy: 'delivery' } },
  pendingPayments:  { key: 'pendingPayments',   icon: MdCreditCard,     label: 'Pending Payment Approvals',   params: { paymentStatus: 'SCREENSHOT_UPLOADED' } },
  readyToDispatch:  { key: 'readyToDispatch',   icon: MdLocalShipping,  label: 'Ready to Dispatch',           params: { status: 'READY_TO_DISPATCH' } },
  paymentsReceived: { key: 'paymentsReceived',  icon: MdPaid,           label: 'Payments Received (Verified)', params: { status: 'DELIVERED', paymentStatus: 'VERIFIED', dateBy: 'delivery' } },
  outstanding:      { key: 'outstanding',       icon: MdPendingActions, label: 'Outstanding — Not Received',  params: { status: 'DELIVERED', paymentStatus: 'PENDING,PAYMENT_REQUESTED,SCREENSHOT_UPLOADED', dateBy: 'delivery' } },
  totalRemakes:     { key: 'totalRemakes',      icon: MdAutorenew,      label: 'Remake Cases',               params: { remake: 'true' } },
  otherCases:       { key: 'otherCases',        icon: MdHelpOutline,    label: 'Other / Exception Cases',     params: { status: OTHER_STATUSES } },
  // No dateBy here — deliberately falls back to createdAt (the "order date"
  // cohort), matching how the backend computes deliveredOfCreated. Do NOT
  // add dateBy:'delivery', or the list would silently switch to a different
  // cohort than the tile it's supposed to explain.
  deliveredOfCreated: { key: 'deliveredOfCreated', icon: MdCheckCircle, label: 'Delivered (Ordered in Range)', params: { status: 'DELIVERED' } },
};

// ── Main component ────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [selectedClinic, setSelectedClinic] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // committed on Enter/blur — avoids a request per keystroke
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate]     = useState(todayLocal());
  const [drillKey, setDrillKey]   = useState(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult]   = useState(null);

  const runWorkflowTest = async () => {
    if (!window.confirm('Run end-to-end workflow test? This creates a real test case, walks it through every stage, then deletes it automatically.')) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await api.post('/dashboard/run-workflow-test');
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ result: '❌ REQUEST FAILED', summary: err.response?.data?.error || err.message, steps: [] });
    } finally {
      setTestRunning(false);
    }
  };

  const { data, isLoading: loading, error: queryError } = useQuery({
    queryKey: ['dashboard', 'analytics', fromDate, toDate, selectedClinic, search],
    queryFn: () => {
      const params = { from: fromDate, to: toDate };
      if (selectedClinic) params.clinicId = selectedClinic;
      if (search) params.search = search;
      return api.get('/dashboard/admin-analytics', { params }).then(r => r.data);
    },
    staleTime: 5 * 60_000,
  });

  const error = queryError ? (queryError.response?.data?.error || 'Failed to load analytics.') : '';
  const { kpi, monthlyTrend, revenueByClinic, revenueByWorkType, clinicList } = data || {};

  const { data: invSummary } = useQuery({
    queryKey: ['inventory', 'summary'],
    queryFn: () => api.get('/inventory/summary').then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const topMiller = invSummary?.topMillerName
    ? `${invSummary.topMillerName}${invSummary.topMillerPoints ? ` (${invSummary.topMillerPoints} pts)` : ''}`
    : '—';

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
      ['Total Case Value (Br)', kpi?.totalCaseValue ?? 0],
      ['Total Case Value — Delivered Only (Br)', kpi?.deliveredCaseValue ?? 0],
      ['Total Revenue Received (Br)',  kpi?.totalRevenue ?? 0],
      ['Outstanding (Br)', kpi?.outstandingAmount ?? 0],
      ['Total Cases',      kpi?.totalCases ?? 0],
      ['Total Units',      kpi?.totalUnits ?? 0],
      ['Active Cases',     kpi?.activeCases ?? 0],
      ['Ready for Delivery & Dispatch', kpi?.readyToDispatch ?? 0],
      ['Delivered (Ordered in Range)', kpi?.deliveredOfCreated ?? 0],
      ['Other / Exception Cases', kpi?.otherCases ?? 0],
      ['Delivered Cases (by Delivery Date)',  kpi?.deliveredCases ?? 0],
      ['Units Delivered',  kpi?.unitsDelivered ?? 0],
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
      <div className="topbar glass-topbar">
        <div className="topbar-title">Analytics Dashboard</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={exportToExcel} disabled={loading || !data}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: loading || !data ? 'var(--border)' : '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: loading || !data ? 'not-allowed' : 'pointer' }}>
            <MdBarChart className="mi" size={16} /> Export Excel
          </button>
          <button onClick={runWorkflowTest} disabled={testRunning}
            title="Run end-to-end workflow test through all lab stages"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: testRunning ? 'var(--border)' : '#0F2044', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: testRunning ? 'not-allowed' : 'pointer' }}>
            {testRunning ? <><MdPendingActions className="mi" size={16} /> Testing…</> : <><MdScience className="mi" size={16} /> Run Test</>}
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
        <div className="glass-card" style={{ marginBottom: 20, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Filters</span>
            <div className="search-input" style={{ minWidth: 200, margin: 0 }}>
              <span className="icon mi"><MdSearch size={16} /></span>
              <input
                placeholder="Search clinic, patient, case no…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                onBlur={() => setSearch(searchInput)}
              />
            </div>
            {search && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', display: 'flex', alignItems: 'center' }}
                onClick={() => { setSearchInput(''); setSearch(''); }}><MdClose className="mi" size={14} /></button>
            )}
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
                { label: 'Today',      f: () => { const n=todayLocal(); setFromDate(n); setToDate(n); setDrillKey(null); } },
                { label: 'This Month', f: () => { const n=new Date(); setFromDate(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setToDate(todayLocal()); setDrillKey(null); } },
                { label: 'This Year',  f: () => { setFromDate(`${thisYear}-01-01`); setToDate(todayLocal()); setDrillKey(null); } },
                { label: 'All Time',   f: () => { setFromDate('2020-01-01'); setToDate(todayLocal()); setDrillKey(null); } },
              ].map(({ label, f }) => <button key={label} className="btn btn-ghost btn-sm" onClick={f}>{label}</button>)}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#3d1a1a', borderRadius: 10, padding: '12px 16px', marginBottom: 20, border: '1px solid rgba(229,62,62,.3)', color: '#ef9a9a', fontSize: 13 }}>
            <MdErrorOutline className="mi" size={16} /> {error}
          </div>
        )}

        {/* ── Workflow Test Results ── */}
        {testResult && (() => {
          const passed = testResult.result?.startsWith('✅');
          const resultText = testResult.result?.replace(/^[✅❌]\s*/, '');
          return (
            <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: `2px solid ${passed ? '#16A34A' : '#DC2626'}` }}>
              <div style={{ background: passed ? '#16A34A' : '#DC2626', color: '#fff', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {passed ? <MdCheckCircle className="mi" size={22} /> : <MdCancel className="mi" size={22} />}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{resultText}</div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{testResult.summary}</div>
                  </div>
                </div>
                <button onClick={() => setTestResult(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MdClose className="mi" size={16} />
                </button>
              </div>
              <div style={{ background: '#F9FAFB', padding: '12px 18px' }}>
                {testResult.steps?.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid #E5E7EB' }}>
                    <span className="mi" style={{ color: s.status === 'PASS' ? '#16A34A' : '#DC2626', minWidth: 16 }}>
                      {s.status === 'PASS' ? <MdCheck size={16} /> : <MdClose size={16} />}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{s.step}</div>
                      {s.detail && <div style={{ fontSize: 12, color: s.status === 'PASS' ? '#6B7280' : '#DC2626', marginTop: 2 }}>{s.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-3)', fontSize: 14 }}>Loading analytics…</div>
        ) : (
          <>
            {/* ── Section 1: Financial Projection ── */}
            <SectionHeader>Financial Projection</SectionHeader>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
              <ColorTile icon={MdAssignment} label="Total Cases" value={kpi?.totalCases ?? '—'}
                sub="In selected range" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'totalCases'} onClick={() => handleDrill('totalCases')}
                info="Every case created between the From and To dates you picked above, no matter what stage it's at — still in production, ready to ship, or already delivered." />
              <ColorTile icon={MdInventory2} label="Total Units" value={kpi?.totalUnits ?? '—'}
                sub="In selected range" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'totalCases'} onClick={() => handleDrill('totalCases')}
                info="Total tooth/unit count added up across all those same cases (e.g. a 3-unit bridge counts as 3)." />
              <ColorTile icon={MdBarChart} label="Total Case Value" value={fmtBr(kpi?.totalCaseValue)}
                sub="In selected range" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'totalCases'} onClick={() => handleDrill('totalCases')}
                info="What all of those cases are expected to bill for in total — added together whether the clinic has paid yet or not, and whether the case has been delivered yet or not." />
            </div>

            {/* ── Section 2: Revenue Vs Volume ── */}
            <SectionHeader>Revenue Vs Volume</SectionHeader>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 16 }}>
              <ColorTile icon={MdCheckCircle} label="Total Cases Delivered" value={kpi?.deliveredCases ?? '—'}
                sub="Completed" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'deliveredCases'} onClick={() => handleDrill('deliveredCases')}
                info="Cases actually delivered to the clinic between the From and To dates you picked — regardless of when they were originally created. A case ordered last week and delivered today counts toward today, not last week." />
              <ColorTile icon={MdInventory2} label="Total Units Delivered" value={kpi?.unitsDelivered ?? '—'}
                sub="Completed" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'deliveredCases'} onClick={() => handleDrill('deliveredCases')}
                info="Total units across those same delivered-in-range cases — not the ones still in production." />
              <ColorTile icon={MdBarChart} label="Total Case Value" value={fmtBr(kpi?.deliveredCaseValue)}
                sub="Delivered cases only" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'deliveredCases'} onClick={() => handleDrill('deliveredCases')}
                info="What those delivered-in-range cases are billed for in total — whether it's been paid yet or not. (The 'Total Case Value' above in Financial Projection is a different cohort — cases ordered in this range, not delivered in it.)" />
              <ColorTile icon={MdPaid} label="Verified Payments" value={ETB(kpi?.totalRevenue)}
                sub="Received" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'paymentsReceived'} onClick={() => handleDrill('paymentsReceived')}
                info="Money Finance has checked and confirmed as paid, for cases delivered within this range — regardless of exactly when that payment was verified." />
              <ColorTile icon={MdPendingActions} label="Outstanding Payment" value={ETB(kpi?.outstandingAmount)}
                sub={`${kpi?.outstandingCount ?? 0} unpaid cases`} color="var(--red)" bg="#FFF1F2"
                active={drillKey === 'outstanding'} onClick={() => handleDrill('outstanding')}
                info="Money still owed on cases DELIVERED within this range that haven't been fully paid. A case still in production isn't counted as 'outstanding' — nothing's owed until it ships." />
            </div>

            {/* Collection rate bar — must share the same cohort as the delivered
                "Total Case Value" tile above it (delivered cases created in the
                selected range), not kpi.totalCaseValue (ALL cases, paid or not,
                delivered or not) or kpi.totalRevenue (payments verified in-range
                regardless of when the case was created) — mixing cohorts makes
                the rate meaningless. */}
            {(() => {
              const billableTotal  = kpi?.deliveredCaseValue || 0;
              const outstanding = kpi?.outstandingAmount  || 0;
              const received    = Math.max(billableTotal - outstanding, 0);
              const collectionRate = billableTotal > 0 ? Math.round((received / billableTotal) * 100) : 0;
              const receivedPct    = billableTotal > 0 ? (received / billableTotal) * 100 : 0;
              const outstandingPct = billableTotal > 0 ? (outstanding / billableTotal) * 100 : 0;
              return (
                <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(90deg, #F0A500, #F59E0B)', border: '1px solid rgba(255,255,255,.35)', boxShadow: '0 8px 28px rgba(217,119,6,.25), inset 0 1px 0 rgba(255,255,255,.4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                      Collection Rate
                      <span className="info-icon-wrap" tabIndex={0}>
                        <MdInfoOutline size={13} style={{ opacity: 0.75 }} />
                        <span className="info-tooltip">Of the money billed on delivered cases in this range (Total Case Value, delivered only), what share has actually been collected vs. is still owed. Not paid-for cases still in production — this is purely about delivered work.</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{collectionRate}%</div>
                  </div>
                  <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${receivedPct}%`, background: '#fff', borderRadius: 6, transition: 'width .6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
                    <span>Received {receivedPct.toFixed(1)}%</span>
                    <span>Outstanding {outstandingPct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })()}

            {/* ── Section 3: Operation ── */}
            <SectionHeader>Operation</SectionHeader>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8, marginTop: -4 }}>
              Status breakdown of the same cohort as "Total Cases" above (by order date) — these four always add up exactly.
            </div>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 8 }}>
              <ColorTile icon={MdSettings} label="Total Cases In Progress" value={kpi?.activeCases ?? '—'}
                sub="In production" color="var(--amber)" bg="var(--amber-dim)"
                active={drillKey === 'activeCases'} onClick={() => handleDrill('activeCases')}
                info="Cases actively moving through the lab right now (plaster, scanning, milling, ceramics, QC, etc). Doesn't include cases that are already finished and just waiting to ship — those are counted separately in 'Ready for Delivery & Dispatch', so a case is never counted in both." />
              <ColorTile icon={MdLocalShipping} label="Ready for Delivery & Dispatch" value={kpi?.readyToDispatch ?? '—'}
                sub="Ready to dispatch" color="var(--amber)" bg="var(--amber-dim)"
                active={drillKey === 'readyToDispatch'} onClick={() => handleDrill('readyToDispatch')}
                info="Cases where the lab work is fully done and QC'd — just waiting on payment and/or a driver before they go out. These have left 'In Progress' but aren't 'Delivered' yet." />
              <ColorTile icon={MdCheckCircle} label="Delivered (of these Cases)" value={kpi?.deliveredOfCreated ?? '—'}
                sub="Already shipped" color="var(--green)" bg="var(--green-dim)"
                active={drillKey === 'deliveredOfCreated'} onClick={() => handleDrill('deliveredOfCreated')}
                info="Of the cases ORDERED in this date range, how many have since been delivered — no matter when the delivery itself happened. This is NOT the same figure as 'Total Cases Delivered' in Revenue vs Volume above, which counts by delivery date instead of order date — the two are different questions and won't always match." />
              <ColorTile icon={MdHelpOutline} label="Other / Exception Cases" value={kpi?.otherCases ?? '—'}
                sub="Not in the buckets above" color="var(--gray, #6B7280)" bg="rgba(107,114,128,0.12)"
                active={drillKey === 'otherCases'} onClick={() => handleDrill('otherCases')}
                info="Cases created in this range that don't fall into any bucket above — still awaiting pickup, out for delivery, on hold, flagged with REMAKE status, cancelled, under review, or rejected." />
            </div>
            {kpi && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, fontFamily: 'monospace' }}>
                {(kpi.activeCases ?? 0).toLocaleString()} + {(kpi.readyToDispatch ?? 0).toLocaleString()} + {(kpi.deliveredOfCreated ?? 0).toLocaleString()} + {(kpi.otherCases ?? 0).toLocaleString()} = {((kpi.activeCases ?? 0) + (kpi.readyToDispatch ?? 0) + (kpi.deliveredOfCreated ?? 0) + (kpi.otherCases ?? 0)).toLocaleString()} — matches Total Cases ({(kpi.totalCases ?? 0).toLocaleString()}) ✓
              </div>
            )}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
              <ColorTile icon={MdAutorenew} label="Total Remake" value={kpi?.totalRemakes ?? '—'}
                sub={kpi?.mostCommonRemakeReason ? `Top reason: ${kpi.mostCommonRemakeReason}` : 'In selected range'}
                color="var(--red)" bg="#FFF1F2"
                active={drillKey === 'totalRemakes'} onClick={() => handleDrill('totalRemakes')}
                info="Cases created in this range that were flagged as a remake — redone for the clinic at no extra charge (e.g. shade mismatch, fit issue). This is a flag on a case, not a status — a remake-flagged case can be in ANY of the buckets above (in progress, delivered, etc), so don't add this into the breakdown above." />
              <ColorTile icon={MdSchedule} label="Turn Around Time"
                value={kpi?.avgTurnaroundDays != null ? `${kpi.avgTurnaroundDays}d` : '—'}
                sub="Avg. days to delivery" color="var(--blue)" bg="#EEF2FF"
                info="On average, how many days passed between order and delivery, measured on cases that were DELIVERED within this range (regardless of when they were originally created)." />
              <ColorTile icon={MdTrackChanges} label="% On Time Delivery"
                value={kpi?.onTimeDeliveryPct != null ? `${kpi.onTimeDeliveryPct}%` : '—'}
                sub="Within due date" color="var(--blue)" bg="#EEF2FF"
                info="Of the delivered cases in this range that had a due date set, what percentage were delivered on or before that due date." />
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

            {/* ── Section 4: Inventory ── */}
            <SectionHeader>Inventory</SectionHeader>
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
              <ColorTile icon={MdWarning} label="Low Stock Items" value={invSummary?.lowStockCount ?? '—'}
                sub="Below reorder threshold" color="var(--red)" bg="var(--red-dim)"
                onClick={() => navigate('/admin/inventory')}
                info="Stock items whose quantity on hand has fallen to or below the low-stock alert threshold the Inventory Manager set for them." />
              <ColorTile icon={MdPendingActions} label="Pending Goods Requests" value={invSummary?.pendingRequestsCount ?? '—'}
                sub="Awaiting review" color="var(--amber)" bg="var(--amber-dim)"
                onClick={() => navigate('/admin/inventory')}
                info="Goods requests from lab techs that the Inventory Manager hasn't accepted or rejected yet." />
              <ColorTile icon={MdEmojiEvents} label="Top Milling Bonus Earner" value={topMiller}
                sub="All-time bonus points" color="var(--green)" bg="var(--green-dim)"
                onClick={() => navigate('/admin/inventory')}
                info="The lab tech with the most bonus points earned for yielding more than 30 crowns from a single milling blank." />
            </div>

            {/* ── Charts ── */}
            <div className="glass-card" style={{ marginBottom: 20 }}>
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

            <div className="glass-card" style={{ marginBottom: 20 }}>
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
              <div className="glass-card">
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
              <div className="glass-card">
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
            <div className="glass-card" style={{ marginBottom: 20 }}>
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
                <div className="glass-card">
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
  const [expanded, setExpanded]         = useState(null);
  const [clinicCases, setClinicCases]   = useState({});
  const [loadingClinic, setLoadingClinic] = useState(null);

  const toggleClinic = async (clinicId) => {
    if (expanded === clinicId) { setExpanded(null); return; }
    setExpanded(clinicId);
    if (clinicCases[clinicId]) return;
    setLoadingClinic(clinicId);
    try {
      const res = await api.get('/payments/trusted', { params: { clinicId, limit: 200 } });
      setClinicCases(prev => ({ ...prev, [clinicId]: res.data?.cases ?? [] }));
    } catch {}
    finally { setLoadingClinic(null); }
  };

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
    <div className="glass-card" style={{ marginTop: 20 }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdHandshake className="mi" size={16} /> Trusted Partners Summary</div>
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
              <React.Fragment key={c.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => toggleClinic(c.id)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: '#6D28D9', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        {c.phone && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.phone}</div>}
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F5F3FF', color: '#6D28D9', fontWeight: 700 }}><MdHandshake size={11} /> Trusted</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>{n(c.totalOrders)}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{n(c.totalUnits) || '—'}</td>
                  <td style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{n(c.deliveredOrders)}</td>
                  <td style={{ textAlign: 'center', color: 'var(--amber)', fontWeight: 600 }}>{n(c.inProgress)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{ETBa(c.totalRevenue)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{ETBa(c.paymentsReceived)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: c.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {ETBa(c.outstanding)}
                    <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>{expanded === c.id ? '▲' : '▼'}</span>
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0, background: 'var(--surface-2)' }}>
                      {loadingClinic === c.id ? (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading cases…</div>
                      ) : (clinicCases[c.id] || []).length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No outstanding cases</div>
                      ) : (
                        <table style={{ width: '100%', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--border)' }}>
                              <th style={{ padding: '6px 12px 6px 40px', textAlign: 'left' }}>Case #</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left' }}>Patient</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left' }}>Work Type</th>
                              <th style={{ padding: '6px 12px', textAlign: 'center' }}>Units</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left' }}>Status</th>
                              <th style={{ padding: '6px 12px', textAlign: 'right' }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(clinicCases[c.id] || []).map(cas => (
                              <tr key={cas.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '7px 12px 7px 40px', fontFamily: 'DM Mono, monospace', color: 'var(--blue)' }}>{cas.caseNumber}</td>
                                <td style={{ padding: '7px 12px', fontWeight: 600 }}>{cas.patientName}</td>
                                <td style={{ padding: '7px 12px', color: 'var(--text-2)' }}>{cas.workType}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'center' }}>{cas.units ?? '—'}</td>
                                <td style={{ padding: '7px 12px' }}><StatusBadge status={cas.status} /></td>
                                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                                  {cas.totalAmount ? `Br ${cas.totalAmount.toLocaleString('en-US')}` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
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
