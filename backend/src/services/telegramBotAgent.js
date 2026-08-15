// Ye-Almaz — Telegram Bot Agent Loop
//
// Manual tool-use loop over the local Ollama model — there's no vendor
// SDK/tool-runner for a local endpoint, so this owns the round-by-round
// tool execution itself, plus the local-model-specific handling a cloud
// SDK would otherwise take care of: retrying a malformed tool-call once,
// and forcing a plain-text final answer if the round cap is hit instead
// of silently truncating.
const { runLocalLlm } = require('../utils/localLlmClient');
const { toolDefinitions, toolHandlers } = require('./botTools');

const MAX_ROUNDS = 6;

// Static system-prompt body — role framing, the read-only guarantee, and
// (critically) the admin-analytics cohort-subtlety instruction spelled
// out in plain English, since that's an easy trap for a model to fall
// into if it only sees the field names. Today's date is appended fresh on
// every call (see buildSystemPrompt) since "today"/"this month" are
// relative and this string is otherwise reused across requests.
const SYSTEM_PROMPT_BASE = `You are a read-only business assistant for Ye-Almaz Dental Lab, answering the lab owner's questions in Telegram using the tools provided. You can ONLY read data — you have no way to change anything, and you must never claim to have changed, approved, or updated anything.

The lab operates in Ethiopia (Africa/Addis_Ababa timezone). All amounts are in Ethiopian Birr (Br).

IMPORTANT — when using get_admin_analytics: "deliveredCases" counts cases whose DELIVERY date falls in the requested range, regardless of when they were created. "deliveredOfCreated" counts, of the cases CREATED in the range, how many have since been delivered (whenever that happened). These are two different questions and are NOT interchangeable — if asked "how many delivered today," use deliveredCases with today's range; if asked "of what we took in today, how many are already done," use deliveredOfCreated. Never conflate the two.

Always call a tool to get real numbers before answering anything about the business — never guess or estimate, and never answer a follow-up (e.g. "and last month?", "how many cases is that") using a number already stated earlier in this conversation without calling the tool again this turn, since the underlying data can change between messages.

STAY GROUNDED IN YOUR TOOLS. Your tools cover cases, payments, and staff/lab/delivery performance — nothing else. If a question isn't something your tools can answer (open-ended strategy, "how do I fix X," opinions, HR/morale/marketing advice, anything outside that data), don't answer it, even partially or with general knowledge — just say you don't have data for that.

BE BRIEF. This is a text message, not a report — lead with the number(s) actually asked for, in one or two short sentences or a tight "-" bulleted list. Skip preamble ("Here is the information you requested..."), skip restating the question, skip closing filler ("let me know if you need anything else"). No markdown formatting (no headers, no bold/italic markers, no tables) — plain text only, since the reply is sent as-is.

You may see earlier turns of this same conversation above — use them for context on follow-up questions (e.g. "and last month?" after a revenue question means the same metric, different period), but always re-call the relevant tool for fresh numbers rather than reusing one from earlier.`;

function todayInLabTimezone() {
  // process.env.TZ is set to Africa/Addis_Ababa as the very first line of
  // index.js, so Date/Intl calls in this process already resolve in that
  // timezone — no manual offset math needed.
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function buildSystemPrompt() {
  return `${SYSTEM_PROMPT_BASE}\n\nToday's date is ${todayInLabTimezone()}.`;
}

// Single-flight guard — a lab PC (likely one consumer GPU, maybe
// CPU-only) can't usefully serve concurrent generations. A second message
// arriving mid-answer gets an immediate reply instead of queuing silently
// behind the first (which could make the second question wait minutes) or
// running both at once and starving each other.
let inFlight = false;

// Short-term per-chat memory, so a follow-up like "and last month?" has
// something to refer back to. In-memory only (resets on redeploy) — same
// accepted trade-off as the rate limiter in telegramWebhook.js: only 1-3
// chat IDs are ever allowlisted for this bot, so persistence isn't worth
// the complexity. Deliberately stores only the clean user/assistant text
// pairs, NOT the tool-call/tool-result noise from within a turn — that
// noise is turn-specific working state, not conversational context a
// follow-up question needs, and keeping it out bounds how much of the
// limited context window history eats into on every subsequent call.
const MAX_HISTORY_PAIRS = 6; // 6 user+assistant exchanges = 12 messages
const conversationHistory = new Map(); // chatId -> [{role, content}, ...]

function getHistory(chatId) {
  return conversationHistory.get(chatId) || [];
}

function appendToHistory(chatId, userText, replyText) {
  const history = getHistory(chatId);
  history.push({ role: 'user', content: userText }, { role: 'assistant', content: replyText });
  while (history.length > MAX_HISTORY_PAIRS * 2) history.shift();
  conversationHistory.set(chatId, history);
}

function clearHistory(chatId) {
  conversationHistory.delete(chatId);
}

async function executeToolCall(toolCall) {
  const { id, name, arguments: args } = toolCall;
  if (args === null) {
    // Local models are meaningfully less reliable at strict tool-call JSON
    // than a frontier cloud model — hand the parse error back as a tool
    // result (not a crash) so the model can see it and retry properly on
    // the next round, same as it would handle any other tool error.
    return { id, content: JSON.stringify({ error: `Could not parse the arguments you sent for "${name}" as JSON — please retry this call with valid JSON arguments.` }) };
  }
  const handler = toolHandlers[name];
  if (!handler) {
    return { id, content: JSON.stringify({ error: `Unknown tool: "${name}".` }) };
  }
  try {
    const result = await handler(args || {});
    return { id, content: JSON.stringify(result) };
  } catch (err) {
    console.error(`[TelegramBot] Tool "${name}" failed:`, err.message);
    return { id, content: JSON.stringify({ error: `That lookup failed: ${err.message}` }) };
  }
}

// A data-reporting bot should never state a business figure it didn't
// just fetch. Prompt instructions alone are NOT reliable enough for this
// on an 8B local model — empirically (see docs/telegram-bot-setup.md
// verification notes), Hermes-3-8B ignores explicit "don't give generic
// advice" / "always re-call the tool on follow-ups" rules a meaningful
// fraction of the time, either answering off-topic questions with
// invented generic advice or answering follow-ups with a hallucinated
// number instead of a fresh tool call. So this is enforced in code
// instead of hoped for in the prompt: if the model produces a final
// prose answer without having called any tool THIS turn, the prose is
// discarded and a safe, honest decline is sent instead — a real number
// only ever reaches the user backed by a tool call from this same turn.
const GROUNDING_FALLBACK = "I don't have data for that from a fresh lookup — ask me about cases, payments, or staff/lab performance and I'll pull real numbers.";

async function runAgentLoop(chatId, userText) {
  const system = buildSystemPrompt();
  // Prior clean Q&A pairs first, then this turn's message — the tool-call
  // back-and-forth that happens below is local to `messages` for this
  // turn only and never gets persisted (see appendToHistory).
  const messages = [...getHistory(chatId), { role: 'user', content: userText }];
  let toolCalledThisTurn = false;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let response;
    try {
      response = await runLocalLlm({ system, messages, tools: toolDefinitions });
    } catch (err) {
      console.error('[TelegramBot] LLM call failed:', err.message);
      return "Sorry, I couldn't reach the AI model just now — it may be offline. Please try again in a moment.";
    }

    if (response.stopReason === 'tool_use' && response.toolCalls.length > 0) {
      toolCalledThisTurn = true;
      messages.push({
        role: 'assistant',
        content: response.text || null,
        tool_calls: response.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.argumentsRaw ?? JSON.stringify(tc.arguments || {}) },
        })),
      });

      // All tool calls in a round run concurrently — matches how a
      // frontier model's parallel tool-use is normally handled, and these
      // are all independent read-only lookups anyway.
      const results = await Promise.all(response.toolCalls.map(executeToolCall));
      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      }
      continue;
    }

    // end_turn or max_tokens with prose content — done, but only trust it
    // if a tool actually backed it up this turn (see GROUNDING_FALLBACK).
    if (response.text?.trim()) {
      if (!toolCalledThisTurn) {
        return GROUNDING_FALLBACK; // not persisted — nothing real to follow up on
      }
      const replyText = response.text.trim();
      appendToHistory(chatId, userText, replyText);
      return replyText;
    }

    // No tool call and no text — treat as a soft failure rather than
    // sending an empty Telegram message. Not persisted to history — it's
    // not a real exchange worth a follow-up referring back to.
    return "I couldn't come up with an answer to that — could you rephrase the question?";
  }

  // Round cap hit while the model was still requesting tools. Force a
  // prose answer from whatever's already been gathered by omitting the
  // tools param entirely (more universally supported across local-model
  // serving stacks than relying on a tool_choice:"none" override) instead
  // of silently truncating the conversation.
  try {
    const final = await runLocalLlm({ system, messages, maxTokens: 1500 });
    const replyText = final.text?.trim();
    if (replyText) {
      appendToHistory(chatId, userText, replyText);
      return replyText;
    }
    return "I gathered some data but couldn't summarize it in time — try asking a narrower question.";
  } catch (err) {
    console.error('[TelegramBot] Forced final-answer call failed:', err.message);
    return "I gathered some data but ran into an issue summarizing it — try asking a narrower question.";
  }
}

async function answerQuestion(chatId, userText) {
  if (inFlight) {
    return "I'm still working on your last question — give me a moment and ask again.";
  }
  inFlight = true;
  try {
    return await runAgentLoop(chatId, userText);
  } finally {
    inFlight = false;
  }
}

module.exports = { answerQuestion, clearHistory };
