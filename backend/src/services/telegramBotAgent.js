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

function toYMD(date) {
  return date.toLocaleDateString('en-CA');
}

// Concrete date-range anchors for the system prompt, computed in code
// rather than left for the model to derive. Empirically, an 8B local
// model asked to resolve "this week" / "no period given" on its own will
// sometimes invent an arbitrary, wrong year for the tool's from/to args
// (observed: 2022, out of nowhere, on a live 2026 system) instead of
// leaving them unset or using the real current year — silently returning
// all-zero data for a totally different period. Handing it pre-computed
// YYYY-MM-DD values removes the date arithmetic (and the guessing) from
// the model's job entirely.
function dateAnchors() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat, already lab-timezone via TZ env
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  return {
    today: toYMD(now),
    startOfWeek: toYMD(monday),
    startOfMonth: toYMD(startOfMonth),
    startOfYear: toYMD(startOfYear),
  };
}

function buildSystemPrompt() {
  const a = dateAnchors();
  return `${SYSTEM_PROMPT_BASE}

Today's date is ${a.today}. When a tool needs a date range, resolve it using these exact anchors — never guess or invent a year: "today" = ${a.today} to ${a.today}; "this week" = ${a.startOfWeek} to ${a.today}; "this month" = ${a.startOfMonth} to ${a.today}; "this year" or no period mentioned = ${a.startOfYear} to ${a.today}. Only use a different year or date than these if the user explicitly names one (e.g. "in 2024," "since March 3rd"). When you write your answer, if you mention the date range at all, quote it from the "range" field actually returned in the tool's JSON result — never restate the from/to you originally asked for, since a tool may adjust it.`;
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

// Guards against a specific, repeatedly-observed failure mode: asked for
// a date-range tool with no period named ("who's the best lab worker"),
// Hermes-3-8B sometimes invents an arbitrary, wrong year for from/to (seen
// live: 2022, out of nowhere, on this 2026 system) instead of naming the
// real current year or omitting the args — silently returning all-zero
// data for the wrong period. This held even after the system prompt was
// given the exact real dates to use, so it's corrected here instead of
// re-prompted for: if a tool call's from/to year doesn't match the
// current year and the user's own message never mentioned that year (or
// any year), the args are dropped so the tool's own "defaults to start of
// this year" behavior (see botTools.js's parameter descriptions) kicks in
// instead of the model's guess.
function sanitizeDateArgs(args, userText) {
  if (!args || typeof args !== 'object') return args;
  const isYMD = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isYMD(args.from) && !isYMD(args.to)) return args;

  const currentYear = new Date().getFullYear(); // lab timezone via TZ env
  const years = [args.from, args.to].filter(isYMD).map(v => parseInt(v.slice(0, 4), 10));
  const mentionedYears = (userText.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  const suspicious = years.some(y => y !== currentYear && !mentionedYears.includes(y));
  if (!suspicious) return args;

  console.warn(`[TelegramBot] Dropping suspicious date args ${JSON.stringify({ from: args.from, to: args.to })} for user text "${userText}" — not the current year and not mentioned by the user.`);
  const { from, to, ...rest } = args;
  return rest;
}

// Even after sanitizeDateArgs corrects what's actually SENT to a tool
// (so the numbers come back for the right period), Hermes-3-8B has been
// observed to still narrate a wrong, invented date range in its final
// prose (e.g. citing "2022-05-23 to 2022-05-29" in the reply even though
// the tool it called was, after sanitization, given no from/to at all and
// returned this year's real range) — an explicit "quote the tool's own
// range field" instruction did not fix this either. So the last real
// range a tool actually returned this turn is tracked and used to
// deterministically correct any suspicious-year date the model still
// writes into its reply, rather than trusting the model to get this right.
function extractRange(toolResultContent) {
  try {
    const parsed = JSON.parse(toolResultContent);
    const from = parsed?.range?.from;
    if (typeof from === 'string') {
      return { from: from.slice(0, 10), to: (parsed.range.to || from).slice(0, 10) };
    }
  } catch {
    // not JSON or no range field — nothing to extract
  }
  return null;
}

function correctDateMentions(text, realRange, userText) {
  if (!text || !realRange) return text;
  const currentYear = new Date().getFullYear();
  const mentionedYears = (userText.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  let matchIndex = 0;
  return text.replace(/\b(19|20)\d{2}-\d{2}-\d{2}\b/g, (match) => {
    const year = parseInt(match.slice(0, 4), 10);
    if (year === currentYear || mentionedYears.includes(year)) return match; // plausibly legit, leave it
    const replacement = matchIndex === 0 ? realRange.from : realRange.to;
    matchIndex++;
    return replacement;
  });
}

async function executeToolCall(toolCall, userText) {
  const { id, name, arguments: rawArgs } = toolCall;
  if (rawArgs === null) {
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
  const args = sanitizeDateArgs(rawArgs, userText);
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
  let lastRealRange = null;

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
      const results = await Promise.all(response.toolCalls.map(tc => executeToolCall(tc, userText)));
      for (const r of results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
        const range = extractRange(r.content);
        if (range) lastRealRange = range; // most recent date-range tool result wins
      }
      continue;
    }

    // end_turn or max_tokens with prose content — done, but only trust it
    // if a tool actually backed it up this turn (see GROUNDING_FALLBACK).
    if (response.text?.trim()) {
      if (!toolCalledThisTurn) {
        return GROUNDING_FALLBACK; // not persisted — nothing real to follow up on
      }
      const replyText = correctDateMentions(response.text.trim(), lastRealRange, userText);
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
    if (final.text?.trim()) {
      const replyText = correctDateMentions(final.text.trim(), lastRealRange, userText);
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
