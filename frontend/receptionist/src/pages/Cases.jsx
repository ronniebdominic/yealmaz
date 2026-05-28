import { useState } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import CaseDetailModal from '../components/CaseDetailModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const FILTERS = [
  { label: 'All',            value: '' },
  { label: 'Accepted',       value: 'CASE_ACCEPTED' },
  { label: 'CAD/CAM',        value: 'DESIGNING' },
  { label: 'Manufacturing',  value: 'MILLING_SINTERING' },
  { label: 'Ceramic',        value: 'CERAMIC_LAYERING' },
  { label: 'Quality Check',  value: 'QUALITY_CHECK' },
  { label: 'Ready to Ship',  value: 'READY_TO_DISPATCH' },
  { label: 'Delivered',      value: 'DELIVERED' },
];

const PAGE_SIZE = 20;

export default function Cases() {
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCase, setSelectedCase] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['cases', filter, search, page],
    queryFn: () => {
      const params = { limit: PAGE_SIZE, page };
      if (filter) params.status = filter;
      if (search) params.search = search;
      return api.get('/cases', { params }).then(r => r.data);
    },
    staleTime: 30_000,
    keepPreviousData: true,
  });

  const cases = data?.cases || [];
  const pagination = data?.pagination || {};

  const changeFilter = (f) => { setFilter(f); setPage(1); };
  const changeSearch = (s) => { setSearch(s); setPage(1); };

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
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: '200px' }}>
            <span className="icon">🔍</span>
            <input
              placeholder="Search patient name or case number…"
              value={search}
              onChange={e => changeSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="filters">
          {FILTERS.map(f => (
            <button
              key={f.value}
              className={`filter-chip ${filter === f.value ? 'active' : ''}`}
              onClick={() => changeFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-3)' }}>
            {pagination.total ?? 0} cases
          </span>
        </div>

        <div className="card">
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-3)' }}>Loading cases…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No cases found</div>
                <p>Try a different filter or search term</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
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
                      <td>{c.clinic?.name}</td>
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td>{c.workType}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                        {c.dueDate ? format(new Date(c.dueDate), 'dd MMM yyyy') : '—'}
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

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>
              Page {page} of {pagination.totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={page === pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {selectedCase && (
        <CaseDetailModal
          caseId={selectedCase.id}
          onClose={() => {
            setSelectedCase(null);
            queryClient.invalidateQueries({ queryKey: ['cases'] });
          }}
        />
      )}
    </Layout>
  );
}
