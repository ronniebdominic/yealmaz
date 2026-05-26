// Ye-Almaz — Web Push Helper
const webpush = require('web-push');

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@yealmaz.com'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

/**
 * Send a push notification to all subscribed devices of a clinic.
 * Automatically removes stale/expired subscriptions (410/404).
 *
 * @param {PrismaClient} prisma
 * @param {string} clinicId
 * @param {{ title: string, body: string, icon?: string, data?: object }} payload
 */
async function sendPushToClinic(prisma, clinicId, { title, body, icon = '/assets/icon.png', data = {} }) {
  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { clinicId } });
  } catch (err) {
    console.error('[Push] Could not fetch subscriptions:', err.message);
    return;
  }

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
          console.log('[Push] Removed stale subscription for clinic', clinicId);
        } else {
          console.error('[Push] Send failed:', err.message);
        }
      }
    })
  );
}

module.exports = { sendPushToClinic };
