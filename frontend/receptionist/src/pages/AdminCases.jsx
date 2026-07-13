// Ye-Almaz — Admin Case Management
// Full case list with delete, manual payment collection, and payment override (admin only)

import { useState, useMemo } from 'react';
import AdminLayout from '../components/AdminLayout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import CaseDetailModal from '../components/CaseDetailModal';
import Odontogram from '../components/Odontogram';
import Pagination from '../components/Pagination';
import SearchableSelect from '../components/SearchableSelect';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

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
        <span>{caseData.workType}{caseData.units != null ? ` · ${caseData.units} unit${caseData.units !== 1 ? 's' : ''}` : ''}</span>
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

const fieldLabel = { fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 };
const fieldInput = { width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'DM Sans, sans-serif' };

// ── Edit Case Modal ────────────────────────────────────────
// Admin-only — edits core case details. Status/payment are changed via their
// own dedicated actions (Override, status changes elsewhere), not here.
function EditCaseModal({ caseData, onDone, onClose }) {
  const toDateInput = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
  const [form, setForm] = useState({
    patientName:   caseData.patientName || '',
    patientAge:    caseData.patientAge?.toString() || '',
    patientGender: caseData.patientGender || '',
    doctorName:    caseData.doctorName || '',
    doctorPhone:   caseData.doctorPhone || '',
    workType:      caseData.workType || '',
    units:         caseData.units?.toString() || '',
    shade:         caseData.shade || '',
    toothNumbers:  caseData.toothNumbers || '',
    dueDate:       toDateInput(caseData.dueDate),
    deliveryDate:  toDateInput(caseData.deliveryDate),
    totalAmount:   caseData.totalAmount?.toString() || '',
    deliveryType:  caseData.deliveryType || 'NORMAL',
    remake:        caseData.remake || false,
    remakeReason:  caseData.remakeReason || '',
    redo:          caseData.redo || false,
    isRedo:        caseData.isRedo || false,
    notes:         caseData.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const selectedTeeth = form.toothNumbers
    ? form.toothNumbers.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    : [];
  const toggleTooth = (num) => {
    const next = selectedTeeth.includes(num) ? selectedTeeth.filter(n => n !== num) : [...selectedTeeth, num];
    setForm(f => ({ ...f, toothNumbers: next.join(', ') }));
  };
  const clearTeeth = () => setForm(f => ({ ...f, toothNumbers: '' }));

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const setBool = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.checked }));

  const submit = async () => {
    if (!form.patientName.trim()) { toast.error('Patient name is required'); return; }
    if (!form.workType.trim())    { toast.error('Work type is required'); return; }
    setSaving(true);
    try {
      await api.patch(`/cases/${caseData.id}`, {
        patientName:   form.patientName.trim(),
        patientAge:    form.patientAge || null,
        patientGender: form.patientGender || null,
        doctorName:    form.doctorName.trim() || null,
        doctorPhone:   form.doctorPhone.trim() || null,
        workType:      form.workType.trim(),
        units:         form.units || null,
        shade:         form.shade.trim() || null,
        toothNumbers:  form.toothNumbers.trim() || null,
        dueDate:       form.dueDate || null,
        deliveryDate:  form.deliveryDate || null,
        totalAmount:   form.totalAmount || null,
        deliveryType:  form.deliveryType,
        remake:        form.remake,
        remakeReason:  form.remake ? (form.remakeReason.trim() || null) : null,
        redo:          form.redo,
        isRedo:        form.isRedo,
        notes:         form.notes.trim() || null,
      });
      toast.success(`Case ${caseData.caseNumber} updated`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">✏️ Edit Case Details</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{caseData.caseNumber} · {caseData.clinic?.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Patient Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input style={fieldInput} value={form.patientName} onChange={set('patientName')} />
            </div>
            <div>
              <label style={fieldLabel}>Patient Age</label>
              <input type="number" min="0" style={fieldInput} value={form.patientAge} onChange={set('patientAge')} />
            </div>
            <div>
              <label style={fieldLabel}>Patient Gender</label>
              <select style={{ ...fieldInput, cursor: 'pointer' }} value={form.patientGender} onChange={set('patientGender')}>
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Delivery Type</label>
              <select style={{ ...fieldInput, cursor: 'pointer' }} value={form.deliveryType} onChange={set('deliveryType')}>
                <option value="NORMAL">Normal</option>
                <option value="EXPRESS">Express</option>
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Doctor Name</label>
              <input style={fieldInput} value={form.doctorName} onChange={set('doctorName')} />
            </div>
            <div>
              <label style={fieldLabel}>Doctor Phone</label>
              <input style={fieldInput} value={form.doctorPhone} onChange={set('doctorPhone')} />
            </div>
            <div>
              <label style={fieldLabel}>Work Type <span style={{ color: 'var(--red)' }}>*</span></label>
              <input style={fieldInput} value={form.workType} onChange={set('workType')} />
            </div>
            <div>
              <label style={fieldLabel}>Units</label>
              <input type="number" min="0" style={fieldInput} value={form.units} onChange={set('units')} />
            </div>
            <div>
              <label style={fieldLabel}>Shade</label>
              <input style={fieldInput} value={form.shade} onChange={set('shade')} placeholder="e.g. A2, To Be Advised Later" />
            </div>
            <div>
              <label style={fieldLabel}>Total Amount (Br)</label>
              <input type="number" min="0" style={fieldInput} value={form.totalAmount} onChange={set('totalAmount')} />
            </div>
            <div>
              <label style={fieldLabel}>Due Date</label>
              <input type="date" style={fieldInput} value={form.dueDate} onChange={set('dueDate')} />
            </div>
            <div>
              <label style={fieldLabel}>Delivery Date</label>
              <input type="date" style={fieldInput} value={form.deliveryDate} onChange={set('deliveryDate')} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabel}>Tooth Numbers</label>
            <div style={{ overflowX: 'auto', padding: '10px 0' }}>
              <Odontogram selected={selectedTeeth} onToggle={toggleTooth} onClear={clearTeeth} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.remake} onChange={setBool('remake')} /> Remake
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.redo} onChange={setBool('redo')} /> Redo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isRedo} onChange={setBool('isRedo')} /> Redo / Replacement (50% charge)
            </label>
          </div>

          {form.remake && (
            <div style={{ marginBottom: 14 }}>
              <label style={fieldLabel}>Remake Reason</label>
              <input style={fieldInput} value={form.remakeReason} onChange={set('remakeReason')} />
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={fieldLabel}>Notes</label>
            <textarea rows={3} style={{ ...fieldInput, resize: 'vertical' }} value={form.notes} onChange={set('notes')} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              onClick={submit} disabled={saving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: saving ? 'var(--border)' : 'var(--accent)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : '✓ Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────
export default function AdminCases() {
  const queryClient = useQueryClient();
  const [search,         setSearch]        = useState('');
  const [statusFilter,   setStatusFilter]  = useState('');
  const [payFilter,      setPayFilter]     = useState('');
  const [clinicId,       setClinicId]      = useState('');
  const [sortBy,         setSortBy]        = useState('caseNumber');
  const [sortDir,        setSortDir]       = useState('desc');
  const [page,           setPage]          = useState(1);
  const [viewCase,       setViewCase]      = useState(null);
  const [editTarget,     setEditTarget]    = useState(null);
  const [deleteTarget,   setDeleteTarget]  = useState(null);
  const [collectTarget,  setCollectTarget] = useState(null);
  const [overrideTarget, setOverrideTarget]= useState(null);
  const [deleting,       setDeleting]      = useState(false);
  const [exporting,      setExporting]     = useState(false);

  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => {
    const p = { limit: PAGE_SIZE, page, sortDir, sortBy };
    if (statusFilter) p.status        = statusFilter;
    if (payFilter)    p.paymentStatus = payFilter;
    if (search)       p.search        = search;
    if (clinicId)     p.clinicId      = clinicId;
    return p;
  }, [statusFilter, payFilter, search, clinicId, sortBy, sortDir, page]);

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

  const exportToExcel = async () => {
    setExporting(true);
    try {
      // Fetch all matching cases (no pagination limit)
      const exportParams = { limit: 9999, page: 1, sortDir, sortBy };
      if (statusFilter) exportParams.status        = statusFilter;
      if (payFilter)    exportParams.paymentStatus = payFilter;
      if (search)       exportParams.search        = search;
      if (clinicId)     exportParams.clinicId      = clinicId;

      const { data } = await api.get('/cases', { params: exportParams });
      const rows = data.cases || [];

      const STATUS_LABELS = {
        CASE_ACCEPTED:      'Case Accepted',
        MILLING_SINTERING:  'In Production',
        QUALITY_CHECK:      'Quality Check',
        READY_TO_DISPATCH:  'Ready to Ship',
        OUT_FOR_DELIVERY:   'Out for Delivery',
        DELIVERED:          'Delivered',
        CANCELLED:          'Cancelled',
      };
      const PAYMENT_LABELS = {
        PENDING:             'Unpaid',
        SCREENSHOT_UPLOADED: 'Screenshot Uploaded',
        VERIFIED:            'Verified / Paid',
        REJECTED:            'Rejected',
      };

      const sheetData = [
        ['Case #', 'Clinic', 'Patient', 'Doctor', 'Work Type', 'Amount (Br)', 'Status', 'Payment', 'Date'],
        ...rows.map(c => [
          c.caseNumber,
          c.clinic?.name || '',
          c.patientName  || '',
          c.doctorName   || '',
          c.workType     || '',
          c.totalAmount  ?? '',
          STATUS_LABELS[c.status]        || c.status,
          PAYMENT_LABELS[c.paymentStatus] || c.paymentStatus,
          format(new Date(c.createdAt), 'dd MMM yyyy'),
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      // Column widths
      ws['!cols'] = [14, 22, 20, 18, 20, 14, 20, 22, 14].map(w => ({ wch: w }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cases');

      // Build a descriptive filename from active filters
      const parts = ['YAL-Cases'];
      if (clinicId) {
        const clinic = clinicList.find(c => c.id === clinicId);
        if (clinic) parts.push(clinic.name.replace(/\s+/g, '-'));
      }
      if (statusFilter) parts.push(STATUS_LABELS[statusFilter] || statusFilter);
      if (payFilter)    parts.push(PAYMENT_LABELS[payFilter]   || payFilter);
      parts.push(format(new Date(), 'yyyy-MM-dd'));

      XLSX.writeFile(wb, `${parts.join('_')}.xlsx`);
      toast.success(`Exported ${rows.length} case${rows.length !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error('Export failed — please try again');
    } finally {
      setExporting(false);
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {pagination.total ?? 0} total cases
          </div>
          <button
            onClick={exportToExcel}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: exporting ? 'var(--border)' : 'var(--green)',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 13, fontWeight: 700,
              cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
          >
            {exporting ? '⏳ Exporting…' : '⬇️ Export Excel'}
          </button>
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
          <SearchableSelect
            value={clinicId}
            onChange={v => { setClinicId(v); setPage(1); }}
            options={clinicList.map(c => ({ value: c.id, label: c.name }))}
            placeholder="All Clinics"
            style={{ minWidth: 200 }}
          />
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
                    <th>
                      <button
                        onClick={() => {
                          setSortDir(d => (sortBy === 'caseNumber' && d === 'desc') ? 'asc' : 'desc');
                          setSortBy('caseNumber');
                          setPage(1);
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontWeight: 700, fontSize: 'inherit', color: 'var(--text-2)',
                          padding: 0, fontFamily: 'inherit',
                        }}
                      >
                        Case # {sortBy === 'caseNumber' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th>Clinic</th>
                    <th>Patient</th>
                    <th>Work Type</th>
                    <th style={{ width: 70 }}>Units</th>
                    <th>Amount</th>
                    <th>Delivered On</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>
                      <button
                        onClick={() => {
                          setSortDir(d => (sortBy === 'date' && d === 'desc') ? 'asc' : 'desc');
                          setSortBy('date');
                          setPage(1);
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontWeight: 700, fontSize: 'inherit', color: 'var(--text-2)',
                          padding: 0, fontFamily: 'inherit',
                        }}
                      >
                        Date {sortBy === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
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
                      <td style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>
                        {c.totalAmount
                          ? `Br ${c.totalAmount.toLocaleString('en-US')}`
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><PaymentBadge status={c.paymentStatus} isExcluded={c.clinic?.isExcluded} /></td>
                      <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)' }}>
                        {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {format(new Date(c.createdAt), 'dd MMM yyyy')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>

                          {/* View */}
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewCase(c)}>
                            👁 View
                          </button>

                          {/* Edit — admin-only detail editor */}
                          <button
                            onClick={() => setEditTarget(c)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3,
                              background: 'rgba(37,99,235,0.08)', color: '#2563EB',
                              border: '1px solid rgba(37,99,235,0.25)',
                              borderRadius: 6, padding: '4px 9px',
                              fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            ✏️ Edit
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

      {editTarget && (
        <EditCaseModal
          caseData={editTarget}
          onDone={() => { setEditTarget(null); refresh(); }}
          onClose={() => setEditTarget(null)}
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
