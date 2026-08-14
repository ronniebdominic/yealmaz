// Ye-Almaz — Telegram Bot Webhook
// Public endpoint Telegram calls on every incoming message. Same pattern
// as webhooks.js (DB-trigger callbacks) and the Chapa webhook in
// payments.js: no protect/restrict — authenticated by a shared secret
// instead, since the sender is Telegram's servers, not an app user. Acks
// fast; the real work (LLM call, tool execution, reply) happens after.
const express = require('express');
const { sendMessage, sendChatAction } = require('../utils/telegramClient');
const { answerQuestion } = require('../services/telegramBotAgent');

const router = express.Router();

// Simple in-memory sliding-window rate limit, per chat. Only 1-3 chat IDs
// are ever allowlisted for this bot, so an in-memory Map (reset on
// redeploy) is an intentional, acceptable trade-off — this exists to
// protect the lab machine's limited local-inference throughput from a
// retry storm, not to serve real multi-tenant traffic (contrast with the
// Redis-backed appCache, justified by actual dashboard traffic volume).
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const requestLog = new Map(); // chatId -> timestamps[]

function isRateLimited(chatId) {
  const now = Date.now();
  const timestamps = (requestLog.get(chatId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(chatId, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function getAllowedChatIds() {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// ── POST /api/telegram-webhook ───────────────────────────
router.post('/', async (req, res) => {
  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return res.status(401).end();
    }

    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = message?.text;

    // Ack immediately — Telegram doesn't wait on the reply, and a slow
    // LLM response shouldn't hold the webhook connection open.
    res.status(200).end();

    if (!chatId || !text) return; // non-text update (sticker, photo, etc.) — nothing to answer

    const allowedChatIds = getAllowedChatIds();
    if (!allowedChatIds.includes(String(chatId))) {
      // Zero cost, zero information leak — no reply, no LLM call, just a
      // server-side log so an unexpected sender is at least visible.
      console.error('[telegram-webhook] rejected message from unauthorized chat', chatId);
      return;
    }

    if (text.trim() === '/start') {
      await sendMessage(chatId, "Hi — I'm the Ye-Almaz business assistant. Ask me anything about cases, payments, or performance, e.g. \"how much is outstanding from Trusted Partners?\" or \"how many cases were delivered today?\"");
      return;
    }

    if (isRateLimited(chatId)) {
      await sendMessage(chatId, "You've sent a lot of questions in a short time — please wait a few minutes and try again.");
      return;
    }

    await sendChatAction(chatId, 'typing');
    const reply = await answerQuestion(text);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error('[telegram-webhook]', err.message);
  }
});

module.exports = router;
