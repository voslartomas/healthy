import { runCoach, ToolSpec } from '../src/features/coach/aiClient';

/**
 * Forcing a tool is what makes an explicit UI action reliable. Left on `auto`,
 * every provider leaves intent recognition to the model, and "two eggs and toast"
 * reads as easily as a question as a request to log — so the coach often just
 * replied and nothing was written.
 *
 * The subtle part, and the reason these tests exist, is that only the FIRST round
 * may be forced. Keep forcing and the model calls the tool again instead of
 * reporting the result, burning MAX_TOOL_ROUNDS and failing the turn.
 */

const TOOLS: ToolSpec[] = [
  {
    name: 'log_food',
    description: 'Log food',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_workout',
    description: 'Create a workout',
    parameters: { type: 'object', properties: {} },
  },
];

/** Bodies of every request the run made, parsed, oldest first. */
let bodies: Record<string, unknown>[] = [];

function mockFetch(replies: unknown[]): void {
  let i = 0;
  globalThis.fetch = jest.fn(async (_url: unknown, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    const body = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return { ok: true, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const baseOpts = {
  system: 'sys',
  history: [{ role: 'user' as const, content: 'two eggs and toast' }],
  tools: TOOLS,
  exec: async () => '{"ok":true}',
};

beforeEach(() => {
  bodies = [];
});

describe('Anthropic tool_choice', () => {
  const cfg = {
    provider: 'anthropic' as const,
    model: 'Claude Haiku 4',
    apiKey: 'k',
  };

  it('omits tool_choice entirely when auto', async () => {
    mockFetch([{ content: [{ type: 'text', text: 'hi' }] }]);
    await runCoach(cfg, baseOpts);
    expect(bodies[0]).not.toHaveProperty('tool_choice');
  });

  it('forces the named tool on the first round only', async () => {
    mockFetch([
      // Round 1: the forced call.
      {
        content: [
          { type: 'tool_use', id: 't1', name: 'log_food', input: { a: 1 } },
        ],
      },
      // Round 2: the model reports what it logged.
      { content: [{ type: 'text', text: 'Logged 240 kcal.' }] },
    ]);
    const reply = await runCoach(cfg, {
      ...baseOpts,
      toolChoice: { force: 'log_food' },
    });
    expect(reply).toBe('Logged 240 kcal.');
    expect(bodies[0].tool_choice).toEqual({ type: 'tool', name: 'log_food' });
    // Round 2 must be free, or the model can never stop calling the tool.
    expect(bodies[1]).not.toHaveProperty('tool_choice');
  });
});

describe('OpenAI tool_choice', () => {
  const cfg = { provider: 'openai' as const, model: 'GPT-5 mini', apiKey: 'k' };

  it("stays 'auto' by default", async () => {
    mockFetch([{ choices: [{ message: { content: 'hi' } }] }]);
    await runCoach(cfg, baseOpts);
    expect(bodies[0].tool_choice).toBe('auto');
  });

  it('forces the named function on the first round only', async () => {
    mockFetch([
      {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: 'c1',
                  function: { name: 'create_workout', arguments: '{}' },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ message: { content: 'Built it.' } }] },
    ]);
    await runCoach(cfg, {
      ...baseOpts,
      toolChoice: { force: 'create_workout' },
    });
    expect(bodies[0].tool_choice).toEqual({
      type: 'function',
      function: { name: 'create_workout' },
    });
    expect(bodies[1].tool_choice).toBe('auto');
  });
});

describe('Gemini toolConfig', () => {
  const cfg = {
    provider: 'gemini' as const,
    model: 'Gemini 2.5 Flash',
    apiKey: 'k',
  };

  it('omits toolConfig when auto', async () => {
    mockFetch([{ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }]);
    await runCoach(cfg, baseOpts);
    expect(bodies[0]).not.toHaveProperty('toolConfig');
  });

  it('restricts to the named function on the first round only', async () => {
    mockFetch([
      {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: 'log_food', args: {} } }],
            },
          },
        ],
      },
      { candidates: [{ content: { parts: [{ text: 'Logged.' }] } }] },
    ]);
    await runCoach(cfg, {
      ...baseOpts,
      toolChoice: { force: 'log_food' },
    });
    expect(bodies[0].toolConfig).toEqual({
      functionCallingConfig: {
        mode: 'ANY',
        allowedFunctionNames: ['log_food'],
      },
    });
    expect(bodies[1]).not.toHaveProperty('toolConfig');
  });
});
