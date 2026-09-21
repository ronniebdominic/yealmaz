// Ye-Almaz — Clinic onboarding card. Rendered to a PNG (canvas) so the same
// artwork can be printed (A5), downloaded, or sent through WhatsApp.
const W = 1080;
const H = 1527; // A5 ratio, so it prints edge-to-edge
const FONT = "Manrope, 'Segoe UI', Arial, sans-serif";
const MONO = "'DM Mono', 'Courier New', monospace";

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const wrapText = (ctx, text, maxWidth) => {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
};

const breakLong = (ctx, text, maxWidth) => {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
};

export async function renderOnboardingCard({ clinic, url, qrCodeUrl, expiresAt }) {
  try { await Promise.all([document.fonts.load(`800 40px Manrope`), document.fonts.load(`500 24px 'DM Mono'`)]); } catch { /* fall back to system fonts */ }
  const [logo, qr] = await Promise.all([loadImage(`${window.location.origin}/logo.png`).catch(() => null), loadImage(qrCodeUrl)]);

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // background + brand glows
  ctx.fillStyle = '#0B1120';
  ctx.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, a) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(62,123,240,${a})`);
    g.addColorStop(1, 'rgba(62,123,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W - 60, 80, 620, 0.5);
  glow(60, H - 120, 520, 0.22);

  // bottom accent bar
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, '#2B62D4'); bar.addColorStop(0.55, '#3E7BF0'); bar.addColorStop(1, '#7AA6FF');
  ctx.fillStyle = bar;
  ctx.fillRect(0, H - 22, W, 22);

  // brand row
  const logoR = 62, logoX = 96 + logoR, logoY = 112 + logoR;
  ctx.beginPath(); ctx.arc(logoX, logoY, logoR + 6, 0, Math.PI * 2); ctx.fillStyle = '#3E7BF0'; ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(logoX, logoY, logoR, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#fff'; ctx.fillRect(logoX - logoR, logoY - logoR, logoR * 2, logoR * 2);
  if (logo) ctx.drawImage(logo, logoX - logoR, logoY - logoR, logoR * 2, logoR * 2);
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText('Ye-Almaz Dental Lab', logoX + logoR + 34, logoY - 4);
  ctx.fillStyle = '#7AA6FF';
  ctx.font = `700 24px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.fillText('CLINIC ONBOARDING', logoX + logoR + 36, logoY + 38);
  ctx.letterSpacing = '0px';

  // headline
  ctx.fillStyle = '#fff';
  ctx.font = `800 84px ${FONT}`;
  ctx.fillText('Welcome aboard', 96, 372);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText('Set up your clinic account in a minute.', 96, 426);

  // clinic pill
  ctx.font = `800 40px ${FONT}`;
  const name = clinic.code ? `${clinic.name}  ·  ${clinic.code}` : clinic.name;
  let pillText = name;
  while (ctx.measureText(pillText).width > W - 96 * 2 - 80 && pillText.length > 4) pillText = pillText.slice(0, -2);
  if (pillText !== name) pillText = pillText.trimEnd() + '…';
  const pillW = Math.min(W - 192, ctx.measureText(pillText).width + 80);
  roundRect(ctx, 96, 470, pillW, 80, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(122,166,255,0.45)'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.fillText(pillText, 96 + 40, 470 + 54);

  // QR tile
  const tile = 360, tx = (W - tile) / 2, ty = 574;
  roundRect(ctx, tx, ty, tile, tile, 44);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(122,166,255,0.6)'; ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, tx + 30, ty + 30, tile - 60, tile - 60);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#7AA6FF';
  ctx.font = `700 24px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN WITH YOUR PHONE CAMERA', W / 2, ty + tile + 56);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';

  // steps
  const steps = [
    'Scan the QR code, or tap the link you were sent.',
    'Confirm your clinic details.',
    'Set your password, then log in at yealmazdentallab.odontofusion.com',
  ];
  let y = ty + tile + 108;
  steps.forEach((s, i) => {
    ctx.beginPath(); ctx.arc(96 + 26, y - 10, 26, 0, Math.PI * 2); ctx.fillStyle = '#3E7BF0'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 28px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 96 + 26, y);
    ctx.textAlign = 'left';
    ctx.font = `600 29px ${FONT}`;
    const lines = wrapText(ctx, s, W - 96 * 2 - 90);
    lines.forEach((ln, li) => ctx.fillText(ln, 96 + 76, y + li * 36));
    y += Math.max(1, lines.length) * 36 + 16;
  });

  // link box
  ctx.font = `500 23px ${MONO}`;
  const linkLines = breakLong(ctx, url, W - 96 * 2 - 56);
  const boxH = linkLines.length * 32 + 40;
  const boxY = y + 4;
  roundRect(ctx, 96, boxY, W - 192, boxH, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(122,166,255,0.3)'; ctx.stroke();
  ctx.fillStyle = '#A9C5FF';
  linkLines.forEach((ln, i) => ctx.fillText(ln, 96 + 28, boxY + 40 + i * 32));

  // expiry + footer
  if (expiresAt) {
    const d = new Date(expiresAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    ctx.fillStyle = '#FBBF24'; ctx.font = `700 26px ${FONT}`;
    ctx.fillText(`This link expires on ${d}`, 96, boxY + boxH + 46);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 24px ${FONT}`;
  ctx.fillText('Ye-Almaz Dental Laboratory  ·  Addis Ababa  ·  +251 945 535 455', 96, H - 22 - 34);

  return canvas.toDataURL('image/png');
}

export function printCardImage(dataUrl, title = 'Onboarding') {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>@page{size:A5 portrait;margin:0}*{margin:0;padding:0}html,body{width:148mm;height:210mm;background:#0B1120;-webkit-print-color-adjust:exact;print-color-adjust:exact}img{width:148mm;height:210mm;display:block}</style>
</head><body><img src="${dataUrl}" /><script>window.onload=()=>setTimeout(()=>window.print(),150);</script></body></html>`);
  w.document.close();
}

export function downloadCardImage(dataUrl, clinicName) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `yealmaz-onboarding-${String(clinicName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Ethiopian numbers are usually saved as 09xxxxxxxx / +2519xxxxxxxx.
export function toWhatsAppNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('251')) return d;
  if (d.startsWith('0')) return `251${d.slice(1)}`;
  if (d.length === 9) return `251${d}`;
  return d;
}

export function whatsAppUrl({ phone, clinicName, url, expiresAt }) {
  const d = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
  const text = `Hello ${clinicName}, welcome to Ye-Almaz Dental Lab! Please complete your clinic account setup and choose your password here:\n${url}${d ? `\n\n(This link expires on ${d}.)` : ''}`;
  const num = toWhatsAppNumber(phone);
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
