// Ye-Almaz — Printable payslip, matching Billing.jsx's invoice-print
// mechanism exactly: a template-string HTML document opened in a new
// window and printed on load.
const LAB = {
  name: 'Ye-Almaz Dental Laboratory',
  address: 'Addis Ababa, Ethiopia',
  phone: '+251 945 535 455',
  email: 'info@yealmaz.com',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function buildPayslipHTML(entry, run) {
  const adjustments = entry.adjustments || [];
  const period = `${MONTH_NAMES[run.periodMonth - 1]} ${run.periodYear}`;
  const fmt = (n) => `Br ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Payslip — ${entry.user?.name || ''}</title>
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
  .amt-pos{color:#16A34A}
  .amt-neg{color:#DC2626}
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
    <h1>PAYSLIP</h1>
    <div class="inv-num">${period}</div>
  </div>
</div>

<div class="dates-grid">
  <div>
    <div class="section-title">Employee</div>
    <div class="bill-to">${entry.user?.name || '—'}</div>
    <div class="bill-sub">${entry.user?.email || ''}</div>
  </div>
  <div>
    <div class="section-title">Pay Period</div>
    <div class="date-item">${period}</div>
  </div>
</div>

<table>
  <thead>
    <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
  </thead>
  <tbody>
    <tr><td>Base Salary</td><td style="text-align:right;font-weight:700">${fmt(entry.baseSalarySnapshot)}</td></tr>
    ${adjustments.map(a => `
    <tr><td>${a.label}</td><td style="text-align:right;font-weight:700" class="${a.amount >= 0 ? 'amt-pos' : 'amt-neg'}">${a.amount >= 0 ? '+' : ''}${fmt(a.amount)}</td></tr>`).join('')}
    <tr class="total-row">
      <td style="text-align:right;font-size:14px">Net Pay</td>
      <td style="text-align:right;color:#1565C0;font-size:18px">${fmt(entry.netPay)}</td>
    </tr>
  </tbody>
</table>

<div class="footer">Ye-Almaz Dental Laboratory — internal payroll record</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

export function printPayslip(entry, run) {
  const w = window.open('', '_blank');
  w.document.write(buildPayslipHTML(entry, run));
  w.document.close();
}
