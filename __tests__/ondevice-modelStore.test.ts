/**
 * The coach model's availability store (ADR-008). The model is the OS's own —
 * Gemini Nano / Apple Intelligence — so the store mirrors what the OS reports,
 * plus Android's one-time "fetch Gemini Nano". A scripted engine stands in for
 * the native module.
 */
import * as FS from 'expo-file-system/legacy';

import {
  SystemModelEngine,
  SystemModelInfo,
} from '../src/features/coach/ondevice/systemLlm';
import {
  removeLegacyModelFiles,
  setModelEngineForTests,
  useModelStore,
} from '../src/features/coach/ondevice/useModelStore';

function engineWith(
  info: SystemModelInfo,
  overrides: Partial<SystemModelEngine> = {},
): SystemModelEngine & { warmup: jest.Mock; status: jest.Mock } {
  return {
    status: jest.fn(async () => info),
    download: async () => undefined,
    warmup: jest.fn(async () => undefined),
    generate: async () => '',
    ...overrides,
  } as SystemModelEngine & { warmup: jest.Mock; status: jest.Mock };
}

beforeEach(() => {
  useModelStore.setState({
    status: 'checking',
    reason: null,
    modelName: 'On-device AI',
    bytesDownloaded: 0,
    error: null,
  });
});

describe('useModelStore.check', () => {
  it('maps an available OS model to ready, names it, and warms it up', async () => {
    const e = engineWith({ status: 'available', modelName: 'Gemini Nano' });
    setModelEngineForTests(e);
    await useModelStore.getState().check();
    expect(useModelStore.getState()).toMatchObject({
      status: 'ready',
      modelName: 'Gemini Nano',
    });
    expect(e.warmup).toHaveBeenCalled();
  });

  it('keeps the reason a phone cannot run it, for the Settings copy', async () => {
    setModelEngineForTests(
      engineWith({
        status: 'unavailable',
        reason: 'notEnabled',
        modelName: 'Apple Intelligence',
      }),
    );
    await useModelStore.getState().check();
    expect(useModelStore.getState()).toMatchObject({
      status: 'unavailable',
      reason: 'notEnabled',
    });
  });

  it('collapses concurrent checks into one OS query', async () => {
    const e = engineWith({ status: 'available', modelName: 'Gemini Nano' });
    setModelEngineForTests(e);
    await Promise.all([
      useModelStore.getState().check(),
      useModelStore.getState().check(),
      useModelStore.getState().check(),
    ]);
    expect(e.status).toHaveBeenCalledTimes(1);
  });
});

describe('useModelStore.download (Android: ask AICore for Gemini Nano)', () => {
  it('goes downloadable → downloading (with bytes) → ready', async () => {
    let finish: () => void = () => undefined;
    let report: (b: number) => void = () => undefined;
    const e = engineWith(
      { status: 'downloadable', modelName: 'Gemini Nano' },
      {
        download: onProgress =>
          new Promise<void>(resolve => {
            report = onProgress ?? (() => undefined);
            finish = resolve;
          }),
      },
    );
    setModelEngineForTests(e);
    await useModelStore.getState().check();
    expect(useModelStore.getState().status).toBe('downloadable');

    const done = useModelStore.getState().download();
    expect(useModelStore.getState().status).toBe('downloading');
    report(5_000_000);
    expect(useModelStore.getState().bytesDownloaded).toBe(5_000_000);

    // AICore finishes; the store re-asks the OS and lands on ready.
    e.status.mockResolvedValue({
      status: 'available',
      modelName: 'Gemini Nano',
    });
    finish();
    await done;
    expect(useModelStore.getState()).toMatchObject({
      status: 'ready',
      bytesDownloaded: 0,
    });
  });

  it('surfaces a failed download as a retryable error', async () => {
    setModelEngineForTests(
      engineWith(
        { status: 'downloadable', modelName: 'Gemini Nano' },
        {
          download: async () => {
            throw new Error('network');
          },
        },
      ),
    );
    await useModelStore.getState().check();
    await useModelStore.getState().download();
    expect(useModelStore.getState()).toMatchObject({
      status: 'error',
      error: 'network',
    });
  });

  it('does nothing when there is nothing to download', async () => {
    const download = jest.fn(async () => undefined);
    setModelEngineForTests(
      engineWith(
        { status: 'available', modelName: 'Gemini Nano' },
        { download },
      ),
    );
    await useModelStore.getState().check();
    await useModelStore.getState().download();
    expect(download).not.toHaveBeenCalled();
  });
});

describe('removeLegacyModelFiles', () => {
  it('deletes only the old Gemma files — never the shared models/ directory', async () => {
    const del = FS.deleteAsync as jest.Mock;
    del.mockClear();
    await removeLegacyModelFiles();
    const paths = del.mock.calls.map(c => c[0] as string);
    expect(paths).toEqual([
      'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf',
      'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part',
      'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part.json',
    ]);
    // The Whisper voice model lives in the same directory and must survive.
    expect(paths).not.toContain('file:///doc/models/');
  });
});
