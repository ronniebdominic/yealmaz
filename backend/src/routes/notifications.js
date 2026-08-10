// Ye-Almaz — Push Notification Subscription + In-App Notification Routes
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect, restrict } = require('../middleware/auth');
const { sendPushToUser } = require('../utils/webpush');

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
// Clinic or staff (DELIVERY/LAB_TECH) saves their push subscription after
// granting permission. Clinics are keyed by clinicId, staff by userId.
router.post('/subscribe', protect, restrict('CLINIC', 'DELIVERY', 'LAB_TECH'), async (req, res) => {
  const { endpoint, keys, userAgent } = req.body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription object.' });
  }

  const owner = req.user.role === 'CLINIC' ? { clinicId: req.user.id } : { userId: req.user.id };

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        ...owner,
        endpoint,
        p256dh: keys.p256dh,
        auth:   keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        p256dh: keys.p256dh,
        auth:   keys.auth,
        ...owner,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[Push] Subscribe error:', err);
    res.status(500).json({ error: 'Could not save subscription.' });
  }
});

// ── DELETE /api/notifications/subscribe ─────────────────
// Clinic or staff unsubscribes (e.g. on logout or permission revoked)
router.delete('/subscribe', protect, restrict('CLINIC', 'DELIVERY', 'LAB_TECH'), async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required.' });

  const owner = req.user.role === 'CLINIC' ? { clinicId: req.user.id } : { userId: req.user.id };

  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, ...owner },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not remove subscription.' });
  }
});

// ── In-app notifications ─────────────────────────────────
// Persisted rows (unlike the push subscriptions above, which are ephemeral
// device registrations) — gives every role a real, listable history plus
// an unread badge, backed by Socket.IO for instant delivery while the app
// is open and web-push for when it isn't. See index.js's `join_user` room.

// ── GET /api/notifications — the caller's own notifications ─────────────
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = { userId: req.user.id };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: { sender: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip, take: parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      notifications,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('[notifications list]', err);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

// ── GET /api/notifications/unread-count ──────────────────
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Could not load unread count.' });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────
router.patch('/:id/read', protect, async (req, res) => {
  try {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Notification not found.' });
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not your notification.' });

    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Could not mark notification as read.' });
  }
});

// ── POST /api/notifications/read-all ─────────────────────
router.post('/read-all', protect, async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not mark notifications as read.' });
  }
});

// ── POST /api/notifications/broadcast — Admin → lab techs ───────────────
// target is either the literal 'ALL_LAB_TECHS' or { userId } for one
// specific tech. Fans out into one Notification row per recipient (plus a
// live socket push + best-effort web-push), rather than inventing a
// separate "audience" concept — matches the existing model's userId
// being singular (one notification = one user).
router.post('/broadcast', protect, restrict('ADMIN'), async (req, res) => {
  try {
    const { title, message, target } = req.body || {};
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'title and message are required.' });
    }

    let recipients;
    if (target?.userId) {
      const u = await prisma.user.findUnique({ where: { id: target.userId }, select: { id: true, role: true, isActive: true } });
      if (!u || u.role !== 'LAB_TECH') return res.status(400).json({ error: 'target.userId must be an active lab tech account.' });
      recipients = [u];
    } else if (target === 'ALL_LAB_TECHS' || target?.mode === 'ALL_LAB_TECHS') {
      recipients = await prisma.user.findMany({
        where: { role: 'LAB_TECH', isActive: true, isSharedAccount: false },
        select: { id: true },
      });
    } else {
      return res.status(400).json({ error: "target must be 'ALL_LAB_TECHS' or { userId }." });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No matching recipients found.' });
    }

    const rows = await prisma.$transaction(
      recipients.map(r => prisma.notification.create({
        data: { userId: r.id, senderId: req.user.id, type: 'ANNOUNCEMENT', title: title.trim(), message: message.trim() },
      }))
    );

    const io = req.app.get('io');
    for (const row of rows) {
      io.to(`user_${row.userId}`).emit('notification', row);
      sendPushToUser(prisma, row.userId, { title: row.title, body: row.message }).catch(() => {});
    }

    res.status(201).json({ success: true, sentTo: rows.length });
  } catch (err) {
    console.error('[notifications broadcast]', err);
    res.status(500).json({ error: 'Could not send broadcast.' });
  }
});

module.exports = router;
