/**
 * On-device coach backend: drives the OS model (Gemini Nano on Android, Apple
 * Intelligence on iOS — ADR-008) through the same tool-calling contract as the
 * cloud providers ({@link RunOptions}).
 *
 * It runs a bounded loop of "action" turns: each round the model must emit one
 * JSON object — either a tool call or a final reply (see {@link ./models}).
 * Tool calls execute via `opts.exec` (reusing {@link safeExec} /
 * {@link MAX_TOOL_ROUNDS} from the shared client) and their results are fed
 * back as the next user turn until the model produces a reply.
 *
 * Every round is a stateless `generate(instructions, transcript)` call: the
 * whole conversation so far is re-rendered into the prompt (trimmed to the
 * model's small context, see `renderTranscript`), so no session lives in native
 * code and a failed round leaves nothing behind.
 *
 * The engine is injectable so tests script a fake without a native module.
 */

import {
  CoachConfig,
  CoachError,
  MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  RunOptions,
  safeExec,
} from '../aiClient';
import {
  buildSystemPreamble,
  CoachTurn,
  MAX_HISTORY_TURNS,
  parseAction,
  PROMPT_CHAR_BUDGET,
  renderTranscript,
  turnReminder,
} from './models';
import { SystemModelEngine, systemModelEngine } from './systemLlm';
import { useModelStore } from './useModelStore';

/** Extract a human-readable message from an unknown thrown value. */
function errMsg(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

/**
 * A successful write tool's own confirmation (`{"ok": true, "confirm": "…"}`),
 * or null. When present the turn ENDS with it — no second model round. The
 * small OS models were slowest and least reliable exactly there: after
 * log_food they re-called it (a duplicate entry) or replied with garbled JSON,
 * and each extra round costs 5–15 s. The tool knows precisely what happened, so
 * it phrases the confirmation. Read-only tools (list_food_log) return no
 * `confirm`, so the model still gets their result and continues.
 */
export function toolConfirmation(out: string): string | null {
  try {
    const obj = JSON.parse(out) as { ok?: unknown; confirm?: unknown };
    return obj.ok === true && typeof obj.confirm === 'string' && obj.confirm
      ? obj.confirm
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether a past assistant message is junk the model must not see again: the
 * raw JSON / code-fenced output of an earlier failed parse that was shown in the
 * chat as-is. Replayed, it was copied — on the phone Gemini Nano re-emitted an
 * old broken `{"food": [...]}` call verbatim for a new request.
 */
function isGarbledHistory(content: string): boolean {
  const t = content.trim();
  return t.startsWith('```') || (t.startsWith('{') && /"(tool|args)"/.test(t));
}

/** What the user is told when they pressed an action button and the model
 * never managed to call the tool — honest, and actionable. */
function forcedFailure(tool: string): string {
  return tool === 'log_food'
    ? 'Sorry — I couldn\'t log that. Try describing it with amounts, like "2 slices of bread with butter".'
    : "Sorry — I couldn't do that this time. Try rephrasing it a little more specifically.";
}

/**
 * Whether a reply claims, in the first person, that the coach CHANGED the
 * user's data ("I've deleted the banana", "Smazal jsem…"). Only a write tool can
 * do that, and a write tool ends the turn with its own confirmation — so a reply
 * that says it is always false. Seen on the phone: asked "delete the banana from
 * my food log", Gemini Nano replied "Okay, I've deleted the banana…" with no
 * tool call at all, and the entry stayed. Deliberately narrow (first person,
 * past tense) so "you logged 2 eggs today" in a plain answer doesn't trip it.
 */
export function claimsAction(reply: string): boolean {
  const en =
    /\bI(?:'ve|’ve| have)?\s+(?:now\s+|just\s+|also\s+)?(?:deleted|removed|logged|updated|changed|edited|adjusted|added|saved|created|recorded|tracked)\b/i;
  const enPassive =
    /\b(?:has|have)\s+been\s+(?:deleted|removed|logged|updated|changed|added|saved|recorded)\b/i;
  // Czech: "smazal jsem…", and a sentence-initial passive participle in any
  // gender — "Smazáno", "Smazané." (seen on the phone). Sentence-initial only,
  // so prose like "upravený jídelníček" isn't taken for a claim.
  const cs =
    /\b(?:smazal|smazala|odstranil|odstranila|zapsal|zapsala|zaznamenal|zaznamenala|upravil|upravila|změnil|změnila|přidal|přidala|uložil|uložila)\s+jsem\b|(?:^|[.!?]\s+)(?:hotovo|ok|dobře)?[,.!—–-]*\s*(?:smaz[aá]n|odstran[eě]n|zaps[aá]n|zaznamen[aá]n|upraven|zm[eě]n[eě]n|p[rř]id[aá]n|ulo[zž]en)/i;
  // Sentence-initial past tense with no subject: "Removed Banana from your
  // food log." — also seen on the phone, after the first-person form was caught.
  const enBare =
    /(?:^|[.!?]\s+)(?:okay|ok|done|sure|alright)?[,.!—–-]*\s*(?:deleted|removed|logged|updated|changed|edited|adjusted|added|saved|recorded)\b/i;
  return (
    en.test(reply) ||
    enPassive.test(reply) ||
    enBare.test(reply) ||
    cs.test(reply)
  );
}

/**
 * Whether the user's message asks to REMOVE something (English or Czech). Used
 * to stop the wrong write: on the phone, "delete the banana from my food log"
 * made Gemini Nano call update_food_log with the banana's own values — the
 * entry was rewritten, not deleted, and the coach said "Updated".
 */
export function asksToDelete(message: string): boolean {
  return /\b(?:delete|remove|erase|undo)\b|\b(?:smaž|smaz|odstra|vymaž|vymaz|zruš|zrus)/i.test(
    message,
  );
}

/**
 * Whether an assistant message is one of the tools' own `confirm` sentences
 * (foodTool / workoutTool) — true by construction, so it stays in the history
 * even though it reads like a claim. Keep in step with those strings.
 */
export function isToolConfirmation(content: string): boolean {
  return /^(?:Logged .+ — \d+ kcal|Logged \d+ foods — |Updated .+ — \d+ kcal\.|Deleted .+ from today's food log\.|Saved .+ to your quick-add foods\.|Created ".+" with )/.test(
    content.trim(),
  );
}

/** The reply when the model kept claiming a change it never made. */
const UNPERFORMED_ACTION =
  "Sorry — I couldn't make that change, so nothing was changed. You can edit or delete an entry yourself: tap it in Food → Eaten today.";

/** Whitespace/case/fence-insensitive form of a reply, for spotting repeats. */
function normalizeReply(text: string): string {
  return text
    .replace(/```(?:json)?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** A failed tool's user-facing message (`{"ok": false, "say": "…"}`), or null. */
function failureSay(out: string): string | null {
  try {
    const obj = JSON.parse(out) as { ok?: unknown; say?: unknown };
    return obj.ok === false && typeof obj.say === 'string' ? obj.say : null;
  } catch {
    return null;
  }
}

function toolSucceeded(out: string): boolean {
  try {
    return (JSON.parse(out) as { ok?: unknown }).ok !== false;
  } catch {
    return true;
  }
}

/** Why the coach can't run, in words a user can act on. */
function unavailableMessage(): string {
  const { status, reason, modelName } = useModelStore.getState();
  if (status === 'downloadable')
    return `Download ${modelName} in Me before chatting with the coach.`;
  if (status === 'downloading')
    return `${modelName} is still being set up on this phone — try again in a few minutes.`;
  if (reason === 'notEnabled')
    return 'Turn on Apple Intelligence in iOS Settings to use the coach.';
  if (reason === 'osTooOld')
    return 'The coach needs iOS 26 or newer with Apple Intelligence.';
  if (reason === 'error')
    return `${modelName} isn't ready yet on this phone. Try again in a few minutes, or restart the phone.`;
  return "This phone doesn't support on-device AI, so the coach isn't available here.";
}

/**
 * Run one coach turn entirely on-device and return the model's final reply.
 * Throws {@link CoachError} if the OS model isn't usable or the loop runs away.
 * `engine` defaults to the real one and is overridden in tests.
 */
export async function runOnDevice(
  _cfg: CoachConfig,
  opts: RunOptions,
  engine: SystemModelEngine = systemModelEngine,
): Promise<string> {
  if (useModelStore.getState().status !== 'ready') {
    // The store may simply not have asked the OS yet (cold start straight into
    // the coach). Ask, then re-read before giving up.
    await useModelStore.getState().check();
  }
  if (useModelStore.getState().status !== 'ready') {
    throw new CoachError(unavailableMessage());
  }

  const preamble = buildSystemPreamble(opts.system, opts.tools);
  /**
   * Forcing here is prompt-level, not API-enforced as it is for the cloud
   * providers — the protocol admits both a tool call and a plain reply, so a
   * small model can still ignore the instruction. Hence the swapped-in preamble
   * plus one corrective retry below: between them, an explicit UI action
   * reliably produces the tool call instead of a chat response.
   */
  const forced =
    opts.toolChoice && opts.toolChoice !== 'auto'
      ? opts.toolChoice.force
      : null;
  const forcedPreamble = forced
    ? buildSystemPreamble(opts.system, opts.tools, forced)
    : null;
  /** True while the model still owes us the forced call. */
  let mustCall = forcedPreamble != null;
  /** Corrective retries left for a model that replies when it must call. */
  let corrections = 1;
  /** Corrective retries left for a reply that claims a change it never made. */
  let claimCorrections = 1;

  // Only the recent window (see MAX_HISTORY_TURNS), minus replayed junk. A
  // FORCED turn (the user pressed "Log food" / "New workout") sees only the
  // message itself: it is a self-contained instruction, and earlier chat only
  // leaked in — on the phone, "2 slices of bread with butter" was logged
  // together with "2 eggs" taken from a reply further up the conversation.
  const historyWindow = forced ? 1 : MAX_HISTORY_TURNS;
  const turns: CoachTurn[] = opts.history
    // A past reply that claimed a change it never made is dropped too: replayed,
    // Gemini Nano repeated "Okay, I've deleted the banana…" word for word when
    // the user asked again.
    .filter(
      m =>
        !(
          m.role === 'assistant' &&
          (isGarbledHistory(m.content) ||
            (claimsAction(m.content) && !isToolConfirmation(m.content)))
        ),
    )
    .slice(-historyWindow)
    .map(m => ({ role: m.role, content: m.content }));
  /** Turns before the message being answered: shown as background, not as
   * live transcript (see renderTranscript). */
  const contextCount =
    turns.length > 0 && turns[turns.length - 1].role === 'user'
      ? turns.length - 1
      : turns.length;
  /** Tool calls already run this turn, by `tool + args`, with their output. A
   * small model sometimes repeats the exact same call; re-running a write would
   * duplicate it, so a repeat is answered from here instead of executed. */
  const ran = new Map<string, string>();
  const lastUser = [...opts.history].reverse().find(m => m.role === 'user');
  const wantsDelete = lastUser != null && asksToDelete(lastUser.content);
  const canDelete = opts.tools.some(t => t.name === 'delete_food_log');
  /** Whether a delete_food_log call succeeded this turn. */
  let deleted = false;
  /** Whether any WRITE tool (anything but a list_* read) succeeded this turn —
   * after one, a reply saying "Logged …" is the truth, not a claim to catch. */
  let wrote = false;
  /** Whether delete_food_log was called at all (even if it failed). */
  let triedDelete = false;
  /** The user-facing `say` of the last failed tool call, if it gave one — what
   * to show when the model can't recover from the failure itself. */
  let lastSay: string | null = null;
  /** Earlier assistant replies, normalized. Gemini Nano sometimes answers by
   * repeating one: asked "smaž ty vejce" after a steps question, it replied
   * with the steps answer again — twice. */
  const pastReplies = new Set(
    opts.history
      .filter(m => m.role === 'assistant')
      .map(m => normalizeReply(m.content)),
  );
  let echoCorrections = 1;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) throw new CoachError('Cancelled.');

    let raw: string;
    try {
      raw = await engine.generate(
        mustCall && forcedPreamble ? forcedPreamble : preamble,
        renderTranscript(
          turns,
          PROMPT_CHAR_BUDGET,
          turnReminder(mustCall ? forced : null),
          contextCount,
        ),
        { maxOutputTokens: MAX_TOKENS, temperature: 0.3 },
      );
    } catch (err) {
      throw new CoachError(`On-device generation failed: ${errMsg(err)}.`);
    }
    const action = parseAction(raw);
    if (action.kind === 'reply') {
      const isEcho = pastReplies.has(normalizeReply(action.reply));
      // Remember it: a later round repeating THIS reply is an echo too.
      pastReplies.add(normalizeReply(action.reply));
      // Chatted when the turn was mandatory. Say so and let it try again — the
      // user pressed an action button, so a reply is not an acceptable outcome.
      if (mustCall && corrections > 0) {
        corrections -= 1;
        turns.push({ role: 'assistant', content: raw.trim() });
        turns.push({
          role: 'user',
          content:
            `That is not valid. You MUST respond with a single JSON object ` +
            `{"tool": "${forced}", "args": {...}} for the message before this. Do it now.`,
        });
        continue;
      }
      // Still owing the forced call with no retries left: the model's chat is
      // not an answer to "log this" (on the phone it echoed an example from its
      // instructions), so say plainly that it didn't work.
      if (mustCall && forced) return forcedFailure(forced);
      // A reply claiming a change is never true (a successful write would have
      // ended the turn above). Tell the model once to actually call the tool;
      // if it still only talks, say honestly that nothing changed.
      // A delete request answered in words is held to the same standard
      // without relying on the wording: the model must try the tools once.
      // A repeat of an earlier answer is not an answer to this message.
      if (isEcho) {
        if (echoCorrections > 0 && lastUser) {
          echoCorrections -= 1;
          turns.push({ role: 'assistant', content: raw.trim() });
          turns.push({
            role: 'user',
            content:
              'You repeated an earlier answer. Answer THIS message instead: ' +
              JSON.stringify(lastUser.content),
          });
          continue;
        }
        if (lastSay) return lastSay;
      }
      const owesDelete = wantsDelete && canDelete && !deleted && !triedDelete;
      if (
        opts.tools.length > 0 &&
        !wrote &&
        (claimsAction(action.reply) || owesDelete)
      ) {
        if (claimCorrections > 0) {
          claimCorrections -= 1;
          turns.push({ role: 'assistant', content: raw.trim() });
          turns.push({
            role: 'user',
            content:
              'That is not true: you called no tool, so NOTHING changed. Replying cannot change data. ' +
              'Call the tool now as one JSON object (to delete a food: {"tool": "delete_food_log", "args": {"name": "<its name as listed under Logged today>"}}). ' +
              'If the user did not ask for a change, reply without claiming you made one.',
          });
          continue;
        }
        // Out of retries: an honest "nothing changed" over a false claim. A
        // reply that claims nothing (e.g. "remove" was part of a question) is
        // fine to show as-is.
        if (claimsAction(action.reply)) return lastSay ?? UNPERFORMED_ACTION;
      }
      return action.reply.trim();
    }

    // Record the model's tool call, run it, and feed the result back.
    const call = JSON.stringify({ tool: action.tool, args: action.args });
    turns.push({ role: 'assistant', content: call });
    const previous = ran.get(call);
    if (previous != null) {
      const done = toolConfirmation(previous);
      if (done) return done;
      turns.push({
        role: 'user',
        content:
          `TOOL_RESULT ${action.tool}: (you already called this with the same ` +
          `args — the result is unchanged) ${previous}\n` +
          'Do not repeat it. Reply to the user now, or call a different tool.',
      });
      continue;
    }
    // Asked to delete, but reaching for update: refuse it before it writes and
    // point at the right tool. A rejection costs one round; the wrong write
    // would silently keep the entry the user wanted gone.
    if (action.tool === 'update_food_log' && wantsDelete && canDelete) {
      const food =
        typeof action.args.name === 'string' ? action.args.name : '<the food>';
      turns.push({
        role: 'user',
        content:
          `TOOL_RESULT update_food_log: {"ok":false,"error":"The user asked to DELETE it, not change it. ` +
          `Call {\\"tool\\": \\"delete_food_log\\", \\"args\\": {\\"name\\": \\"${food}\\"}} instead."}`,
      });
      continue;
    }
    const out = await safeExec(opts.exec, action.tool, action.args);
    ran.set(call, out);
    // The obligation is discharged only by a call that WORKED — a rejected
    // log_food must still be retried, not followed by free chat.
    if (action.tool === forced && toolSucceeded(out)) mustCall = false;
    if (action.tool === 'delete_food_log') triedDelete = true;
    if (action.tool === 'delete_food_log' && toolSucceeded(out)) deleted = true;
    const say = failureSay(out);
    if (say) lastSay = say;
    if (!action.tool.startsWith('list_') && toolSucceeded(out)) wrote = true;
    const done = toolConfirmation(out);
    if (done) return done;
    turns.push({
      role: 'user',
      content: `TOOL_RESULT ${action.tool}: ${out}`,
    });
  }

  throw new CoachError(
    'The on-device coach took too many steps. Try rephrasing your request.',
  );
}
