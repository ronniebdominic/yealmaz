import { UPPER_TEETH, LOWER_TEETH } from '../components/Odontogram';

// Renders the same FDI tooth chart used on-screen (Odontogram.jsx) as a
// static print-friendly grid, with the case's selected teeth filled in.
function buildOdontogramHTML(toothNumbers) {
  const selected = new Set(
    String(toothNumbers).split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)
  );
  const toothCell = (num, isUpper) => {
    const active = selected.has(num);
    const radius = isUpper ? '2px 2px 0 0' : '0 0 2px 2px';
    return `<div class="tooth${active ? ' active' : ''}" style="border-radius:${radius}">${num}</div>`;
  };
  const row = (teeth, isUpper) => {
    const midlineAt = isUpper ? 21 : 31;
    return teeth.map(num => (num === midlineAt ? '<div class="tooth-mid"></div>' : '') + toothCell(num, isUpper)).join('');
  };
  return `
    <div class="odonto-row">${row(UPPER_TEETH, true)}</div>
    <div class="odonto-divider"><span>UPPER</span><i></i><span>LOWER</span></div>
    <div class="odonto-row">${row(LOWER_TEETH, false)}</div>
  `;
}

// Ye-Almaz — Shared A5 production-tracking label printer.
// Used by CaseDetailModal (View → click QR) and any list that offers a
// one-click "Print Label" action without opening the full case modal.
export function printCaseLabel(data) {
  if (!data?.qrCodeUrl) return;
  const due   = data.dueDate   ? new Date(data.dueDate).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const order = data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  // Pull the 3D-file/arch-fee line (recorded by New Case's "3D File (Emailed)"
  // intake) out of notes so it prints as its own highlighted row; anything
  // else in notes prints below as free-text.
  const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const notesLines = (data.notes || '').split('\n').filter(Boolean);
  const threeDLine = notesLines.find(l => l.startsWith('📧 3D file intake'));
  const otherNotes = notesLines.filter(l => l !== threeDLine).join('\n');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>QR — ${data.caseNumber}</title>
  <style>
    @page {
      size: A5 portrait;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 148mm;
      height: 210mm;
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a2e;
      background: #fff;
      display: flex;
      flex-direction: column;
      text-align: center;
      padding: 6mm;
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      width: 100%;
      padding-bottom: 3mm;
      border-bottom: 2.5px solid #1A56A0;
      margin-bottom: 4mm;
    }
    .header-icon { width: 12mm; height: 12mm; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .header-text { width: 100%; }
    .lab-name {
      font-size: 14px;
      font-weight: 800;
      color: #1A56A0;
      letter-spacing: 0.3px;
      line-height: 1.2;
    }
    .lab-sub { font-size: 10px; font-weight: 600; color: #777; margin-top: 1px; }

    /* ── QR block ── */
    .qr-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 4mm;
    }
    .qr-wrap img {
      width: 48mm;
      height: 48mm;
      border: 2px solid #ddd;
      border-radius: 5px;
      display: block;
    }

    /* ── Case info ── */
    .case-number {
      text-align: center;
      font-family: 'Courier New', monospace;
      font-size: 22px;
      font-weight: 800;
      color: #1A56A0;
      letter-spacing: 1.4px;
      background: #F4F7FF;
      border: 1.5px solid #C7D7F5;
      border-radius: 5px;
      padding: 1.5mm;
      margin-bottom: 3mm;
    }
    .lineage-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #F5F3FF;
      border: 1.5px solid #DDD6FE;
      border-radius: 5px;
      padding: 2mm 3mm;
      margin-bottom: 3mm;
    }
    .lineage-banner .info-label { color: #6D28D9; margin-bottom: 0; }
    .lineage-banner .info-value {
      font-family: 'Courier New', monospace;
      color: #6D28D9;
      font-size: 15px;
      letter-spacing: 0.8px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2mm 3mm;
      margin-bottom: 3mm;
    }
    .info-cell {
      background: #F4F7FF;
      border-radius: 4px;
      padding: 2mm 3mm;
    }
    .info-cell.teeth {
      background: #FFFBEB;
      border: 1.5px solid #FDE68A;
    }
    .info-cell.threed {
      background: #EFF6FF;
      border: 1.5px solid #BFDBFE;
    }
    .notes-block {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 4px;
      padding: 2mm 3mm;
      margin-bottom: 3mm;
    }
    .notes-text {
      font-size: 12px;
      font-weight: 600;
      color: #1a1a2e;
      line-height: 1.35;
      white-space: pre-line;
    }
    .info-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 1px;
    }
    .info-value {
      font-size: 14px;
      font-weight: 800;
      color: #1a1a2e;
      line-height: 1.25;
    }
    .info-cell.teeth .info-value {
      font-size: 12px;
      letter-spacing: 0.3px;
      font-weight: 700;
      color: #92400E;
    }
    .info-cell.full { grid-column: 1 / -1; }

    /* ── Odontogram (FDI tooth chart) ── */
    .odonto-row { display: flex; justify-content: center; align-items: stretch; margin: 1.5px 0; }
    .tooth {
      width: 6.8mm; height: 7.5mm;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #E2E8F0;
      background: #fff;
      color: #94A3B8;
      font-size: 8.5px; font-weight: 700;
      font-family: 'Courier New', monospace;
      margin: 0 0.4px;
      flex-shrink: 0;
    }
    .tooth.active { background: #1A56A0; border-color: #1A56A0; color: #fff; }
    .tooth-mid { width: 1.5px; background: #CBD5E0; margin: 0 1.2px; flex-shrink: 0; }
    .odonto-divider {
      display: flex; align-items: center; gap: 4px;
      margin: 2px 0; padding: 0 4px;
    }
    .odonto-divider i { flex: 1; height: 1px; background: #E2E8F0; }
    .odonto-divider span { font-size: 7px; font-weight: 800; color: #94A3B8; letter-spacing: 0.6px; }

    /* ── Delivery badge ── */
    .delivery-badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
    }
    .badge-express { background: #FEF3C7; color: #92400E; }
    .badge-normal  { background: #EFF6FF; color: #1A56A0; }

    /* ── Footer ── */
    .footer {
      margin-top: auto;
      padding-top: 2.5mm;
      border-top: 1.5px solid #eee;
      text-align: center;
      font-size: 8.5px;
      font-weight: 600;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <img class="header-icon" src="${window.location.origin}/logo.png" alt="Ye-Almaz" />
    <div class="header-text">
      <div class="lab-name">Ye-Almaz Dental Laboratory</div>
      <div class="lab-sub">Addis Ababa, Ethiopia &nbsp;·&nbsp; +251 945 535 455 &nbsp;·&nbsp; Production Tracking Label</div>
    </div>
  </div>

  <div class="qr-wrap">
    <img src="${data.qrCodeUrl}" alt="QR Code" />
  </div>

  <div class="case-number">${data.caseNumber}</div>

  ${data.originalCase ? `
  <div class="lineage-banner">
    <div class="info-label">${[data.remake && 'Remake', data.redo && 'Redo', data.isRedo && 'Redo/Replacement'].filter(Boolean).join(' / ') || 'Remake/Redo'} — Previous Scan #</div>
    <div class="info-value">${data.originalCase.caseNumber || '—'}</div>
  </div>` : ''}

  <div class="info-grid">
    <div class="info-cell full">
      <div class="info-label">Clinic</div>
      <div class="info-value">${data.clinic?.name || '—'}</div>
    </div>
    ${data.clinic?.zone?.name ? `
    <div class="info-cell full">
      <div class="info-label">Zone</div>
      <div class="info-value">${data.clinic.zone.name}</div>
    </div>` : ''}
    <div class="info-cell full">
      <div class="info-label">Patient</div>
      <div class="info-value">${data.patientName}${data.patientAge ? ' · Age ' + data.patientAge : ''}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Order Date</div>
      <div class="info-value">${order || '—'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Due Date</div>
      <div class="info-value">${due || '—'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Units</div>
      <div class="info-value">${data.units ?? '—'}</div>
    </div>
    ${data.shade ? `
    <div class="info-cell">
      <div class="info-label">Shade</div>
      <div class="info-value">${data.shade}</div>
    </div>` : ''}
    ${data.toothNumbers ? `
    <div class="info-cell full teeth">
      <div class="info-label">Teeth (FDI Numbering)</div>
      ${buildOdontogramHTML(data.toothNumbers)}
      <div class="info-value">${data.toothNumbers}</div>
    </div>` : ''}
    <div class="info-cell">
      <div class="info-label">Work Type</div>
      <div class="info-value">${data.workType}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Delivery</div>
      <div class="info-value">
        <span class="delivery-badge ${data.deliveryType === 'EXPRESS' ? 'badge-express' : 'badge-normal'}">
          ${data.deliveryType === 'EXPRESS' ? '⚡ Express' : '🚚 Normal'}
        </span>
      </div>
    </div>
    ${threeDLine ? `
    <div class="info-cell full threed">
      <div class="info-label">3D File Intake</div>
      <div class="info-value">${escapeHtml(threeDLine.replace('📧 ', ''))}</div>
    </div>` : ''}
  </div>

  ${otherNotes ? `
  <div class="notes-block">
    <div class="info-label">Notes</div>
    <div class="notes-text">${escapeHtml(otherNotes)}</div>
  </div>` : ''}

  <div class="footer">Scan QR to update production stage &nbsp;·&nbsp; yealmaz.com</div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  w.document.close();
}
