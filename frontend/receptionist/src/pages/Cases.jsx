import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import CaseDetailModal from '../components/CaseDetailModal';

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

export default function Cases() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [pagination, setPagination] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    loadCases();
  }, [filter, search]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (filter) params.status = filter;
      if (search) params.search = search;
      const res = await api.get('/cases', { params });
      setCases(res.data.cases);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
        {/* Search + Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: '200px' }}>
            <span className="icon">🔍</span>
            <input
              placeholder="Search patient name or case number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="filters">
          {FILTERS.map(f => (
            <button
              key={f.value}
              className={`filter-chip ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
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
            {loading ? (
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
                    <th>Patient</th>
                    <th>Clinic</th>
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
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td>{c.clinic?.name}</td>
                      <td>{c.workType}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                        {c.dueDate ? format(new Date(c.dueDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSelectedCase(c)}
                        >
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
      </div>

      {selectedCase && (
        <CaseDetailModal
          caseId={selectedCase.id}
          onClose={() => { setSelectedCase(null); loadCases(); }}
        />
      )}
    </Layout>
  );
}
