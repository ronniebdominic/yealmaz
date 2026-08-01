// Ye-Almaz — Web Push Helper
const webpush = require('web-push');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL || 'admin@yealmaz.com'}`,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.error('[Push] Invalid VAPID keys — push notifications disabled:', err.message);
  }
} else {
  console.warn('[Push] VAPID keys not set — push notifications disabled.');
}

// Shared send: pushes to every subscription in the list, cleaning up
// stale/expired ones (410/404) as it goes. `label` is just for the log line.
async function sendPush(prisma, subs, { title, body, icon = '/assets/icon.png', data = {} }, label) {
  if (!subs.length) return;

  const notification = JSON.stringify({ title, body, icon, data });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification
        );
      } catch (err) {
        // Subscription expired or invalid — clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription
            .delete({ where: { endpoint: sub.endpoint } })
            .catch(() => {});
          console.log('[Push] Removed stale subscription for', label);
        } else {
          console.error('[Push] Send failed:', err.message);
        }
      }
    })
  );
}

/**
 * Send a push notification to all subscribed devices of a clinic.
 * Automatically removes stale/expired subscriptions (410/404).
 *
 * @param {PrismaClient} prisma
 * @param {string} clinicId
 * @param {{ title: string, body: string, icon?: string, data?: object }} payload
 */
async function sendPushToClinic(prisma, clinicId, payload) {
  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { clinicId } });
  } catch (err) {
    console.error('[Push] Could not fetch subscriptions:', err.message);
    return;
  }
  await sendPush(prisma, subs, payload, `clinic ${clinicId}`);
}

/**
 * Send a push notification to all subscribed devices of a staff user
 * (currently delivery agents subscribing from the receptionist web app).
 * Automatically removes stale/expired subscriptions (410/404).
 *
 * @param {PrismaClient} prisma
 * @param {string} userId
 * @param {{ title: string, body: string, icon?: string, data?: object }} payload
 */
async function sendPushToUser(prisma, userId, payload) {
  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch (err) {
    console.error('[Push] Could not fetch subscriptions:', err.message);
    return;
  }
  await sendPush(prisma, subs, payload, `user ${userId}`);
}

module.exports = { sendPushToClinic, sendPushToUser };
