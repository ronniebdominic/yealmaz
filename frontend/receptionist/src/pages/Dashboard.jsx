import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import FilterBar from '../components/FilterBar';
import ExportMenu from '../components/ExportMenu';
import api from '../api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';

// ─── Data fetchers ────────────────────────────────────────
const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);

const PRODUCTION_STATUSES = [
  'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
  'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
  'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
  'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
].join(',');

// ─── Accept Cases Section ─────────────────────────────────
const inputSt = { width: '100%', padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit' };
const textareaSt = { ...inputSt, resize: 'vertical' };

function AcceptCasesSection({ queryClient }) {
  const [openId, setOpenId]       = useState(null);  // case id with expanded panel
  const [action, setAction]       = useState(null);  // 'accept' | 'review' | 'reject'
  const [submitting, setSubmitting] = useState(false);

  // Per-case form state for acceptance details
  const [details, setDetails] = useState({}); // { [caseId]: { shade, doctorName, doctorPhone, workType, notes, reason } }
  const det = (id) => details[id] || {};
  const setDet = (id, field, val) => setDetails(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cases', 'to-accept'],
    queryFn: () => api.get('/cases', {
      params: { status: 'PENDING_PICKUP,PICKUP_ASSIGNED,UNDER_REVIEW', limit: 100 }
    }).then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cases'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
    refetch();
  };

  const open = (id, act) => { setOpenId(openId === id && action === act ? null : id); setAction(act); };

  const handleAccept = async (c) => {
    const d = det(c.id);
    if (!d.shade?.trim())      return toast.error('Shade is required to accept');
    if (!d.doctorName?.trim()) return toast.error("Doctor's name is required");
    if (!d.doctorPhone?.trim()) return toast.error("Doctor's contact is required");
    setSubmitting(true);
    try {
      await api.post(`/cases/${c.id}/accept`, {
        shade:       d.shade,
        doctorName:  d.doctorName,
        doctorPhone: d.doctorPhone,
        workType:    d.workType || c.workType,
        notes:       d.notes,
      });
      toast.success(`✓ Case accepted — scan number assigned`);
      setOpenId(null);
      setDetails(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (c) => {
    const d = det(c.id);
    setSubmitting(true);
    try {
      await api.patch(`/cases/${c.id}/status`, {
        status: 'UNDER_REVIEW',
        notes: d.notes || 'Needs clarification from dentist',
      });
      toast.success('🔎 Case marked Under Review');
      setOpenId(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (c) => {
    const d = det(c.id);
    if (!d.notes?.trim()) return toast.error('Please enter a rejection reason');
    setSubmitting(true);
    try {
      await api.patch(`/cases/${c.id}/status`, {
        status: 'REJECTED',
        notes: d.notes,
      });
      toast.success('🚫 Case rejected');
      setOpenId(null);
      invalidate();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const cases = data?.cases ?? [];
  const pending     = cases.filter(c => c.status === 'PENDING_PICKUP');
  const inTransit   = cases.filter(c => c.status === 'PICKUP_ASSIGNED');
  const underReview = cases.filter(c => c.status === 'UNDER_REVIEW');

  const CaseCard = ({ c, canAct }) => {
    const isOpen  = openId === c.id;
    const accentColor = c.status === 'UNDER_REVIEW' ? '#1D4ED8'
      : c.status === 'PICKUP_ASSIGNED' ? 'var(--accent)' : 'var(--text-3)';

    return (
      <div style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${accentColor}`, padding: '14px 18px' }}>
        {/* Case info row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              {c.caseNumber
                ? <span className="case-number">{c.caseNumber}</span>
                : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--amber-dim)', color: 'var(--amber)', fontFamily: 'DM Mono, monospace' }}>No Scan # Yet</span>
              }
              <StatusBadge status={c.status} />
              {c.remake && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#FFF1F2', color: 'var(--red)' }}>🔄 Remake</span>}
              {c.redo   && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'var(--amber-dim)', color: 'var(--amber)' }}>♻️ Redo</span>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{c.patientName}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 2 }}>
              {c.workType && c.workType !== 'TBD' ? c.workType : <span style={{ color: 'var(--amber)' }}>Work type TBD</span>}
              {c.units != null ? ` · ${c.units} unit${c.units !== 1 ? 's' : ''}` : ''}{' · '}🏥 {c.clinic?.name}
            </div>
            {c.clinic?.phone && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>📞 {c.clinic.phone}</div>}
            {c.clinic?.address && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>📍 {c.clinic.address}</div>}
            {c.doctorName && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>👨‍⚕️ {c.doctorName}{c.doctorPhone ? ` · ${c.doctorPhone}` : ''}</div>}
            {c.shade && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>🎨 Shade: <strong>{c.shade}</strong></div>}
            {c.notes && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>📋 {c.notes}</div>}
            {c.assignedDelivery && <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2 }}>🛵 {c.assignedDelivery.name.replace('Yealmaz Delivery Executive ', 'Driver ')}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              Registered {format(new Date(c.createdAt), 'dd MMM yyyy, h:mm a')}
            </div>
          </div>

          {/* Action buttons */}
          {canAct && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => open(c.id, 'accept')}
                style={{ whiteSpace: 'nowrap' }}
              >
                ✓ Accept
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => open(c.id, 'review')}
                style={{ color: '#1D4ED8', whiteSpace: 'nowrap' }}
              >
                🔎 Under Review
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => open(c.id, 'reject')}
                style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}
              >
                🚫 Reject
              </button>
            </div>
          )}
          {!canAct && (
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', flexShrink: 0 }}>Awaiting pickup</span>
          )}
        </div>

        {/* ── Accept form ── */}
        {isOpen && action === 'accept' && (
          <div style={{ marginTop: 14, padding: '16px 16px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>
              ✓ Accept Case — Fill in Details & Assign Scan Number
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>SHADE *</label>
                <input style={inputSt} placeholder="e.g. A2, B1" value={det(c.id).shade || ''} onChange={e => setDet(c.id, 'shade', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>WORK TYPE</label>
                <input style={inputSt} placeholder={c.workType || 'e.g. Zirconia Crown'} value={det(c.id).workType || ''} onChange={e => setDet(c.id, 'workType', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>DOCTOR'S NAME *</label>
                <input style={inputSt} placeholder="Dr. Ahmed" value={det(c.id).doctorName || c.doctorName || ''} onChange={e => setDet(c.id, 'doctorName', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>CONTACT / PHONE *</label>
                <input style={inputSt} placeholder="+251 911 000 000" value={det(c.id).doctorPhone || c.doctorPhone || ''} onChange={e => setDet(c.id, 'doctorPhone', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>NOTES / ACCEPTANCE NOTE</label>
              <textarea rows={2} style={textareaSt} placeholder="Additional instructions, observations…" value={det(c.id).notes || ''} onChange={e => setDet(c.id, 'notes', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => handleAccept(c)} disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
                {submitting ? 'Accepting…' : '✓ Accept & Assign Scan Number'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Under Review form ── */}
        {isOpen && action === 'review' && (
          <div style={{ marginTop: 14, padding: '16px 16px', background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 10 }}>
              🔎 Under Review — What information is needed from the dentist?
            </div>
            <textarea rows={3} style={{ ...textareaSt, border: '1px solid #BFDBFE', background: '#fff' }}
              placeholder="e.g. Shade not specified. Need confirmation of tooth 14 preparation type."
              value={det(c.id).notes || ''} onChange={e => setDet(c.id, 'notes', e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => handleReview(c)} disabled={submitting}
                style={{ flex: 1, justifyContent: 'center', background: '#1D4ED8', color: '#fff', border: 'none' }}>
                {submitting ? 'Saving…' : '🔎 Mark Under Review'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Reject form ── */}
        {isOpen && action === 'reject' && (
          <div style={{ marginTop: 14, padding: '16px 16px', background: '#FFF1F2', borderRadius: 10, border: '1px solid #FECACA' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>
              🚫 Reject Case — Please enter the reason
            </div>
            <textarea rows={3} style={{ ...textareaSt, border: '1px solid #FECACA', background: '#fff' }}
              placeholder="e.g. Impression quality too poor to work with. Please retake."
              value={det(c.id).notes || ''} onChange={e => setDet(c.id, 'notes', e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-sm" onClick={() => handleReject(c)} disabled={submitting}
                style={{ flex: 1, justifyContent: 'center', background: 'var(--red)', color: '#fff', border: 'none' }}>
                {submitting ? 'Rejecting…' : '🚫 Confirm Rejection'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) return <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>;

  return (
    <>
      {/* Under Review */}
      {underReview.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">🔎 Under Review</div>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{underReview.length} awaiting dentist info</span>
          </div>
          <div>{underReview.map(c => <CaseCard key={c.id} c={c} canAct />)}</div>
        </div>
      )}

      {/* In Transit */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">📥 In Transit — Arrived at Lab</div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{inTransit.length} case{inTransit.length !== 1 ? 's' : ''}</span>
        </div>
        {inTransit.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <div className="empty-title">No cases in transit</div>
            <p>Cases picked up by drivers and brought to the lab will appear here.</p>
          </div>
        ) : (
          <div>{inTransit.map(c => <CaseCard key={c.id} c={c} canAct />)}</div>
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
          <div>{pending.map(c => <CaseCard key={c.id} c={c} canAct={false} />)}</div>
        )}
      </div>
    </>
  );
}

// ─── Ready Orders Section ─────────────────────────────────
// Ready for Dispatch  = READY_TO_DISPATCH (QC done, waiting for dispatch to assign driver)
// Ready for Delivery  = OUT_FOR_DELIVERY  (driver assigned and on the way to clinic)

const CASE_COLS = [
  { header: 'Case #',        value: c => c.caseNumber ?? '' },
  { header: 'Clinic',        value: c => c.clinic?.name },
  { header: 'Patient',       value: c => c.patientName },
  { header: 'Work Type',     value: c => c.workType },
  { header: 'Units',         value: c => c.units ?? '' },
  { header: 'Amount (Br)',   value: c => c.payment?.amount ?? c.totalAmount ?? '' },
  { header: 'Payment',       value: c => c.paymentStatus },
  { header: 'Delivery Date', value: c => c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '' },
  { header: 'Order Date',    value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
];

function OrdersTab({ status, title, icon, emptyText, emptyNote, accentColor, applied, page, setPage }) {
  const params = (extra = {}) => ({
    status,
    ...(applied.search   ? { search: applied.search }     : {}),
    ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
    ...(applied.dateTo   ? { dateTo: applied.dateTo }     : {}),
    ...extra,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ready-orders', status, applied, page],
    queryFn: () => api.get('/cases', { params: params({ limit: 20, page }) }).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const fetchAll = () => api.get('/cases', { params: params({ limit: 1000 }) }).then(r => r.data.cases ?? []);
  const cases      = data?.cases ?? [];
  const pagination = data?.pagination ?? {};

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title" style={{ color: accentColor }}>{icon} {title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {pagination.total != null && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pagination.total} case{pagination.total !== 1 ? 's' : ''}</span>
          )}
          <ExportMenu fetchData={fetchAll} columns={CASE_COLS} filename={title.toLowerCase().replace(/ /g, '-')} title={title} />
        </div>
      </div>
      <div className="table-wrap">
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <div className="empty-title">{emptyText}</div>
            <p>{emptyNote}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Case #</th><th>Clinic</th><th>Patient</th><th>Work Type</th>
                <th>Units</th><th>Amount</th><th>Payment</th><th>Delivery Date</th><th>Order Date</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td>{c.caseNumber ? <span className="case-number">{c.caseNumber}</span> : <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>—</span>}</td>
                  <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                  <td><span className="patient-name">{c.patientName}</span></td>
                  <td style={{ fontSize: 13 }}>{c.workType}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{c.units ?? '—'}</td>
                  <td style={{ fontWeight: 600, color: 'var(--green)' }}>
                    {c.payment?.amount != null ? `Br ${c.payment.amount.toLocaleString('en-US')}` :
                     c.totalAmount != null ? `Br ${c.totalAmount.toLocaleString('en-US')}` : '—'}
                  </td>
                  <td><PaymentBadge status={c.paymentStatus} /></td>
                  <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)', fontWeight: c.deliveryDate ? 600 : 400 }}>
                    {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{format(new Date(c.createdAt), 'dd MMM yyyy')}</td>
                </tr>
              ))}
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
  );
}

function ReadyOrdersSection() {
  const [activeTab, setActiveTab] = useState('dispatch'); // 'dispatch' | 'delivery'
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [applied, setApplied]   = useState({ search: '', dateFrom: '', dateTo: '' });
  const [pageDispatch, setPageDispatch] = useState(1);
  const [pageDelivery, setPageDelivery] = useState(1);

  const apply = () => { setApplied({ search, dateFrom, dateTo }); setPageDispatch(1); setPageDelivery(1); };
  const clear  = () => { setSearch(''); setDateFrom(''); setDateTo(''); setApplied({ search: '', dateFrom: '', dateTo: '' }); setPageDispatch(1); setPageDelivery(1); };

  return (
    <>
      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FilterBar
            search={search} onSearch={setSearch}
            dateFrom={dateFrom} onDateFrom={setDateFrom}
            dateTo={dateTo} onDateTo={setDateTo}
            placeholder="Clinic name, case no., patient…"
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={apply}>Apply</button>
            {(applied.search || applied.dateFrom || applied.dateTo) && (
              <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="filters" style={{ marginBottom: 14 }}>
        <button
          className={`filter-chip${activeTab === 'dispatch' ? ' active' : ''}`}
          onClick={() => setActiveTab('dispatch')}
          style={activeTab === 'dispatch' ? { background: 'var(--accent)', color: '#fff' } : {}}
        >
          📦 Ready for Dispatch
          <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.8 }}>QC done • Awaiting driver</span>
        </button>
        <button
          className={`filter-chip${activeTab === 'delivery' ? ' active' : ''}`}
          onClick={() => setActiveTab('delivery')}
          style={activeTab === 'delivery' ? { background: 'var(--green)', color: '#fff' } : {}}
        >
          🚚 Ready for Delivery
          <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.8 }}>Driver assigned • En route</span>
        </button>
      </div>

      {activeTab === 'dispatch' && (
        <OrdersTab
          status="READY_TO_DISPATCH"
          title="Ready for Dispatch"
          icon="📦"
          accentColor="var(--accent)"
          emptyText="No cases waiting for dispatch"
          emptyNote="Cases that have passed QC will appear here for dispatch to assign a driver."
          applied={applied}
          page={pageDispatch}
          setPage={setPageDispatch}
        />
      )}

      {activeTab === 'delivery' && (
        <OrdersTab
          status="OUT_FOR_DELIVERY"
          title="Ready for Delivery"
          icon="🚚"
          accentColor="var(--green)"
          emptyText="No cases currently out for delivery"
          emptyNote="Cases appear here once dispatch has assigned a driver and the case is on its way to the clinic."
          applied={applied}
          page={pageDelivery}
          setPage={setPageDelivery}
        />
      )}
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
      ? api.get('/cases', { params: { search: submitted, limit: 100 } }).then(r => r.data)
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {data && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.pagination?.total ?? cases.length} found</span>}
              <ExportMenu
                data={cases}
                columns={[
                  { header: 'Case #',         value: c => c.caseNumber ?? '' },
                  { header: 'Clinic',         value: c => c.clinic?.name },
                  { header: 'Patient',        value: c => c.patientName },
                  { header: 'Work Type',      value: c => c.workType },
                  { header: 'Units',          value: c => c.units ?? '' },
                  { header: 'Status',         value: c => c.status },
                  { header: 'Payment',        value: c => c.paymentStatus },
                  { header: 'Delivery Date',  value: c => c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '' },
                  { header: 'Registered',     value: c => format(new Date(c.createdAt), 'dd MMM yyyy') },
                ]}
                filename={`case-search-${submitted}`}
                title={`Search: ${submitted}`}
              />
            </div>
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
                    <th>Units</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Delivery Date</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td>
                        {c.caseNumber
                          ? <span className="case-number">{c.caseNumber}</span>
                          : <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>—</span>
                        }
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                      <td>
                        <span className="patient-name">
                          {c.patientName && c.patientName.match(/^[A-Z]{2,3}-\d{4}-\d+$/)
                            ? <span style={{ color: 'var(--text-3)', fontStyle: 'italic', fontSize: 11 }}>—</span>
                            : c.patientName || '—'
                          }
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{c.workType}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{c.units ?? '—'}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} /></td>
                      <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)', fontWeight: c.deliveryDate ? 600 : 400 }}>
                        {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
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
    // Badge shows total of READY_TO_DISPATCH + OUT_FOR_DELIVERY
    queryFn: async () => {
      const [dispatch, delivery] = await Promise.all([
        api.get('/cases', { params: { status: 'READY_TO_DISPATCH', limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
        api.get('/cases', { params: { status: 'OUT_FOR_DELIVERY',  limit: 1 } }).then(r => r.data.pagination?.total ?? 0),
      ]);
      return dispatch + delivery;
    },
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
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  navigate(`/cases?dateFrom=${today}&dateTo=${today}&label=Orders+Today`);
                }}>
                  <div className="stat-icon" style={{ background: '#EEF2FF' }}>📋</div>
                  <div className="stat-label">Orders Today</div>
                  <div className="stat-value">{stats?.todayCases ?? '—'}</div>
                  <div className="stat-sub" style={{ color: 'var(--blue)', fontWeight: 600 }}>View today's orders ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  navigate(`/cases?remake=true&dateFrom=${today}&dateTo=${today}&label=Remakes+Today`);
                }}>
                  <div className="stat-icon" style={{ background: '#FFF1F2' }}>🔄</div>
                  <div className="stat-label">Remake Today</div>
                  <div className="stat-value" style={{ color: stats?.remakeCount > 0 ? 'var(--red)' : 'var(--text-1)' }}>
                    {stats?.remakeCount ?? '—'}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--red)', fontWeight: 600 }}>View remakes ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  navigate(`/cases?redo=true&dateFrom=${today}&dateTo=${today}&label=Redo+Today`);
                }}>
                  <div className="stat-icon" style={{ background: '#FFF7ED' }}>♻️</div>
                  <div className="stat-label">Redo Today</div>
                  <div className="stat-value" style={{ color: stats?.redoCases > 0 ? 'var(--amber)' : 'var(--text-1)' }}>
                    {stats?.redoCases ?? '—'}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>View redo cases ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  navigate(`/cases?status=DELIVERED&dateFrom=${today}&dateTo=${today}&label=Delivered+Today`);
                }}>
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>✅</div>
                  <div className="stat-label">Delivered Today</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{stats?.deliveredToday ?? '—'}</div>
                  <div className="stat-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>View delivered ↗</div>
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
                  <div className="stat-sub" style={{ color: '#EA580C', fontWeight: 600 }}>View Accept Cases ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/cases?multiStatus=${encodeURIComponent(PRODUCTION_STATUSES)}&label=In+Production`)}>
                  <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>⏳</div>
                  <div className="stat-label">In Production</div>
                  <div className="stat-value" style={{ color: 'var(--amber)' }}>{stats?.pendingCases ?? '—'}</div>
                  <div className="stat-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>View in-production ↗</div>
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
