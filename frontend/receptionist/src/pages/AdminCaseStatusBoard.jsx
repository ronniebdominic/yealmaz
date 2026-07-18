// Ye-Almaz — Case Status Board (Admin)
// Granular, per-department view of the production pipeline — complements
// Case Management's coarser "In Production" grouping with one filter chip
// per lab department, each showing a live case count.

import { useState, useMemo } from 'react';
import AdminLayout from '../components/AdminLayout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import CaseDetailModal from '../components/CaseDetailModal';
import ExportMenu from '../components/ExportMenu';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
import { printCaseLabel } from '../utils/printLabel';
import api from '../api';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  MdAssignment, MdMoveToInbox, MdScience, MdContentCut, MdBiotech,
  MdComputer, MdSettings, MdPrint, MdBuild, MdPalette, MdAccountBalance,
  MdDiamond, MdAutoAwesome, MdLocalFireDepartment, MdSearch, MdInventory2,
  MdPrecisionManufacturing, MdVisibility,
} from 'react-icons/md';

const PAGE_SIZE = 25;

// One chip per lab-production stage (Accepted → Quality Check → Ready to
// Dispatch), matching the department vocabulary used on the Lab Dashboard's
// scan screen (scan.js DEPARTMENTS) so the label here means the same thing
// there.
const STATUS_FILTERS = [
  { label: 'All',              value: '',                            icon: MdAssignment },
  { label: 'Accepted',         value: 'CASE_ACCEPTED',               icon: MdMoveToInbox },
  { label: 'Plaster',          value: 'PLASTER_DEPARTMENT',          icon: MdScience },
  { label: 'Margin',           value: 'MARGIN_DEPARTMENT',           icon: MdContentCut },
  { label: 'Scanning',         value: 'SCANNING',                    icon: MdBiotech },
  { label: 'Designing',        value: 'DESIGNING',                   icon: MdComputer },
  { label: 'Milling/Sintering',value: 'MILLING_SINTERING',           icon: MdSettings },
  { label: 'Resin 3D Print',   value: 'RESIN_3D_PRINTING',           icon: MdPrint },
  { label: 'Metal 3D Print',   value: 'METAL_3D_PRINTING',           icon: MdBuild },
  { label: 'Metal Finishing',  value: 'METAL_FINISHING',             icon: MdBuild },
  { label: 'Opaque',           value: 'OPAQUE_APPLICATION',          icon: MdPalette },
  { label: 'Ceramic',          value: 'CERAMIC_LAYERING',            icon: MdAccountBalance },
  { label: 'Zirconia Fitting', value: 'ZIRCONIA_FITTING_FINISHING',  icon: MdDiamond },
  { label: 'Glazing',          value: 'GLAZING',                     icon: MdAutoAwesome },
  { label: 'Thermo Press',     value: 'THERMO_PRESS',                icon: MdLocalFireDepartment },
  { label: 'Trimming',         value: 'TRIMMING',                    icon: MdContentCut },
  { label: 'Quality Check',    value: 'QUALITY_CHECK',               icon: MdSearch },
  { label: 'Ready to Dispatch',value: 'READY_TO_DISPATCH',           icon: MdInventory2 },
];

// ── Clickable department card ─────────────────────────────
function DeptCard({ icon: Icon, label, count, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
        background: active ? 'var(--blue)' : 'var(--surface)',
        border: `1.5px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
        boxShadow: active ? '0 4px 14px rgba(26,86,160,0.25)' : 'var(--shadow, none)',
        transition: 'transform .1s, box-shadow .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 20, display: 'flex' }}>{Icon && <Icon size={20} />}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: active ? '#fff' : 'var(--text-1)' }}>{count}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: active ? 'rgba(255,255,255,0.9)' : 'var(--text-2)' }}>
        {label}
      </div>
    </div>
  );
}

const PAYMENT_FILTERS = [
  { label: 'All Payments', value: '' },
  { label: 'Unpaid',       value: 'PENDING' },
  { label: 'Screenshot',   value: 'SCREENSHOT_UPLOADED' },
  { label: 'Verified',     value: 'VERIFIED' },
  { label: 'Rejected',     value: 'REJECTED' },
];

export default function AdminCaseStatusBoard() {
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [payFilter,    setPayFilter]    = useState('');
  const [clinicId,     setClinicId]     = useState('');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [page,         setPage]         = useState(1);
  const [viewCase,     setViewCase]     = useState(null);

  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  // Live count per status — a standalone snapshot of "how many cases are in
  // each department right now," independent of the search/date filters below.
  const { data: statusCounts = [] } = useQuery({
    queryKey: ['dashboard', 'cases-by-status'],
    queryFn: () => api.get('/dashboard/cases-by-status').then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const countMap = useMemo(
    () => Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
    [statusCounts]
  );
  // "All" card = sum of just the pipeline departments listed below (not every
  // status in the system — e.g. excludes DELIVERED/CANCELLED/pickup stages).
  const allDeptCount = useMemo(
    () => STATUS_FILTERS.filter(f => f.value).reduce((sum, f) => sum + (countMap[f.value] ?? 0), 0),
    [countMap]
  );

  const changeFilter = (setter) => (val) => { setter(val); setPage(1); };

  const params = useMemo(() => {
    const p = { limit: PAGE_SIZE, page, sortBy: 'date', sortDir: 'desc' };
    if (statusFilter) p.status        = statusFilter;
    if (payFilter)    p.paymentStatus = payFilter;
    if (search)       p.search        = search;
    if (clinicId)     p.clinicId      = clinicId;
    if (dateFrom)     p.dateFrom      = dateFrom;
    if (dateTo)       p.dateTo        = dateTo;
    return p;
  }, [statusFilter, payFilter, search, clinicId, dateFrom, dateTo, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'case-status-board', params],
    queryFn: () => api.get('/cases', { params }).then(r => r.data),
    staleTime: 20_000,
  });

  const cases      = data?.cases      || [];
  const pagination = data?.pagination || {};

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><MdPrecisionManufacturing className="mi" size={18} /> Case Status Board</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{pagination.total ?? 0} matching cases</div>
          <ExportMenu
            fetchData={() => api.get('/cases', { params: { ...params, limit: 9999, page: 1 } }).then(r => r.data.cases ?? [])}
            columns={[
              { header: 'Case #',    value: c => c.caseNumber },
              { header: 'Clinic',    value: c => c.clinic?.name },
              { header: 'Patient',   value: c => c.patientName },
              { header: 'Work Type', value: c => c.workType },
              { header: 'Units',     value: c => c.units ?? '' },
              { header: 'Amount',    value: c => c.payment?.amount ?? c.totalAmount ?? '' },
              { header: 'Status',    value: c => c.status },
              { header: 'Payment',   value: c => c.paymentStatus },
              { header: 'Order Date',value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
            ]}
            filename="case-status-board"
            title="Case Status Board"
          />
        </div>
      </div>

      <div className="content">
        {/* Search + date range + clinic */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
            <span className="icon mi"><MdSearch size={16} /></span>
            <input
              placeholder="Search by clinic, patient name or case number…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
          </div>
          <SearchableSelect
            value={clinicId}
            onChange={v => { setClinicId(v); setPage(1); }}
            options={clinicList.map(c => ({ value: c.id, label: c.name }))}
            placeholder="All Clinics"
            style={{ minWidth: 200 }}
          />
          {(statusFilter || payFilter || search || clinicId || dateFrom || dateTo) && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}
              onClick={() => { setStatusFilter(''); setPayFilter(''); setSearch(''); setClinicId(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            >
              ✕ Clear All
            </button>
          )}
        </div>

        {/* Per-department status cards, each with a live count */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
          {STATUS_FILTERS.map(f => (
            <DeptCard
              key={f.value}
              icon={f.icon}
              label={f.label}
              count={f.value ? (countMap[f.value] ?? 0) : allDeptCount}
              active={statusFilter === f.value}
              onClick={() => changeFilter(setStatusFilter)(f.value)}
            />
          ))}
        </div>

        {/* Payment filters */}
        <div className="filters" style={{ marginBottom: 20 }}>
          {PAYMENT_FILTERS.map(f => (
            <button key={f.value} className={`filter-chip ${payFilter === f.value ? 'active' : ''}`}
              onClick={() => changeFilter(setPayFilter)(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="card">
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading cases…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdAssignment size={32} /></div>
                <div className="empty-title">No cases match your filters</div>
                <p>Try adjusting the search, date range, or department filter</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
                    <th style={{ width: 70 }}>Units</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Date</th>
                    <th style={{ minWidth: 150 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber || '—'}</span></td>
                      <td style={{ fontSize: 13 }}>{c.clinic?.name}</td>
                      <td>
                        <span className="patient-name">{c.patientName}</span>
                        {c.doctorName && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Dr. {c.doctorName}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{c.workType}</td>
                      <td style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {(c.payment?.amount ?? c.totalAmount)
                          ? `Br ${(c.payment?.amount ?? c.totalAmount).toLocaleString('en-US')}`
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} isExcluded={c.clinic?.isExcluded} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewCase(c)}><MdVisibility className="mi" size={14} /> View</button>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={!c.qrCodeUrl}
                            title={c.qrCodeUrl ? 'Print production label' : 'No QR code on this case yet'}
                            onClick={() => printCaseLabel(c)}
                          >
                            <MdPrint className="mi" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Pagination
              page={page}
              totalPages={pagination.totalPages || 1}
              total={pagination.total || 0}
              pageSize={PAGE_SIZE}
              onPrev={() => setPage(p => p - 1)}
              onNext={() => setPage(p => p + 1)}
            />
          </div>
        </div>
      </div>

      {viewCase && (
        <CaseDetailModal caseId={viewCase.id} onClose={() => setViewCase(null)} />
      )}
    </AdminLayout>
  );
}
