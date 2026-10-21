// Ye-Almaz — Live Production TV API.
//   Display (read-only): GET /snapshot, /events, /config — reachable with a paired display token, or by an admin.
//   Pairing:             POST /pair (public, rate-limited) trades a one-time code for the display's own token.
//   Admin:               config, display list / pair / revoke.
// The display token can reach nothing outside this file: every other route in the app requires a user login.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect, restrict } = require('../middleware/auth');
const prisma = require('../db');
const tv = require('../services/tvService');

const router = express.Router();

const pairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many pairing attempts. Try again in a few minutes.' },
});

// A paired display, or an administrator previewing the screen.
const displayOrAdmin = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.startsWith('tvd_')) {
    try {
      const session = await tv.verifyDisplayToken(token);
      if (!session) return res.status(401).json({ error: 'This display is no longer authorised.', code: 'DISPLAY_REVOKED' });
      req.display = session;
      return next();
    } catch (err) {
      return res.status(503).json({ error: 'Could not verify the display. Retrying.' });
    }
  }
  return protect(req, res, (err) => (err ? next(err) : restrict('ADMIN')(req, res, next)));
};

router.post('/pair', pairLimiter, async (req, res) => {
  try {
    const result = await tv.pairDisplay(req.body?.code);
    if (!result) return res.status(400).json({ error: 'That code is not valid or has expired.' });
    res.json(result);
  } catch (err) {
    console.error('[tv] pair failed:', err.message);
    res.status(500).json({ error: 'Could not pair this display.' });
  }
});

router.get('/config', displayOrAdmin, async (req, res) => {
  res.json({ config: await tv.loadConfig(), serverTime: new Date().toISOString() });
});

router.get('/snapshot', displayOrAdmin, async (req, res) => {
  try {
    res.json({ ...(await tv.getSnapshot()), serverTime: new Date().toISOString() });
  } catch (err) {
    console.error('[tv] snapshot failed:', err);
    res.status(500).json({ error: 'Could not build the production snapshot.' });
  }
});

// Catch-up after a gap or reconnect: every event with seq > after, in order.
router.get('/events', displayOrAdmin, async (req, res) => {
  const after = Number.parseInt(req.query.after, 10);
  if (!Number.isInteger(after) || after < 0) return res.status(400).json({ error: 'after must be a non-negative integer.' });
  try {
    res.json({ events: await tv.eventsAfter(after), latestSeq: await tv.latestSeq() });
  } catch (err) {
    res.status(500).json({ error: 'Could not load events.' });
  }
});

// ── administration
router.put('/config', protect, restrict('ADMIN'), async (req, res) => {
  try {
    res.json({ config: await tv.saveConfig(req.body || {}, req.user.id) });
  } catch (err) {
    console.error('[tv] save config failed:', err.message);
    res.status(500).json({ error: 'Could not save the TV settings.' });
  }
});

router.get('/displays', protect, restrict('ADMIN'), async (req, res) => {
  const rows = await prisma.displaySession.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(rows.map(r => ({
    id: r.id, label: r.label, createdAt: r.createdAt, pairedAt: r.pairedAt, lastSeenAt: r.lastSeenAt, revokedAt: r.revokedAt,
    status: r.revokedAt ? 'REVOKED' : r.pairedAt ? 'PAIRED' : (r.pairingExpiresAt && r.pairingExpiresAt > new Date() ? 'WAITING' : 'EXPIRED'),
  })));
});

router.post('/displays', protect, restrict('ADMIN'), async (req, res) => {
  const label = String(req.body?.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Give the display a name, e.g. "Lab wall TV".' });
  res.status(201).json(await tv.createPairing(label, req.user.id));
});

router.delete('/displays/:id', protect, restrict('ADMIN'), async (req, res) => {
  try {
    await tv.revokeDisplay(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ error: 'Display not found.' });
  }
});

module.exports = router;
