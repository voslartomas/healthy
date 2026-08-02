/**
 * Provider-agnostic AI coach client with tool calling.
 *
 * Talks directly to the configured provider's REST API (Anthropic / OpenAI /
 * Gemini) using the key + model the user set in Settings ({@link useAppStore}).
 * There is no backend — requests go device↔provider over TLS, mirroring the
 * Google Health privacy boundary (ADR-005).
 *
 * The core is {@link runCoach}: it runs a bounded tool-calling loop so the model
 * can call app tools (e.g. log_food) mid-turn, receive the result, and continue
 * until it produces a final text reply. Each provider has its own wire format
 * for tools, so there is one loop per provider sharing the same {@link ToolSpec}
 * / {@link ToolExecutor} contract.
 */

import { AiProvider, PROVIDERS } from '../../state/useAppStore';

/** A single conversation turn as the UI knows it (system notes excluded). */
export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool the model may call. `parameters` is a JSON-Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Executes a tool call and returns a string result fed back to the model.
 * Should never throw — {@link runCoach} guards it, but returning a JSON error
 * string gives the model a chance to recover. */
export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

export interface CoachConfig {
  provider: AiProvider;
  /** Display model name from PROVIDERS (mapped to an API id internally). */
  model: string;
  apiKey: string;
}

export interface RunOptions {
  system: string;
  /** Prior turns plus the new user message, oldest first. */
  history: CoachMessage[];
  tools: ToolSpec[];
  exec: ToolExecutor;
  signal?: AbortSignal;
}

/** A user-facing error whose message is safe to show in a chat bubble. */
export class CoachError extends Error {}

/** Hard cap on tool-call rounds so a misbehaving model can't loop forever. */
const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 1024;

/** Display model name → provider API model id. Falls back to the raw name. */
const MODEL_IDS: Record<string, string> = {
  'Claude Sonnet 4.5': 'claude-sonnet-4-5',
  'Claude Opus 4.1': 'claude-opus-4-1',
  'Claude Haiku 4': 'claude-haiku-4-5',
  'GPT-5': 'gpt-5',
  'GPT-5 mini': 'gpt-5-mini',
  'GPT-4.1': 'gpt-4.1',
  'Gemini 2.5 Pro': 'gemini-2.5-pro',
  'Gemini 2.5 Flash': 'gemini-2.5-flash',
};

function modelId(model: string): string {
  return MODEL_IDS[model] ?? model;
}

/**
 * Run one coach turn end to end and return the model's final text reply.
 * Executes any tool calls along the way via `opts.exec`. Throws {@link
 * CoachError} for user-actionable problems (bad key, unsupported provider).
 */
export async function runCoach(
  cfg: CoachConfig,
  opts: RunOptions,
): Promise<string> {
  if (cfg.provider === 'ondevice') {
    throw new CoachError(
      "On-device models aren't available yet. Pick Anthropic, OpenAI, or Gemini in Settings and add an API key.",
    );
  }
  if (!cfg.apiKey.trim()) {
    throw new CoachError(
      `Add your ${PROVIDERS[cfg.provider].name} API key in Settings to chat with the coach.`,
    );
  }
  switch (cfg.provider) {
    case 'anthropic':
      return runAnthropic(cfg, opts);
    case 'openai':
      return runOpenAI(cfg, opts);
    case 'gemini':
      return runGemini(cfg, opts);
    default:
      throw new CoachError('Unsupported AI provider.');
  }
}

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

async function httpError(
  res: FetchResponse,
  provider: string,
): Promise<CoachError> {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    detail = '';
  }
  if (res.status === 401 || res.status === 403) {
    return new CoachError(
      `${provider} rejected your API key (HTTP ${res.status}). Check it in Settings.`,
    );
  }
  if (res.status === 429) {
    return new CoachError(`${provider} rate limit reached. Try again in a moment.`);
  }
  return new CoachError(
    `${provider} request failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`,
  );
}

/** Run a tool call without letting an exception escape the loop. */
async function safeExec(
  exec: ToolExecutor,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    return await exec(name, args);
  } catch (err) {
    return JSON.stringify({
      ok: false,
      error: String((err as Error)?.message ?? err),
    });
  }
}

// ---------------------------------------------------------------------------
// Anthropic — POST /v1/messages, tool_use / tool_result content blocks.
// ---------------------------------------------------------------------------

async function runAnthropic(
  cfg: CoachConfig,
  opts: RunOptions,
): Promise<string> {
  const tools = opts.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
  const messages: unknown[] = opts.history.map(m => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelId(cfg.model),
        max_tokens: MAX_TOKENS,
        system: opts.system,
        tools,
        messages,
      }),
      signal: opts.signal,
    });
    if (!res.ok) throw await httpError(res, 'Anthropic');

    const data = (await res.json()) as {
      content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
    };
    const blocks = data.content ?? [];
    const toolUses = blocks.filter(b => b.type === 'tool_use');
    const text = blocks
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
      .trim();

    if (toolUses.length === 0) return text;

    messages.push({ role: 'assistant', content: blocks });
    const results = [];
    for (const tu of toolUses) {
      const out = await safeExec(opts.exec, tu.name ?? '', tu.input ?? {});
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }
  throw new CoachError('The coach took too many steps. Try rephrasing your request.');
}

// ---------------------------------------------------------------------------
// OpenAI — POST /v1/chat/completions, function tool calls.
// ---------------------------------------------------------------------------

async function runOpenAI(cfg: CoachConfig, opts: RunOptions): Promise<string> {
  const tools = opts.tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
  const messages: unknown[] = [
    { role: 'system', content: opts.system },
    ...opts.history.map(m => ({ role: m.role, content: m.content })),
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: modelId(cfg.model),
        messages,
        tools,
        tool_choice: 'auto',
      }),
      signal: opts.signal,
    });
    if (!res.ok) throw await httpError(res, 'OpenAI');

    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
    };
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new CoachError('OpenAI returned no message.');

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) return (msg.content ?? '').trim();

    messages.push(msg);
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function.arguments || '{}');
      } catch {
        args = {};
      }
      const out = await safeExec(opts.exec, c.function.name, args);
      messages.push({ role: 'tool', tool_call_id: c.id, content: out });
    }
  }
  throw new CoachError('The coach took too many steps. Try rephrasing your request.');
}

// ---------------------------------------------------------------------------
// Gemini — POST /v1beta/models/{model}:generateContent, functionCall parts.
// ---------------------------------------------------------------------------

async function runGemini(cfg: CoachConfig, opts: RunOptions): Promise<string> {
  const model = modelId(cfg.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const tools = [
    {
      functionDeclarations: opts.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
  const contents: unknown[] = opts.history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.system }] },
        contents,
        tools,
      }),
      signal: opts.signal,
    });
    if (!res.ok) throw await httpError(res, 'Gemini');

    const data = (await res.json()) as {
      candidates?: {
        content?: {
          parts?: {
            text?: string;
            functionCall?: { name: string; args?: Record<string, unknown> };
          }[];
        };
      }[];
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter(p => p.functionCall);
    const text = parts
      .filter(p => typeof p.text === 'string')
      .map(p => p.text ?? '')
      .join('')
      .trim();

    if (calls.length === 0) return text;

    contents.push({ role: 'model', parts });
    const responseParts = [];
    for (const p of calls) {
      const fc = p.functionCall!;
      const out = await safeExec(opts.exec, fc.name, fc.args ?? {});
      responseParts.push({
        functionResponse: { name: fc.name, response: { result: out } },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
  throw new CoachError('The coach took too many steps. Try rephrasing your request.');
}
