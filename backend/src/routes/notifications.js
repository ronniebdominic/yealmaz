// Ye-Almaz — Push Notification Subscription Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/notifications/vapid-public-key ──────────────
// Clinic app fetches this on startup to subscribe
router.get('/vapid-public-key', (req, res) => {
  if (!process.env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications not configured on server.' });
  }
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// ── POST /api/notifications/subscribe ───────────────────
// Clinic saves their push subscription after granting permission
router.post('/subscribe', protect, restrict('CLINIC'), async (req, res) => {
  const { endpoint, keys, userAgent } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object.' });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        clinicId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth:   keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        p256dh: keys.p256dh,
        auth:   keys.auth,
        clinicId: req.user.id,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Subscribe error:', err);
    res.status(500).json({ error: 'Could not save subscription.' });
  }
});

// ── DELETE /api/notifications/subscribe ─────────────────
// Clinic unsubscribes (e.g. on logout or permission revoked)
router.delete('/subscribe', protect, restrict('CLINIC'), async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required.' });

  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, clinicId: req.user.id },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove subscription.' });
  }
});

module.exports = router;
