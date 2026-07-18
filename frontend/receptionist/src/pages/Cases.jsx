import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import SearchableSelect from '../components/SearchableSelect';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api, { downloadExport } from '../api';
import { format } from 'date-fns';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CaseDetailModal from '../components/CaseDetailModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MdFileDownload, MdSearch, MdAutorenew, MdAssignment } from 'react-icons/md';

const STATUS_FILTERS = [
  { label: 'All',             value: '' },
  { label: 'Awaiting Pickup', value: 'PENDING_PICKUP' },
  { label: 'Pickup Assigned', value: 'PICKUP_ASSIGNED' },
  { label: 'Accepted',        value: 'CASE_ACCEPTED' },
  { label: 'CAD/CAM',         value: 'DESIGNING' },
  { label: 'Manufacturing',   value: 'MILLING_SINTERING' },
  { label: 'Ceramic',         value: 'CERAMIC_LAYERING' },
  { label: 'Quality Check',   value: 'QUALITY_CHECK' },
  { label: 'Ready to Ship',   value: 'READY_TO_DISPATCH' },
  { label: 'Delivered',       value: 'DELIVERED' },
];

// Statuses that map to "In Production" — passed as comma-separated from dashboard
const PRODUCTION_STATUSES = [
  'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
  'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
  'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
  'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
].join(',');

const PAGE_SIZE = 20;

export default function Cases() {
  const [searchParams] = useSearchParams();
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  // Initialise from URL query params (set by dashboard card clicks)
  const [filter,    setFilter]    = useState(searchParams.get('status') || '');
  const [search,    setSearch]    = useState(searchParams.get('search') || '');
  const [clinicId,  setClinicId]  = useState(searchParams.get('clinicId') || '');
  const [dateFrom,  setDateFrom]  = useState(searchParams.get('dateFrom') || '');
  const [dateTo,    setDateTo]    = useState(searchParams.get('dateTo') || '');
  const [remake,    setRemake]    = useState(searchParams.get('remake') === 'true');
  const [redo,      setRedo]      = useState(searchParams.get('redo') === 'true');
  // multi-status override (e.g. all production statuses)
  const [multiStatus, setMultiStatus] = useState(searchParams.get('multiStatus') || '');
  const [page,      setPage]      = useState(1);
  const [selectedCase, setSelectedCase] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Active filter label for banner
  const filterLabel = searchParams.get('label') || '';

  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const queryParams = () => {
    const p = { limit: PAGE_SIZE, page };
    const statusValue = multiStatus || filter;
    if (statusValue) p.status   = statusValue;
    if (search)      p.search   = search;
    if (clinicId)    p.clinicId = clinicId;
    if (dateFrom)    p.dateFrom = dateFrom;
    if (dateTo)      p.dateTo   = dateTo;
    if (remake)      p.remake   = 'true';
    if (redo)        p.redo     = 'true';
    return p;
  };

  const { data, isLoading } = useQuery({
    queryKey: ['cases', filter, multiStatus, search, clinicId, dateFrom, dateTo, remake, redo, page],
    queryFn: () => api.get('/cases', { params: queryParams() }).then(r => r.data),
    staleTime: 30_000,
    keepPreviousData: true,
  });

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadExport('/cases/export', queryParams(), `cases_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const cases      = data?.cases      || [];
  const pagination = data?.pagination || {};

  const reset = () => {
    setFilter(''); setSearch(''); setClinicId('');
    setDateFrom(''); setDateTo('');
    setRemake(false); setRedo(false); setMultiStatus('');
    setPage(1);
    navigate('/cases', { replace: true });
  };

  const hasFilters = filter || search || clinicId || dateFrom || dateTo || remake || redo || multiStatus;

  return (
    <Layout>
      <div className="topbar">
        <div className="topbar-title">All Cases</div>
        <div className="topbar-right" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting}>
            {exporting ? 'Exporting…' : <><MdFileDownload className="mi" size={14} /> Export Excel</>}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>
            + New Case
          </button>
        </div>
      </div>

      <div className="content">
        {/* Active filter banner (shown when arriving from a dashboard card) */}
        {filterLabel && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
            background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 10,
            padding: '10px 16px', marginBottom: 14, fontSize: 13,
          }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <MdSearch size={14} /> Filtered: <strong>{filterLabel}</strong>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={reset} style={{ color: 'var(--red)' }}>
              ✕ Clear filter
            </button>
          </div>
        )}

        {/* Search + date + clinic row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 2, minWidth: 200 }}>
            <span className="icon mi"><MdSearch size={16} /></span>
            <input
              placeholder="Search by clinic, patient name or case number…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>FROM</div>
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>TO</div>
            <input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
          </div>
          <SearchableSelect
            value={clinicId}
            onChange={v => { setClinicId(v); setPage(1); }}
            options={clinicList.map(c => ({ value: c.id, label: c.name }))}
            placeholder="All Clinics"
            style={{ minWidth: 160 }}
          />
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={reset} style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>
              ✕ Clear all
            </button>
          )}
        </div>

        {/* Status filter chips */}
        <div className="filters" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`filter-chip ${!multiStatus && filter === f.value ? 'active' : ''}`}
              onClick={() => { setFilter(f.value); setMultiStatus(''); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
          {/* Extra chips for special filters from dashboard */}
          {remake && (
            <button className="filter-chip active" style={{ background: 'var(--red)', color: '#fff' }}
              onClick={() => { setRemake(false); setPage(1); }}>
              <MdAutorenew className="mi" size={13} /> Remake ✕
            </button>
          )}
          {redo && (
            <button className="filter-chip active" style={{ background: 'var(--amber)', color: '#fff' }}
              onClick={() => { setRedo(false); setPage(1); }}>
              <MdAutorenew className="mi" size={13} /> Redo ✕
            </button>
          )}
          {multiStatus && (
            <button className="filter-chip active"
              onClick={() => { setMultiStatus(''); setPage(1); }}>
              In Production ✕
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
            {pagination.total ?? 0} cases
          </span>
        </div>

        <div className="card">
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading cases…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon mi"><MdAssignment size={32} /></div>
                <div className="empty-title">No cases found</div>
                <p>Try a different clinic, filter or search term</p>
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
                    <th>Order Date</th>
                    <th>Delivered On</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--text-1)' }}>{c.clinic?.name}</td>
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td>{c.workType}</td>
                      <td style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)' }}>
                        {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedCase(c)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Page {page} of {pagination.totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page === pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {selectedCase && (
        <CaseDetailModal
          caseId={selectedCase.id}
          onClose={() => { setSelectedCase(null); queryClient.invalidateQueries({ queryKey: ['cases'] }); }}
        />
      )}
    </Layout>
  );
}
