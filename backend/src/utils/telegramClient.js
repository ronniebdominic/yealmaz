// Ye-Almaz — Telegram Bot API Client
//
// Plain `fetch` against Telegram's HTTP Bot API — no dependency needed,
// same house style as this codebase's other outbound integrations
// (webpush.js, the Chapa client in payments.js): a conditional client
// guarded by env-var presence, small exported helpers, log-and-swallow on
// failure rather than throwing into the caller's hot path.
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.');
}

const API_BASE = process.env.TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
  : null;

// Telegram hard-caps a single message at 4096 characters. A safety net
// regardless of how disciplined the system prompt is about conciseness —
// splits on the nearest preceding newline within the limit where possible,
// so a chunk boundary doesn't land mid-sentence any more than necessary.
const TELEGRAM_MAX_LEN = 4096;
function chunkText(text) {
  if (text.length <= TELEGRAM_MAX_LEN) return [text];
  const chunks = [];
  let rest = text;
  while (rest.length > TELEGRAM_MAX_LEN) {
    let cut = rest.lastIndexOf('\n', TELEGRAM_MAX_LEN);
    if (cut < TELEGRAM_MAX_LEN * 0.5) cut = TELEGRAM_MAX_LEN; // no good break point — hard cut
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function callTelegramApi(method, payload) {
  if (!API_BASE) {
    console.warn(`[Telegram] Skipped ${method} — bot not configured.`);
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      console.error(`[Telegram] ${method} failed:`, data?.description || res.status);
      return null;
    }
    return data.result;
  } catch (err) {
    console.error(`[Telegram] ${method} error:`, err.message);
    return null;
  }
}

// Plain text, deliberately no parse_mode — MarkdownV2 requires escaping a
// long list of characters that LLM prose and currency figures ("Br
// 12,450.00") routinely contain unescaped, a well-known source of hard
// `400 can't parse entities` failures when piping raw model output through
// it. The system prompt asks the model for plain, chat-friendly prose
// instead; this is the delivery-side safety net (chunking) on top of that.
async function sendMessage(chatId, text) {
  const chunks = chunkText(String(text ?? ''));
  const results = [];
  for (const chunk of chunks) {
    // Sequential, not parallel — preserves message order in the chat.
    results.push(await callTelegramApi('sendMessage', { chat_id: chatId, text: chunk }));
  }
  return results;
}

async function sendChatAction(chatId, action = 'typing') {
  return callTelegramApi('sendChatAction', { chat_id: chatId, action });
}

module.exports = { callTelegramApi, sendMessage, sendChatAction, chunkText };
