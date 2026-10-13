// Ye-Almaz — Audit trail
//
// Records every successful write (POST/PUT/PATCH/DELETE) made by a signed-in
// user, across the whole API, without touching individual routes. `protect`
// sets req.user later in the request, so the row is written on response
// 'finish', when it is known who did it and whether it succeeded.


const prisma = require('../db');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Not user edits: credentials, bot/AI chatter, read-state noise.
const SKIP_PREFIXES = ['/api/auth', '/api/ai-chat', '/api/telegram-webhook', '/api/webhooks', '/api/notifications', '/api/audit'];
const SECRET_KEY = /pass|token|secret|otp|authorization|pin$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MAX_BODY = 4000;

function scrub(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(v => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? '[hidden]' : scrub(v, depth + 1);
    return out;
  }
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}…`;
  return value;
}

let warned = false;

function auditTrail(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const url = req.originalUrl.split('?')[0];
  if (SKIP_PREFIXES.some(p => url.startsWith(p))) return next();

  res.on('finish', () => {
    if (!req.user || res.statusCode >= 400) return;
    let body = null;
    try {
      if (req.body && Object.keys(req.body).length) body = JSON.stringify(scrub(req.body)).slice(0, MAX_BODY);
    } catch { /* unserialisable body — log the action without it */ }

    prisma.auditLog.create({
      data: {
        userId: req.user.id || null,
        userName: req.user.name || req.user.email || null,
        userRole: req.user.role || null,
        method: req.method,
        path: url,
        module: url.split('/')[2] || 'other',
        entityId: (url.match(UUID) || [null])[0],
        status: res.statusCode,
        ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || null,
        body,
      },
    }).catch((err) => {
      if (!warned) { warned = true; console.error('[audit] could not write audit log:', err.message); }
    });
  });
  next();
}

module.exports = auditTrail;
