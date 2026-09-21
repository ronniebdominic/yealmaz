// Ye-Almaz — Printable business-card-sized clinic login card (89mm x 51mm).
// Admin generates a fresh password for a clinic (new or existing) from the
// Clinics page ("Login Card") and prints this card to hand over.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function printCredentialsCard({ clinic, password, qrCodeUrl }) {
  if (!qrCodeUrl || !password) return;

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Login Card — ${esc(clinic.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=DM+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    @page { size: 89mm 51mm; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { width: 89mm; height: 51mm; }
    body {
      font-family: 'Manrope', Arial, Helvetica, sans-serif;
      color: #fff; background: #0B1120;
      position: relative; overflow: hidden;
      display: flex; align-items: stretch;
    }
    /* soft brand glow + accent bar */
    body::before {
      content: ''; position: absolute; right: -18mm; top: -22mm;
      width: 60mm; height: 60mm; border-radius: 50%;
      background: radial-gradient(circle, rgba(62,123,240,.55) 0%, rgba(62,123,240,0) 68%);
    }
    body::after {
      content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1.6mm;
      background: linear-gradient(90deg, #2B62D4, #3E7BF0 55%, #7AA6FF);
    }

    .left {
      position: relative; z-index: 1; width: 33mm; flex-shrink: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 3.5mm 0 4mm 4mm; gap: 2.4mm;
    }
    .qr-tile {
      background: #fff; border-radius: 3mm; padding: 1.6mm;
      box-shadow: 0 0 0 0.3mm rgba(122,166,255,.55);
    }
    .qr-tile img { width: 25mm; height: 25mm; display: block; }
    .scan { font-size: 5.2px; font-weight: 700; letter-spacing: 1.1px; color: #7AA6FF; text-transform: uppercase; }

    .right {
      position: relative; z-index: 1; flex: 1; min-width: 0;
      padding: 4.2mm 4.5mm 4.6mm 3mm;
      display: flex; flex-direction: column;
    }
    .brand { display: flex; align-items: center; gap: 2mm; margin-bottom: 3mm; }
    .logo {
      width: 8.5mm; height: 8.5mm; border-radius: 50%; object-fit: cover;
      background: #fff; box-shadow: 0 0 0 0.35mm #3E7BF0;
    }
    .brand-name { font-size: 7.4px; font-weight: 800; letter-spacing: .5px; line-height: 1.15; }
    .brand-sub  { font-size: 5px; font-weight: 700; letter-spacing: 1.3px; color: #7AA6FF; text-transform: uppercase; margin-top: .3mm; }

    .clinic {
      font-size: 10.5px; font-weight: 800; line-height: 1.12; letter-spacing: -.1px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      margin-bottom: 2.6mm;
    }
    .field {
      background: rgba(255,255,255,.07); border: 0.25mm solid rgba(122,166,255,.28);
      border-radius: 1.6mm; padding: 1.1mm 2mm; margin-bottom: 1.5mm;
    }
    .label { font-size: 4.8px; font-weight: 700; letter-spacing: 1.1px; color: #7AA6FF; text-transform: uppercase; }
    .value {
      font-family: 'DM Mono', 'Courier New', monospace; font-size: 8.2px; font-weight: 500;
      color: #fff; margin-top: .25mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      letter-spacing: .2px;
    }
    .value.pass { color: #A9C5FF; font-size: 8.8px; letter-spacing: .5px; }
    .foot { margin-top: auto; font-size: 5px; font-weight: 600; color: rgba(255,255,255,.55); letter-spacing: .3px; }
  </style>
</head>
<body>
  <div class="left">
    <div class="qr-tile"><img src="${qrCodeUrl}" alt="Login QR" /></div>
    <div class="scan">Scan to copy login</div>
  </div>
  <div class="right">
    <div class="brand">
      <img class="logo" src="${window.location.origin}/logo.png" alt="Ye-Almaz" />
      <div>
        <div class="brand-name">Ye-Almaz Dental Lab</div>
        <div class="brand-sub">Clinic Login</div>
      </div>
    </div>
    <div class="clinic">${esc(clinic.name)}</div>
    <div class="field"><div class="label">Email</div><div class="value">${esc(clinic.email)}</div></div>
    <div class="field"><div class="label">Password</div><div class="value pass">${esc(password)}</div></div>
    <div class="foot">yealmazdentallab.odontofusion.com &nbsp;·&nbsp; +251 945 535 455</div>
  </div>
  <script>
    window.onload = () => {
      const go = () => setTimeout(() => window.print(), 150);
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go, go);
    };
  </script>
</body>
</html>`);
  w.document.close();
}
