import { useState, useMemo } from 'react';
import Layout from '../components/Layout';
import { StatusBadge, PaymentBadge } from '../components/StatusBadge';
import api from '../api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Pagination from '../components/Pagination';

const PAGE_SIZE = 15;

const fetchBilling = () => api.get('/payments/billing').then(r => r.data.cases ?? r.data);

const LAB = {
  name: 'Ye-Almaz Dental Laboratory',
  address: 'Addis Ababa, Ethiopia',
  phone: '+251 911 000 000',
  email: 'info@yealmaz.com',
};

// ── Printable invoice HTML ────────────────────────────────
function buildInvoiceHTML(c) {
  const inv = c.payment;
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
      <div>
        <div class="section-title">Invoice Date</div>
        <div class="date-item">${issued}</div>
      </div>
      <div>
        <div class="section-title">Due Date</div>
        <div class="date-item">${due}</div>
      </div>
      <div>
        <div class="section-title">Case Number</div>
        <div class="date-item" style="font-family:monospace">${c.caseNumber}</div>
      </div>
      <div>
        <div class="section-title">Patient</div>
        <div class="date-item">${c.patientName}</div>
      </div>
    </div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Details</th>
      <th style="text-align:right">Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>${c.workType}</strong><br><span style="color:#888;font-size:12px">Dental Lab Work</span></td>
      <td>
        ${c.toothNumbers ? 'Teeth: ' + c.toothNumbers + '<br>' : ''}
        ${c.shade ? 'Shade: ' + c.shade : ''}
      </td>
      <td style="text-align:right;font-weight:700">₹${amount.toLocaleString('en-IN')}</td>
    </tr>
    <tr class="total-row">
      <td colspan="2" style="text-align:right;font-size:14px">Total Amount</td>
      <td style="text-align:right;color:#1565C0;font-size:18px">₹${amount.toLocaleString('en-IN')}</td>
    </tr>
  </tbody>
</table>

${inv?.invoiceNotes ? `<div class="notes"><strong>Notes:</strong> ${inv.invoiceNotes}</div>` : ''}

<div class="footer">
  Thank you for choosing Ye-Almaz Dental Laboratory · Please transfer to the provided bank account and upload your payment receipt.
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

// ── Issue Invoice Modal ───────────────────────────────────
function IssueInvoiceModal({ caseData, onDone, onClose }) {
  const [amount, setAmount] = useState(caseData.totalAmount?.toString() || '');
  const [notes, setNotes]   = useState(caseData.payment?.invoiceNotes || '');
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
          {/* Case summary */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20, border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{caseData.patientName}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'monospace' }}>{caseData.caseNumber}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
              {caseData.workType}{caseData.toothNumbers ? ` · Teeth ${caseData.toothNumbers}` : ''}{caseData.shade ? ` · Shade ${caseData.shade}` : ''}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>🏥 {caseData.clinic?.name}</div>
          </div>

          {/* Amount */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              Invoice Amount (₹) *
            </label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 12500"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 15, fontWeight: 700 }}
              autoFocus
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
              Notes (optional)
            </label>
            <textarea
              rows={3}
              placeholder="Payment instructions, bank details, etc."
              value={notes}
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
  const inv = caseData.payment;
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

          {/* Invoice preview card */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            {/* Header */}
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

            {/* Bill-to + dates */}
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
                  ['Case #', caseData.caseNumber],
                  ['Patient', caseData.patientName],
                  ['Due Date', caseData.dueDate ? format(new Date(caseData.dueDate), 'dd MMM yyyy') : '—'],
                ].map(([lbl, val]) => (
                  <div key={lbl}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: lbl === 'Case #' ? 'DM Mono, monospace' : 'inherit' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Line items */}
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
                  <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>₹{amount.toLocaleString('en-IN')}</td>
                </tr>
                <tr style={{ background: 'var(--surface-2)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: '12px 20px', fontWeight: 700, textAlign: 'right' }}>Total</td>
                  <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 800, fontSize: 18, color: 'var(--blue)' }}>₹{amount.toLocaleString('en-IN')}</td>
                </tr>
              </tbody>
            </table>

            {inv?.invoiceNotes && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: '#FFFBEB', fontSize: 13, color: 'var(--text-2)' }}>
                <strong>Notes:</strong> {inv.invoiceNotes}
              </div>
            )}
          </div>

          {/* Payment status */}
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

// ── Main Billing Page ─────────────────────────────────────
const TABS = [
  { id: 'to-invoice', label: 'To Invoice',          icon: '📄' },
  { id: 'awaiting',   label: 'Awaiting Payment',     icon: '⏳' },
  { id: 'uploaded',   label: 'Screenshot Uploaded',  icon: '📸' },
  { id: 'verified',   label: 'Verified',             icon: '✅' },
];

export default function Billing() {
  const [tab, setTab]               = useState('to-invoice');
  const [issueModal, setIssueModal] = useState(null);
  const [viewModal, setViewModal]   = useState(null);
  const [processing, setProcessing] = useState(null);
  const [page, setPage]             = useState(1);
  const queryClient = useQueryClient();

  const changeTab = (t) => { setTab(t); setPage(1); };

  const { data: cases = [], isLoading: loading } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
    onError: () => toast.error('Action failed. Please try again.'),
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

  // Tab buckets
  const toInvoice = cases.filter(c => c.status === 'PAYMENT_INVOICING' && !c.totalAmount);
  const awaiting  = cases.filter(c => c.totalAmount && c.paymentStatus === 'PENDING');
  const uploaded  = cases.filter(c => c.paymentStatus === 'SCREENSHOT_UPLOADED');
  const verified  = cases.filter(c => c.paymentStatus === 'VERIFIED');

  const buckets = { 'to-invoice': toInvoice, awaiting, uploaded, verified };
  const shown   = buckets[tab] || [];
  const totalPages = Math.ceil(shown.length / PAGE_SIZE);
  const paginated  = useMemo(
    () => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [shown, page]
  );

  const counts = { 'to-invoice': toInvoice.length, awaiting: awaiting.length, uploaded: uploaded.length, verified: verified.length };

  return (
    <Layout pendingPayments={uploaded.length}>
      <div className="topbar">
        <div className="topbar-title">💰 Billing & Invoicing</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {toInvoice.length > 0 && `${toInvoice.length} case${toInvoice.length !== 1 ? 's' : ''} need invoicing`}
        </div>
      </div>

      <div className="content">
        {/* Tabs */}
        <div className="filters" style={{ marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.id} className={`filter-chip ${tab === t.id ? 'active' : ''}`} onClick={() => changeTab(t.id)}>
              {t.icon} {t.label}
              {counts[t.id] > 0 && <span className="badge-count">{counts[t.id]}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 60 }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{TABS.find(t => t.id === tab)?.icon}</div>
            <div className="empty-title">
              {tab === 'to-invoice' ? 'No cases awaiting invoice' :
               tab === 'awaiting'   ? 'No pending payments' :
               tab === 'uploaded'   ? 'No screenshots to review' :
               'No verified payments yet'}
            </div>
            <p>
              {tab === 'to-invoice' ? 'Cases move here after reaching the Payment / Invoicing stage.' :
               tab === 'awaiting'   ? 'Cases appear here after you issue an invoice.' :
               tab === 'uploaded'   ? 'Clinics appear here after uploading a payment screenshot.' :
               'Approved payments appear here.'}
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
                        {c.totalAmount ? `₹${c.totalAmount.toLocaleString('en-IN')}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td>
                        <StatusBadge status={c.status} />
                        <div style={{ marginTop: 4 }}><PaymentBadge status={c.paymentStatus} /></div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {/* Issue / Edit invoice */}
                          <button className="btn btn-primary btn-sm" onClick={() => setIssueModal(c)}>
                            {c.payment?.invoiceNumber ? '✏️ Edit' : '📄 Issue Invoice'}
                          </button>

                          {/* View invoice (if issued) */}
                          {c.payment?.invoiceNumber && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setViewModal(c)}>
                              🖨️ View / Print
                            </button>
                          )}

                          {/* Verify payment (if screenshot uploaded) */}
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
                              >
                                ✓ Approve
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => verify(c.id, 'REJECT')}
                                disabled={!!processing}
                              >
                                ✗ Reject
                              </button>
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
      </div>

      {issueModal && (
        <IssueInvoiceModal
          caseData={issueModal}
          onDone={() => { setIssueModal(null); queryClient.invalidateQueries({ queryKey: ['payments'] }); }}
          onClose={() => setIssueModal(null)}
        />
      )}

      {viewModal && (
        <InvoiceViewModal
          caseData={viewModal}
          onClose={() => setViewModal(null)}
        />
      )}
    </Layout>
  );
}
