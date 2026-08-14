// Ye-Almaz — Local LLM Client (Ollama, running on a machine at the lab)
//
// Talks to Ollama's OpenAI-compatible endpoint (/v1/chat/completions),
// reached over a Cloudflare Tunnel + auth proxy sitting on the lab
// machine — see docs/telegram-bot-setup.md for the full infra runbook.
// Plain `fetch`, no SDK — Ollama (and effectively every local-inference
// server: vLLM, LM Studio, text-generation-webui) speaks the same
// OpenAI-shaped tool-calling format, so there's nothing vendor-specific
// to wrap here. This module is the one place that knows that; the agent
// loop (services/telegramBotAgent.js) only ever sees the normalized
// { text, toolCalls, stopReason } shape below, so swapping the backing
// model/provider later only ever touches this file.
if (!process.env.OLLAMA_BASE_URL) {
  console.warn('[LocalLLM] OLLAMA_BASE_URL not set — Telegram bot Q&A disabled.');
}

const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'hermes3:8b';
// Ollama's default context window (2k-4k tokens) is too small for this
// bot's system prompt + full tool set + multi-round tool-result history —
// left unset, the model silently loses earlier context mid-conversation.
const NUM_CTX = parseInt(process.env.OLLAMA_NUM_CTX, 10) || 8192;

function isConfigured() {
  return !!process.env.OLLAMA_BASE_URL;
}

// Local open-weight models are meaningfully less reliable at emitting
// strictly-valid tool-call JSON than a frontier cloud model — this parses
// defensively and lets the caller decide whether to retry.
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

// messages: OpenAI-shaped [{role, content, tool_calls?, tool_call_id?}, ...]
// tools: OpenAI-shaped [{type:'function', function:{name, description, parameters}}, ...]
// toolChoice: undefined (model decides) | 'none' (force a prose final answer)
async function runLocalLlm({ system, messages, tools, toolChoice, maxTokens } = {}) {
  if (!isConfigured()) {
    throw new Error('Local LLM is not configured (OLLAMA_BASE_URL missing).');
  }

  const body = {
    model: DEFAULT_MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    options: { num_ctx: NUM_CTX },
    stream: false,
  };
  if (tools?.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;
  if (maxTokens) body.max_tokens = maxTokens;

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.OLLAMA_PROXY_SECRET) {
    headers.Authorization = `Bearer ${process.env.OLLAMA_PROXY_SECRET}`;
  }

  const res = await fetch(`${process.env.OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Local LLM request failed (${res.status}): ${errText.slice(0, 500)}`);
  }

  const completion = await res.json();
  return normalize(completion);
}

module.exports = { runLocalLlm, isConfigured, DEFAULT_MODEL };
