// Ye-Almaz — Telegram Daily Business Summary
//
// A fixed nightly digest over well-defined fields, composed as a plain
// string template — deliberately NOT an LLM call. This keeps the
// unattended recurring job at zero LLM cost and removes any risk of an
// unreviewed message misstating a number; it reuses the exact same
// compute* functions as on-demand Q&A, so the digest and any follow-up
// chat question about the same figures are guaranteed to agree.
const cron = require('node-cron');
const dashboard = require('../routes/dashboard');
const { sendMessage } = require('../utils/telegramClient');

const DEFAULT_CRON = '0 8 * * *'; // 08:00 daily
// A clinic's oldest unpaid case crossing this many days gets called out by
// name in the digest instead of just folding into the total.
const STALE_OUTSTANDING_DAYS = 30;

function fmtBr(amount) {
  return `Br ${Math.round(amount || 0).toLocaleString('en-US')}`;
}

async function buildDigestText() {
  const [summary, financeReport, trustedPartners] = await Promise.all([
    dashboard.computeDashboardSummary(),
    dashboard.computeFinanceReport({}),
    dashboard.computeTrustedPartnersSummary(),
  ]);

  const s = summary.stats;
  const todayRevenue = financeReport.revenue.daily.amount;

  const totalOutstanding = trustedPartners.reduce((sum, c) => sum + (c.outstanding || 0), 0);
  const staleClinic = trustedPartners
    .filter(c => (c.oldestAgeDays || 0) >= STALE_OUTSTANDING_DAYS)
    .sort((a, b) => b.oldestAgeDays - a.oldestAgeDays)[0];

  const lines = [
    `Ye-Almaz daily summary — ${new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    '',
    `- New cases today: ${s.todayCases}`,
    `- Delivered today: ${s.deliveredToday}`,
    `- Revenue collected today: ${fmtBr(todayRevenue)}`,
    `- Cases in active production: ${s.activeCases}`,
    `- Ready to dispatch: ${s.readyToDispatch}`,
    `- Trusted Partners outstanding (all-time): ${fmtBr(totalOutstanding)} across ${trustedPartners.reduce((sum, c) => sum + (c.outstandingCount || 0), 0)} cases`,
  ];

  if (staleClinic) {
    lines.push(`- ${staleClinic.name} has a case unpaid for ${staleClinic.oldestAgeDays} days — may be worth following up.`);
  }

  return lines.join('\n');
}

function getRecipientChatIds() {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function runDailySummary() {
  const chatIds = getRecipientChatIds();
  if (chatIds.length === 0) {
    console.warn('[DailySummary] No TELEGRAM_ALLOWED_CHAT_IDS configured — skipping.');
    return;
  }
  let text;
  try {
    text = await buildDigestText();
  } catch (err) {
    console.error('[DailySummary] Could not build digest:', err.message);
    return;
  }
  for (const chatId of chatIds) {
    await sendMessage(chatId, text);
  }
}

// Guarded the same way as the other conditional-client modules in this
// codebase — a missing token means the whole feature is inert, not an
// error at startup.
function schedule() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('[DailySummary] TELEGRAM_BOT_TOKEN not set — daily summary disabled.');
    return;
  }
  if (process.env.TELEGRAM_DAILY_SUMMARY_ENABLED === 'false') {
    console.log('[DailySummary] Disabled via TELEGRAM_DAILY_SUMMARY_ENABLED=false.');
    return;
  }
  const expression = process.env.TELEGRAM_DAILY_SUMMARY_CRON || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    console.error(`[DailySummary] Invalid TELEGRAM_DAILY_SUMMARY_CRON "${expression}" — daily summary disabled.`);
    return;
  }
  // Timezone explicit even though process.env.TZ is already Africa/Addis_Ababa
  // (set as the first line of index.js) — this is the one setting that
  // most directly determines when the digest actually fires, so it's
  // worth being explicit rather than relying on an ambient global.
  cron.schedule(expression, () => {
    runDailySummary().catch(err => console.error('[DailySummary] Unhandled error:', err.message));
  }, { timezone: 'Africa/Addis_Ababa' });
  console.log(`[DailySummary] Scheduled "${expression}" (Africa/Addis_Ababa).`);
}

module.exports = { runDailySummary, schedule, buildDigestText };
