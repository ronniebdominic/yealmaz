// Ye-Almaz — Admin Dashboard AI Assistant (text + voice)
//
// A second channel into the exact same agent loop the Telegram bot uses
// (telegramBotAgent.js) — same tools, same grounding guardrails, same
// system prompt, same single-flight guard against the lab machine's one
// local-model generation at a time. Reusing it rather than building a
// parallel implementation is what guarantees this can never give a
// different answer than the Telegram bot for the same question.
//
// Voice is entirely a FRONTEND concern (the browser's own Web Speech API
// for mic-to-text and text-to-speech) — this endpoint only ever sees and
// returns plain text, exactly like the Telegram webhook does. No audio
// ever reaches this server.
const express = require('express');
const { protect, restrict } = require('../middleware/auth');
const { answerQuestion, clearHistory } = require('../services/telegramBotAgent');
const { isConfigured } = require('../utils/localLlmClient');

const router = express.Router();

const MAX_MESSAGE_LENGTH = 2000;

// Distinct prefix from Telegram's numeric chat ids, so the two id spaces
// can never collide inside telegramBotAgent's shared conversation-history
// Map — belt and braces on top of a collision that was already effectively
// impossible (a UUID vs Telegram's numeric chat ids).
const conversationKey = (userId) => `admin-web:${userId}`;

// ── POST /api/ai-chat/ask ────────────────────────────────
router.post('/ask', protect, restrict('ADMIN'), async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'The local AI model is not configured right now (OLLAMA_BASE_URL missing) — ask whoever manages the lab machine to check it.' });
    }
    const text = (req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Message text is required.' });
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` });
    }

    const reply = await answerQuestion(conversationKey(req.user.id), text);
    res.json({ reply });
  } catch (err) {
    console.error('[ai-chat ask]', err);
    res.status(500).json({ error: 'Something went wrong answering that — please try again.' });
  }
});

// ── POST /api/ai-chat/reset ──────────────────────────────
// Clears this admin's own conversation history — does not affect Telegram
// or any other admin's conversation, since each has its own key.
router.post('/reset', protect, restrict('ADMIN'), (req, res) => {
  clearHistory(conversationKey(req.user.id));
  res.json({ ok: true });
});

module.exports = router;
