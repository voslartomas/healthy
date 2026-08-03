/**
 * On-device Gemma model registry and prompt/grammar builders.
 *
 * This module is deliberately PURE — no `llama.rn` and no `expo-file-system`
 * imports — so it can be pulled into {@link useAppStore} (for the provider's
 * model list) and unit-tested without dragging the native runtime in. The
 * filesystem/path side lives in {@link ./useModelStore}; the inference side in
 * {@link ./llamaEngine}.
 *
 * Gemma has no dedicated system role and requires strictly alternating
 * user/model turns, so {@link renderGemmaPrompt} folds the system preamble into
 * the first user turn and merges any consecutive same-role turns. Small Gemma
 * models are unreliable at free-form tool-call tokens, so instead of trusting
 * the model's native tool syntax we constrain its output to a single JSON
 * "action" object with {@link ACTION_GRAMMAR} (a GBNF grammar) and parse the
 * intent ourselves — see {@link ../ondevice/runner}.
 */

import type { ToolSpec } from '../aiClient';

/** One downloadable GGUF build. `sizeBytes` is the approximate download size,
 * used for UI copy and as a fallback denominator before the server reports a
 * content length. */
export interface GemmaModel {
  id: string;
  /** Shown as the MODEL pill in Settings — must match PROVIDERS.ondevice.models. */
  label: string;
  /** Direct Hugging Face GGUF resolve URL. */
  url: string;
  filename: string;
  sizeBytes: number;
}

/** Available Gemma tiers, best-quality first. The 4B build is the default
 * (best food/macro estimates that still fit a modern phone); the 1B build is a
 * lighter fallback. Both are Q4_K_M quantizations from unsloth's GGUF repos. */
export const GEMMA_MODELS: GemmaModel[] = [
  {
    id: 'gemma-3-4b-it-q4',
    label: 'Gemma 3 4B',
    url: 'https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
    filename: 'gemma-3-4b-it-Q4_K_M.gguf',
    sizeBytes: 2_700_000_000,
  },
  {
    id: 'gemma-3-1b-it-q4',
    label: 'Gemma 3 1B',
    url: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    filename: 'gemma-3-1b-it-Q4_K_M.gguf',
    sizeBytes: 850_000_000,
  },
];

export const DEFAULT_MODEL_ID = GEMMA_MODELS[0].id;

/** Look up a model by id, falling back to the default so callers never crash on
 * a stale persisted id. */
export function modelById(id: string): GemmaModel {
  return GEMMA_MODELS.find(m => m.id === id) ?? GEMMA_MODELS[0];
}

/** Map a display label (the persisted `model` in useAppStore) to its model. */
export function modelByLabel(label: string): GemmaModel | undefined {
  return GEMMA_MODELS.find(m => m.label === label);
}

/** Human-readable size, e.g. "2.7 GB" / "850 MB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
  return `${Math.round(bytes / 1000)} KB`;
}

// ---------------------------------------------------------------------------
// Prompt + grammar for the constrained "action" protocol.
// ---------------------------------------------------------------------------

/** Stop sequences: end the turn on Gemma's end-of-turn / eos markers. */
export const GEMMA_STOP = ['<end_of_turn>', '<eos>'];

/**
 * GBNF grammar forcing the model to emit exactly one valid JSON object. This is
 * the canonical llama.cpp JSON grammar; the runner then reads `tool`/`args` or
 * `reply` from the parsed object. Constraining to valid JSON (rather than the
 * exact schema) keeps the grammar small while still guaranteeing parseability.
 */
export const ACTION_GRAMMAR = String.raw`root   ::= object
value  ::= object | array | string | number | ("true" | "false" | "null") ws
object ::= "{" ws ( string ":" ws value ("," ws string ":" ws value)* )? "}" ws
array  ::= "[" ws ( value ("," ws value)* )? "]" ws
string ::= "\"" ( [^"\\] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]) )* "\"" ws
number ::= "-"? ([0-9] | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [-+]? [0-9]+)? ws
ws     ::= [ \t\n]*
`;

/**
 * Build the system preamble: the caller's coaching instructions plus the action
 * protocol and a compact description of each tool. Prepended to the first user
 * turn by {@link renderGemmaPrompt}.
 */
export function buildSystemPreamble(system: string, tools: ToolSpec[]): string {
  const toolLines = tools
    .map(
      t =>
        `- ${t.name}: ${t.description}\n  args (JSON schema): ${JSON.stringify(t.parameters)}`,
    )
    .join('\n');
  return [
    system,
    '',
    'You drive the app by emitting JSON actions. On EVERY turn reply with EXACTLY ONE JSON object and nothing else — no markdown, no code fences — in one of these two forms:',
    '  {"tool": "<name>", "args": { ... }}   — to call a tool',
    '  {"reply": "<message to the user>"}     — to talk to the user',
    '',
    'Available tools:',
    toolLines,
    '',
    'RULES:',
    '- Never call a tool with empty or missing args. Fill in every value yourself.',
    '- For log_food, the "entries" array MUST contain at least one object, and each object MUST have "name" and "kcal". Estimate kcal and macros (proteinG, carbsG, fatG) from the food yourself using standard nutrition values.',
    '- Do not ask the user for calories or macros — you estimate them.',
    '',
    'EXAMPLE. User: "I had 2 eggs and a slice of toast for breakfast"',
    'You (turn 1): {"tool": "log_food", "args": {"entries": [{"name": "2 eggs + toast", "kcal": 240, "proteinG": 18, "carbsG": 15, "fatG": 12, "mealType": "BREAKFAST"}]}}',
    'TOOL_RESULT log_food: {"ok": true}',
    'You (turn 2): {"reply": "Logged breakfast — 240 kcal, 18g protein, 15g carbs, 12g fat."}',
    '',
    'After you call a tool you receive its result as the next user turn, prefixed with TOOL_RESULT. If it says ok:true, send a {"reply": ...} stating the numbers plainly. If it reports an error, fix your args and call the tool again.',
  ].join('\n');
}

/** A single Gemma turn. `assistant` is rendered as Gemma's `model` role. */
export interface GemmaTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Drop any leading non-user turns (Gemma must start with a user turn) and
 * merge consecutive same-role turns so the transcript strictly alternates. */
function normalizeTurns(turns: GemmaTurn[]): GemmaTurn[] {
  const res: GemmaTurn[] = [];
  for (const t of turns) {
    if (res.length === 0 && t.role !== 'user') continue;
    const last = res[res.length - 1];
    if (last && last.role === t.role) last.content += '\n' + t.content;
    else res.push({ role: t.role, content: t.content });
  }
  if (res.length === 0) res.push({ role: 'user', content: '' });
  return res;
}

/**
 * Render turns into Gemma's chat format, folding `preamble` into the first user
 * turn and appending an open `model` turn to prompt generation. Returns a raw
 * prompt string (no BOS — llama.cpp adds it when tokenizing).
 */
export function renderGemmaPrompt(
  preamble: string,
  turns: GemmaTurn[],
): string {
  const norm = normalizeTurns(turns);
  norm[0] = { ...norm[0], content: `${preamble}\n\n${norm[0].content}`.trim() };
  let out = '';
  for (const t of norm) {
    const role = t.role === 'assistant' ? 'model' : 'user';
    out += `<start_of_turn>${role}\n${t.content}<end_of_turn>\n`;
  }
  return out + '<start_of_turn>model\n';
}

/** The decoded model action. */
export type CoachAction =
  | { kind: 'reply'; reply: string }
  | { kind: 'tool'; tool: string; args: Record<string, unknown> };

/**
 * Parse one model completion into a {@link CoachAction}. Tolerates stray
 * markdown fences and, if the JSON can't be read as an action, falls back to
 * treating the whole output as a plain reply so a confused model still says
 * something instead of erroring.
 */
export function parseAction(raw: string): CoachAction {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof obj.reply === 'string')
      return { kind: 'reply', reply: obj.reply };
    if (typeof obj.tool === 'string') {
      const args =
        obj.args && typeof obj.args === 'object'
          ? (obj.args as Record<string, unknown>)
          : {};
      return { kind: 'tool', tool: obj.tool, args };
    }
  } catch {
    // fall through
  }
  return { kind: 'reply', reply: cleaned || raw.trim() };
}
