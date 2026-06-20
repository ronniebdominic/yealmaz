import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

// ─── Data fetchers ────────────────────────────────────────
const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);

// ─── Accept Cases Section ─────────────────────────────────
function AcceptCasesSection({ queryClient }) {
  const [acceptingId, setAcceptingId]   = useState(null); // case id with open note form
  const [notes, setNotes]               = useState({});   // { caseId: noteText }
  const [submitting, setSubmitting]     = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cases', 'to-accept'],
    queryFn: () => api.get('/cases', {
      params: { status: 'PENDING_PICKUP,PICKUP_ASSIGNED', limit: 50 }
    }).then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const cases = data?.cases ?? [];
  const pending  = cases.filter(c => c.status === 'PENDING_PICKUP');
  const inTransit = cases.filter(c => c.status === 'PICKUP_ASSIGNED');

  const handleAccept = async (c) => {
    setSubmitting(true);
    try {
      await api.patch(`/cases/${c.id}/status`, {
        status: 'CASE_ACCEPTED',
        notes: notes[c.id]?.trim() || undefined,
      });
      toast.success(`✓ ${c.caseNumber} accepted`);
      setAcceptingId(null);
      setNotes(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
      refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to accept case');
    } finally {
      setSubmitting(false);
    }
  };

  const CaseCard = ({ c }) => {
    const isOpen = acceptingId === c.id;
    const isTransit = c.status === 'PICKUP_ASSIGNED';
    return (
      <div style={{
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${isTransit ? 'var(--accent)' : 'var(--text-3)'}`,
        padding: '14px 18px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="case-number">{c.caseNumber}</span>
              <StatusBadge status={c.status} />
              {c.remake && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#FFF1F2', color: 'var(--red)' }}>🔄 Remake</span>}
              {c.redo   && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)' }}>♻️ Redo</span>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{c.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2 }}>
              {c.workType}{c.units != null ? ` · ${c.units} unit${c.units !== 1 ? 's' : ''}` : ''}{' · '}🏥 {c.clinic?.name}
            </div>
            {c.doctorName && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>👨‍⚕️ {c.doctorName}{c.doctorPhone ? ` · ${c.doctorPhone}` : ''}</div>}
            {c.shade && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>🎨 Shade: <strong>{c.shade}</strong></div>}
            {c.assignedDelivery && (
              <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>
                🛵 {c.assignedDelivery.name.replace('Yealmaz Delivery Executive ', 'Driver ')}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Registered {format(new Date(c.createdAt), 'dd MMM yyyy, h:mm a')}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
            {isTransit && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setAcceptingId(isOpen ? null : c.id)}
              >
                {isOpen ? '✕ Cancel' : '✓ Accept Case'}
              </button>
            )}
            {!isTransit && (
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Awaiting pickup</span>
            )}
          </div>
        </div>

        {/* Inline accept form */}
        {isOpen && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
              📝 Add a note (e.g. shade confirmation, info needed from dentist)
            </div>
            <textarea
              rows={3}
              placeholder="e.g. Shade B1 confirmed. Please clarify occlusion on tooth 14…"
              value={notes[c.id] || ''}
              onChange={e => setNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', resize: 'vertical',
                fontFamily: 'inherit', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => handleAccept(c)}
                disabled={submitting}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {submitting ? 'Accepting…' : '✓ Confirm Acceptance'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAcceptingId(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>;

  return (
    <>
      {/* In Transit — ready to accept */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">📥 In Transit — Ready to Accept</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{inTransit.length} case{inTransit.length !== 1 ? 's' : ''}</span>
        </div>
        {inTransit.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <div className="empty-title">No cases in transit</div>
            <p>Cases picked up by drivers will appear here for acceptance.</p>
          </div>
        ) : (
          <div>{inTransit.map(c => <CaseCard key={c.id} c={c} />)}</div>
        )}
      </div>

      {/* Awaiting Pickup */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🛵 Awaiting Pickup</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pending.length} case{pending.length !== 1 ? 's' : ''}</span>
        </div>
        {pending.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <div className="empty-title">No cases waiting for pickup</div>
          </div>
        ) : (
          <div>{pending.map(c => <CaseCard key={c.id} c={c} />)}</div>
        )}
      </div>
    </>
  );
}

// ─── Ready Orders Section ─────────────────────────────────
function ReadyOrdersSection() {
  const [search, setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [applied, setApplied] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [page, setPage]       = useState(1);

  const apply = () => { setApplied({ search, dateFrom, dateTo }); setPage(1); };
  const clear  = () => {
    setSearch(''); setDateFrom(''); setDateTo('');
    setApplied({ search: '', dateFrom: '', dateTo: '' });
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['ready-orders', applied, page],
    queryFn: () => api.get('/cases', {
      params: {
        status: 'READY_TO_DISPATCH',
        limit: 20, page,
        ...(applied.search   ? { search: applied.search }     : {}),
        ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
        ...(applied.dateTo   ? { dateTo: applied.dateTo }     : {}),
      }
    }).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const cases = data?.cases ?? [];
  const pagination = data?.pagination ?? {};

  return (
    <>
      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 180 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Search</div>
            <div className="search-input" style={{ margin: 0 }}>
              <span className="icon">🔍</span>
              <input
                placeholder="Clinic name, case no., patient…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && apply()}
              />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Order Date From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={apply}>Apply</button>
            {(applied.search || applied.dateFrom || applied.dateTo) && (
              <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">🚚 Ready for Delivery / Dispatch</div>
          {pagination.total != null && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pagination.total} case{pagination.total !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="table-wrap">
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : cases.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎉</div>
              <div className="empty-title">No ready orders{(applied.search || applied.dateFrom || applied.dateTo) ? ' matching filters' : ''}</div>
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
                  <th>Due Date</th>
                  <th>Order Date</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => {
                  const overdue = c.dueDate && new Date(c.dueDate) < new Date() && c.status !== 'DELIVERED';
                  return (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber}</span></td>
                      <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td style={{ fontSize: 13 }}>{c.workType}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                      <td style={{ fontWeight: 600, color: 'var(--green)' }}>
                        {c.payment?.amount != null ? `Br ${c.payment.amount.toLocaleString('en-US')}` :
                         c.totalAmount != null ? `Br ${c.totalAmount.toLocaleString('en-US')}` : '—'}
                      </td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                      <td style={{ fontSize: 12, color: overdue ? 'var(--red)' : 'var(--text-3)', fontWeight: overdue ? 700 : 400 }}>
                        {c.dueDate ? format(new Date(c.dueDate), 'dd MMM') : '—'}
                        {overdue ? ' ⚠' : ''}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
            <span style={{ color: 'var(--text-3)' }}>Page {page} of {pagination.totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>← Prev</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Track Order Section ──────────────────────────────────
function TrackOrderSection() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['track-order', submitted],
    queryFn: () => submitted
      ? api.get('/cases', { params: { search: submitted, limit: 30 } }).then(r => r.data)
      : null,
    enabled: !!submitted,
    staleTime: 30_000,
  });

  const cases = data?.cases ?? [];

  return (
    <>
      <div className="card" style={{ marginBottom: 16, padding: '18px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>🔍 Search / Track Order Status</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="search-input" style={{ flex: 1, margin: 0 }}>
            <span className="icon">🔍</span>
            <input
              placeholder="Case number, patient name, or clinic…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setSubmitted(search)}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setSubmitted(search)} disabled={!search.trim()}>
            Search
          </button>
          {submitted && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSubmitted(''); }}>Clear</button>
          )}
        </div>
      </div>

      {submitted && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Results for "{submitted}"</div>
            {data && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.pagination?.total ?? cases.length} found</span>}
          </div>
          <div className="table-wrap">
            {isLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Searching…</div>
            ) : cases.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <div className="empty-title">No cases found</div>
                <p>Try a different case number, patient name, or clinic.</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Due Date</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber}</span></td>
                      <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                      <td><span className="patient-name">{c.patientName}</span></td>
                      <td style={{ fontSize: 13 }}>{c.workType}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {c.dueDate ? format(new Date(c.dueDate), 'dd MMM yyyy') : '—'}
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
        </div>
      )}
    </>
  );
}

// ─── Main Reception Dashboard ─────────────────────────────
const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard',      icon: '📊' },
  { id: 'accept',    label: 'Accept Case',    icon: '📥' },
  { id: 'ready',     label: 'Ready Orders',   icon: '🚚' },
  { id: 'track',     label: 'Track Order',    icon: '🔍' },
];

export default function Dashboard() {
  const navigate    = useNavigate();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [section, setSection] = useState('dashboard');
  const [open, setOpen]       = useState(false);

  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // Counts for badges
  const { data: acceptBadge } = useQuery({
    queryKey: ['cases', 'accept-badge'],
    queryFn: () => api.get('/cases', { params: { status: 'PICKUP_ASSIGNED', limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const { data: readyBadge } = useQuery({
    queryKey: ['cases', 'ready-badge'],
    queryFn: () => api.get('/cases', { params: { status: 'READY_TO_DISPATCH', limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { stats } = summary || {};
  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'RX';

  const nav = (id) => { setSection(id); setOpen(false); };

  const badges = {
    accept: acceptBadge || 0,
    ready:  readyBadge  || 0,
  };

  const NavList = ({ close }) => (
    <nav className="sidebar-nav">
      <div className="nav-section-label">Reception</div>
      {SECTIONS.map(s => (
        <button
          key={s.id}
          className={`nav-item${section === s.id ? ' active' : ''}`}
          onClick={() => { setSection(s.id); if (close) close(); }}
        >
          <span>{s.icon}</span> {s.label}
          {badges[s.id] > 0 && <span className="badge-count">{badges[s.id]}</span>}
        </button>
      ))}

      <div className="nav-section-label">Cases</div>
      <button className="nav-item" onClick={() => navigate('/cases/new')}>
        <span>➕</span> New Case
      </button>
      <button className="nav-item" onClick={() => navigate('/cases')}>
        <span>📋</span> All Cases
      </button>
    </nav>
  );

  return (
    <div className="app">
      {/* Mobile topbar */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title">
          {SECTIONS.find(s => s.id === section)?.icon}{' '}
          {SECTIONS.find(s => s.id === section)?.label ?? 'Reception'}
        </span>
        <div className="live-dot" />
      </div>

      {/* Drawer overlay */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* Drawer */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">Receptionist</span>
        </div>
        <NavList close={() => setOpen(false)} />
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div><div className="user-name">{user?.name}</div><div className="user-role">Receptionist</div></div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </div>

      {/* Sidebar (desktop) */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge">Receptionist</span>
        </div>
        <NavList />
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div><div className="user-name">{user?.name}</div><div className="user-role">Receptionist</div></div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main">
        <div className="topbar">
          <div className="topbar-title">
            {SECTIONS.find(s => s.id === section)?.icon}{' '}
            {SECTIONS.find(s => s.id === section)?.label ?? 'Dashboard'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>+ New Case</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
              <div className="live-dot" /> Live
            </div>
          </div>
        </div>

        <div className="content">

          {/* ── Dashboard ── */}
          {section === 'dashboard' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Today's Overview
              </div>
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: '#EEF2FF' }}>📋</div>
                  <div className="stat-label">Orders Today</div>
                  <div className="stat-value">{stats?.todayCases ?? '—'}</div>
                  <div className="stat-sub">New cases today</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setSection('accept')}>
                  <div className="stat-icon" style={{ background: '#FFF1F2' }}>🔄</div>
                  <div className="stat-label">Remake Today</div>
                  <div className="stat-value" style={{ color: stats?.remakeCount > 0 ? 'var(--red)' : 'var(--text-1)' }}>
                    {stats?.remakeCount ?? '—'}
                  </div>
                  <div className="stat-sub">Remakes submitted today</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: '#FFF7ED' }}>♻️</div>
                  <div className="stat-label">Redo Today</div>
                  <div className="stat-value" style={{ color: stats?.redoCases > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
                    {stats?.redoCases ?? '—'}
                  </div>
                  <div className="stat-sub">Redo cases today</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
                  <div className="stat-label">Delivered Today</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{stats?.deliveredToday ?? '—'}</div>
                  <div className="stat-sub">Completed today</div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Current Workload
              </div>
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setSection('accept')}>
                  <div className="stat-icon" style={{ background: '#FFF7ED' }}>🛵</div>
                  <div className="stat-label">Awaiting Pickup</div>
                  <div className="stat-value" style={{ color: '#EA580C' }}>{stats?.pendingPickups ?? '—'}</div>
                  <div className="stat-sub">View Accept Cases ↗</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>⏳</div>
                  <div className="stat-label">In Production</div>
                  <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats?.pendingCases ?? '—'}</div>
                  <div className="stat-sub">Active in lab</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setSection('ready')}>
                  <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}>🚚</div>
                  <div className="stat-label">Ready to Dispatch</div>
                  <div className="stat-value" style={{ color: stats?.readyToDispatch > 0 ? 'var(--accent)' : 'var(--text-1)' }}>
                    {stats?.readyToDispatch ?? '—'}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--accent)', fontWeight: 600 }}>View Ready Orders ↗</div>
                </div>
              </div>
            </>
          )}

          {/* ── Accept Case ── */}
          {section === 'accept' && (
            <AcceptCasesSection queryClient={queryClient} />
          )}

          {/* ── Ready Orders ── */}
          {section === 'ready' && (
            <ReadyOrdersSection />
          )}

          {/* ── Track Order ── */}
          {section === 'track' && (
            <TrackOrderSection />
          )}

        </div>
      </main>
    </div>
  );
}
