// Ye-Almaz — Printable business-card-sized login credentials.
// Admin generates a fresh password for a clinic (new or existing) and
// prints a standard business card (89mm x 51mm) with the QR + credentials,
// ready to hand over or mail. See AdminClinics.jsx "Credentials Card" action.
export function printCredentialsCard({ clinic, password, qrCodeUrl }) {
  if (!qrCodeUrl || !password) return;

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Login Card — ${clinic.name}</title>
  <style>
    @page { size: 89mm 51mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 89mm; height: 51mm;
      font-family: Arial, Helvetica, sans-serif;
      color: #1a1a2e; background: #fff;
      display: flex; align-items: center;
      padding: 4mm;
    }
    .qr { width: 24mm; height: 24mm; border: 1px solid #ddd; border-radius: 3px; flex-shrink: 0; }
    .info { flex: 1; min-width: 0; padding-left: 4mm; }
    .lab { font-size: 8.5px; font-weight: 800; color: #1A56A0; letter-spacing: 0.3px; margin-bottom: 2.5mm; }
    .clinic-name {
      font-size: 11px; font-weight: 800; line-height: 1.15; margin-bottom: 2.5mm;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .row { margin-bottom: 1.6mm; }
    .label { font-size: 6.5px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
    .value {
      font-size: 9px; font-weight: 700; font-family: 'Courier New', monospace; color: #1a1a2e;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .value.pass { color: #1A56A0; }
  </style>
</head>
<body>
  <img class="qr" src="${qrCodeUrl}" alt="Login QR" />
  <div class="info">
    <div class="lab">YE-ALMAZ DENTAL LABORATORY</div>
    <div class="clinic-name">${clinic.name}${clinic.code ? ' · ' + clinic.code : ''}</div>
    <div class="row">
      <div class="label">Email</div>
      <div class="value">${clinic.email}</div>
    </div>
    <div class="row">
      <div class="label">Password</div>
      <div class="value pass">${password}</div>
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  w.document.close();
}
