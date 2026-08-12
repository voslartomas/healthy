import * as FS from 'expo-file-system/legacy';

import { CoachError, runCoach } from '../src/features/coach/aiClient';
import { OnDeviceEngine } from '../src/features/coach/ondevice/llamaEngine';
import { runOnDevice } from '../src/features/coach/ondevice/runner';
import { useModelStore } from '../src/features/coach/ondevice/useModelStore';

/** A fake engine that replays a scripted list of completions, one per call. */
function fakeEngine(script: string[]): OnDeviceEngine & { loaded: string[] } {
  const loaded: string[] = [];
  let i = 0;
  return {
    loaded,
    load: async (path: string) => {
      loaded.push(path);
    },
    complete: async () => script[i++] ?? '{"reply":"(no more script)"}',
    release: async () => undefined,
    isLoaded: () => loaded.length > 0,
  };
}

const TOOLS = [
  {
    name: 'log_food',
    description: 'Log a meal.',
    parameters: { type: 'object', properties: {} },
  },
];

beforeEach(() => {
  // A healthy, fully-downloaded model file by default (the runner size-checks it).
  (FS.getInfoAsync as jest.Mock).mockResolvedValue({
    exists: true,
    size: 3_000_000_000,
  });
  useModelStore.setState({
    selectedId: 'gemma-3-4b-it-q4',
    status: 'absent',
    progress: 0,
    bytesWritten: 0,
    bytesTotal: 0,
    error: null,
  });
});

describe('runOnDevice', () => {
  it('throws a CoachError when no model has been downloaded', async () => {
    // No file on disk: the runner now syncs status from disk (check()) before
    // giving up, so "no model" means the file is genuinely absent.
    (FS.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    await expect(
      runOnDevice(
        { provider: 'ondevice', model: 'Gemma 3 4B', apiKey: '' },
        {
          system: 'sys',
          history: [{ role: 'user', content: 'hi' }],
          tools: TOOLS,
          exec: async () => '{}',
        },
      ),
    ).rejects.toBeInstanceOf(CoachError);
  });

  it('rejects an incomplete/too-small model file with a clear CoachError', async () => {
    useModelStore.setState({ status: 'ready' });
    (FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({
      exists: true,
      size: 1_000_000, // 1 MB — far below a real GGUF
    });
    await expect(
      runOnDevice(
        { provider: 'ondevice', model: 'Gemma 3 4B', apiKey: '' },
        {
          system: 's',
          history: [{ role: 'user', content: 'hi' }],
          tools: TOOLS,
          exec: async () => '{}',
        },
        fakeEngine(['{"reply":"hi"}']),
      ),
    ).rejects.toThrow(/incomplete/i);
  });

  it('loads the ready model, runs a tool call, then returns the final reply', async () => {
    useModelStore.setState({ status: 'ready' });
    const engine = fakeEngine([
      '{"tool":"log_food","args":{"entries":[{"name":"2 eggs","kcal":180}]}}',
      '{"reply":"Logged 2 eggs — 180 kcal."}',
    ]);
    const exec = jest.fn(async () => JSON.stringify({ ok: true, id: 'abc' }));

    const reply = await runOnDevice(
      { provider: 'ondevice', model: 'Gemma 3 4B', apiKey: '' },
      {
        system: 'You are a coach.',
        history: [{ role: 'user', content: 'I ate 2 eggs' }],
        tools: TOOLS,
        exec,
      },
      engine,
    );

    expect(engine.loaded[0]).toContain('gemma-3-4b-it-Q4_K_M.gguf');
    expect(exec).toHaveBeenCalledWith('log_food', {
      entries: [{ name: '2 eggs', kcal: 180 }],
    });
    expect(reply).toBe('Logged 2 eggs — 180 kcal.');
  });

  it('stops with a CoachError if the model never produces a reply', async () => {
    useModelStore.setState({ status: 'ready' });
    // Always returns a tool call — never a reply — so the loop should exhaust.
    const engine = fakeEngine(Array(10).fill('{"tool":"log_food","args":{}}'));
    await expect(
      runOnDevice(
        { provider: 'ondevice', model: 'Gemma 3 4B', apiKey: '' },
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
});

describe('runCoach routing', () => {
  it('routes the ondevice provider to the on-device runner (guarded when no model)', async () => {
    (FS.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    await expect(
      runCoach(
        { provider: 'ondevice', model: 'Gemma 3 4B', apiKey: '' },
        {
          system: 's',
          history: [{ role: 'user', content: 'hi' }],
          tools: TOOLS,
          exec: async () => '{}',
        },
      ),
    ).rejects.toThrow(/download the gemma model/i);
  });
});
