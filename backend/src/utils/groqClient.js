// Ye-Almaz — Groq LLM Client
//
// Talks to Groq's OpenAI-compatible endpoint (/openai/v1/chat/completions).
// Plain `fetch`, no SDK — this used to be a local Ollama model reached over
// a tunnel from the lab machine (see git history / docs/telegram-bot-setup.md
// for that old infra); moved to Groq's hosted API for better tool-calling
// reliability and to drop the lab-machine/tunnel dependency entirely. The
// agent loop (services/telegramBotAgent.js) only ever sees the normalized
// { text, toolCalls, stopReason } shape below, so swapping the backing
// model/provider again later only ever touches this file.
if (!process.env.GROQ_API_KEY) {
  console.warn('[GroqLLM] GROQ_API_KEY not set — Telegram bot Q&A disabled.');
}

const BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai';
// openai/gpt-oss-120b: Groq's recommended replacement for the now-retired
// llama-3.3-70b-versatile — strong tool-use (built for it, unlike a
// general chat model retrofitted with function calling), 131072 context.
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// Low but non-zero — this is a business-data reporting bot, not a
// creative-writing one, so favor the model picking the same, most-likely
// tool calls and phrasing for the same question every time over
// conversational variety. Not 0: a little headroom avoids the model
// getting stuck in a degenerate repeat-itself loop on edge cases.
const TEMPERATURE = process.env.GROQ_TEMPERATURE != null ? parseFloat(process.env.GROQ_TEMPERATURE) : 0.2;

function isConfigured() {
  return !!process.env.GROQ_API_KEY;
}

// Local/open-weight models can be meaningfully less reliable at emitting
// strictly-valid tool-call JSON than this — kept defensive anyway since a
// malformed call should never crash the bot, whatever model is behind this.
function parseToolArguments(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // signals a parse failure to the caller
  }
}

// Normalizes an OpenAI-shaped chat-completion response into the shape the
// agent loop actually wants to work with.
function normalize(completion) {
  const choice = completion?.choices?.[0];
  const message = choice?.message || {};
  const rawToolCalls = message.tool_calls || [];

  const toolCalls = rawToolCalls.map(tc => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
    name: tc.function?.name,
    arguments: parseToolArguments(tc.function?.arguments),
    argumentsRaw: tc.function?.arguments,
  }));

  let stopReason = 'end_turn';
  if (toolCalls.length > 0) stopReason = 'tool_use';
  else if (choice?.finish_reason === 'length') stopReason = 'max_tokens';

  return {
    text: message.content || '',
    toolCalls,
    stopReason,
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Groq's FREE tier caps every model at the same 30 req/min, 8K tokens/min,
// 1K req/day — not model-specific, so switching models doesn't raise this.
// This bot's system prompt + tool definitions + growing multi-round history
// can burst past 8K tokens within a single question (up to MAX_ROUNDS calls,
// each resending most of that). A 429 here almost always means that cap,
// not an outage — retry once using Groq's own Retry-After header (capped
// short, so a real question never hangs waiting on a long reset window;
// past that cap it's a config problem for the caller to report, not
// something worth blocking on).
const MAX_RATE_LIMIT_WAIT_MS = 6000;

// messages: OpenAI-shaped [{role, content, tool_calls?, tool_call_id?}, ...]
// tools: OpenAI-shaped [{type:'function', function:{name, description, parameters}}, ...]
// toolChoice: undefined (model decides) | 'none' (force a prose final answer)
async function runGroqLlm({ system, messages, tools, toolChoice, maxTokens } = {}) {
  if (!isConfigured()) {
    throw new Error('Groq is not configured (GROQ_API_KEY missing).');
  }

  const body = {
    model: DEFAULT_MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: TEMPERATURE,
    stream: false,
  };
  if (tools?.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (maxTokens) body.max_tokens = maxTokens;

  const doCall = () => fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  let res = await doCall();

  if (res.status === 429) {
    const retryAfterSec = parseFloat(res.headers.get('retry-after'));
    const waitMs = !isNaN(retryAfterSec) ? retryAfterSec * 1000 : 2000;
    console.warn(`[GroqLLM] 429 rate-limited — free tier is capped at 30 req/min & 8K tokens/min for every model. Retry-After: ${res.headers.get('retry-after') ?? '?'}s`);
    if (waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
      await sleep(waitMs);
      res = await doCall();
    }
  }

  // Log remaining quota on every call — the only way to see how close to
  // the free-tier ceiling this bot is running without checking the Groq
  // console by hand.
  const remainingTokens = res.headers.get('x-ratelimit-remaining-tokens');
  const remainingReqs = res.headers.get('x-ratelimit-remaining-requests');
  if (remainingTokens != null || remainingReqs != null) {
    console.log(`[GroqLLM] quota remaining — tokens/min: ${remainingTokens ?? '?'}, requests/min: ${remainingReqs ?? '?'}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const hint = res.status === 429
      ? ' — free-tier rate limit (8K tokens/min, shared across all models); upgrade to Groq\'s paid tier or reduce prompt/tool size if this recurs.'
      : res.status === 401
        ? ' — check GROQ_API_KEY is set correctly.'
        : res.status === 400 && errText.includes('model')
          ? ' — check GROQ_MODEL is a valid, currently-available Groq model id.'
          : '';
    throw new Error(`Groq request failed (${res.status})${hint} ${errText.slice(0, 500)}`);
  }

  const completion = await res.json();
  return normalize(completion);
}

module.exports = { runGroqLlm, isConfigured, DEFAULT_MODEL };
