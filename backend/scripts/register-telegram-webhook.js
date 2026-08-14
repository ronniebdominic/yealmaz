// One-off script: registers (or inspects) this backend's Telegram webhook.
// Run standalone, after deploy — not required by the app at runtime, so it
// loads its own .env explicitly (the app's other scripts assume they're
// run from a context where dotenv is already loaded; this one might not
// be).
//
// Usage:
//   node scripts/register-telegram-webhook.js          — registers the webhook
//   node scripts/register-telegram-webhook.js --info    — shows current webhook status
require('dotenv').config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL;

async function main() {
  if (!TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is not set.');
    process.exit(1);
  }

  const apiBase = `https://api.telegram.org/bot${TOKEN}`;
  const showInfo = process.argv.includes('--info');

  if (showInfo) {
    const res = await fetch(`${apiBase}/getWebhookInfo`);
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (!SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET is not set.');
    process.exit(1);
  }
  if (!APP_URL) {
    console.error('APP_URL is not set.');
    process.exit(1);
  }

  const webhookUrl = `${APP_URL.replace(/\/$/, '')}/api/telegram-webhook`;
  console.log(`Registering webhook: ${webhookUrl}`);

  const res = await fetch(`${apiBase}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, secret_token: SECRET }),
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  if (!data.ok) {
    process.exit(1);
  }
  console.log('\nWebhook registered. Verify with: node scripts/register-telegram-webhook.js --info');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
