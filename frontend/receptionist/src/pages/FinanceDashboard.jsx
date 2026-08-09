// Ye-Almaz — Finance Department Dashboard
// Standalone page (no Layout wrapper) for FINANCE role users
// Tabs: Screenshot Approvals · Billing & Invoicing · Verified History

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import FilterBar from '../components/FilterBar';
import ExportMenu from '../components/ExportMenu';
import SearchableSelect from '../components/SearchableSelect';
import api, { downloadExport } from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  MdInventory2, MdLocalHospital, MdLightbulb, MdBolt, MdSend, MdPrint,
  MdWarning, MdCheckCircle, MdCancel, MdSearch, MdSchedule, MdPendingActions,
  MdCreditCard, MdCameraAlt, MdEdit, MdPaid, MdImage, MdDescription,
  MdReceipt, MdInbox, MdEventNote, MdHandshake, MdAccountBalance,
  MdAssignment, MdTrendingUp, MdAccountBalanceWallet, MdMoneyOff,
  MdCalendarToday, MdDashboard, MdCelebration, MdCheck, MdClose, MdFileDownload,
  MdLogout,
} from 'react-icons/md';
import { todayLocal, toLocalDateString } from '../utils/date';
import AttendanceClock from '../components/AttendanceClock';
import LeaveRequestButton from '../components/LeaveRequestButton';

const PAGE_SIZE = 15;
const HIST_SIZE = 20;

// ── Data fetchers ─────────────────────────────────────────
const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);
const fetchPending = () => api.get('/payments/pending').then(r => r.data.payments ?? r.data);
const fetchBilling = () => api.get('/payments/billing').then(r => r.data.cases    ?? r.data);
const fetchHistory = (page, search = '') =>
  api.get(`/payments/history?page=${page}&limit=${HIST_SIZE}${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(r => r.data);
const fetchTrusted = (page, search = '') =>
  api.get(`/payments/trusted?page=${page}&limit=${HIST_SIZE}${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(r => r.data);
const fetchFinanceReport = ({ from, to, search } = {}) => {
  const params = new URLSearchParams();
  if (from)   params.set('from', from);
  if (to)     params.set('to', to);
  if (search) params.set('search', search);
  return api.get(`/dashboard/finance-report?${params}`).then(r => r.data);
};

// ── Lab info constant ─────────────────────────────────────
const LAB = {
  name: 'Ye-Almaz Dental Laboratory',
  address: 'Addis Ababa, Ethiopia',
  phone: '+251 945 535 455',
  email: 'info@yealmaz.com',
};

// ── Printable invoice HTML ────────────────────────────────
function buildInvoiceHTML(c) {
  const inv    = c.payment;
  const issued = inv?.invoiceIssuedAt ? format(new Date(inv.invoiceIssuedAt), 'dd MMMM yyyy') : '—';
  const due    = c.dueDate ? format(new Date(c.dueDate), 'dd MMMM yyyy') : '—';
  const amount = inv?.amount ?? c.totalAmount ?? 0;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${inv?.invoiceNumber || 'Invoice'}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #1565C0}
  .lab-brand{display:flex;align-items:center;gap:10px}
  .lab-logo{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0}
  .lab-name{font-size:22px;font-weight:800;color:#1565C0;margin-bottom:4px}
  .lab-sub{font-size:12px;color:#666}
  .inv-title{text-align:right}
  .inv-title h1{font-size:28px;font-weight:800;color:#1565C0;letter-spacing:2px}
  .inv-num{font-size:13px;color:#444;margin-top:4px}
  .dates-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
  .section-title{font-size:10px;font-weight:700;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px}
  .bill-to{font-size:15px;font-weight:700;margin-bottom:2px}
  .bill-sub{font-size:13px;color:#555;line-height:1.6}
  .date-item{font-size:13px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:24px}
  thead tr{background:#1565C0;color:#fff}
  th{padding:10px 14px;text-align:left;font-size:12px;font-weight:700;letter-spacing:0.5px}
  td{padding:12px 14px;font-size:13px;border-bottom:1px solid #eee}
  tbody tr:last-child td{border-bottom:none}
  .total-row{background:#F8FAFF;font-weight:700;font-size:15px}
  .status-pill{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:700}
  .status-pending{background:#FEF3C7;color:#92400E}
  .status-verified{background:#D1FAE5;color:#065F46}
  .notes{background:#F8FAFF;border-radius:8px;padding:14px;margin-bottom:24px;font-size:13px;color:#555;line-height:1.6}
  .footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center}
  @media print{body{padding:20px}button{display:none}}
</style></head>
<body>
<div class="header">
  <div class="lab-brand">
    <img class="lab-logo" src="${window.location.origin}/logo.png" alt="Ye-Almaz" />
    <div>
      <div class="lab-name">${LAB.name}</div>
      <div class="lab-sub">${LAB.address}<br>${LAB.phone} · ${LAB.email}</div>
    </div>
  </div>
  <div class="inv-title">
    <h1>INVOICE</h1>
    <div class="inv-num">${inv?.invoiceNumber || '—'}</div>
    <div class="inv-num" style="margin-top:4px;color:#1565C0;font-weight:700">
      <span class="status-pill ${c.paymentStatus === 'VERIFIED' ? 'status-verified' : 'status-pending'}">
        ${c.paymentStatus === 'VERIFIED' ? 'PAID' : 'PAYMENT PENDING'}
      </span>
    </div>
  </div>
</div>
<div class="dates-grid">
  <div>
    <div class="section-title">Bill To</div>
    <div class="bill-to">${c.clinic?.name}</div>
    <div class="bill-sub">
      ${c.clinic?.address ? c.clinic.address + '<br>' : ''}
      ${c.clinic?.phone || ''}${c.clinic?.email ? '<br>' + c.clinic.email : ''}
    </div>
  </div>
  <div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div><div class="section-title">Invoice Date</div><div class="date-item">${issued}</div></div>
      <div><div class="section-title">Due Date</div><div class="date-item">${due}</div></div>
      <div><div class="section-title">Case Number</div><div class="date-item" style="font-family:monospace">${c.caseNumber}</div></div>
      <div><div class="section-title">Patient</div><div class="date-item">${c.patientName}</div></div>
      <div><div class="section-title">FS #</div><div class="date-item" style="font-family:monospace">${inv?.fsNumber || '—'}</div></div>
    </div>
  </div>
</div>
<table>
  <thead><tr><th>Description</th><th>Details</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>${c.workType}</strong><br><span style="color:#888;font-size:12px">Dental Lab Work</span></td>
      <td>${[c.toothNumbers && 'Teeth: ' + c.toothNumbers, c.shade && 'Shade: ' + c.shade].filter(Boolean).join('<br>') || '—'}</td>
      <td style="text-align:right;font-weight:700">Br ${amount.toLocaleString('en-US')}</td>
    </tr>
    <tr class="total-row">
      <td colspan="2" style="text-align:right;font-size:14px">Total Amount</td>
      <td style="text-align:right;color:#1565C0;font-size:18px">Br ${amount.toLocaleString('en-US')}</td>
    </tr>
  </tbody>
</table>
${inv?.invoiceNotes ? `<div class="notes"><strong>Notes:</strong> ${inv.invoiceNotes}</div>` : ''}
<div class="footer">Thank you for choosing Ye-Almaz Dental Laboratory · Please transfer to the provided bank account and upload your payment receipt.</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

// ── Send Payment Request Modal ────────────────────────────
const FLAT_PRICE_TYPES = new Set([
  'Night Guard', 'Night Guard Soft', 'Night Guard Hard',
  'Retainer', 'Orthodontic Retainer', 'Clear Aligner', 'Clear Aligner Setup',
  'Bleaching Tray', 'Flexible Denture', 'Fexible Denture', '3D Printed Model',
  'Sports Guard', 'Bite Splint', 'Gingival Mask',
]);

function SendPaymentRequestModal({ caseData, onDone, onClose }) {
  const [amount, setAmount]   = useState(caseData.totalAmount?.toString() || '');
  const [notes, setNotes]     = useState(caseData.payment?.invoiceNotes || '');
  const [loading, setLoading] = useState(false);
  const [calcHint, setCalcHint] = useState(null);

  useEffect(() => {
    api.get('/prices').then(res => {
      const entry = (res.data || []).find(p => p.workType === caseData.workType);
      if (!entry) return;
      const isExpress = caseData.deliveryType === 'EXPRESS' && entry.expressPrice != null;
      const unitPrice = isExpress ? entry.expressPrice : entry.price;
      const isFlat = FLAT_PRICE_TYPES.has(caseData.workType);
      const count = isFlat ? 1 : Math.max(1, caseData.units || 1);
      const total = Math.round(unitPrice * count * (caseData.isRedo ? 0.5 : 1));
      setCalcHint({ unitPrice, count, isFlat, isExpress, isRedo: caseData.isRedo, total });
      if (!caseData.totalAmount) setAmount(String(total));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await api.post(`/payments/${caseData.id}/request`, { amount: num, notes });
      toast.success(`Payment request sent to ${caseData.clinic?.name}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send request');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Send Payment Request</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Clinic will be notified to upload their payment receipt
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              {caseData.workType}{caseData.units ? ` · ${caseData.units} unit${caseData.units !== 1 ? 's' : ''}` : ''}{caseData.toothNumbers ? ` · Teeth ${caseData.toothNumbers}` : ''}{caseData.shade ? ` · Shade ${caseData.shade}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocalHospital size={12} /> {caseData.clinic?.name}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Amount Due (Br) *</label>
            <input
              type="number" min="1" placeholder="e.g. 12500" value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 15, fontWeight: 700 }}
              autoFocus
            />
            {calcHint && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <MdLightbulb size={13} />
                <span>
                  Br {calcHint.unitPrice.toLocaleString('en-US')}
                  {!calcHint.isFlat && calcHint.count > 1 && ` × ${calcHint.count} units`}
                  {calcHint.isExpress && <> · <MdBolt size={11} style={{ verticalAlign: 'middle' }} /> express</>}
                  {calcHint.isRedo && ' · 50% redo'}
                  {' = '}
                  <strong style={{ color: 'var(--text-1)' }}>Br {calcHint.total.toLocaleString('en-US')}</strong>
                  {caseData.totalAmount && caseData.totalAmount !== calcHint.total && (
                    <span style={{ color: 'var(--amber)', marginLeft: 6 }}>
                      (case stored Br {Number(caseData.totalAmount).toLocaleString('en-US')})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Payment Instructions (optional)</label>
            <textarea
              rows={3} placeholder="Bank account details, transfer instructions, etc." value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={loading}>
              {loading ? 'Sending…' : <><MdSend className="mi" size={14} /> Send Payment Request</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invoice View Modal ────────────────────────────────────
function InvoiceViewModal({ caseData, onClose }) {
  const inv    = caseData.payment;
  const amount = inv?.amount ?? caseData.totalAmount ?? 0;

  const printInvoice = () => {
    const w = window.open('', '_blank');
    w.document.write(buildInvoiceHTML(caseData));
    w.document.close();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, width: '100%' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{inv?.invoiceNumber || 'Invoice'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {inv?.invoiceIssuedAt ? `Issued ${format(new Date(inv.invoiceIssuedAt), 'dd MMM yyyy')}` : 'Not yet issued'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={printInvoice}><MdPrint className="mi" size={14} /> Print / Save PDF</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: 'var(--navy)', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}><MdInventory2 size={16} /> {LAB.name}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{LAB.address} · {LAB.phone}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: 2 }}>INVOICE</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, marginTop: 2 }}>{inv?.invoiceNumber}</div>
              </div>
            </div>
            <div className="grid-2" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Bill To</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{caseData.clinic?.name}</div>
                {caseData.clinic?.address && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{caseData.clinic.address}</div>}
                {caseData.clinic?.phone && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{caseData.clinic.phone}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  ['Invoice Date', inv?.invoiceIssuedAt ? format(new Date(inv.invoiceIssuedAt), 'dd MMM yyyy') : '—'],
                  ['Case #',       caseData.caseNumber],
                  ['Patient',      caseData.patientName],
                  ['Due Date',     caseData.dueDate ? format(new Date(caseData.dueDate), 'dd MMM yyyy') : '—'],
                  ['FS #',         inv?.fsNumber || '—'],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: lbl === 'Case #' ? 'DM Mono, monospace' : 'inherit' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Description', 'Details', 'Amount'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: h === 'Amount' ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '14px 20px', fontWeight: 600, fontSize: 14 }}>{caseData.workType}</td>
                  <td style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-2)' }}>
                    {[caseData.toothNumbers && `Teeth: ${caseData.toothNumbers}`, caseData.shade && `Shade: ${caseData.shade}`].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>Br {amount.toLocaleString('en-US')}</td>
                </tr>
                <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Total</td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, fontSize: 18, color: 'var(--blue)' }}>Br {amount.toLocaleString('en-US')}</td>
                </tr>
              </tbody>
            </table>
            {inv?.invoiceNotes && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: '#FFFBEB', fontSize: 13, color: 'var(--text-2)' }}>
                <strong>Notes:</strong> {inv.invoiceNotes}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PaymentBadge status={caseData.paymentStatus} />
            {caseData.payment?.screenshotUrl && (
              <a href={caseData.payment.screenshotUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">View Screenshot</a>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Shared error state component ──────────────────────────
function ErrorState({ message, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 36, marginBottom: 12, display: 'flex', justifyContent: 'center' }}><MdWarning size={36} /></div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 8 }}>
        Failed to load data
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{message}</div>
      <button className="btn btn-primary btn-sm" onClick={onRetry}>Try Again</button>
    </div>
  );
}

// ── Payment Gateway Tab ───────────────────────────────────
// Shows clinic-app payment transactions (online gateway + screenshot uploads)
// with their outcome — success / pending / failed — and lets finance verify or
// reject the ones still awaiting review.
const OUTCOME_META = {
  SUCCESS:          { label: 'Success',  icon: MdCheckCircle, color: 'var(--green)', bg: 'var(--green-dim)' },
  FAILED:           { label: 'Failed',   icon: MdCancel, color: 'var(--red)',   bg: '#FFF1F2' },
  PENDING_REVIEW:   { label: 'Awaiting Review', icon: MdSearch, color: 'var(--amber)', bg: 'var(--amber-dim)' },
  AWAITING_PAYMENT: { label: 'Request Sent',    icon: MdSchedule, color: 'var(--blue)',  bg: '#EFF6FF' },
  PENDING_GATEWAY:  { label: 'In Progress',     icon: MdPendingActions, color: 'var(--blue)',  bg: '#EFF6FF' },
  PENDING:          { label: 'Pending',  icon: MdPendingActions, color: 'var(--text-3)', bg: 'var(--surface-2)' },
};
const METHOD_META = {
  GATEWAY:    { label: 'Online', icon: MdCreditCard, color: 'var(--blue)' },
  SCREENSHOT: { label: 'Screenshot', icon: MdCameraAlt, color: '#6D28D9' },
  REQUESTED:  { label: 'Requested', icon: MdSchedule, color: 'var(--text-3)' },
  MANUAL:     { label: 'Manual', icon: MdEdit, color: 'var(--text-3)' },
};

function ScreenshotsTab({ queryClient }) {
  const [processing, setProcessing] = useState(null);
  const [filter, setFilter] = useState('all'); // all | success | pending | failed
  const [search, setSearch] = useState('');
  const [collectModal, setCollect] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'gateway'],
    queryFn: () => api.get('/payments/gateway').then(r => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const tx     = data?.transactions ?? [];
  const counts = data?.counts ?? { success: 0, failed: 0, pending: 0 };

  const verifyMutation = useMutation({
    mutationFn: ({ caseId, action, rejectionReason }) =>
      api.post(`/payments/${caseId}/verify`, { action, rejectionReason }),
    onSuccess: (_, { action }) => {
      toast.success(action === 'APPROVE' ? 'Payment approved — case ready for dispatch.' : 'Payment rejected.');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Action failed. Please try again.'),
    onSettled: () => setProcessing(null),
  });

  const verify = (caseId, action) => {
    let rejectionReason;
    if (action === 'REJECT') {
      rejectionReason = prompt('Reason for rejection (will be sent to clinic):');
      if (!rejectionReason) return;
    }
    setProcessing(caseId + action);
    verifyMutation.mutate({ caseId, action, rejectionReason });
  };

  const filtered = tx.filter(t => {
    if (filter === 'success' && t.outcome !== 'SUCCESS') return false;
    if (filter === 'failed'  && t.outcome !== 'FAILED')  return false;
    if (filter === 'pending' && (t.outcome === 'SUCCESS' || t.outcome === 'FAILED')) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = t.caseNumber?.toLowerCase().includes(q)
        || t.clinicName?.toLowerCase().includes(q)
        || t.patientName?.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading transactions…</div>;
  if (isError)   return <ErrorState message="Could not load gateway transactions." onRetry={refetch} />;

  return (
    <>
      {/* Outcome summary */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setFilter('success')}>
          <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdCheckCircle size={18} /></div>
          <div className="stat-label">Successful</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{counts.success}</div>
          <div className="stat-sub">Paid via clinic app</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setFilter('pending')}>
          <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}><MdPendingActions size={18} /></div>
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{counts.pending}</div>
          <div className="stat-sub">Request sent · awaiting payment / review</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setFilter('failed')}>
          <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdCancel size={18} /></div>
          <div className="stat-label">Failed</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{counts.failed}</div>
          <div className="stat-sub">Rejected / unsuccessful</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdCreditCard className="mi" size={15} /> Payment Gateway Transactions</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-input" style={{ minWidth: 200 }}>
              <span className="icon mi"><MdSearch size={16} /></span>
              <input placeholder="Search clinic, case #, patient…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {search && <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')} style={{ color: 'var(--red)' }}>✕</button>}
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all','All'],['success','Success'],['pending','Pending'],['failed','Failed']].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)}
                  className={`filter-chip${filter === id ? ' active' : ''}`}
                  style={filter === id ? { background: 'var(--blue)', color: '#fff' } : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon mi"><MdCreditCard size={32} /></div>
              <div className="empty-title">No transactions</div>
              <p>Payments made by clinics through the app appear here with their success / failure status.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Case #</th><th>Clinic</th><th>Patient</th><th>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Outcome</th><th>Date</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const om = OUTCOME_META[t.outcome] || OUTCOME_META.PENDING;
                  const mm = METHOD_META[t.method] || METHOD_META.MANUAL;
                  return (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{t.caseNumber}</td>
                      <td style={{ fontWeight: 600 }}>{t.clinicName}</td>
                      <td>{t.patientName}</td>
                      <td><span style={{ fontSize: 12, fontWeight: 700, color: mm.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}><mm.icon size={13} /> {mm.label}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.amount ? `Br ${t.amount.toLocaleString('en-US')}` : '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: om.bg, color: om.color, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <om.icon size={12} /> {om.label}
                        </span>
                        {t.outcome === 'FAILED' && t.rejectionReason && (
                          <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>{t.rejectionReason}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                        {t.verifiedAt ? format(new Date(t.verifiedAt), 'dd MMM, h:mm a')
                          : t.uploadedAt ? format(new Date(t.uploadedAt), 'dd MMM, h:mm a')
                          : format(new Date(t.updatedAt), 'dd MMM, h:mm a')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {t.outcome === 'PENDING_REVIEW' && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => verify(t.caseId, 'APPROVE')} disabled={!!processing}><MdCheck className="mi" size={14} /> Approve</button>
                              <button className="btn btn-danger btn-sm" onClick={() => verify(t.caseId, 'REJECT')} disabled={!!processing}><MdClose className="mi" size={14} /></button>
                            </>
                          )}
                          {/* Manual cash / bank collection — for any payment still outstanding */}
                          {t.outcome !== 'SUCCESS' && t.outcome !== 'FAILED' && (
                            <button
                              onClick={() => setCollect({
                                id: t.caseId, caseNumber: t.caseNumber, patientName: t.patientName,
                                workType: t.workType, totalAmount: t.amount, clinic: { name: t.clinicName },
                              })}
                              style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            ><MdPaid size={13} /> Collect</button>
                          )}
                          {t.screenshotUrl && <button className="btn btn-ghost btn-sm" onClick={() => window.open(t.screenshotUrl, '_blank')}><MdImage className="mi" size={14} /></button>}
                          {t.outcome === 'SUCCESS' && !t.screenshotUrl && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {collectModal && (
        <CollectModal
          caseData={collectModal}
          onDone={() => {
            setCollect(null);
            queryClient.invalidateQueries({ queryKey: ['payments'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
          onClose={() => setCollect(null)}
        />
      )}
    </>
  );
}

// ── Issued Invoices panel ─────────────────────────────────
// Real invoices ONLY — generated after payment is done. (Quotes/payment
// requests are auto-sent by Dispatch via 'Request Payment'; they are not
// invoices and do not appear here.)
const INVOICE_METHODS = [
  { value: '',            label: 'All Methods' },
  { value: 'ONLINE',      label: 'Online' },
  { value: 'SCREENSHOT',  label: 'Screenshot' },
  { value: 'MANUAL',      label: 'Manual' },
];

function InvoicesPanel() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [clinicId, setClinicId] = useState('');
  const [method, setMethod]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [viewInvoice, setViewInvoice] = useState(null);
  const [fsEdits, setFsEdits]     = useState({}); // { [paymentId]: in-progress value }
  const [fsSaving, setFsSaving]   = useState({}); // { [paymentId]: true }
  const queryClient = useQueryClient();

  const { data: clinicList = [] } = useQuery({
    queryKey: ['clinics'],
    queryFn: () => api.get('/clinics').then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const clinicOptions = [{ value: '', label: 'All Clinics' }, ...clinicList.map(c => ({ value: c.id, label: c.name }))];

  const invoiceParams = { page, limit: PAGE_SIZE, search: submitted, clinicId, method, dateFrom, dateTo };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'invoices', page, submitted, clinicId, method, dateFrom, dateTo],
    queryFn: () => api.get('/payments/invoices', { params: invoiceParams }).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });

  const invoices   = data?.invoices ?? [];
  const pagination = data?.pagination ?? {};
  const totalAmount = data?.totalAmount ?? 0;

  const doSearch = (v) => { setSearch(v); };
  const applySearch = () => { setSubmitted(search); setPage(1); };
  const hasExtraFilters = clinicId || method || dateFrom || dateTo;
  const clearExtraFilters = () => { setClinicId(''); setMethod(''); setDateFrom(''); setDateTo(''); setPage(1); };

  const methodLabel = (inv) => {
    const [Icon, text] = inv.chapaTxRef ? [MdCreditCard, 'Online'] : inv.screenshotUrl ? [MdCameraAlt, 'Screenshot'] : [MdEdit, 'Manual'];
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon size={13} /> {text}</span>;
  };

  // FS # (the clinic's paper sales-invoice/fiscal receipt number) — Finance
  // types it in here; saved per-invoice on blur, keyed by case (the payment
  // record's caseId, same endpoint used by the Trusted Partner statement).
  const fsValue = (inv) => fsEdits[inv.id] !== undefined ? fsEdits[inv.id] : (inv.fsNumber || '');
  const saveFsNumber = async (inv) => {
    const value = fsValue(inv).trim();
    if (value === (inv.fsNumber || '')) {
      setFsEdits(prev => { const n = { ...prev }; delete n[inv.id]; return n; });
      return;
    }
    setFsSaving(prev => ({ ...prev, [inv.id]: true }));
    try {
      await api.post(`/payments/${inv.caseId}/fs-number`, { fsNumber: value });
      queryClient.invalidateQueries({ queryKey: ['payments', 'invoices'] });
      setFsEdits(prev => { const n = { ...prev }; delete n[inv.id]; return n; });
    } catch {
      toast.error('Could not save FS number');
    } finally {
      setFsSaving(prev => { const n = { ...prev }; delete n[inv.id]; return n; });
    }
  };

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading invoices…</div>;
  if (isError)   return <ErrorState message="Could not load invoices." onRetry={refetch} />;

  return (
    <>
      {/* Summary */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#EFF6FF' }}><MdDescription size={18} /></div>
          <div className="stat-label">Invoices Issued</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{pagination.total ?? invoices.length}</div>
          <div className="stat-sub">Generated after payment</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdPaid size={18} /></div>
          <div className="stat-label">Total Invoiced</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: totalAmount >= 1000000 ? 16 : 22 }}>{ETB(totalAmount)}</div>
          <div className="stat-sub">{submitted ? 'Matching search' : 'All issued invoices'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdDescription className="mi" size={15} /> Issued Invoices</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-input" style={{ minWidth: 220 }}>
              <span className="icon mi"><MdSearch size={16} /></span>
              <input placeholder="Search invoice #, FS #, clinic, case…" value={search}
                onChange={e => doSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && applySearch()} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={applySearch}>Search</button>
            {submitted && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setSubmitted(''); setPage(1); }} style={{ color: 'var(--red)' }}>✕</button>}
          </div>
        </div>
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>CLINIC</div>
              <SearchableSelect value={clinicId} onChange={v => { setClinicId(v); setPage(1); }} options={clinicOptions} placeholder="All Clinics" />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>METHOD</div>
              <select value={method} onChange={e => { setMethod(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', minWidth: 130 }}>
                {INVOICE_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>ISSUED FROM</div>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3, letterSpacing: 0.4 }}>ISSUED TO</div>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
            </div>
            {hasExtraFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearExtraFilters} style={{ color: 'var(--red)' }}>✕ Clear</button>
            )}
          </div>
          <ExportMenu
            fetchData={() => api.get('/payments/invoices', { params: { ...invoiceParams, limit: 9999, page: 1 } }).then(r => r.data.invoices ?? [])}
            columns={[
              { header: 'Invoice #',  value: i => i.invoiceNumber },
              { header: 'FS #',       value: i => i.fsNumber || '' },
              { header: 'Issued',     value: i => i.invoiceIssuedAt ? format(new Date(i.invoiceIssuedAt), 'dd MMM yyyy') : '' },
              { header: 'Case #',     value: i => i.case?.caseNumber },
              { header: 'Clinic',     value: i => i.case?.clinic?.name },
              { header: 'Patient',    value: i => i.case?.patientName },
              { header: 'Work Type',  value: i => i.case?.workType },
              { header: 'Amount (Br)',value: i => i.amount ?? '' },
              { header: 'Method',     value: i => i.chapaTxRef ? 'Online' : i.screenshotUrl ? 'Screenshot' : 'Manual' },
            ]}
            filename="invoices" title="Issued Invoices"
          />
        </div>
        <div className="table-wrap">
          {invoices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon mi"><MdReceipt size={32} /></div>
              <div className="empty-title">No invoices yet</div>
              <p>Real invoices are generated automatically once a payment is verified. They will appear here, ready to view and print.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th><th>FS #</th><th>Issued</th><th>Case #</th><th>Clinic</th><th>Patient</th>
                  <th>Work Type</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Method</th><th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>{inv.invoiceNumber}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        value={fsValue(inv)}
                        onChange={e => setFsEdits(prev => ({ ...prev, [inv.id]: e.target.value }))}
                        onBlur={() => saveFsNumber(inv)}
                        placeholder="FS #"
                        style={{ width: 84, padding: '4px 6px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace', background: 'var(--surface)' }}
                      />
                      {fsSaving[inv.id] && <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 4 }}>saving…</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{inv.invoiceIssuedAt ? format(new Date(inv.invoiceIssuedAt), 'dd MMM yyyy') : '—'}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{inv.case?.caseNumber}</td>
                    <td style={{ fontWeight: 600 }}>{inv.case?.clinic?.name}</td>
                    <td>{inv.case?.patientName}</td>
                    <td style={{ fontSize: 13 }}>{inv.case?.workType}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{inv.amount ? `Br ${inv.amount.toLocaleString('en-US')}` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{methodLabel(inv)}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => setViewInvoice({ ...inv.case, payment: inv })}>
                        <MdReceipt className="mi" size={14} /> View / Print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <Pagination
            page={page} totalPages={pagination.totalPages}
            total={pagination.total} pageSize={PAGE_SIZE}
            onPrev={() => setPage(p => p - 1)}
            onNext={() => setPage(p => p + 1)}
          />
        )}
      </div>

      {viewInvoice && (
        <InvoiceViewModal caseData={viewInvoice} onClose={() => setViewInvoice(null)} />
      )}
    </>
  );
}

// ── Billing & Invoicing Tab ───────────────────────────────
// Two views: issued Invoices, and Verify Payments (gateway success/failed +
// approve/reject screenshot uploads — folded in from the old Payment Gateway tab).
const BILLING_VIEWS = [
  { id: 'invoices', label: 'Invoices', icon: MdDescription },
  { id: 'verify',   label: 'Verify Payments', icon: MdCreditCard },
];
function BillingTab({ view = 'invoices', onView, scope = 'FULL' }) {
  const queryClient = useQueryClient();
  // Cashier has no backend access to /payments/invoices or /clinics (not
  // scoped by caller yet — see docs/enhancements-plan.md §9) — hide that
  // view rather than let them click into a 403.
  const views = scope === 'CASHIER' ? BILLING_VIEWS.filter(v => v.id !== 'invoices') : BILLING_VIEWS;
  return (
    <>
      <div className="filters" style={{ margin: '0 0 18px', flexWrap: 'wrap' }}>
        {views.map(v => (
          <button key={v.id} className={`filter-chip ${view === v.id ? 'active' : ''}`} onClick={() => onView?.(v.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <v.icon size={14} /> {v.label}
          </button>
        ))}
      </div>
      {view === 'verify' ? <ScreenshotsTab queryClient={queryClient} /> : <InvoicesPanel />}
    </>
  );
}

// ── Monthly Statement HTML ────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildStatementHTML(clinic, cases, month, year, allOutstanding, periodLabel) {
  const total = cases.reduce((s, c) => s + (c.totalAmount || 0), 0);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const period = periodLabel || (allOutstanding ? 'All Outstanding' : `${MONTHS[month]} ${year}`);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const rows = cases.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td style="font-family:monospace;font-size:12px">${c.caseNumber}</td>
      <td>${c.patientName}</td>
      <td>${c.workType}</td>
      <td style="text-align:center">${c.units ?? '—'}</td>
      <td>${fmtDate(c.deliveryDate)}</td>
      <td style="font-family:monospace">${c.payment?.invoiceNumber || '—'}</td>
      <td style="font-family:monospace;font-weight:700">${c.payment?.fsNumber || '—'}</td>
      <td style="text-align:right;font-weight:700">Br ${(c.totalAmount || 0).toLocaleString('en-US')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Statement — ${clinic.name} — ${period}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:40px;font-size:13px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1565C0}
  .lab-brand{display:flex;align-items:center;gap:10px}
  .lab-logo{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0}
  .lab-name{font-size:20px;font-weight:800;color:#1565C0;margin-bottom:4px}
  .lab-sub{font-size:11px;color:#666;line-height:1.7}
  .doc-title{text-align:right}
  .doc-title h1{font-size:22px;font-weight:800;color:#1565C0;letter-spacing:2px}
  .doc-title .period{font-size:13px;color:#444;margin-top:4px;font-weight:600}
  .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;background:#FEF3C7;color:#92400E;margin-top:6px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
  .section-label{font-size:9px;font-weight:700;color:#999;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}
  .clinic-name{font-size:15px;font-weight:700;margin-bottom:3px}
  .clinic-sub{font-size:12px;color:#555;line-height:1.6}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .mi-label{font-size:9px;font-weight:700;color:#999;letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px}
  .mi-value{font-size:12px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#1565C0;color:#fff}
  th{padding:9px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.5px}
  td{padding:10px 12px;border-bottom:1px solid #eee;font-size:12px}
  tbody tr:last-child td{border-bottom:2px solid #1565C0}
  .total-row td{padding:13px 12px;font-weight:700;font-size:14px;background:#F0F7FF}
  .total-amount{color:#1565C0;font-size:19px;font-weight:800;text-align:right}
  .footer{margin-top:32px;padding-top:14px;border-top:1px solid #eee;font-size:10px;color:#999;text-align:center;line-height:1.8}
  @media print{body{padding:20px}button{display:none}}
</style></head>
<body>
<div class="header">
  <div class="lab-brand">
    <img class="lab-logo" src="${window.location.origin}/logo.png" alt="Ye-Almaz" />
    <div>
      <div class="lab-name">Ye-Almaz Dental Laboratory</div>
      <div class="lab-sub">Addis Ababa, Ethiopia<br>+251 945 535 455 · info@yealmaz.com</div>
    </div>
  </div>
  <div class="doc-title">
    <h1>BILL</h1>
    <div class="period">${period}</div>
    <div><span class="badge">⏳ Outstanding</span></div>
  </div>
</div>

<div class="meta">
  <div>
    <div class="section-label">Bill To</div>
    <div class="clinic-name">${clinic.name}</div>
    <div class="clinic-sub">
      ${clinic.address ? clinic.address + '<br>' : ''}
      ${clinic.phone || ''}
    </div>
  </div>
  <div class="meta-grid">
    <div><div class="mi-label">Statement Date</div><div class="mi-value">${today}</div></div>
    <div><div class="mi-label">Period</div><div class="mi-value">${period}</div></div>
    <div><div class="mi-label">Cases</div><div class="mi-value">${cases.length}</div></div>
    <div><div class="mi-label">Total Due</div><div class="mi-value" style="color:#1565C0;font-size:14px">Br ${total.toLocaleString('en-US')}</div></div>
  </div>
</div>

<table>
  <thead>
    <tr><th>#</th><th>Case Number</th><th>Patient</th><th>Work Type</th><th style="text-align:center">Units</th><th>Delivered</th><th>Invoice #</th><th>FS #</th><th style="text-align:right">Amount (Br)</th></tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="9" style="text-align:center;color:#999;padding:20px">No outstanding cases for this period</td></tr>'}
    <tr class="total-row">
      <td colspan="8" style="text-align:right">Total Outstanding</td>
      <td class="total-amount">Br ${total.toLocaleString('en-US')}</td>
    </tr>
  </tbody>
</table>

<div class="footer">
  Ye-Almaz Dental Laboratory &nbsp;·&nbsp; Payment Collection Statement &nbsp;·&nbsp; ${period}<br>
  Please settle the outstanding amount at the earliest convenience. For queries contact info@yealmaz.com
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

// ── Generate Bill / Statement Modal ───────────────────────
// Trusted-partner billing: pick a period (week / fortnight / month / custom /
// all-outstanding), preview the consolidated bill, print it, and optionally
// mark the clinic as billed (records lastBilledAt for the next cycle).
const BILL_PRESETS = [
  { id: 'week',     label: 'This Week' },
  { id: 'fortnight',label: 'This Fortnight' },
  { id: 'month',    label: 'This Month' },
  { id: 'custom',   label: 'Custom Range' },
  { id: 'all',      label: 'All Outstanding' },
];

function rangeForPreset(preset, customFrom, customTo) {
  const now = new Date();
  const iso = toLocalDateString;
  if (preset === 'all') return {};
  if (preset === 'custom') return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
  if (preset === 'week') {
    const from = new Date(now); from.setDate(now.getDate() - 6);
    return { dateFrom: iso(from), dateTo: iso(now) };
  }
  if (preset === 'fortnight') {
    const from = new Date(now); from.setDate(now.getDate() - 13);
    return { dateFrom: iso(from), dateTo: iso(now) };
  }
  // month
  return { dateFrom: iso(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: iso(now) };
}

function StatementModal({ clinicId, clinic, onClose, onBilled }) {
  const now = new Date();
  const [preset, setPreset]       = useState(clinic.billingCycle && clinic.billingCycle !== 'NONE'
    ? ({ WEEKLY: 'week', FORTNIGHTLY: 'fortnight', MONTHLY: 'month', CUSTOM: 'custom' }[clinic.billingCycle] || 'month')
    : 'month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [cases, setCases]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [marking, setMarking]       = useState(false);
  const [fsEdits, setFsEdits]       = useState({}); // { [caseId]: in-progress value }
  const [fsSaving, setFsSaving]     = useState({}); // { [caseId]: true }

  const range = rangeForPreset(preset, customFrom, customTo);
  const periodLabel = preset === 'all' ? 'All Outstanding'
    : range.dateFrom ? `${range.dateFrom} → ${range.dateTo || 'today'}` : 'All';

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/payments/statement/${clinicId}`, { params: range });
      setCases(res.data);
    } catch {
      toast.error('Failed to load bill data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [preset, customFrom, customTo]);

  // FS # (the clinic's paper sales-invoice/fiscal receipt number) — Finance
  // types it in here while reconciling the bill; saved per-case on blur.
  const fsValue = (c) => fsEdits[c.id] !== undefined ? fsEdits[c.id] : (c.payment?.fsNumber || '');
  const saveFsNumber = async (c) => {
    const value = fsValue(c).trim();
    if (value === (c.payment?.fsNumber || '')) {
      setFsEdits(prev => { const n = { ...prev }; delete n[c.id]; return n; });
      return;
    }
    setFsSaving(prev => ({ ...prev, [c.id]: true }));
    try {
      await api.post(`/payments/${c.id}/fs-number`, { fsNumber: value });
      setCases(prev => prev.map(x => x.id === c.id ? { ...x, payment: { ...x.payment, fsNumber: value || null } } : x));
      setFsEdits(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    } catch {
      toast.error('Could not save FS number');
    } finally {
      setFsSaving(prev => { const n = { ...prev }; delete n[c.id]; return n; });
    }
  };

  const total = cases.reduce((s, c) => s + (c.totalAmount || 0), 0);

  const print = () => {
    const w = window.open('', '_blank');
    // buildStatementHTML signature: (clinic, cases, month, year, allOutstanding) — pass period via allOutstanding label
    w.document.write(buildStatementHTML(clinic, cases, now.getMonth(), now.getFullYear(), preset === 'all', periodLabel));
    w.document.close();
  };

  const markBilled = async () => {
    setMarking(true);
    try {
      await api.patch(`/clinics/${clinicId}/billing`, { markBilled: true });
      toast.success('✓ Marked as billed — next cycle scheduled');
      onBilled?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not mark as billed');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 920, width: '100%' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdReceipt className="mi" size={16} /> Generate Bill</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MdLocalHospital size={12} /> {clinic.name}{clinic.billingCycle && clinic.billingCycle !== 'NONE' ? ` · ${clinic.billingCycle.toLowerCase()} cycle` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={print} disabled={loading || cases.length === 0}>
              <MdPrint className="mi" size={14} /> Print / Save PDF
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          {/* Period preset chips */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {BILL_PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={`filter-chip${preset === p.id ? ' active' : ''}`}
                style={preset === p.id ? { background: 'var(--blue)', color: '#fff' } : {}}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range inputs */}
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>FROM</div>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 3 }}>TO</div>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  style={{ padding: '7px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
              </div>
            </div>
          )}

          {/* Summary banner */}
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Cases</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)' }}>{cases.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Total Outstanding</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>Br {total.toLocaleString('en-US')}</div>
            </div>
            <div style={{ marginLeft: 'auto', alignSelf: 'center', textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{periodLabel}</div>
              {clinic.lastBilledAt && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  Last billed: {format(new Date(clinic.lastBilledAt), 'dd MMM yyyy')}
                </div>
              )}
              <button className="btn btn-success btn-sm" onClick={markBilled} disabled={marking || cases.length === 0}
                style={{ marginTop: 6 }}>
                {marking ? 'Saving…' : '✓ Mark as Billed'}
              </button>
            </div>
          </div>

          {/* Case preview table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Loading cases…</div>
          ) : cases.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <div className="empty-icon mi"><MdInbox size={32} /></div>
              <div className="empty-title">No outstanding cases</div>
              <p>No pending cases found for this period.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
                    {['Case #', 'Patient', 'Work Type', 'Units', 'Delivered', 'Invoice #', 'FS #', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-3)', textAlign: h === 'Amount' ? 'right' : h === 'Units' ? 'center' : 'left', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', fontSize: 11 }}>{c.caseNumber}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 600 }}>{c.patientName}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--text-2)' }}>{c.workType}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                      <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: 'DM Mono, monospace', color: 'var(--blue)', fontSize: 11 }}>{c.payment?.invoiceNumber || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          value={fsValue(c)}
                          onChange={e => setFsEdits(prev => ({ ...prev, [c.id]: e.target.value }))}
                          onBlur={() => saveFsNumber(c)}
                          placeholder="FS #"
                          style={{ width: 84, padding: '4px 6px', fontSize: 11, borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace', background: 'var(--surface)' }}
                        />
                        {fsSaving[c.id] && <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 4 }}>saving…</span>}
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {c.totalAmount ? `Br ${c.totalAmount.toLocaleString('en-US')}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                    <td colSpan={7} style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right', fontSize: 13 }}>Total</td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, fontSize: 15, color: 'var(--blue)', textAlign: 'right' }}>
                      Br {total.toLocaleString('en-US')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Billing Cycle Modal ───────────────────────────────────
// Finance assigns a recurring billing cadence to a trusted-partner clinic.
const CYCLE_OPTIONS = [
  { id: 'NONE',        label: 'No schedule',  desc: 'Bill manually whenever needed' },
  { id: 'WEEKLY',      label: 'Weekly',       desc: 'Every 7 days' },
  { id: 'FORTNIGHTLY', label: 'Fortnightly',  desc: 'Every 14 days' },
  { id: 'MONTHLY',     label: 'Monthly',      desc: 'Once a month' },
  { id: 'CUSTOM',      label: 'Custom',       desc: 'Ad-hoc — choose dates each time' },
];
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function BillingCycleModal({ clinic, onClose, onSaved }) {
  const [cycle, setCycle]   = useState(clinic.billingCycle || 'NONE');
  const [anchor, setAnchor] = useState(clinic.billingAnchor ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/clinics/${clinic.id}/billing`, {
        billingCycle: cycle,
        billingAnchor: (cycle === 'WEEKLY' || cycle === 'FORTNIGHTLY' || cycle === 'MONTHLY') ? (anchor === '' ? null : anchor) : null,
      });
      toast.success('✓ Billing cycle updated');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save billing cycle');
    } finally {
      setSaving(false);
    }
  };

  const isWeekly = cycle === 'WEEKLY' || cycle === 'FORTNIGHTLY';
  const isMonthly = cycle === 'MONTHLY';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460, width: '100%' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdEventNote className="mi" size={16} /> Billing Schedule</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocalHospital size={12} /> {clinic.name}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, letterSpacing: 0.5 }}>BILLING CYCLE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {CYCLE_OPTIONS.map(opt => (
              <label key={opt.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                border: `2px solid ${cycle === opt.id ? 'var(--blue)' : 'var(--border)'}`,
                background: cycle === opt.id ? 'var(--blue-dim,#EEF2FF)' : 'var(--surface)',
              }}>
                <input type="radio" checked={cycle === opt.id} onChange={() => setCycle(opt.id)} style={{ width: 16, height: 16 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: cycle === opt.id ? 'var(--blue)' : 'var(--text-1)' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {isWeekly && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>BILL ON</div>
              <select value={anchor} onChange={e => setAnchor(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <option value="">— Any day —</option>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          {isMonthly && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6 }}>DAY OF MONTH (1–28)</div>
              <input type="number" min="1" max="28" value={anchor} onChange={e => setAnchor(e.target.value)} placeholder="e.g. 1"
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)' }} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trusted Partners Tab ─────────────────────────────────
function CollectModal({ caseData, onDone, onClose }) {
  const [amount, setAmount] = useState(caseData.totalAmount?.toString() || '');
  const [notes,  setNotes]  = useState('');
  const [withholdTax, setWithholdTax] = useState(false);
  const [taxWithheld, setTaxWithheld] = useState('');
  const [saving, setSaving] = useState(false);

  const isTrusted = caseData.clinic?.isExcluded;
  const netReceived = (parseFloat(amount) || 0) - (parseFloat(taxWithheld) || 0);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/payments/${caseData.id}/collect`, {
        amount: amount ? parseFloat(amount) : undefined,
        notes:  notes  || undefined,
        taxWithheld: withholdTax && taxWithheld ? parseFloat(taxWithheld) : undefined,
      });
      toast.success(`Payment collected — ${caseData.caseNumber}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdPaid className="mi" size={16} /> Manual Payment Collection</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {isTrusted ? 'Trusted partner — cash / bank collection' : 'Record cash or bank transfer received directly'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{
            background: isTrusted ? '#F5F3FF' : 'var(--surface-2)',
            border: `1px solid ${isTrusted ? '#DDD6FE' : 'var(--border)'}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 20,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              {caseData.workType}{caseData.toothNumbers ? ` · Teeth ${caseData.toothNumbers}` : ''}
            </div>
            <div style={{ fontSize: 12, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><MdLocalHospital size={12} /> {caseData.clinic?.name}</div>
            {isTrusted && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#EDE9FE', color: '#6D28D9' }}><MdHandshake size={11} /> Trusted Partner</span>
            )}
          </div>

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

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={withholdTax} onChange={e => setWithholdTax(e.target.checked)} />
              <MdAccountBalance className="mi" size={14} /> Clinic withheld tax for government filing
            </label>
            {withholdTax && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number" min="0"
                    placeholder="Tax withheld (Br)"
                    value={taxWithheld}
                    onChange={e => setTaxWithheld(e.target.value)}
                    style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 14, background: 'var(--surface)', color: 'var(--text-1)' }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTaxWithheld(String(Math.round((parseFloat(amount) || 0) * 0.03)))}
                  >
                    Auto-fill 3%
                  </button>
                </div>
                {taxWithheld && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
                    Net received: <strong style={{ color: 'var(--text-2)' }}>Br {netReceived.toLocaleString('en-US')}</strong> — invoice stays Br {(parseFloat(amount) || 0).toLocaleString('en-US')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g. Cash at delivery, Bank transfer ref…"
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
              {saving ? 'Saving…' : '✓ Confirm Collected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const fetchTrustedSummary = () =>
  api.get('/dashboard/trusted-partners-summary').then(r => r.data);

const ETB = (v) => `Br ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function TrustedPartnersTab({ queryClient }) {
  const [expanded, setExpanded]   = useState(null); // clinic id
  const [collectCase, setCollect] = useState(null);
  const [statement, setStatement] = useState(null);   // { clinicId, clinic } → Generate Bill modal
  const [cycleClinic, setCycleClinic] = useState(null); // clinic → Billing Cycle modal
  const [clinicCases, setClinicCases] = useState({}); // { [clinicId]: cases[] }
  const [loadingClinic, setLoadingClinic] = useState(null);
  const [search, setSearch] = useState('');

  const cycleBadge = (cyc) => {
    if (!cyc || cyc === 'NONE') return null;
    const map = { WEEKLY: '#0EA5E9', FORTNIGHTLY: '#6366F1', MONTHLY: '#16A34A', CUSTOM: '#9333EA' };
    return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: `${map[cyc]}22`, color: map[cyc] }}>{cyc.toLowerCase()}</span>;
  };

  const { data: summary = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['trusted-partners-summary'],
    queryFn:  fetchTrustedSummary,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const toggleClinic = async (clinicId) => {
    if (expanded === clinicId) { setExpanded(null); return; }
    setExpanded(clinicId);
    if (clinicCases[clinicId]) return; // already loaded
    setLoadingClinic(clinicId);
    try {
      const res = await api.get('/payments/trusted', { params: { clinicId, limit: 200 } });
      setClinicCases(prev => ({ ...prev, [clinicId]: res.data?.cases ?? [] }));
    } catch {}
    finally { setLoadingClinic(null); }
  };

  const cases      = [];
  const pagination = {};

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>;
  if (isError)   return <div style={{ textAlign: 'center', color: 'var(--red)', padding: 60 }}>Could not load trusted partners. <button className="btn btn-ghost btn-sm" onClick={refetch}>Retry</button></div>;
  if (summary.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon mi"><MdHandshake size={32} /></div>
      <div className="empty-title">No trusted partners found</div>
      <p>Clinics marked as Trusted Partners will appear here.</p>
    </div>
  );

  // Client-side filter — the summary endpoint returns every trusted clinic
  // in one shot (no server pagination), so there's no need for a backend
  // round-trip to search this small, already-loaded list.
  const q = search.trim().toLowerCase();
  const filteredSummary = q
    ? summary.filter(c => c.name?.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q))
    : summary;

  // Totals — scoped to the filtered/searched set, so the KPI cards match
  // what's actually shown in the table below them.
  const totals = filteredSummary.reduce((acc, c) => ({
    totalOrders:      acc.totalOrders      + c.totalOrders,
    totalUnits:       acc.totalUnits       + c.totalUnits,
    deliveredOrders:  acc.deliveredOrders  + c.deliveredOrders,
    inProgress:       acc.inProgress       + c.inProgress,
    totalRevenue:     acc.totalRevenue     + c.totalRevenue,
    paymentsReceived: acc.paymentsReceived + c.paymentsReceived,
    outstanding:      acc.outstanding      + c.outstanding,
  }), { totalOrders: 0, totalUnits: 0, deliveredOrders: 0, inProgress: 0, totalRevenue: 0, paymentsReceived: 0, outstanding: 0 });

  const numFmt = (v) => Number(v || 0).toLocaleString('en-US');
  const billsDue = filteredSummary.filter(c => c.billOverdue).length;
  const scheduled = filteredSummary.filter(c => c.billingCycle && c.billingCycle !== 'NONE').length;

  return (
    <>
      {/* Summary KPIs */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#F5F3FF' }}><MdHandshake size={18} /></div>
          <div className="stat-label">Trusted Partners</div>
          <div className="stat-value" style={{ color: '#6D28D9' }}>{summary.length}</div>
          <div className="stat-sub">{scheduled} on a billing schedule</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#EEF2FF' }}><MdAssignment size={18} /></div>
          <div className="stat-label">Total Orders</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{numFmt(totals.totalOrders)}</div>
          <div className="stat-sub">{numFmt(totals.deliveredOrders)} delivered · {numFmt(totals.inProgress)} in progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdPaid size={18} /></div>
          <div className="stat-label">Payments Received</div>
          <div className="stat-value" style={{ color: 'var(--green)', fontSize: totals.paymentsReceived >= 1000000 ? 16 : 22 }}>{ETB(totals.paymentsReceived)}</div>
          <div className="stat-sub">Verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdPendingActions size={18} /></div>
          <div className="stat-label">Outstanding</div>
          <div className="stat-value" style={{ color: 'var(--red)', fontSize: totals.outstanding >= 1000000 ? 16 : 22 }}>{ETB(totals.outstanding)}</div>
          <div className="stat-sub">Pending collection</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: billsDue > 0 ? '#FFF1F2' : 'var(--green-dim)' }}><MdEventNote size={18} /></div>
          <div className="stat-label">Bills Due</div>
          <div className="stat-value" style={{ color: billsDue > 0 ? 'var(--red)' : 'var(--green)' }}>{billsDue}</div>
          <div className="stat-sub">{billsDue > 0 ? 'Scheduled bills overdue' : 'All schedules up to date'}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="search-input" style={{ flex: 1 }}>
          <span className="icon mi"><MdSearch size={16} /></span>
          <input
            placeholder="Search clinic name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')} style={{ color: 'var(--red)' }}>✕</button>
        )}
      </div>

      {/* Partner table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdHandshake className="mi" size={15} /> Trusted Partner Clinics</div>
          <ExportMenu
            data={filteredSummary}
            columns={[
              { header: 'Clinic Name',         value: c => c.name },
              { header: 'Total Orders',         value: c => c.totalOrders },
              { header: 'Total Units',          value: c => c.totalUnits },
              { header: 'Delivered Orders',     value: c => c.deliveredOrders },
              { header: 'Orders in Progress',   value: c => c.inProgress },
              { header: 'Total Revenue (Br)',   value: c => c.totalRevenue.toFixed(2) },
              { header: 'Payments Received (Br)', value: c => c.paymentsReceived.toFixed(2) },
              { header: 'Outstanding (Br)',     value: c => c.outstanding.toFixed(2) },
            ]}
            filename="trusted-partners"
            title="Trusted Partners Summary"
          />
        </div>
        {filteredSummary.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-icon mi"><MdSearch size={28} /></div>
            <div className="empty-title">No clinics match "{search}"</div>
            <p>Try a different name or phone number.</p>
          </div>
        ) : (
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
                <th style={{ textAlign: 'center' }}>Billing</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummary.map(c => (
                <React.Fragment key={c.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggleClinic(c.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#6D28D9', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {c.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.phone}</div>}
                        </div>
                        <span className="badge badge-trusted" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}><MdHandshake size={10} /> Trusted</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>{numFmt(c.totalOrders)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-2)', fontWeight: 600 }}>{numFmt(c.totalUnits) || '—'}</td>
                    <td style={{ textAlign: 'center', color: 'var(--green)', fontWeight: 600 }}>{numFmt(c.deliveredOrders)}</td>
                    <td style={{ textAlign: 'center', color: 'var(--amber)', fontWeight: 600 }}>{numFmt(c.inProgress)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-1)' }}>{ETB(c.totalRevenue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{ETB(c.paymentsReceived)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: c.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {ETB(c.outstanding)}
                      {c.outstandingCount > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>
                          {c.outstandingCount} case{c.outstandingCount !== 1 ? 's' : ''}{c.oldestAgeDays > 0 ? ` · ${c.oldestAgeDays}d old` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {cycleBadge(c.billingCycle)}
                          {c.billOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><MdWarning size={10} /> due</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => setStatement({ clinicId: c.id, clinic: c })}
                            style={{ background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <MdReceipt size={11} /> Bill
                          </button>
                          <button onClick={() => setCycleClinic(c)}
                            style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                            <MdEventNote size={11} />
                          </button>
                          <button onClick={() => toggleClinic(c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)' }}>
                            {expanded === c.id ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded individual cases */}
                  {expanded === c.id && (
                    <tr>
                      <td colSpan={9} style={{ padding: '0 0 12px 0', background: 'var(--surface-2)' }}>
                        {loadingClinic === c.id ? (
                          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Loading cases…</div>
                        ) : (clinicCases[c.id] || []).length === 0 ? (
                          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No cases found</div>
                        ) : (
                          <table style={{ width: '100%', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: 'var(--border)' }}>
                                <th style={{ padding: '6px 12px 6px 52px', textAlign: 'left' }}>Case #</th>
                                <th style={{ padding: '6px 12px', textAlign: 'left' }}>Patient</th>
                                <th style={{ padding: '6px 12px', textAlign: 'left' }}>Work Type</th>
                                <th style={{ padding: '6px 12px', textAlign: 'center' }}>Units</th>
                                <th style={{ padding: '6px 12px', textAlign: 'left' }}>Status</th>
                                <th style={{ padding: '6px 12px', textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '6px 12px' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(clinicCases[c.id] || []).map(cas => (
                                <tr key={cas.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '8px 12px 8px 52px', fontFamily: 'DM Mono, monospace', color: 'var(--blue)' }}>{cas.caseNumber}</td>
                                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{cas.patientName}</td>
                                  <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{cas.workType}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>{cas.units ?? '—'}</td>
                                  <td style={{ padding: '8px 12px' }}><StatusBadge status={cas.status} /></td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                                    {cas.totalAmount ? `Br ${cas.totalAmount.toLocaleString('en-US')}` : '—'}
                                  </td>
                                  <td style={{ padding: '8px 12px' }}>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button onClick={() => setCollect(cas)}
                                        style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <MdPaid size={12} /> Collected
                                      </button>
                                      <button onClick={() => setStatement({ clinicId: cas.clinicId, clinic: cas.clinic })}
                                        style={{ background: '#EFF6FF', color: 'var(--blue)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <MdDescription size={12} /> Statement
                                      </button>
                                    </div>
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

              {/* Totals row */}
              <tr style={{ background: 'var(--surface-2)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '12px 16px', color: 'var(--text-1)' }}>TOTAL — {filteredSummary.length} partner{filteredSummary.length !== 1 ? 's' : ''}{search ? ` (of ${summary.length})` : ''}</td>
                <td style={{ textAlign: 'center', color: 'var(--blue)' }}>{numFmt(totals.totalOrders)}</td>
                <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{numFmt(totals.totalUnits)}</td>
                <td style={{ textAlign: 'center', color: 'var(--green)' }}>{numFmt(totals.deliveredOrders)}</td>
                <td style={{ textAlign: 'center', color: 'var(--amber)' }}>{numFmt(totals.inProgress)}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-1)' }}>{ETB(totals.totalRevenue)}</td>
                <td style={{ textAlign: 'right', color: 'var(--green)' }}>{ETB(totals.paymentsReceived)}</td>
                <td style={{ textAlign: 'right', color: totals.outstanding > 0 ? 'var(--red)' : 'var(--green)' }}>{ETB(totals.outstanding)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        )}
      </div>

      {collectCase && (
        <CollectModal
          caseData={collectCase}
          onDone={() => {
            setCollect(null);
            queryClient.invalidateQueries({ queryKey: ['trusted-partners-summary'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setClinicCases({});
          }}
          onClose={() => setCollect(null)}
        />
      )}
      {statement && (
        <StatementModal
          clinicId={statement.clinicId}
          clinic={statement.clinic}
          onClose={() => setStatement(null)}
          onBilled={() => {
            queryClient.invalidateQueries({ queryKey: ['trusted-partners-summary'] });
            refetch();
          }}
        />
      )}
      {cycleClinic && (
        <BillingCycleModal
          clinic={cycleClinic}
          onClose={() => setCycleClinic(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['trusted-partners-summary'] });
            refetch();
          }}
        />
      )}
    </>
  );
}

// ── Verified History Tab ──────────────────────────────────
function HistoryTab() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleSearch = (v) => { setSearch(v); setPage(1); };

  const exportExcel = async () => {
    setExporting(true);
    try {
      await downloadExport('/payments/export', {
        status: 'VERIFIED',
        search: search || undefined,
      }, `verified_payments_${todayLocal()}.xlsx`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'history', page, search],
    queryFn: () => fetchHistory(page, search),
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  });

  const payments   = data?.payments || [];
  const pagination = data?.pagination || {};

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>;
  if (isError)   return <ErrorState message="Could not load payment history." onRetry={refetch} />;

  if (payments.length === 0 && page === 1) return (
    <div className="empty-state">
      <div className="empty-icon mi"><MdCheckCircle size={32} /></div>
      <div className="empty-title">No verified payments yet</div>
      <p>Approved payment history will appear here.</p>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div className="search-input" style={{ flex: 1 }}>
          <span className="icon mi"><MdSearch size={16} /></span>
          <input
            placeholder="Search clinic, case, patient or invoice…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => handleSearch('')} style={{ color: 'var(--red)' }}>✕</button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={exportExcel} disabled={exporting} style={{ whiteSpace: 'nowrap' }}>
          {exporting ? 'Exporting…' : <><MdFileDownload className="mi" size={14} /> Export Excel</>}
        </button>
      </div>
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Case #</th>
              <th>Clinic</th>
              <th>Patient</th>
              <th>Work Type</th>
              <th>Invoice #</th>
              <th>Amount</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{p.case?.caseNumber}</td>
                <td style={{ fontSize: 13 }}>{p.case?.clinic?.name}</td>
                <td style={{ fontWeight: 600 }}>{p.case?.patientName}</td>
                <td style={{ fontSize: 13 }}>{p.case?.workType}</td>
                <td style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--blue)' }}>
                  {p.invoiceNumber || '—'}
                </td>
                <td style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>
                  {p.amount ? `Br ${p.amount.toLocaleString('en-US')}` : '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {p.verifiedAt ? format(new Date(p.verifiedAt), 'dd MMM yyyy') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page} totalPages={pagination.totalPages || 1}
          total={pagination.total || 0} pageSize={HIST_SIZE}
          onPrev={() => setPage(p => p - 1)}
          onNext={() => setPage(p => p + 1)}
        />
      </div>
    </div>
    </>
  );
}

// ── Cases Tab (in-progress + completed) ──────────────────
const CASE_STATUS_GROUPS = [
  { label: 'All Cases',          value: 'all' },
  { label: 'In Production',      value: 'production' },
  { label: 'Ready to Dispatch',  value: 'READY_TO_DISPATCH' },
  { label: 'Out for Delivery',   value: 'OUT_FOR_DELIVERY' },
  { label: 'Completed',          value: 'DELIVERED' },
];

const PRODUCTION_STATUSES = [
  'CASE_ACCEPTED','PLASTER_DEPARTMENT','MARGIN_DEPARTMENT','SCANNING','DESIGNING',
  'MILLING_SINTERING','RESIN_3D_PRINTING','METAL_3D_PRINTING','METAL_FINISHING',
  'OPAQUE_APPLICATION','CERAMIC_LAYERING','ZIRCONIA_FITTING_FINISHING','GLAZING',
  'THERMO_PRESS','TRIMMING','QUALITY_CHECK','PAYMENT_INVOICING',
];

function CasesTab() {
  const [group, setGroup]       = useState('all');
  const [search, setSearch]     = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [page, setPage]         = useState(1);
  const [exporting, setExporting] = useState(false);

  // 'all' → no status filter (returns every case)
  const statusParam = group === 'all'
    ? undefined
    : group === 'production'
    ? PRODUCTION_STATUSES.join(',')
    : group;

  const queryParams = (extra = {}) => ({
    ...(statusParam ? { status: statusParam } : {}),
    ...(search   ? { search }   : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo   ? { dateTo }   : {}),
    ...extra,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['finance-cases', group, search, dateFrom, dateTo, page],
    queryFn: () => api.get('/cases', { params: queryParams({ limit: 20, page }) }).then(r => r.data),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  // Full-dataset export (all matching rows, not just the current page) —
  // hits the backend /cases/export route so large result sets download in one click.
  const exportAll = async () => {
    setExporting(true);
    try {
      await downloadExport('/cases/export', queryParams(), `finance-cases_${todayLocal()}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const cases = data?.cases ?? [];
  const pagination = data?.pagination ?? {};

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {CASE_STATUS_GROUPS.map(g => (
          <button
            key={g.value}
            className={`filter-chip${group === g.value ? ' active' : ''}`}
            onClick={() => { setGroup(g.value); setPage(1); }}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 14 }}>
        <FilterBar
          search={search} onSearch={v => { setSearch(v); setPage(1); }}
          dateFrom={dateFrom} onDateFrom={v => { setDateFrom(v); setPage(1); }}
          dateTo={dateTo} onDateTo={v => { setDateTo(v); setPage(1); }}
          placeholder="Clinic, patient, case no…"
        />
      </div>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Cases — {CASE_STATUS_GROUPS.find(g2 => g2.value === group)?.label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {pagination.total != null && (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{pagination.total} total</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={exportAll} disabled={exporting}>
              {exporting ? 'Exporting…' : <><MdFileDownload className="mi" size={14} /> Export All (Excel)</>}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : cases.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon mi"><MdAssignment size={32} /></div>
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
                  <th>Order Date</th>
                  <th>Delivery Date</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{c.caseNumber}</td>
                    <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                    <td><span className="patient-name">{c.patientName}</span></td>
                    <td style={{ fontSize: 13 }}>{c.workType}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-2)' }}>{c.units ?? '—'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><PaymentBadge status={c.paymentStatus} /></td>
                    <td style={{ fontWeight: 600, color: 'var(--green)' }}>
                      {c.payment?.amount != null ? `Br ${c.payment.amount.toLocaleString('en-US')}` :
                       c.totalAmount != null ? `Br ${c.totalAmount.toLocaleString('en-US')}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                      {format(new Date(c.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td style={{ fontSize: 12, color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)', fontWeight: c.deliveryDate ? 600 : 400 }}>
                      {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {pagination.totalPages > 1 && (
          <Pagination
            page={page} totalPages={pagination.totalPages}
            total={pagination.total} pageSize={20}
            onPrev={() => setPage(p => p - 1)}
            onNext={() => setPage(p => p + 1)}
          />
        )}
      </div>
    </>
  );
}

// ── Clinic Balances Tab ───────────────────────────────────
const fetchClinicBalances = () => api.get('/dashboard/clinic-balances').then(r => r.data);

function ClinicBalancesTab() {
  const [expanded, setExpanded] = useState(null);

  const { data: rawBalances = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['clinic-balances'],
    queryFn: fetchClinicBalances,
    staleTime: 0,           // always fresh — don't cache stale Br 0 entries
    refetchInterval: 60_000,
  });

  // Filter out clinics with no outstanding amount (no payment amount set yet)
  const balances = rawBalances.filter(b => b.pendingAmount > 0);

  const totalOutstanding = balances.reduce((s, b) => s + b.pendingAmount, 0);

  return (
    <>
      {/* Summary KPI */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdPendingActions size={18} /></div>
          <div className="stat-label">Total Outstanding</div>
          <div className="stat-value" style={{ color: 'var(--red)', fontSize: totalOutstanding >= 100000 ? 17 : 22 }}>
            Br {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-sub">Across all clinics</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}><MdLocalHospital size={18} /></div>
          <div className="stat-label">Clinics with Balance</div>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{balances.length}</div>
          <div className="stat-sub">Have unpaid cases</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#EFF6FF' }}><MdAssignment size={18} /></div>
          <div className="stat-label">Total Unpaid Cases</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>
            {balances.reduce((s, b) => s + b.pendingCount, 0)}
          </div>
          <div className="stat-sub">Pending payment</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdPendingActions className="mi" size={15} /> Outstanding Balance by Clinic</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={refetch}>↺ Refresh</button>
            <ExportMenu
              data={balances}
              columns={[
                { header: 'Clinic',             value: b => b.name },
                { header: 'Trusted Partner',    value: b => b.isExcluded ? 'Yes' : 'No' },
                { header: 'Unpaid Cases',       value: b => b.pendingCount },
                { header: 'Outstanding (Br)',   value: b => b.pendingAmount.toFixed(2) },
              ]}
              filename="clinic-balances"
              title="Outstanding Balance by Clinic"
            />
          </div>
        </div>
        <div className="table-wrap">
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : isError ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load balances.</div>
          ) : balances.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon mi"><MdCelebration size={32} /></div>
              <div className="empty-title">No outstanding balances</div>
              <p>All clinics are up to date.</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Clinic</th>
                  <th>Unpaid Cases</th>
                  <th>Outstanding Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {balances.map(b => (
                  <React.Fragment key={b.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--blue)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {b.name[0]?.toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600 }}>{b.name}</span>
                          {b.isExcluded && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: '#F5F3FF', color: '#6D28D9', fontWeight: 700 }}>TRUSTED</span>}
                        </div>
                      </td>
                      <td style={{ color: 'var(--amber)', fontWeight: 600 }}>{b.pendingCount}</td>
                      <td style={{ fontWeight: 700, color: 'var(--red)', fontSize: 15 }}>
                        Br {b.pendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{expanded === b.id ? '▲' : '▼'}</td>
                    </tr>
                    {expanded === b.id && (
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td colSpan={4} style={{ padding: '6px 16px 0 52px' }}>
                          <div onClick={e => e.stopPropagation()}>
                            <ExportMenu
                              data={b.cases}
                              columns={[
                                { header: 'Case #',        value: c => c.caseNumber || '' },
                                { header: 'Patient',       value: c => c.patientName || '' },
                                { header: 'Work Type',     value: c => c.workType },
                                { header: 'Units',         value: c => c.units ?? '' },
                                { header: 'Order Date',    value: c => c.createdAt ? format(new Date(c.createdAt), 'dd MMM yyyy') : '' },
                                { header: 'Delivery Date', value: c => c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '' },
                                { header: 'Amount (Br)',   value: c => c.amount ?? '' },
                                { header: 'Payment Status', value: c => c.paymentStatus },
                              ]}
                              filename={`outstanding-${b.name.replace(/\s+/g, '-').toLowerCase()}`}
                              title={`Outstanding — ${b.name}`}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    {expanded === b.id && b.cases.map(c => {
                      const isOldFormat = c.patientName && /^[A-Z]{2,4}-\d{4}-\d+$/.test(c.patientName);
                      return (
                        <tr key={c.caseId} style={{ background: 'var(--surface-2)' }}>
                          <td colSpan={4} style={{ padding: '8px 16px 8px 52px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr 1fr auto', gap: '8px 20px', fontSize: 12, alignItems: 'center' }}>
                              {/* Case # */}
                              <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {c.caseNumber || '—'}
                              </span>
                              {/* Patient */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 1 }}>PATIENT</div>
                                <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                                  {isOldFormat ? '—' : (c.patientName || '—')}
                                </div>
                              </div>
                              {/* Work type + units */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 1 }}>PRODUCT · UNITS</div>
                                <div style={{ color: 'var(--text-2)' }}>
                                  {c.workType}
                                  {c.units ? <span style={{ fontWeight: 700, color: 'var(--accent)', marginLeft: 6 }}>{c.units}u</span> : ''}
                                </div>
                              </div>
                              {/* Order date */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 1 }}>ORDER DATE</div>
                                <div style={{ color: 'var(--text-2)' }}>
                                  {c.createdAt ? format(new Date(c.createdAt), 'dd MMM yyyy') : '—'}
                                </div>
                              </div>
                              {/* Delivery date */}
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', marginBottom: 1 }}>DELIVERY DATE</div>
                                <div style={{ color: c.deliveryDate ? 'var(--green)' : 'var(--text-3)', fontWeight: c.deliveryDate ? 600 : 400 }}>
                                  {c.deliveryDate ? format(new Date(c.deliveryDate), 'dd MMM yyyy') : '—'}
                                </div>
                              </div>
                              {/* Amount + payment status */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontWeight: 700, color: c.amount != null ? 'var(--green)' : 'var(--red)' }}>
                                  {c.amount != null ? `Br ${c.amount.toLocaleString('en-US')}` : 'No amount set'}
                                </span>
                                <PaymentBadge status={c.paymentStatus} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ── Revenue Overview panel (Report › Overview) ────────────
function RevenueOverviewPanel() {
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [search, setSearch]   = useState('');
  const [applied, setApplied] = useState({ from: '', to: '', search: '' });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-report', applied],
    queryFn: () => fetchFinanceReport(applied),
    staleTime: 60_000,
  });

  const apply = () => setApplied({ from, to, search });
  const clear  = () => { setFrom(''); setTo(''); setSearch(''); setApplied({ from: '', to: '', search: '' }); };

  const r  = data?.revenue  || {};
  const u  = data?.units    || {};
  const pend = data?.pending || {};
  const tax  = data?.taxWithheld || {};

  const fmtBr = (n) => `Br ${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>From</div>
            <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>To</div>
            <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)}
              style={{ padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 4 }}>Search clinic / case no.</div>
            <input type="text" placeholder="Clinic name or case number…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={apply}>Apply</button>
            {(applied.from || applied.to || applied.search) && (
              <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
            )}
          </div>
        </div>
      </div>

      {isLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading report…</div>}
      {isError  && <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load report.</div>}

      {data && (
        <>
          {/* Revenue KPI row */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Revenue
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdCalendarToday size={18} /></div>
              <div className="stat-label">Today</div>
              <div className="stat-value" style={{ color: 'var(--green)', fontSize: (r.daily?.amount || 0) >= 100000 ? 17 : 22 }}>
                {fmtBr(r.daily?.amount)}
              </div>
              <div className="stat-sub">{r.daily?.count || 0} payment{r.daily?.count !== 1 ? 's' : ''}</div>
            </div>
            {(applied.from || applied.to) ? (
              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#EFF6FF' }}><MdSearch size={18} /></div>
                <div className="stat-label">Selected Range</div>
                <div className="stat-value" style={{ color: 'var(--blue)', fontSize: (r.range?.amount || 0) >= 100000 ? 17 : 22 }}>
                  {fmtBr(r.range?.amount)}
                </div>
                <div className="stat-sub">{r.range?.count || 0} payments</div>
              </div>
            ) : (
              <div className="stat-card">
                <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdPendingActions size={18} /></div>
                <div className="stat-label">Pending</div>
                <div className="stat-value" style={{ color: 'var(--red)', fontSize: (pend.amount || 0) >= 100000 ? 17 : 22 }}>
                  {fmtBr(pend.amount)}
                </div>
                <div className="stat-sub">{pend.count || 0} unpaid cases</div>
              </div>
            )}
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#EEF2FF' }}><MdInventory2 size={18} /></div>
              <div className="stat-label">Units Delivered Today</div>
              <div className="stat-value">{u.daily || 0}</div>
              <div className="stat-sub">units</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#F5F3FF' }}><MdAccountBalance size={18} /></div>
              <div className="stat-label">Tax Withheld{applied.from || applied.to ? ' (Range)' : ' (YTD)'}</div>
              <div className="stat-value" style={{ color: '#6D28D9', fontSize: (tax.amount || 0) >= 100000 ? 17 : 22 }}>
                {fmtBr(tax.amount)}
              </div>
              <div className="stat-sub">{tax.count || 0} payment{tax.count !== 1 ? 's' : ''} · deducted by clinics for tax filing</div>
            </div>
          </div>

          {/* Verified payments table */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdCheckCircle className="mi" size={15} /> Verified Payments {applied.from || applied.to ? '(filtered)' : ''}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.recentVerified?.length || 0} records</span>
                <ExportMenu
                  data={data.recentVerified || []}
                  columns={[
                    { header: 'Case #',      value: p => p.case?.caseNumber },
                    { header: 'Clinic',      value: p => p.case?.clinic?.name },
                    { header: 'Patient',     value: p => p.case?.patientName },
                    { header: 'Work Type',   value: p => p.case?.workType },
                    { header: 'Invoice #',   value: p => p.invoiceNumber ?? '' },
                    { header: 'Amount (Br)', value: p => p.amount ?? '' },
                    { header: 'Verified',    value: p => p.verifiedAt ? format(new Date(p.verifiedAt), 'dd MMM yyyy') : '' },
                  ]}
                  filename="verified-payments"
                  title="Verified Payments — Finance Report"
                />
              </div>
            </div>
            <div className="table-wrap">
              {!data.recentVerified?.length ? (
                <div className="empty-state">
                  <div className="empty-icon mi"><MdMoneyOff size={32} /></div>
                  <div className="empty-title">No verified payments</div>
                  <p>No payments match the selected filters.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Case #</th>
                      <th>Clinic</th>
                      <th>Patient</th>
                      <th>Work Type</th>
                      <th>Invoice</th>
                      <th>Amount</th>
                      <th>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentVerified.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{p.case?.caseNumber}</td>
                        <td style={{ fontSize: 13 }}>{p.case?.clinic?.name}</td>
                        <td style={{ fontWeight: 600 }}>{p.case?.patientName}</td>
                        <td style={{ fontSize: 13 }}>{p.case?.workType}</td>
                        <td style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--blue)' }}>{p.invoiceNumber || '—'}</td>
                        <td style={{ fontWeight: 700, color: 'var(--green)' }}>
                          {p.amount ? `Br ${p.amount.toLocaleString('en-US')}` : '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {p.verifiedAt ? format(new Date(p.verifiedAt), 'dd MMM yyyy') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Pending payments table */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdPendingActions className="mi" size={15} /> Pending Payments</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{data.recentPending?.length || 0} records</span>
                <ExportMenu
                  data={data.recentPending || []}
                  columns={[
                    { header: 'Case #',      value: p => p.case?.caseNumber },
                    { header: 'Clinic',      value: p => p.case?.clinic?.name },
                    { header: 'Patient',     value: p => p.case?.patientName },
                    { header: 'Work Type',   value: p => p.case?.workType },
                    { header: 'Amount (Br)', value: p => p.amount ?? '' },
                    { header: 'Status',      value: p => p.status },
                    { header: 'Updated',     value: p => p.updatedAt ? format(new Date(p.updatedAt), 'dd MMM yyyy') : '' },
                  ]}
                  filename="pending-payments"
                  title="Pending Payments — Finance Report"
                />
              </div>
            </div>
            <div className="table-wrap">
              {!data.recentPending?.length ? (
                <div className="empty-state">
                  <div className="empty-icon mi"><MdCelebration size={32} /></div>
                  <div className="empty-title">No pending payments</div>
                  <p>All payments are up to date.</p>
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
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentPending.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{p.case?.caseNumber}</td>
                        <td style={{ fontSize: 13 }}>{p.case?.clinic?.name}</td>
                        <td style={{ fontWeight: 600 }}>{p.case?.patientName}</td>
                        <td style={{ fontSize: 13 }}>{p.case?.workType}</td>
                        <td style={{ fontWeight: 700, color: 'var(--amber)' }}>
                          {p.amount ? `Br ${p.amount.toLocaleString('en-US')}` : '—'}
                        </td>
                        <td><PaymentBadge status={p.status} /></td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                          {p.updatedAt ? format(new Date(p.updatedAt), 'dd MMM yyyy') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Main Finance Dashboard ────────────────────────────────
// ── Ready for Delivery Tab ────────────────────────────────
// Finance view of cases that passed QC (READY_TO_DISPATCH) — payment status at a glance.
function ReadyForDeliveryTab() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['payments', 'ready-for-delivery'],
    queryFn: () => api.get('/cases', { params: { status: 'READY_TO_DISPATCH', limit: 300 } }).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const cases = (data?.cases ?? []).filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.clinic?.name?.toLowerCase().includes(q)
        || c.caseNumber?.toLowerCase().includes(q)
        || c.patientName?.toLowerCase().includes(q);
  });

  const total = cases.reduce((s, c) => s + (c.payment?.amount ?? c.totalAmount ?? 0), 0);
  const verified = cases.filter(c => c.paymentStatus === 'VERIFIED').length;

  return (
    <>
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--accent-dim)' }}><MdInventory2 size={18} /></div>
          <div className="stat-label">Ready for Delivery</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{cases.length}</div>
          <div className="stat-sub">Passed QC</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdCheckCircle size={18} /></div>
          <div className="stat-label">Payment Verified</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{verified}</div>
          <div className="stat-sub">Cleared to dispatch</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdPaid size={18} /></div>
          <div className="stat-label">Total Value</div>
          <div className="stat-value" style={{ color: 'var(--text-1)', fontSize: total >= 1000000 ? 16 : 22 }}>{ETB(total)}</div>
          <div className="stat-sub">Across {cases.length} cases</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MdInventory2 className="mi" size={15} /> Ready for Delivery</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="search-input" style={{ maxWidth: 240 }}>
              <span className="icon mi"><MdSearch size={16} /></span>
              <input placeholder="Search clinic, case, patient…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <ExportMenu
              data={cases}
              columns={[
                { header: 'Case #',      value: c => c.caseNumber },
                { header: 'Clinic',      value: c => c.clinic?.name },
                { header: 'Patient',     value: c => c.patientName },
                { header: 'Work Type',   value: c => c.workType },
                { header: 'Units',       value: c => c.units ?? '' },
                { header: 'Amount (Br)', value: c => c.payment?.amount ?? c.totalAmount ?? '' },
                { header: 'Payment',     value: c => c.paymentStatus },
              ]}
              filename="ready-for-delivery" title="Ready for Delivery"
            />
          </div>
        </div>
        <div className="table-wrap">
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Loading…</div>
          ) : cases.length === 0 ? (
            <div className="empty-state"><div className="empty-icon mi"><MdCelebration size={32} /></div><div className="empty-title">Nothing ready for delivery</div></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Case #</th><th>Clinic</th><th>Patient</th><th>Work Type</th>
                  <th style={{ textAlign: 'center' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>Amount</th><th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{c.caseNumber}</td>
                    <td style={{ fontWeight: 600 }}>{c.clinic?.name}</td>
                    <td>{c.patientName}</td>
                    <td style={{ fontSize: 13 }}>{c.workType}</td>
                    <td style={{ textAlign: 'center' }}>{c.units ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>
                      {(c.payment?.amount ?? c.totalAmount) ? ETB(c.payment?.amount ?? c.totalAmount) : '—'}
                    </td>
                    <td><PaymentBadge status={c.paymentStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ── Report Tab ────────────────────────────────────────────
// Four views: revenue Overview, plus Verified History, Clinic Balances and Cases
// (folded in from the old standalone Analytics nav items).
const REPORT_VIEWS = [
  { id: 'overview', label: 'Overview', icon: MdTrendingUp },
  { id: 'history',  label: 'Verified History', icon: MdCheckCircle },
  { id: 'balances', label: 'Clinic Balances', icon: MdAccountBalanceWallet },
  { id: 'cases',    label: 'Cases', icon: MdAssignment },
];
function ReportTab({ view = 'overview', onView }) {
  return (
    <>
      <div className="filters" style={{ margin: '0 0 18px', flexWrap: 'wrap' }}>
        {REPORT_VIEWS.map(v => (
          <button key={v.id} className={`filter-chip ${view === v.id ? 'active' : ''}`} onClick={() => onView?.(v.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <v.icon size={14} /> {v.label}
          </button>
        ))}
      </div>
      {view === 'history'  && <HistoryTab />}
      {view === 'balances' && <ClinicBalancesTab />}
      {view === 'cases'    && <CasesTab />}
      {view === 'overview' && <RevenueOverviewPanel />}
    </>
  );
}

// Nav model — single source of truth, rendered in both drawer + sidebar.
const NAV_GROUPS = [
  { group: 'Overview', items: [
    { id: 'dashboard',  label: 'Dashboard',          icon: MdDashboard },
  ]},
  { group: 'Operations', items: [
    { id: 'ready',      label: 'Ready for Delivery', icon: MdInventory2 },
    { id: 'billing',    label: 'Billing & Invoicing',icon: MdDescription, badge: 'payments' },
    { id: 'trusted',    label: 'Trusted Partners',   icon: MdHandshake, badge: 'trusted' },
  ]},
  { group: 'Analytics', items: [
    { id: 'report',     label: 'Report',             icon: MdTrendingUp },
  ]},
];
const MAIN_TABS = NAV_GROUPS.flatMap(g => g.items);

// Narrower finance accounts (client request 5/8/2026): FINANCE_AP only follows
// up Trusted Partners; FINANCE_CASHIER only does day-to-day collection. Both
// are enforced backend-side (restrict() in payments.js/dashboard.js) — this
// scope just keeps the UI from linking to pages/queries those roles get a
// 403 from.
const scopeForRole = (role) => role === 'FINANCE_AP' ? 'AP' : role === 'FINANCE_CASHIER' ? 'CASHIER' : 'FULL';

export default function FinanceDashboard() {
  const { user, logout } = useAuth();
  const scope = scopeForRole(user?.role);
  const [tab, setTab]    = useState(() => scope === 'AP' ? 'trusted' : scope === 'CASHIER' ? 'billing' : 'dashboard');
  const [billingView, setBillingView] = useState(() => scope === 'CASHIER' ? 'verify' : 'invoices'); // invoices | verify
  const [reportView, setReportView]   = useState('overview');  // overview | history | balances | cases
  const [open, setOpen]  = useState(false);
  const queryClient      = useQueryClient();

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'FN';
  const roleLabel = scope === 'AP' ? 'Finance — AP' : scope === 'CASHIER' ? 'Finance — Cashier' : 'Finance';

  // dashboard/summary and finance-report are FULL-scope only (backend restrict()
  // doesn't grant them to FINANCE_AP/FINANCE_CASHIER) — AP/Cashier skip the
  // 'dashboard' tab entirely, so these would just be wasted 403s otherwise.
  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: scope === 'FULL',
  });

  const { data: pending = [] } = useQuery({
    queryKey: ['payments', 'pending'],
    queryFn: fetchPending,
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: scope !== 'AP',
  });

  const { data: billing = [] } = useQuery({
    queryKey: ['payments', 'billing'],
    queryFn: fetchBilling,
    staleTime: 60_000,
    enabled: scope !== 'AP',
  });

  // Accurate trusted-partner status straight from the summary endpoint
  const { data: trustedSummary = [] } = useQuery({
    queryKey: ['trusted-partners-summary'],
    queryFn: fetchTrustedSummary,
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: scope !== 'CASHIER',
  });
  const trustedOutstanding = trustedSummary.filter(c => c.outstanding > 0).length;
  const trustedBillsDue    = trustedSummary.filter(c => c.billOverdue).length;

  const { data: quickReport } = useQuery({
    queryKey: ['finance-report', { from: '', to: '', search: '' }],
    queryFn: () => fetchFinanceReport({}),
    staleTime: 120_000,
    refetchInterval: 120_000,
    enabled: scope === 'FULL',
  });

  const uploadedCount  = billing.filter(c => c.paymentStatus === 'SCREENSHOT_UPLOADED').length;
  const paymentsToVerify = pending.length + uploadedCount;
  const stats          = summary?.stats || {};

  // Badge value resolver — keyed by NAV item .badge
  const badgeFor = (key) => {
    if (key === 'payments') return paymentsToVerify;
    if (key === 'trusted')  return trustedOutstanding;
    return 0;
  };

  const currentTab = MAIN_TABS.find(t => t.id === tab);

  const setTabAndClose = (id) => { setTab(id); setOpen(false); };

  // AP only follows up Trusted Partners; Cashier only does Billing/collection —
  // trim the nav (and thus the only tabs reachable) to match what the backend
  // actually grants each role.
  const navGroups = scope === 'AP'
    ? NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(i => i.id === 'trusted') })).filter(g => g.items.length)
    : scope === 'CASHIER'
    ? NAV_GROUPS.map(g => ({ ...g, items: g.items.filter(i => i.id === 'billing') })).filter(g => g.items.length)
    : NAV_GROUPS;

  // Shared nav renderer — used by both the mobile drawer and the desktop sidebar
  const NavList = ({ onNav }) => (
    <nav className="sidebar-nav">
      {navGroups.map(grp => (
        <React.Fragment key={grp.group}>
          <div className="nav-section-label">{grp.group}</div>
          {grp.items.map(item => {
            const count = item.badge ? badgeFor(item.badge) : 0;
            return (
              <button key={item.id}
                className={`nav-item${tab === item.id ? ' active' : ''}`}
                onClick={() => onNav(item.id)}>
                <item.icon className="mi" size={17} /> {item.label}
                {count > 0 && <span className="badge-count">{count}</span>}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </nav>
  );

  return (
    <div className="app">
      {/* ── Mobile topbar ───────────────────────────────── */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {currentTab?.icon && <currentTab.icon className="mi" size={16} />} {currentTab?.label}
        </span>
        <div className="live-dot" />
      </div>

      {/* ── Drawer overlay ──────────────────────────────── */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* ── Drawer ──────────────────────────────────────── */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A' }}>{roleLabel}</span>
        </div>
        <NavList onNav={setTabAndClose} />
        <div className="drawer-footer">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}><AttendanceClock /> <LeaveRequestButton /></div>
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#16A34A', color: '#fff' }}>{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{roleLabel}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
          </div>
        </div>
      </div>

      {/* ── Sidebar (desktop only) ───────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img
            src="/logo.png" alt="Ye-Almaz"
            style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }}
          />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A' }}>{roleLabel}</span>
        </div>

        <NavList onNav={setTab} />

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}><AttendanceClock /> <LeaveRequestButton /></div>
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#16A34A', color: '#fff' }}>{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{roleLabel}</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout"><MdLogout className="mi" size={17} /></button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────── */}
      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(() => { const Icon = MAIN_TABS.find(t => t.id === tab)?.icon; return Icon ? <Icon className="mi" size={17} /> : null; })()}
            {MAIN_TABS.find(t => t.id === tab)?.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
            <div className="live-dot" />
            Live
          </div>
        </div>

        <div className="content">
          {/* ── Dashboard home — Excel-style KPIs (all clickable) + work queue ── */}
          {tab === 'dashboard' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Today's Finance Overview
              </div>
              <div className="stats-grid" style={{ marginBottom: 18, gridTemplateColumns: 'repeat(5,1fr)' }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('ready')}>
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdInventory2 size={18} /></div>
                  <div className="stat-label">Delivered / Day</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.deliveredToday ?? 0}</div>
                  <div className="stat-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>View deliveries ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setReportView('overview'); setTab('report'); }}>
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdInventory2 size={18} /></div>
                  <div className="stat-label">Total Units</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{quickReport?.units?.daily ?? 0}</div>
                  <div className="stat-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>Units today ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setReportView('overview'); setTab('report'); }}>
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdPaid size={18} /></div>
                  <div className="stat-label">Revenue</div>
                  <div className="stat-value" style={{ color: 'var(--green)', fontSize: (quickReport?.revenue?.daily?.amount || 0) >= 100000 ? 15 : 20 }}>
                    Br {(quickReport?.revenue?.daily?.amount || 0).toLocaleString('en-US')}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>Verified today ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setReportView('history'); setTab('report'); }}>
                  <div className="stat-icon" style={{ background: 'var(--green-dim)' }}><MdCheckCircle size={18} /></div>
                  <div className="stat-label">Paid</div>
                  <div className="stat-value" style={{ color: 'var(--green)' }}>{quickReport?.paid?.today ?? 0}</div>
                  <div className="stat-sub" style={{ color: 'var(--green)', fontWeight: 600 }}>View history ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setReportView('balances'); setTab('report'); }}>
                  <div className="stat-icon" style={{ background: '#FFF1F2' }}><MdPendingActions size={18} /></div>
                  <div className="stat-label">Pending</div>
                  <div className="stat-value" style={{ color: 'var(--red)', fontSize: (quickReport?.pending?.amount || 0) >= 100000 ? 15 : 20 }}>
                    Br {(quickReport?.pending?.amount || 0).toLocaleString('en-US')}
                  </div>
                  <div className="stat-sub" style={{ color: 'var(--red)', fontWeight: 600 }}>{quickReport?.pending?.count || 0} unpaid ↗</div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, margin: '16px 0 10px' }}>
                Work Queue
              </div>
              <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4,1fr)' }}>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setBillingView('verify'); setTab('billing'); }}>
                  <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}><MdCreditCard size={18} /></div>
                  <div className="stat-label">Payments to Verify</div>
                  <div className="stat-value" style={{ color: 'var(--amber)' }}>{paymentsToVerify}</div>
                  <div className="stat-sub" style={{ color: 'var(--amber)', fontWeight: 600 }}>Gateway payments ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => { setBillingView('invoices'); setTab('billing'); }}>
                  <div className="stat-icon" style={{ background: '#EFF6FF' }}><MdDescription size={18} /></div>
                  <div className="stat-label">Invoices Today</div>
                  <div className="stat-value" style={{ color: 'var(--blue)' }}>{quickReport?.paid?.today ?? 0}</div>
                  <div className="stat-sub" style={{ color: 'var(--blue)', fontWeight: 600 }}>View invoices ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('trusted')}>
                  <div className="stat-icon" style={{ background: '#F5F3FF' }}><MdHandshake size={18} /></div>
                  <div className="stat-label">Trusted — Outstanding</div>
                  <div className="stat-value" style={{ color: '#6D28D9' }}>{trustedOutstanding}</div>
                  <div className="stat-sub" style={{ color: '#6D28D9', fontWeight: 600 }}>Clinics to bill ↗</div>
                </div>
                <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('trusted')}>
                  <div className="stat-icon" style={{ background: trustedBillsDue > 0 ? '#FFF1F2' : 'var(--green-dim)' }}><MdEventNote size={18} /></div>
                  <div className="stat-label">Bills Due</div>
                  <div className="stat-value" style={{ color: trustedBillsDue > 0 ? 'var(--red)' : 'var(--green)' }}>{trustedBillsDue}</div>
                  <div className="stat-sub" style={{ color: trustedBillsDue > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                    {trustedBillsDue > 0 ? 'Overdue schedules ↗' : 'All up to date'}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Tab content ─────────────────────────────── */}
          {tab === 'ready'    && <ReadyForDeliveryTab />}
          {tab === 'billing'  && <BillingTab view={billingView} onView={setBillingView} scope={scope} />}
          {tab === 'trusted'  && <TrustedPartnersTab queryClient={queryClient} />}
          {tab === 'report'   && <ReportTab view={reportView} onView={setReportView} />}
        </div>
      </main>
    </div>
  );
}
