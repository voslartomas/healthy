/**
 * Prompt protocol for the on-device coach (ADR-008).
 *
 * This module is deliberately PURE — no native modules, no file system — so it
 * can be unit-tested and imported anywhere. The inference side lives in
 * {@link ./systemLlm} (the OS model: Gemini Nano / Apple Intelligence) and the
 * loop in {@link ./runner}.
 *
 * Small on-device models are unreliable at free-form tool calling, so the coach
 * speaks a tiny JSON "action" protocol instead: every turn the model must emit
 * exactly one object — `{"tool": …, "args": …}` or `{"reply": …}` — which
 * {@link parseAction} reads. With llama.rn that was enforced by a GBNF grammar;
 * the OS models expose no grammar, so the protocol is carried by the system
 * instructions ({@link buildSystemPreamble}) and parsing is tolerant: it digs
 * the first JSON object out of prose or code fences, and treats anything else
 * as a plain reply. The runner adds one corrective retry for a forced tool call.
 *
 * The OS models accept under ~4K input tokens (Gemini Nano: < 4000), so
 * {@link renderTranscript} keeps the conversation inside {@link PROMPT_CHAR_BUDGET}
 * by dropping the oldest turns first.
 */

import type { ToolSpec } from '../aiClient';

/** Human-readable size, e.g. "2.7 GB" / "850 MB" (used by the voice-model card). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

// ---------------------------------------------------------------------------
// The constrained "action" protocol.
// ---------------------------------------------------------------------------

/** The placeholder call shape shown for each tool the UI can force. */
const FORCED_FORMAT: Record<string, string> = {
  log_food:
    '{"tool": "log_food", "args": {"entries": [{"name": "<what they ate>", "kcal": <number>, "proteinG": <number>, "carbsG": <number>, "fatG": <number>}]}}',
  create_workout:
    '{"tool": "create_workout", "args": {"name": "<short name>", "muscles": ["<muscle or group>"], "exercises": ["<any exercise the user named>"], "exerciseCount": <number>}}',
};

/**
 * Build the system instructions: the caller's coaching brief plus the action
 * protocol and a compact description of each tool.
 */
export function buildSystemPreamble(
  system: string,
  tools: ToolSpec[],
  /**
   * When set, the model MUST open with a call to this tool — the user chose the
   * action in the UI, so there is no intent left to infer.
   *
   * This matters more on device than in the cloud. The cloud providers have a
   * real `tool_choice` the API enforces; here the only lever is the prompt, and
   * the default rules below lean hard the other way ("default to just talking",
   * "only when the user CLEARLY asks"). Those rules exist because small models
   * over-trigger tools in open chat, but they are exactly wrong once the user has
   * pressed "Log food" — so a forced turn swaps them out rather than piling a
   * contradictory instruction on top.
   */
  forceTool?: string,
): string {
  // No tools → pure text generation (e.g. the daily brief). Keep the action
  // protocol minimal so the model just writes a reply.
  if (tools.length === 0) {
    return [
      system,
      '',
      'Reply with EXACTLY ONE JSON object and nothing else — no markdown, no code fences — of the form {"reply": "<your message>"}.',
    ].join('\n');
  }
  const toolLines = tools
    .map(
      t =>
        `- ${t.name}: ${t.description}\n  args (JSON schema): ${JSON.stringify(t.parameters)}`,
    )
    .join('\n');
  return [
    system,
    '',
    'You drive the app by emitting JSON actions. On EVERY turn reply with EXACTLY ONE JSON object and nothing else — no markdown, no code fences, no text before or after it — in one of these two forms:',
    '  {"tool": "<name>", "args": { ... }}   — to call a tool',
    '  {"reply": "<message to the user>"}     — to talk to the user',
    '',
    'Available tools:',
    toolLines,
    '',
    'RULES:',
    ...(forceTool
      ? [
          // The user picked the action in the UI, so the "default to talking"
          // rules are dropped rather than contradicted — a small model given both
          // "only call a tool when clearly asked" and "you must call this tool"
          // tends to obey the first.
          `- The user has ALREADY chosen the action: your first JSON object MUST be {"tool": "${forceTool}", "args": {...}}. Do not reply in words on this turn, and do not ask a follow-up question first.`,
          '- Their message describes what to act on. Fill in the args from it, estimating any numbers yourself.',
          '- When calling log_food, the "entries" array MUST contain at least one object, and each object MUST have "name" and "kcal". Estimate kcal and macros (proteinG, carbsG, fatG) yourself. Never call a tool with empty args, and never ask the user for calories or macros.',
          '',
          // Placeholders, not a concrete meal: given "2 eggs + toast" here, the
          // small model logged eggs and toast for unrelated messages.
          "FORMAT — fill the <placeholders> from the user's message:",
          // The shape for the tool actually forced: a forced create_workout used
          // to be shown only the log_food shape.
          FORCED_FORMAT[forceTool] ??
            `{"tool": "${forceTool}", "args": {<the arguments described above>}}`,
        ]
      : [
          '- Default to just talking. Answer questions and give advice with {"reply": ...}. Only call a tool when the user CLEARLY asks you to log, add, track, change, remove, or save a food.',
          '- If the user is only asking a question or mentioning food without asking to log it, do NOT call any tool — reply in words.',
          '- When you DO call log_food, the "entries" array MUST contain at least one object, and each object MUST have "name" and "kcal". Estimate kcal and macros (proteinG, carbsG, fatG) yourself. Never call a tool with empty args, and never ask the user for calories or macros.',
          // On the phone Gemini Nano answered "delete the banana" with "Okay,
          // I've deleted the banana" — no tool call, nothing deleted.
          '- A reply changes NOTHING. Only a tool call logs, changes or deletes food. Never say you did something unless a TOOL_RESULT says ok:true. To change or delete a food, call update_food_log or delete_food_log with its "name" (e.g. {\"tool\": \"delete_food_log\", \"args\": {\"name\": \"<the food>\"}}).',
          '',
          // Placeholder reply: with a worked answer here ("Aim for roughly
          // 1.6–2.2 g of protein per kg…") Gemini Nano repeated it word for word
          // for unrelated questions.
          'EXAMPLE A — the user asks a question, so just reply (no tool):',
          '{"reply": "<your answer, using the user\'s real numbers from the data above>"}',
          '',
          'EXAMPLE B — the user explicitly asks to log, so use the tool (fill the <placeholders>):',
          '{"tool": "log_food", "args": {"entries": [{"name": "<what they ate>", "kcal": <number>, "proteinG": <number>, "carbsG": <number>, "fatG": <number>}]}}',
        ]),
    '',
    'After you call a tool you receive its result as the next user turn, prefixed with TOOL_RESULT. If it says ok:true, send a {"reply": ...} stating the numbers plainly. If it reports an error, fix your args and call the tool again.',
  ].join('\n');
}

/** One conversation turn as the runner tracks it. */
export interface CoachTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Character budget for the rendered conversation. The OS models take under ~4K
 * input tokens (Gemini Nano: < 4000) and the system instructions with the tool
 * schemas already use ~1.5K of that; at ~4 characters per token this keeps the
 * transcript to ~2K tokens. Conservative on purpose — non-English text packs
 * fewer characters per token, and an over-long request fails outright.
 */
export const PROMPT_CHAR_BUDGET = 8000;

/** The latest turn is never dropped, but a pasted wall of text is clipped to
 * this so it can't crowd out the whole budget on its own. */
const MAX_TURN_CHARS = 4000;

/**
 * How many past turns the on-device coach sees. The whole chat used to go in
 * (trimmed only by characters): on a small model that mostly added latency and
 * old mistakes to imitate — on the phone, Gemini Nano answered a fresh "log
 * this" by repeating its PREVIOUS reply. A short window keeps the current
 * request in focus; the coach's facts come from the data context anyway.
 */
export const MAX_HISTORY_TURNS = 6;

/** An assistant turn as the protocol shows it: already-JSON turns (tool calls)
 * as they are, stored prose replies wrapped as `{"reply": "…"}`. Replaying past
 * answers as prose contradicted the "reply ONLY with JSON" instruction, and a
 * small model imitates the transcript over the instruction. */
function protocolTurn(content: string): string {
  const t = content.trim();
  if (t.startsWith('{') && t.endsWith('}')) return t;
  return JSON.stringify({ reply: t });
}

/**
 * Render the conversation as the plain-text prompt the OS model receives
 * (the system instructions travel separately, or are folded in ahead of this
 * by the native module).
 *
 * The first `contextCount` turns are EARLIER conversation — previous messages,
 * before the one being answered. They go in a marked block as plain prose
 * ("User said / You answered"), not as `User:` / `Assistant: {"reply": …}`
 * lines: replayed in the live format, Gemini Nano copied them — on the phone it
 * answered "smaž ty vejce" with the previous steps answer, again and again. The
 * rest (the current message and this turn's tool calls/results) is the live
 * `User:` / `Assistant:` transcript, assistant turns in the JSON protocol
 * ({@link protocolTurn}). `reminder`, when given, is repeated right before the
 * open `Assistant:` line, because small models weigh the END of the prompt most.
 *
 * Over budget, the OLDEST turns go first; the newest turn always survives
 * (clipped if huge), because it is the one the model must answer.
 */
export function renderTranscript(
  turns: CoachTurn[],
  budget: number = PROMPT_CHAR_BUDGET,
  reminder?: string,
  contextCount = 0,
): string {
  const clip = (raw: string) =>
    (raw.length > MAX_TURN_CHARS
      ? raw.slice(0, MAX_TURN_CHARS) + '…'
      : raw
    ).trim();
  const lines: { text: string; context: boolean }[] = turns
    .map((t, i) => ({ t, context: i < contextCount }))
    .filter(({ t }) => t.content.trim() !== '')
    .map(({ t, context }) => {
      if (context) {
        return {
          context,
          text:
            t.role === 'assistant'
              ? `- You answered: ${clip(t.content)}`
              : `- User said: ${clip(t.content)}`,
        };
      }
      const raw = t.role === 'assistant' ? protocolTurn(t.content) : t.content;
      return {
        context,
        text: `${t.role === 'assistant' ? 'Assistant' : 'User'}: ${clip(raw)}`,
      };
    });
  const header =
    'EARLIER IN THIS CHAT (background only — do not repeat these answers):';
  const tail = reminder ? [`(${reminder})`, 'Assistant:'] : ['Assistant:'];
  let used = tail.join('\n').length + 1;
  const kept: typeof lines = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const cost =
      lines[i].text.length + 1 + (lines[i].context ? header.length + 1 : 0);
    if (kept.length > 0 && used + cost > budget) break;
    kept.unshift(lines[i]);
    used += lines[i].text.length + 1;
  }
  const context = kept.filter(l => l.context).map(l => l.text);
  const live = kept.filter(l => !l.context).map(l => l.text);
  return [
    ...(context.length ? [header, ...context, ''] : []),
    ...live,
    ...tail,
  ].join('\n');
}

/** The end-of-prompt nudge: the one rule a small model must not miss. */
export function turnReminder(forceTool: string | null): string {
  return forceTool
    ? `Answer the LAST user message only. Respond with exactly {"tool": "${forceTool}", "args": {...}} — one JSON object, nothing else.`
    : // The language line lives here, at the end, because Gemini Nano ignored
      // "reply in the user's language" in the instructions and answered a Czech
      // question in English. It defers to a fixed language set in the brief.
      'Answer the LAST user message only, with exactly one JSON object: {"reply": "..."} or {"tool": "...", "args": {...}}. Write the reply in the language of that message, unless the instructions name a reply language.';
}

/** The decoded model action. */
export type CoachAction =
  | { kind: 'reply'; reply: string }
  | { kind: 'tool'; tool: string; args: Record<string, unknown> };

/**
 * The first balanced `{ … }` object in `text`, or null. String literals are
 * respected, so braces inside a reply's text don't end the object early.
 */
function firstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Repair the JSON slips small on-device models make, observed from Gemini Nano
 * on a real phone: typographic quotes (“ ” „) in place of `"`, and trailing
 * commas before `}` / `]`. Only used after strict parsing has failed, because
 * converting quotes inside a reply's own text would break valid output.
 */
function repairJson(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/,\s*([}\]])/g, '$1');
}

function toAction(obj: Record<string, unknown>, depth = 0): CoachAction | null {
  if (typeof obj.reply === 'string') {
    // A reply that is itself a fenced/JSON action — `{"reply": "```json
    // {\"reply\": \"…\"}```"}`, seen on the phone — is unwrapped once, so
    // the user never sees the protocol, and an echo of it can be recognized.
    const inner = obj.reply.trim();
    if (depth === 0 && (inner.startsWith('```') || inner.startsWith('{'))) {
      const nested = parseAction(inner);
      if (nested.kind === 'tool' || nested.reply.trim() !== inner) {
        return nested;
      }
    }
    return { kind: 'reply', reply: obj.reply };
  }
  if (typeof obj.tool === 'string') {
    const args =
      obj.args && typeof obj.args === 'object'
        ? (obj.args as Record<string, unknown>)
        : {};
    return { kind: 'tool', tool: obj.tool, args };
  }
  return null;
}

/** What the user sees when the model produced an action we can't read — never
 * the raw JSON itself (it showed up in the chat once, before this). */
export const GARBLED_REPLY =
  'Sorry — I got muddled there. Could you say that again?';

/**
 * Parse one model completion into a {@link CoachAction}.
 *
 * Without a grammar the OS models sometimes wrap the object in a code fence,
 * add a sentence before it, emit slightly broken JSON, or (rarely) answer in
 * plain prose. So: take the first balanced JSON object anywhere in the output;
 * parse it strictly, then once more after {@link repairJson}; if it reads as an
 * action, use it. Output that still LOOKS like an action object but can't be
 * read becomes {@link GARBLED_REPLY}; anything else is treated as a plain reply
 * (fences stripped), so a chatty model still says something useful.
 */
/**
 * A tool call written outside the JSON protocol: `tool: delete_food_log` /
 * `delete_food_log` on its own line, then `args: {…}` (or just the `{…}`).
 * Only a snake_case name immediately followed by its args object counts, so
 * ordinary prose that mentions a tool is still a reply.
 */
function looseToolCall(text: string, fenced: boolean): CoachAction | null {
  const m =
    /^(?:tool\s*[:=]?\s*)?([a-z]+(?:_[a-z]+)+)\s*(?:\n\s*)?(?:args\s*[:=]?\s*)?(\{[\s\S]*\})\s*$/i.exec(
      text,
    );
  if (!m || (!fenced && !/^tool\b/i.test(text))) return null;
  for (const body of [m[2], repairJson(m[2])]) {
    try {
      const args = JSON.parse(body) as unknown;
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        return {
          kind: 'tool',
          tool: m[1],
          args: args as Record<string, unknown>,
        };
      }
    } catch {
      // try the repaired form
    }
  }
  return null;
}

export function parseAction(raw: string): CoachAction {
  // A fence labelled ```tool (Gemini Nano, on the phone) is a call written
  // as "tool\n<name>\nargs: {…}" rather than JSON — read it as one.
  const fenced = /^```tool\b/i.test(raw.trim());
  const cleaned = raw
    .trim()
    .replace(/^```(?:json|tool)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const loose = looseToolCall(cleaned, fenced);
  if (loose) return loose;
  const candidate =
    firstJsonObject(cleaned) ?? firstJsonObject(repairJson(cleaned));
  if (candidate) {
    for (const text of [candidate, repairJson(candidate)]) {
      try {
        const action = toAction(JSON.parse(text) as Record<string, unknown>);
        if (action) return action;
      } catch {
        // try the repaired form, then fall through
      }
    }
  }
  // An action object we still couldn't read — balanced but invalid, or cut off
  // mid-object (no closing brace at all, so there was no candidate).
  const actionLike = /["\u201C\u201D](tool|reply)["\u201C\u201D]\s*:/;
  if (
    (candidate && actionLike.test(candidate)) ||
    (cleaned.startsWith('{') && actionLike.test(cleaned))
  ) {
    return { kind: 'reply', reply: GARBLED_REPLY };
  }
  return { kind: 'reply', reply: cleaned || raw.trim() };
}
