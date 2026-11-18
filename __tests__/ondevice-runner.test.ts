import { CoachError, runCoach } from '../src/features/coach/aiClient';
import { runOnDevice } from '../src/features/coach/ondevice/runner';
import { SystemModelEngine } from '../src/features/coach/ondevice/systemLlm';
import {
  setModelEngineForTests,
  useModelStore,
} from '../src/features/coach/ondevice/useModelStore';

/** A fake OS-model engine that replays a scripted list of completions, one per
 * `generate` call, and records what it was asked. */
function fakeEngine(
  script: string[],
  status: Awaited<ReturnType<SystemModelEngine['status']>> = {
    status: 'available',
    modelName: 'Gemini Nano',
  },
): SystemModelEngine & { calls: { system: string; prompt: string }[] } {
  const calls: { system: string; prompt: string }[] = [];
  let i = 0;
  return {
    calls,
    status: async () => status,
    download: async () => undefined,
    warmup: async () => undefined,
    generate: async (system, prompt) => {
      calls.push({ system, prompt });
      return script[i++] ?? '{"reply":"(no more script)"}';
    },
  };
}

const CFG = {
  provider: 'ondevice' as const,
  model: 'On-device AI',
  apiKey: '',
};

const TOOLS = [
  {
    name: 'log_food',
    description: 'Log a meal.',
    parameters: { type: 'object', properties: {} },
  },
];

beforeEach(() => {
  useModelStore.setState({
    status: 'checking',
    reason: null,
    modelName: 'On-device AI',
    bytesDownloaded: 0,
    error: null,
  });
});

describe('runOnDevice — gating on the OS model', () => {
  it('asks the OS first, and explains when this phone cannot run it', async () => {
    setModelEngineForTests(
      fakeEngine([], {
        status: 'unavailable',
        reason: 'deviceNotEligible',
        modelName: 'Gemini Nano',
      }),
    );
    await expect(
      runOnDevice(CFG, {
        system: 's',
        history: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        exec: async () => '{}',
      }),
    ).rejects.toThrow(/doesn't support on-device AI/);
  });

  it('points to the one-time download when AICore reports it downloadable', async () => {
    setModelEngineForTests(
      fakeEngine([], { status: 'downloadable', modelName: 'Gemini Nano' }),
    );
    await expect(
      runOnDevice(CFG, {
        system: 's',
        history: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        exec: async () => '{}',
      }),
    ).rejects.toThrow(/Download Gemini Nano in Me/);
  });

  it('tells an iPhone user to switch Apple Intelligence on', async () => {
    setModelEngineForTests(
      fakeEngine([], {
        status: 'unavailable',
        reason: 'notEnabled',
        modelName: 'Apple Intelligence',
      }),
    );
    await expect(
      runOnDevice(CFG, {
        system: 's',
        history: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        exec: async () => '{}',
      }),
    ).rejects.toThrow(/Turn on Apple Intelligence/);
  });
});

describe('runOnDevice — the action loop', () => {
  beforeEach(() => {
    useModelStore.setState({ status: 'ready', modelName: 'Gemini Nano' });
  });

  it('runs a tool call, feeds the result back, then returns the final reply', async () => {
    const engine = fakeEngine([
      '{"tool":"log_food","args":{"entries":[{"name":"2 eggs","kcal":180}]}}',
      '{"reply":"Logged 2 eggs — 180 kcal."}',
    ]);
    const exec = jest.fn(async () => JSON.stringify({ ok: true, id: 'abc' }));

    const reply = await runOnDevice(
      CFG,
      {
        system: 'You are a coach.',
        history: [{ role: 'user', content: 'I ate 2 eggs' }],
        tools: TOOLS,
        exec,
      },
      engine,
    );

    expect(exec).toHaveBeenCalledWith('log_food', {
      entries: [{ name: '2 eggs', kcal: 180 }],
    });
    expect(reply).toBe('Logged 2 eggs — 180 kcal.');
    // The coaching brief + protocol travel as the system instructions…
    expect(engine.calls[0].system).toContain('You are a coach.');
    expect(engine.calls[0].system).toContain('"tool"');
    // …and the second round sees the tool result in the transcript.
    expect(engine.calls[1].prompt).toContain('TOOL_RESULT log_food');
    expect(engine.calls[1].prompt.endsWith('Assistant:')).toBe(true);
  });

  it('reads an action wrapped in prose — there is no grammar on the OS models', async () => {
    const engine = fakeEngine([
      'Sure! Here you go:\n```json\n{"reply":"Hello there"}\n```',
    ]);
    const reply = await runOnDevice(
      CFG,
      {
        system: 's',
        history: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        exec: async () => '{}',
      },
      engine,
    );
    expect(reply).toBe('Hello there');
  });

  it('corrects a model that chats when the user pressed an action button', async () => {
    const engine = fakeEngine([
      '{"reply":"What did you have exactly?"}',
      '{"tool":"log_food","args":{"entries":[{"name":"toast","kcal":90}]}}',
      '{"reply":"Logged toast — 90 kcal."}',
    ]);
    const exec = jest.fn(async () => '{"ok":true}');
    const reply = await runOnDevice(
      CFG,
      {
        system: 's',
        history: [{ role: 'user', content: 'toast' }],
        tools: TOOLS,
        exec,
        toolChoice: { force: 'log_food' },
      },
      engine,
    );
    expect(engine.calls[0].system).toContain('has ALREADY chosen the action');
    expect(engine.calls[1].prompt).toContain('You MUST respond');
    expect(exec).toHaveBeenCalledTimes(1);
    expect(reply).toBe('Logged toast — 90 kcal.');
  });

  it('shows the model only the recent window of the chat', async () => {
    const engine = fakeEngine(['{"reply":"ok"}']);
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `message ${i}`,
    }));
    await runOnDevice(
      CFG,
      { system: 's', history, tools: TOOLS, exec: async () => '{}' },
      engine,
    );
    expect(engine.calls[0].prompt).toContain('message 19');
    expect(engine.calls[0].prompt).not.toContain('message 10');
  });

  it('stops with a CoachError if the model never produces a reply', async () => {
    const engine = fakeEngine(Array(10).fill('{"tool":"log_food","args":{}}'));
    await expect(
      runOnDevice(
        CFG,
        {
          system: 's',
          history: [{ role: 'user', content: 'hi' }],
          tools: TOOLS,
          exec: async () => '{}',
        },
        engine,
      ),
    ).rejects.toBeInstanceOf(CoachError);
  });

  it('wraps an OS-model failure in a CoachError', async () => {
    const engine = fakeEngine([]);
    engine.generate = async () => {
      throw new Error('quota exceeded');
    };
    await expect(
      runOnDevice(
        CFG,
        {
          system: 's',
          history: [{ role: 'user', content: 'hi' }],
          tools: TOOLS,
          exec: async () => '{}',
        },
        engine,
      ),
    ).rejects.toThrow(/On-device generation failed: quota exceeded/);
  });
});

describe('runCoach routing', () => {
  it('routes the ondevice provider to the on-device runner', async () => {
    // Under Jest the native module is absent, so the real engine reports the
    // model as missing — the runner's own guard proves the routing.
    setModelEngineForTests(
      fakeEngine([], {
        status: 'unavailable',
        reason: 'missing',
        modelName: 'On-device AI',
      }),
    );
    await expect(
      runCoach(CFG, {
        system: 's',
        history: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
        exec: async () => '{}',
      }),
    ).rejects.toBeInstanceOf(CoachError);
  });
});
