import { useState } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import CaseDetailModal from '../components/CaseDetailModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

const PAGE_SIZE = 20;

const selectStyle = {
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 12px', fontSize: 13, color: 'var(--text-1)',
  background: 'var(--surface)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
};

export default function Cases() {
  const [filter,    setFilter]    = useState('');
  const [search,    setSearch]    = useState('');
  const [clinicId,  setClinicId]  = useState('');
  const [page,      setPage]      = useState(1);
  const [selectedCase, setSelectedCase] = useState(null);
  const navigate    = useNavigate();
  const queryClient = useQueryClient();

  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['cases', filter, search, clinicId, page],
    queryFn: () => {
      const params = { limit: PAGE_SIZE, page };
      if (filter)   params.status   = filter;
      if (search)   params.search   = search;
      if (clinicId) params.clinicId = clinicId;
      return api.get('/cases', { params }).then(r => r.data);
    },
    staleTime: 30_000,
    keepPreviousData: true,
  });

  const cases      = data?.cases      || [];
  const pagination = data?.pagination || {};

  const reset = () => { setFilter(''); setSearch(''); setClinicId(''); setPage(1); };
  const hasFilters = filter || search || clinicId;

  return (
    <Layout>
      <div className="topbar">
        <div className="topbar-title">All Cases</div>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>
            + New Case
          </button>
        </div>
      </div>

      <div className="content">
        {/* Search + clinic selector row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: 200 }}>
            <span className="icon">🔍</span>
            <input
              placeholder="Search by clinic, patient name or case number…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            value={clinicId}
            onChange={e => { setClinicId(e.target.value); setPage(1); }}
            style={{ ...selectStyle, minWidth: 180 }}
          >
            <option value="">All Clinics</option>
            {clinicList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={reset} style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Status filter chips */}
        <div className="filters" style={{ marginBottom: 14 }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`filter-chip ${filter === f.value ? 'active' : ''}`}
              onClick={() => { setFilter(f.value); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
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
                <div className="empty-icon">📋</div>
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
                    <th>Due Date</th>
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
                        {c.dueDate
                          ? format(new Date(c.dueDate), 'dd MMM yyyy')
                          : c.payment?.verifiedAt
                            ? <span title="Delivery date">📦 {format(new Date(c.payment.verifiedAt), 'dd MMM yyyy')}</span>
                            : '—'}
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
