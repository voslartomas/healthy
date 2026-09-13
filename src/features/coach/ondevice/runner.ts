/**
 * On-device coach backend: drives a downloaded Gemma model through the same
 * tool-calling contract as the cloud providers ({@link RunOptions}).
 *
 * It runs a bounded loop of grammar-constrained "action" turns: each round the
 * model must emit one JSON object — either a tool call or a final reply (see
 * {@link ../ondevice/models}). Tool calls execute via `opts.exec` (reusing
 * {@link safeExec} / {@link MAX_TOOL_ROUNDS} from the shared client) and their
 * results are fed back as the next user turn until the model produces a reply.
 *
 * The engine is injectable so tests script a fake without touching `llama.rn`;
 * the model file location comes from {@link useModelStore}.
 */

import * as FS from 'expo-file-system/legacy';

import {
  CoachConfig,
  CoachError,
  MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  RunOptions,
  safeExec,
} from '../aiClient';
import { llamaEngine, OnDeviceEngine } from './llamaEngine';
import {
  ACTION_GRAMMAR,
  buildSystemPreamble,
  GEMMA_STOP,
  GemmaTurn,
  parseAction,
  renderGemmaPrompt,
} from './models';
import { useModelStore } from './useModelStore';

/** Extract a human-readable message from an unknown thrown value. */
function errMsg(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

/** A real GGUF is hundreds of MB at minimum. Anything much smaller means the
 * download failed and saved an error page / partial file as `.gguf`. */
const MIN_MODEL_BYTES = 50_000_000;

/**
 * Run one coach turn entirely on-device and return the model's final reply.
 * Throws {@link CoachError} if no model is downloaded or the loop runs away.
 * `engine` defaults to the real singleton and is overridden in tests.
 */
export async function runOnDevice(
  _cfg: CoachConfig,
  opts: RunOptions,
  engine: OnDeviceEngine = llamaEngine,
): Promise<string> {
  let modelPath = useModelStore.getState().activeModelPath();
  if (!modelPath) {
    // The store may simply not be initialised yet — e.g. the user opened the
    // coach without first visiting Settings. Sync status from disk and re-read
    // before giving up, so an already-downloaded model just works.
    await useModelStore.getState().check();
    modelPath = useModelStore.getState().activeModelPath();
  }
  if (!modelPath) {
    throw new CoachError(
      'Download the Gemma model in Settings before chatting with the on-device coach.',
    );
  }

  // A download that was interrupted or hit a bad URL can still be marked ready
  // while leaving a missing/tiny file that llama.cpp can't parse. Catch that
  // here with a clear, actionable message instead of a cryptic native error.
  try {
    const info = await FS.getInfoAsync(modelPath);
    if (!info.exists) {
      throw new CoachError(
        'The model file is missing — re-download it in Settings.',
      );
    }
    if (typeof info.size === 'number' && info.size < MIN_MODEL_BYTES) {
      throw new CoachError(
        `The downloaded model looks incomplete (${Math.round(info.size / 1_000_000)} MB). ` +
          'Delete it in Settings and download again on a stable connection.',
      );
    }
  } catch (err) {
    if (err instanceof CoachError) throw err;
    // getInfoAsync itself failed — let load() surface the underlying problem.
  }

  try {
    await engine.load(modelPath);
  } catch (err) {
    throw new CoachError(
      `Couldn't load the on-device model: ${errMsg(err)}. ` +
        'If this keeps happening, delete and re-download it in Settings.',
    );
  }

  const preamble = buildSystemPreamble(opts.system, opts.tools);
  /**
   * Forcing here is prompt-level, not API-enforced as it is for the cloud
   * providers — the grammar admits both a tool call and a plain reply, so a small
   * model can still ignore the instruction. Hence the swapped-in preamble plus one
   * corrective retry below: between them, an explicit UI action reliably produces
   * the tool call instead of a chat response.
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

  const turns: GemmaTurn[] = opts.history.map(m => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal?.aborted) throw new CoachError('Cancelled.');

    const prompt = renderGemmaPrompt(
      mustCall && forcedPreamble ? forcedPreamble : preamble,
      turns,
    );
    let raw: string;
    try {
      raw = await engine.complete(prompt, {
        grammar: ACTION_GRAMMAR,
        stop: GEMMA_STOP,
        nPredict: MAX_TOKENS,
        temperature: 0.3,
      });
    } catch (err) {
      throw new CoachError(`On-device generation failed: ${errMsg(err)}.`);
    }

    const action = parseAction(raw);
    if (action.kind === 'reply') {
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
      return action.reply.trim();
    }

    // The obligation is discharged: later rounds are free, so the model can
    // report the result in words instead of calling the tool over and over.
    mustCall = false;

    // Record the model's tool call, run it, and feed the result back.
    turns.push({ role: 'assistant', content: raw.trim() });
    const out = await safeExec(opts.exec, action.tool, action.args);
    turns.push({
      role: 'user',
      content: `TOOL_RESULT ${action.tool}: ${out}`,
    });
  }

  throw new CoachError(
    'The on-device coach took too many steps. Try rephrasing your request.',
  );
}
