// Ye-Almaz — Admin Case Management
// Full case list with delete, manual payment collection, and payment override (admin only)

import { useState, useMemo } from 'react';
import AdminLayout from '../components/AdminLayout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import CaseDetailModal from '../components/CaseDetailModal';
import Pagination from '../components/Pagination';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { label: 'All',            value: '' },
  { label: 'Accepted',       value: 'CASE_ACCEPTED' },
  { label: 'In Production',  value: 'MILLING_SINTERING' },
  { label: 'Quality Check',  value: 'QUALITY_CHECK' },
  { label: 'Ready to Ship',  value: 'READY_TO_DISPATCH' },
  { label: 'Delivered',      value: 'DELIVERED' },
  { label: 'Cancelled',      value: 'CANCELLED' },
];

const PAYMENT_FILTERS = [
  { label: 'All Payments', value: '' },
  { label: 'Unpaid',       value: 'PENDING' },
  { label: 'Screenshot',   value: 'SCREENSHOT_UPLOADED' },
  { label: 'Verified',     value: 'VERIFIED' },
  { label: 'Rejected',     value: 'REJECTED' },
];

// ── Shared case info card ─────────────────────────────────
function CaseInfoCard({ caseData, accent }) {
  return (
    <div style={{
      background: accent ? `${accent}08` : 'var(--surface-2)',
      border: `1px solid ${accent ? `${accent}28` : 'var(--border)'}`,
      borderRadius: 10, padding: '12px 14px', marginBottom: 20,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.patientName}</div>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
        {caseData.caseNumber}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>🏥 {caseData.clinic?.name}</span>
        <span>{caseData.workType}</span>
        {caseData.totalAmount && (
          <span style={{ fontWeight: 600 }}>Br {caseData.totalAmount.toLocaleString('en-US')}</span>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <StatusBadge status={caseData.status} />
        <PaymentBadge status={caseData.paymentStatus} />
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────
function DeleteConfirmModal({ caseData, onConfirm, onClose, deleting }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: 'var(--red)' }}>⚠️ Delete Case</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <CaseInfoCard caseData={caseData} accent="#E53E3E" />
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
            This will permanently delete the case and <strong style={{ color: 'var(--text-1)' }}>all associated records</strong> —
            stages, delivery logs, payment history, and invoice data.
            This <strong style={{ color: 'var(--red)' }}>cannot be undone</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              style={{
                flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: deleting ? 'var(--border)' : '#E53E3E',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 18px', fontSize: 13, fontWeight: 700,
                cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? 'Deleting…' : '🗑️ Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Collect Payment Modal ─────────────────────────────────
function CollectPaymentModal({ caseData, onDone, onClose }) {
  const [amount, setAmount] = useState(caseData.totalAmount?.toString() || '');
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/payments/${caseData.id}/collect`, {
        amount: amount ? parseFloat(amount) : undefined,
        notes:  notes  || undefined,
      });
      toast.success(`✅ Payment collected for ${caseData.caseNumber}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">💰 Collect Payment</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Mark as manually collected — no screenshot required
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <CaseInfoCard caseData={caseData} />

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              Amount Collected (Br)
              {caseData.totalAmount && (
                <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                  Invoice: Br {caseData.totalAmount.toLocaleString('en-US')}
                </span>
              )}
            </label>
            <input
              type="number" min="0"
              placeholder={caseData.totalAmount ? String(caseData.totalAmount) : 'Enter amount…'}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 15, fontWeight: 600, background: 'var(--surface)', color: 'var(--text-1)' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g. Cash collected at lab, Bank transfer confirmed…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              onClick={submit} disabled={saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: saving ? 'var(--border)' : 'var(--green)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : '✓ Confirm Payment Collected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Payment Override Modal ────────────────────────────────
const OVERRIDE_OPTIONS = [
  {
    value: 'VERIFIED',
    label: 'Verified / Paid',
    desc:  'Force-mark as paid regardless of screenshot status',
    color: '#16A34A',
    bg:    'rgba(22,163,74,0.08)',
    icon:  '✅',
  },
  {
    value: 'PENDING',
    label: 'Reset to Pending',
    desc:  'Clear any screenshot / approval and reset to awaiting payment',
    color: '#D97706',
    bg:    'rgba(217,119,6,0.08)',
    icon:  '⏳',
  },
  {
    value: 'REJECTED',
    label: 'Rejected',
    desc:  'Mark payment as rejected (clinic must re-submit)',
    color: '#E53E3E',
    bg:    'rgba(229,62,62,0.08)',
    icon:  '✗',
  },
];

function OverridePaymentModal({ caseData, onDone, onClose }) {
  const [newStatus, setNewStatus] = useState('VERIFIED');
  const [amount,    setAmount]    = useState(caseData.totalAmount?.toString() || '');
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);

  const selected = OVERRIDE_OPTIONS.find(o => o.value === newStatus);

  const submit = async () => {
    if (!reason.trim()) { toast.error('A reason is required for payment overrides'); return; }
    setSaving(true);
    try {
      await api.post(`/payments/${caseData.id}/override`, {
        status: newStatus,
        amount: amount ? parseFloat(amount) : undefined,
        reason: reason.trim(),
      });
      toast.success(`Payment overridden → ${selected.label} for ${caseData.caseNumber}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Override failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: 'rgba(240,165,0,0.15)', color: '#D97706',
                fontSize: 10, fontWeight: 800, padding: '2px 8px',
                borderRadius: 4, letterSpacing: 1, textTransform: 'uppercase',
              }}>Admin Override</span>
              Override Payment
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Force-set payment status — action is logged to the case audit trail
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <CaseInfoCard caseData={caseData} accent="#D97706" />

          {/* New status picker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10 }}>
              Set payment status to
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {OVERRIDE_OPTIONS.map(opt => {
                const active = newStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewStatus(opt.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `2px solid ${active ? opt.color : 'var(--border)'}`,
                      background: active ? opt.bg : 'var(--surface)',
                      transition: 'border-color .12s, background .12s',
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: active ? opt.color : 'var(--border)',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                    }}>{opt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: active ? opt.color : 'var(--text-1)' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{opt.desc}</div>
                    </div>
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${active ? opt.color : 'var(--border)'}`,
                      background: active ? opt.color : 'transparent',
                    }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount (optional — only shown for VERIFIED) */}
          {newStatus === 'VERIFIED' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                Amount (Br) — optional
                {caseData.totalAmount && (
                  <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 8 }}>
                    Current: Br {caseData.totalAmount.toLocaleString('en-US')}
                  </span>
                )}
              </label>
              <input
                type="number" min="0"
                placeholder={caseData.totalAmount ? String(caseData.totalAmount) : 'Leave blank to keep existing amount'}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text-1)' }}
              />
            </div>
          )}

          {/* Reason — required */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              Reason <span style={{ color: 'var(--red)' }}>*</span>
              <span style={{ fontWeight: 400, color: 'var(--text-3)', marginLeft: 6 }}>
                — recorded in the case audit trail
              </span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Payment confirmed via bank, duplicate case, adjustment by management…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                border: `1.5px solid ${reason.trim() ? 'var(--border)' : 'rgba(229,62,62,0.4)'}`,
                borderRadius: 8, fontSize: 13, resize: 'vertical',
                background: 'var(--surface)', color: 'var(--text-1)',
                fontFamily: 'DM Sans, sans-serif',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              onClick={submit}
              disabled={saving || !reason.trim()}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: saving || !reason.trim() ? 'var(--border)' : selected.color,
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 700,
                cursor: saving || !reason.trim() ? 'not-allowed' : 'pointer',
                transition: 'background .15s',
              }}
            >
              {saving ? 'Applying…' : `${selected.icon} Apply Override`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  border: '1px solid var(--border)', borderRadius: 8,
  padding: '7px 12px', fontSize: 13, color: 'var(--text-1)',
  background: 'var(--surface)', outline: 'none',
  fontFamily: 'DM Sans, sans-serif', cursor: 'pointer',
};

// ── Main Page ─────────────────────────────────────────────
export default function AdminCases() {
  const queryClient = useQueryClient();
  const [search,         setSearch]        = useState('');
  const [statusFilter,   setStatusFilter]  = useState('');
  const [payFilter,      setPayFilter]     = useState('');
  const [clinicId,       setClinicId]      = useState('');
  const [sortDir,        setSortDir]       = useState('desc');
  const [page,           setPage]          = useState(1);
  const [viewCase,       setViewCase]      = useState(null);
  const [deleteTarget,   setDeleteTarget]  = useState(null);
  const [collectTarget,  setCollectTarget] = useState(null);
  const [overrideTarget, setOverrideTarget]= useState(null);
  const [deleting,       setDeleting]      = useState(false);

  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => {
    const p = { limit: PAGE_SIZE, page, sortDir };
    if (statusFilter) p.status        = statusFilter;
    if (payFilter)    p.paymentStatus = payFilter;
    if (search)       p.search        = search;
    if (clinicId)     p.clinicId      = clinicId;
    return p;
  }, [statusFilter, payFilter, search, clinicId, sortDir, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'cases', params],
    queryFn:  () => api.get('/cases', { params }).then(r => r.data),
    staleTime: 30_000,
  });

  const cases      = data?.cases      || [];
  const pagination = data?.pagination || {};

  const changeFilter = (setter) => (val) => { setter(val); setPage(1); };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'cases'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/cases/${deleteTarget.id}`);
      toast.success(`Case ${deleteTarget.caseNumber} deleted`);
      refresh();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete case');
    } finally {
      setDeleting(false);
    }
  };

  // Collect button eligibility: dispatched/delivered, not yet verified
  const canCollect = (c) =>
    c.paymentStatus !== 'VERIFIED' &&
    ['READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(c.status);

  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title">Case Management</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {pagination.total ?? 0} total cases
        </div>
      </div>

      <div className="content">
        {/* Search + clinic selector */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
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
          {(statusFilter || payFilter || search || clinicId) && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}
              onClick={() => { setStatusFilter(''); setPayFilter(''); setSearch(''); setClinicId(''); setPage(1); }}
            >
              ✕ Clear All
            </button>
          )}
        </div>

        {/* Status filters */}
        <div className="filters" style={{ marginBottom: 10 }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.value} className={`filter-chip ${statusFilter === f.value ? 'active' : ''}`}
              onClick={() => changeFilter(setStatusFilter)(f.value)}>
              {f.label}
            </button>
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
                <div className="empty-icon">📋</div>
                <div className="empty-title">No cases match your filters</div>
                <p>Try adjusting the search or filter criteria</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Case #</th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>
                      <button
                        onClick={() => { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); setPage(1); }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontWeight: 700, fontSize: 'inherit', color: 'var(--text-2)',
                          padding: 0, fontFamily: 'inherit',
                        }}
                      >
                        Date {sortDir === 'desc' ? '↓' : '↑'}
                      </button>
                    </th>
                    <th style={{ minWidth: 200 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id}>
                      <td><span className="case-number">{c.caseNumber}</span></td>
                      <td style={{ fontSize: 13 }}>{c.clinic?.name}</td>
                      <td>
                        <span className="patient-name">{c.patientName}</span>
                        {c.doctorName && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Dr. {c.doctorName}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>{c.workType}</td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {c.totalAmount
                          ? `Br ${c.totalAmount.toLocaleString('en-US')}`
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} isExcluded={c.clinic?.isExcluded} /></td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>

                          {/* View */}
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewCase(c)}>
                            👁 View
                          </button>

                          {/* Collect — dispatched/delivered & unpaid */}
                          {canCollect(c) && (
                            <button
                              onClick={() => setCollectTarget(c)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 3,
                                background: 'var(--green-dim)', color: 'var(--green)',
                                border: '1px solid rgba(22,163,74,0.3)',
                                borderRadius: 6, padding: '4px 9px',
                                fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              💰 Collect
                            </button>
                          )}

                          {/* Override — always available */}
                          <button
                            onClick={() => setOverrideTarget(c)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              background: 'rgba(217,119,6,0.08)', color: '#D97706',
                              border: '1px solid rgba(217,119,6,0.25)',
                              borderRadius: 6, padding: '4px 9px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            ⚡ Override
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteTarget(c)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              background: 'rgba(229,62,62,0.07)', color: '#E53E3E',
                              border: '1px solid rgba(229,62,62,0.2)',
                              borderRadius: 6, padding: '4px 9px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            }}
                          >
                            🗑️ Delete
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

      {/* Modals */}
      {viewCase && (
        <CaseDetailModal
          caseId={viewCase.id}
          onClose={() => { setViewCase(null); refresh(); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          caseData={deleteTarget}
          deleting={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {collectTarget && (
        <CollectPaymentModal
          caseData={collectTarget}
          onDone={() => { setCollectTarget(null); refresh(); }}
          onClose={() => setCollectTarget(null)}
        />
      )}

      {overrideTarget && (
        <OverridePaymentModal
          caseData={overrideTarget}
          onDone={() => { setOverrideTarget(null); refresh(); }}
          onClose={() => setOverrideTarget(null)}
        />
      )}
    </AdminLayout>
  );
}
