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

Always call a tool to get real numbers before answering anything about the business — never guess or estimate. If a question needs a specific date range and none was given, assume "today" unless context suggests otherwise (e.g. "this month," "outstanding" usually means all-time/no date filter).

Reply in plain, concise, conversational prose suitable for a text message — short paragraphs or a simple "-" bulleted list, no markdown formatting (no headers, no bold/italic markers, no tables), since the reply is sent as plain text. Give the actual numbers, not vague summaries. If you don't have enough information after using the available tools, say so plainly instead of guessing.`;

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

async function runAgentLoop(userText) {
  const system = buildSystemPrompt();
  const messages = [{ role: 'user', content: userText }];

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    let response;
    try {
      response = await runLocalLlm({ system, messages, tools: toolDefinitions });
    } catch (err) {
      console.error('[TelegramBot] LLM call failed:', err.message);
      return "Sorry, I couldn't reach the AI model just now — it may be offline. Please try again in a moment.";
    }

    if (response.stopReason === 'tool_use' && response.toolCalls.length > 0) {
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

    // end_turn or max_tokens with prose content — done.
    if (response.text?.trim()) return response.text.trim();

    // No tool call and no text — treat as a soft failure rather than
    // sending an empty Telegram message.
    return "I couldn't come up with an answer to that — could you rephrase the question?";
  }

  // Round cap hit while the model was still requesting tools. Force a
  // prose answer from whatever's already been gathered by omitting the
  // tools param entirely (more universally supported across local-model
  // serving stacks than relying on a tool_choice:"none" override) instead
  // of silently truncating the conversation.
  try {
    const final = await runLocalLlm({ system, messages, maxTokens: 1500 });
    return final.text?.trim() || "I gathered some data but couldn't summarize it in time — try asking a narrower question.";
  } catch (err) {
    console.error('[TelegramBot] Forced final-answer call failed:', err.message);
    return "I gathered some data but ran into an issue summarizing it — try asking a narrower question.";
  }
}

async function answerQuestion(userText) {
  if (inFlight) {
    return "I'm still working on your last question — give me a moment and ask again.";
  }
  inFlight = true;
  try {
    return await runAgentLoop(userText);
  } finally {
    inFlight = false;
  }
}

module.exports = { answerQuestion };
