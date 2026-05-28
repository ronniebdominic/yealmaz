// Ye-Almaz — Finance Department Dashboard
// Standalone page (no Layout wrapper) for FINANCE role users
// Tabs: Screenshot Approvals · Billing & Invoicing · Verified History

import { useState, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import Pagination from '../components/Pagination';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';

const PAGE_SIZE = 15;
const HIST_SIZE = 20;

// ── Data fetchers ─────────────────────────────────────────
const fetchSummary = () => api.get('/dashboard/summary').then(r => r.data);
const fetchPending = () => api.get('/payments/pending').then(r => r.data.payments ?? r.data);
const fetchBilling = () => api.get('/payments/billing').then(r => r.data.cases    ?? r.data);
const fetchHistory = (page) =>
  api.get(`/payments/history?page=${page}&limit=${HIST_SIZE}`).then(r => r.data);
const fetchTrusted = (page) =>
  api.get(`/payments/trusted?page=${page}&limit=${HIST_SIZE}`).then(r => r.data);

// ── Lab info constant ─────────────────────────────────────
const LAB = {
  name: 'Ye-Almaz Dental Laboratory',
  address: 'Addis Ababa, Ethiopia',
  phone: '+251 911 000 000',
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
  <div>
    <div class="lab-name">🦷 ${LAB.name}</div>
    <div class="lab-sub">${LAB.address}<br>${LAB.phone} · ${LAB.email}</div>
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

// ── Issue Invoice Modal ───────────────────────────────────
function IssueInvoiceModal({ caseData, onDone, onClose }) {
  const [amount, setAmount]   = useState(caseData.totalAmount?.toString() || '');
  const [notes, setNotes]     = useState(caseData.payment?.invoiceNotes || '');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error('Enter a valid amount'); return; }
    setLoading(true);
    try {
      await api.post(`/payments/${caseData.id}/invoice`, { amount: num, notes });
      toast.success(`Invoice issued — INV-${caseData.caseNumber}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to issue invoice');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Issue Invoice</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>
              INV-{caseData.caseNumber}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              {caseData.workType}{caseData.toothNumbers ? ` · Teeth ${caseData.toothNumbers}` : ''}{caseData.shade ? ` · Shade ${caseData.shade}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>🏥 {caseData.clinic?.name}</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Invoice Amount (Br) *</label>
            <input
              type="number" min="1" placeholder="e.g. 12500" value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 15, fontWeight: 700 }}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
            <textarea
              rows={3} placeholder="Payment instructions, bank details, etc." value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={submit} disabled={loading}>
              {loading ? 'Issuing…' : '📄 Issue Invoice'}
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
            <button className="btn btn-primary btn-sm" onClick={printInvoice}>🖨️ Print / Save PDF</button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: 'var(--navy)', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>🦷 {LAB.name}</div>
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
      <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 8 }}>
        Failed to load data
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{message}</div>
      <button className="btn btn-primary btn-sm" onClick={onRetry}>Try Again</button>
    </div>
  );
}

// ── Screenshot Approvals Tab ──────────────────────────────
function ScreenshotsTab({ queryClient }) {
  const [processing, setProcessing] = useState(null);
  const [page, setPage] = useState(1);

  const { data: payments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'pending'],
    queryFn: fetchPending,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const verifyMutation = useMutation({
    mutationFn: ({ caseId, action, rejectionReason }) =>
      api.post(`/payments/${caseId}/verify`, { action, rejectionReason }),
    onSuccess: (_, { action }) => {
      toast.success(action === 'APPROVE' ? '✅ Payment approved — case ready for dispatch.' : '❌ Payment rejected.');
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

  const totalPages = Math.ceil(payments.length / PAGE_SIZE);
  const paginated  = useMemo(() => payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [payments, page]);

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>;
  if (isError)   return <ErrorState message="Could not load pending screenshots." onRetry={refetch} />;

  if (payments.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📸</div>
      <div className="empty-title">No screenshots awaiting review</div>
      <p>When a clinic uploads a payment screenshot, it will appear here for you to approve or reject.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {paginated.map(p => (
        <div className="card" key={p.id} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Screenshot thumbnail */}
            <div style={{ width: 180, flexShrink: 0, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              {p.screenshotUrl ? (
                <img
                  src={p.screenshotUrl}
                  alt="Payment screenshot"
                  style={{ width: '100%', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}
                  onClick={() => window.open(p.screenshotUrl, '_blank')}
                  title="Click to view full size"
                />
              ) : (
                <div style={{ color: 'var(--text-3)', textAlign: 'center', fontSize: 12 }}>No image</div>
              )}
            </div>

            {/* Details */}
            <div style={{ flex: 1, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{p.case?.patientName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'DM Mono, monospace', marginTop: 2 }}>{p.case?.caseNumber}</div>
                </div>
                <PaymentBadge status={p.status} />
              </div>
              <div className="grid-2" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Clinic: </span>
                  <strong>{p.case?.clinic?.name}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Amount: </span>
                  <strong>{p.amount ? `Br ${p.amount.toLocaleString('en-US')}` : '—'}</strong>
                </div>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Work: </span>
                  <strong>{p.case?.workType}</strong>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Uploaded: {p.uploadedAt ? format(new Date(p.uploadedAt), 'dd MMM, h:mm a') : '—'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-success"
                  onClick={() => verify(p.caseId, 'APPROVE')}
                  disabled={!!processing}
                >
                  ✓ Approve & Unlock Delivery
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => verify(p.caseId, 'REJECT')}
                  disabled={!!processing}
                >
                  ✗ Reject
                </button>
                {p.screenshotUrl && (
                  <button className="btn btn-ghost btn-sm" onClick={() => window.open(p.screenshotUrl, '_blank')}>
                    🖼️ Full Image
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      <Pagination
        page={page} totalPages={totalPages}
        total={payments.length} pageSize={PAGE_SIZE}
        onPrev={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
      />
    </div>
  );
}

// ── Billing & Invoicing Tab ───────────────────────────────
const BILLING_SUB_TABS = [
  { id: 'awaiting',   label: 'Awaiting Payment',    icon: '⏳' },
  { id: 'uploaded',   label: 'Screenshot Uploaded', icon: '📸' },
  { id: 'to-invoice', label: 'To Invoice',          icon: '📄' },
];

function BillingTab({ queryClient }) {
  // Default to 'awaiting' — that's where active cases live
  const [subTab, setSubTab]         = useState('awaiting');
  const [issueModal, setIssueModal] = useState(null);
  const [viewModal, setViewModal]   = useState(null);
  const [processing, setProcessing] = useState(null);
  const [page, setPage]             = useState(1);

  const changeSubTab = (t) => { setSubTab(t); setPage(1); };

  const { data: cases = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'billing'],
    queryFn: fetchBilling,
    staleTime: 60_000,
  });

  const verifyMutation = useMutation({
    mutationFn: ({ caseId, action, rejectionReason }) =>
      api.post(`/payments/${caseId}/verify`, { action, rejectionReason }),
    onSuccess: (_, { action }) => {
      toast.success(action === 'APPROVE' ? '✅ Payment approved — case ready for dispatch.' : '❌ Payment rejected.');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Action failed. Please try again.'),
    onSettled: () => setProcessing(null),
  });

  const verify = (caseId, action) => {
    let rejectionReason;
    if (action === 'REJECT') {
      rejectionReason = prompt('Reason for rejection (sent to clinic):');
      if (!rejectionReason) return;
    }
    setProcessing(caseId + action);
    verifyMutation.mutate({ caseId, action, rejectionReason });
  };

  const toInvoice = useMemo(() => cases.filter(c => c.status === 'PAYMENT_INVOICING' && !c.totalAmount), [cases]);
  const awaiting  = useMemo(() => cases.filter(c => c.totalAmount && c.paymentStatus === 'PENDING'), [cases]);
  const uploaded  = useMemo(() => cases.filter(c => c.paymentStatus === 'SCREENSHOT_UPLOADED'), [cases]);

  const buckets    = { 'to-invoice': toInvoice, awaiting, uploaded };
  const shown      = buckets[subTab] || [];
  const totalPages = Math.ceil(shown.length / PAGE_SIZE);
  const paginated  = useMemo(() => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [shown, page]);

  const counts = { 'to-invoice': toInvoice.length, awaiting: awaiting.length, uploaded: uploaded.length };

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>;
  if (isError)   return <ErrorState message="Could not load billing data." onRetry={refetch} />;

  return (
    <>
      {/* Sub-tabs */}
      <div className="filters" style={{ marginBottom: 20 }}>
        {BILLING_SUB_TABS.map(t => (
          <button key={t.id} className={`filter-chip ${subTab === t.id ? 'active' : ''}`} onClick={() => changeSubTab(t.id)}>
            {t.icon} {t.label}
            {counts[t.id] > 0 && <span className="badge-count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{BILLING_SUB_TABS.find(t => t.id === subTab)?.icon}</div>
          <div className="empty-title">
            {subTab === 'awaiting'   ? 'No cases awaiting payment'
              : subTab === 'uploaded' ? 'No screenshots to review'
              : 'No cases awaiting invoice'}
          </div>
          <p>
            {subTab === 'awaiting'   ? 'Cases with issued invoices waiting for the clinic to upload a payment screenshot appear here.'
              : subTab === 'uploaded' ? 'After a clinic uploads a payment screenshot, it appears here to approve or reject.'
              : 'Cases reach here after completing all lab work and entering the Payment / Invoicing stage.'}
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Clinic</th>
                  <th>Work</th>
                  <th>Invoice</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span className="case-number">{c.caseNumber}</span>
                      <div className="patient-name" style={{ marginTop: 2 }}>{c.patientName}</div>
                    </td>
                    <td style={{ fontSize: 13 }}>{c.clinic?.name}</td>
                    <td style={{ fontSize: 13 }}>
                      {c.workType}
                      {c.toothNumbers && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>#{c.toothNumbers}</div>}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'DM Mono, monospace' }}>
                      {c.payment?.invoiceNumber
                        ? <span style={{ color: 'var(--blue)' }}>{c.payment.invoiceNumber}</span>
                        : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      {c.payment?.invoiceIssuedAt && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'inherit', marginTop: 1 }}>
                          {format(new Date(c.payment.invoiceIssuedAt), 'dd MMM yyyy')}
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
                      {c.totalAmount ? `Br ${c.totalAmount.toLocaleString('en-US')}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                      <div style={{ marginTop: 4 }}><PaymentBadge status={c.paymentStatus} /></div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => setIssueModal(c)}>
                          {c.payment?.invoiceNumber ? '✏️ Edit Invoice' : '📄 Issue Invoice'}
                        </button>
                        {c.payment?.invoiceNumber && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setViewModal(c)}>
                            🖨️ View / Print
                          </button>
                        )}
                        {c.paymentStatus === 'SCREENSHOT_UPLOADED' && (
                          <>
                            {c.payment?.screenshotUrl && (
                              <button className="btn btn-ghost btn-sm" onClick={() => window.open(c.payment.screenshotUrl, '_blank')}>
                                🖼️ Screenshot
                              </button>
                            )}
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => verify(c.id, 'APPROVE')}
                              disabled={!!processing}
                            >✓ Approve</button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => verify(c.id, 'REJECT')}
                              disabled={!!processing}
                            >✗ Reject</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page} totalPages={totalPages}
              total={shown.length} pageSize={PAGE_SIZE}
              onPrev={() => setPage(p => p - 1)}
              onNext={() => setPage(p => p + 1)}
            />
          </div>
        </div>
      )}

      {issueModal && (
        <IssueInvoiceModal
          caseData={issueModal}
          onDone={() => { setIssueModal(null); queryClient.invalidateQueries({ queryKey: ['payments'] }); }}
          onClose={() => setIssueModal(null)}
        />
      )}
      {viewModal && (
        <InvoiceViewModal caseData={viewModal} onClose={() => setViewModal(null)} />
      )}
    </>
  );
}

// ── Trusted Partners Tab ─────────────────────────────────
function CollectModal({ caseData, onDone, onClose }) {
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
      toast.success(`✅ Payment collected — ${caseData.caseNumber}`);
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
            <div className="modal-title">💰 Mark as Collected</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Trusted partner — cash / bank collection</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              {caseData.workType}{caseData.toothNumbers ? ` · Teeth ${caseData.toothNumbers}` : ''}
            </div>
            <div style={{ fontSize: 12, marginTop: 2 }}>🏥 {caseData.clinic?.name}</div>
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

function TrustedPartnersTab({ queryClient }) {
  const [page, setPage]         = useState(1);
  const [collectCase, setCollect] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'trusted', page],
    queryFn:  () => fetchTrusted(page),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const cases      = data?.cases      || [];
  const pagination = data?.pagination || {};

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>;
  if (isError)   return <ErrorState message="Could not load trusted partner cases." onRetry={refetch} />;

  if (cases.length === 0 && page === 1) return (
    <div className="empty-state">
      <div className="empty-icon">🤝</div>
      <div className="empty-title">All collected!</div>
      <p>No pending payments from trusted partner clinics.</p>
    </div>
  );

  return (
    <>
      <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#6D28D9', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>🤝</span>
        <span>
          <strong>{pagination.total ?? cases.length} cases</strong> from trusted partner clinics awaiting collection.
          These clinics pay on delivery — mark each case as collected once payment is received.
        </span>
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
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{c.caseNumber}</td>
                  <td>
                    <div style={{ fontSize: 13 }}>{c.clinic?.name}</div>
                    <span className="badge badge-trusted" style={{ fontSize: 10, marginTop: 3 }}>🤝 Trusted Partner</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.patientName}</td>
                  <td style={{ fontSize: 13 }}>
                    {c.workType}
                    {c.toothNumbers && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>#{c.toothNumbers}</div>}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'var(--blue)' }}>
                    {c.payment?.invoiceNumber || <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td style={{ fontWeight: 700, fontSize: 14 }}>
                    {c.totalAmount ? `Br ${c.totalAmount.toLocaleString('en-US')}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                  </td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>
                    <button
                      onClick={() => setCollect(c)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'var(--green-dim)', color: 'var(--green)',
                        border: '1px solid rgba(22,163,74,0.3)',
                        borderRadius: 6, padding: '5px 11px',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      💰 Mark Collected
                    </button>
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

      {collectCase && (
        <CollectModal
          caseData={collectCase}
          onDone={() => {
            setCollect(null);
            queryClient.invalidateQueries({ queryKey: ['payments', 'trusted'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }}
          onClose={() => setCollect(null)}
        />
      )}
    </>
  );
}

// ── Verified History Tab ──────────────────────────────────
function HistoryTab() {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payments', 'history', page],
    queryFn: () => fetchHistory(page),
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  });

  const payments   = data?.payments || [];
  const pagination = data?.pagination || {};

  if (isLoading) return <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>;
  if (isError)   return <ErrorState message="Could not load payment history." onRetry={refetch} />;

  if (payments.length === 0 && page === 1) return (
    <div className="empty-state">
      <div className="empty-icon">✅</div>
      <div className="empty-title">No verified payments yet</div>
      <p>Approved payment history will appear here.</p>
    </div>
  );

  return (
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
  );
}

// ── Main Finance Dashboard ────────────────────────────────
const MAIN_TABS = [
  { id: 'screenshots', label: 'Screenshot Approvals', icon: '💳' },
  { id: 'billing',     label: 'Billing & Invoicing',   icon: '📄' },
  { id: 'trusted',     label: 'Trusted Partners',      icon: '🤝' },
  { id: 'history',     label: 'Verified History',      icon: '✅' },
];

export default function FinanceDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab]    = useState('screenshots');
  const [open, setOpen]  = useState(false);
  const queryClient      = useQueryClient();

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'FN';

  const { data: summary } = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchSummary,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: pending = [] } = useQuery({
    queryKey: ['payments', 'pending'],
    queryFn: fetchPending,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: billing = [] } = useQuery({
    queryKey: ['payments', 'billing'],
    queryFn: fetchBilling,
    staleTime: 60_000,
  });

  const { data: trustedData } = useQuery({
    queryKey: ['payments', 'trusted', 1],
    queryFn: () => fetchTrusted(1),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const trustedCount = trustedData?.pagination?.total ?? 0;

  const toInvoiceCount = billing.filter(c => c.status === 'PAYMENT_INVOICING' && !c.totalAmount).length;
  const uploadedCount  = billing.filter(c => c.paymentStatus === 'SCREENSHOT_UPLOADED').length;
  const stats          = summary?.stats || {};
  const revenueGrowth  = stats.revenueGrowth ?? null;

  const currentTab = MAIN_TABS.find(t => t.id === tab);

  const setTabAndClose = (id) => { setTab(id); setOpen(false); };

  return (
    <div className="app">
      {/* ── Mobile topbar ───────────────────────────────── */}
      <div className="mobile-topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
        <span className="mobile-topbar-title">{currentTab?.icon} {currentTab?.label}</span>
        <div className="live-dot" />
      </div>

      {/* ── Drawer overlay ──────────────────────────────── */}
      <div className={`drawer-overlay${open ? ' open' : ''}`} onClick={() => setOpen(false)} />

      {/* ── Drawer ──────────────────────────────────────── */}
      <div className={`drawer${open ? ' open' : ''}`}>
        <div className="drawer-logo">
          <img src="/logo.png" alt="Ye-Almaz" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', marginBottom: 6, border: '2px solid rgba(255,255,255,0.15)', backgroundColor: '#fff' }} />
          <div className="lab-name">Ye-Almaz Dental Lab</div>
          <span className="role-badge" style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A' }}>Finance</span>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Payments</div>
          <button className={`nav-item${tab === 'screenshots' ? ' active' : ''}`} onClick={() => setTabAndClose('screenshots')}>
            <span>💳</span> Screenshot Approvals
            {(pending.length + uploadedCount) > 0 && <span className="badge-count">{pending.length + uploadedCount}</span>}
          </button>
          <div className="nav-section-label">Billing</div>
          <button className={`nav-item${tab === 'billing' ? ' active' : ''}`} onClick={() => setTabAndClose('billing')}>
            <span>📄</span> Billing & Invoicing
            {toInvoiceCount > 0 && <span className="badge-count">{toInvoiceCount}</span>}
          </button>
          <button className={`nav-item${tab === 'trusted' ? ' active' : ''}`} onClick={() => setTabAndClose('trusted')}>
            <span>🤝</span> Trusted Partners
            {trustedCount > 0 && <span className="badge-count">{trustedCount}</span>}
          </button>
          <button className={`nav-item${tab === 'history' ? ' active' : ''}`} onClick={() => setTabAndClose('history')}>
            <span>✅</span> Verified History
          </button>
        </nav>
        <div className="drawer-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#16A34A', color: '#fff' }}>{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Finance</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
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
          <span className="role-badge" style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A' }}>Finance</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Payments</div>
          <button
            className={`nav-item ${tab === 'screenshots' ? 'active' : ''}`}
            onClick={() => setTab('screenshots')}
          >
            <span>💳</span> Screenshot Approvals
            {(pending.length + uploadedCount) > 0 && (
              <span className="badge-count">{pending.length + uploadedCount}</span>
            )}
          </button>

          <div className="nav-section-label">Billing</div>
          <button
            className={`nav-item ${tab === 'billing' ? 'active' : ''}`}
            onClick={() => setTab('billing')}
          >
            <span>📄</span> Billing & Invoicing
            {toInvoiceCount > 0 && <span className="badge-count">{toInvoiceCount}</span>}
          </button>
          <button
            className={`nav-item ${tab === 'trusted' ? 'active' : ''}`}
            onClick={() => setTab('trusted')}
          >
            <span>🤝</span> Trusted Partners
            {trustedCount > 0 && <span className="badge-count">{trustedCount}</span>}
          </button>
          <button
            className={`nav-item ${tab === 'history' ? 'active' : ''}`}
            onClick={() => setTab('history')}
          >
            <span>✅</span> Verified History
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: '#16A34A', color: '#fff' }}>{initials}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">Finance</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────── */}
      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-title">
            {MAIN_TABS.find(t => t.id === tab)?.icon}{' '}
            {MAIN_TABS.find(t => t.id === tab)?.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)' }}>
            <div className="live-dot" />
            Live
          </div>
        </div>

        <div className="content">
          {/* ── KPI row ─────────────────────────────────── */}
          <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(5,1fr)' }}>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('screenshots')}>
              <div className="stat-icon" style={{ background: 'var(--amber-dim)' }}>📸</div>
              <div className="stat-label">Pending Approvals</div>
              <div className="stat-value" style={{ color: 'var(--amber)' }}>
                {pending.length + uploadedCount}
              </div>
              <div className="stat-sub">Screenshots to review</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('billing')}>
              <div className="stat-icon" style={{ background: '#EFF6FF' }}>📄</div>
              <div className="stat-label">To Invoice</div>
              <div className="stat-value" style={{ color: 'var(--blue)' }}>{toInvoiceCount}</div>
              <div className="stat-sub">Need invoice issued</div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setTab('trusted')}>
              <div className="stat-icon" style={{ background: '#F5F3FF' }}>🤝</div>
              <div className="stat-label">Trusted Partners</div>
              <div className="stat-value" style={{ color: '#6D28D9' }}>{trustedCount}</div>
              <div className="stat-sub">Pending collection</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--green-dim)' }}>💰</div>
              <div className="stat-label">This Month</div>
              <div className="stat-value" style={{ color: 'var(--green)', fontSize: (stats.thisMonthRevenue || 0) >= 100000 ? 18 : 24 }}>
                Br {(stats.thisMonthRevenue || 0).toLocaleString('en-US')}
              </div>
              <div className="stat-sub">Verified revenue</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{ background: revenueGrowth != null && revenueGrowth >= 0 ? 'var(--green-dim)' : 'var(--red-dim)' }}>📈</div>
              <div className="stat-label">Revenue Growth</div>
              <div className="stat-value" style={{ color: revenueGrowth != null && revenueGrowth >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 24 }}>
                {revenueGrowth != null ? `${revenueGrowth > 0 ? '+' : ''}${revenueGrowth}%` : '—'}
              </div>
              <div className="stat-sub">vs last month</div>
            </div>
          </div>

          {/* ── Tab content ─────────────────────────────── */}
          {tab === 'screenshots' && <ScreenshotsTab queryClient={queryClient} />}
          {tab === 'billing'     && <BillingTab queryClient={queryClient} />}
          {tab === 'trusted'     && <TrustedPartnersTab queryClient={queryClient} />}
          {tab === 'history'     && <HistoryTab />}
        </div>
      </main>
    </div>
  );
}
