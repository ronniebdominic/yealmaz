// Ye-Almaz — Printable clinic onboarding QR sheet.
// Admin generates a one-time onboarding link/QR for a clinic (see
// AdminClinics.jsx "Onboarding QR" action) and hands this printout to the
// clinic owner: they scan it to fill in their own details and set their own
// password, without needing an admin-issued temp password.
export function printOnboardingSheet({ clinic, url, qrCodeUrl, expiresAt }) {
  if (!qrCodeUrl || !url) return;
  const expires = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Onboarding — ${clinic.name}</title>
  <style>
    @page { size: A5 portrait; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 148mm; height: 210mm;
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a2e; background: #fff;
      display: flex; flex-direction: column; align-items: center;
      text-align: center; padding: 8mm;
    }
    .header {
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      width: 100%; padding-bottom: 4mm;
      border-bottom: 2.5px solid #1A56A0; margin-bottom: 6mm;
    }
    .header-icon { width: 12mm; height: 12mm; border-radius: 50%; object-fit: cover; }
    .lab-name { font-size: 15px; font-weight: 800; color: #1A56A0; letter-spacing: 0.3px; }
    .lab-sub  { font-size: 10px; font-weight: 600; color: #777; margin-top: 1px; }

    .title { font-size: 17px; font-weight: 800; margin-bottom: 2mm; }
    .clinic-name {
      font-size: 14px; font-weight: 700; color: #1A56A0;
      background: #F4F7FF; border: 1.5px solid #C7D7F5; border-radius: 6px;
      padding: 2mm 4mm; margin-bottom: 6mm;
    }

    .qr-wrap { margin-bottom: 6mm; }
    .qr-wrap img { width: 58mm; height: 58mm; border: 2px solid #ddd; border-radius: 6px; display: block; }

    .steps { text-align: left; width: 100%; margin-bottom: 6mm; }
    .steps ol { padding-left: 5mm; }
    .steps li { font-size: 12.5px; font-weight: 600; line-height: 1.6; margin-bottom: 2px; }

    .link-block {
      width: 100%; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 5px;
      padding: 3mm; margin-bottom: 4mm; word-break: break-all;
      font-family: 'Courier New', monospace; font-size: 10px; color: #555;
    }

    .expiry { font-size: 11px; font-weight: 700; color: #92400E; margin-bottom: auto; }

    .footer {
      margin-top: auto; padding-top: 3mm; border-top: 1.5px solid #eee;
      font-size: 8.5px; font-weight: 600; color: #999;
    }
  </style>
</head>
<body>
  <div class="header">
    <img class="header-icon" src="${window.location.origin}/logo.png" alt="Ye-Almaz" />
    <div class="lab-name">Ye-Almaz Dental Laboratory</div>
    <div class="lab-sub">Addis Ababa, Ethiopia &nbsp;·&nbsp; +251 945 535 455</div>
  </div>

  <div class="title">Welcome — Complete Your Clinic Setup</div>
  <div class="clinic-name">${clinic.name}${clinic.code ? ' · ' + clinic.code : ''}</div>

  <div class="qr-wrap"><img src="${qrCodeUrl}" alt="Onboarding QR" /></div>

  <div class="steps">
    <ol>
      <li>Scan this QR code with your phone camera.</li>
      <li>Confirm your clinic's contact details on the page that opens.</li>
      <li>Set your own password, then log in at <b>yealmazdentallab.odontofusion.com</b>.</li>
    </ol>
  </div>

  <div class="link-block">${url}</div>

  ${expires ? `<div class="expiry">This link expires on ${expires}</div>` : ''}

  <div class="footer">Questions? Contact Ye-Almaz Dental Laboratory &nbsp;·&nbsp; yealmaz.com</div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  w.document.close();
}
