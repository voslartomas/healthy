/**
 * Model download lifecycle. Overrides expo-file-system/legacy with a controllable
 * resumable so we can drive progress ticks and resolution by hand (jest.mock
 * factory vars must be `mock`-prefixed).
 */

const SAVED = { url: 'u', fileUri: 'f', options: {}, resumeData: 'tok' };

const mockCtl: {
  cb:
    | ((p: {
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void)
    | null;
  resolve: ((v: { uri: string } | undefined) => void) | null;
  /** Path the resumable was told to stream to (the `.part` temp file). */
  downloadPath: string | null;
  /** Which method kicked off the last task — 'download' (fresh) or 'resume'. */
  lastStart: 'download' | 'resume' | null;
  cancelAsync: jest.Mock;
  pauseAsync: jest.Mock;
  savable: jest.Mock;
  deleteAsync: jest.Mock;
  moveAsync: jest.Mock;
  getInfoAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
  writeAsStringAsync: jest.Mock;
} = {
  cb: null,
  resolve: null,
  downloadPath: null,
  lastStart: null,
  cancelAsync: jest.fn(async () => {}),
  pauseAsync: jest.fn(async () => SAVED),
  savable: jest.fn(() => SAVED),
  deleteAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  // Default: no resume sidecar on disk, so downloads always start fresh.
  readAsStringAsync: jest.fn(async () => {
    throw new Error('no sidecar');
  }),
  writeAsStringAsync: jest.fn(async () => {}),
};

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn(async () => {}),
  getInfoAsync: (...args: unknown[]) => mockCtl.getInfoAsync(...args),
  deleteAsync: (...args: unknown[]) => mockCtl.deleteAsync(...args),
  moveAsync: (...args: unknown[]) => mockCtl.moveAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockCtl.readAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) =>
    mockCtl.writeAsStringAsync(...args),
  createDownloadResumable: (
    _url: string,
    path: string,
    _opts: unknown,
    cb: (p: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void,
  ) => {
    mockCtl.cb = cb;
    mockCtl.downloadPath = path;
    return {
      downloadAsync: () =>
        new Promise<{ uri: string } | undefined>(res => {
          mockCtl.lastStart = 'download';
          mockCtl.resolve = res;
        }),
      resumeAsync: () =>
        new Promise<{ uri: string } | undefined>(res => {
          mockCtl.lastStart = 'resume';
          mockCtl.resolve = res;
        }),
      pauseAsync: mockCtl.pauseAsync,
      savable: mockCtl.savable,
      cancelAsync: mockCtl.cancelAsync,
    };
  },
}));

// eslint-disable-next-line import/first -- must follow the jest.mock above
import { useModelStore } from '../src/features/coach/ondevice/useModelStore';

/** Flush several macro/microtask rounds so download()'s chain of awaits
 * (makeDirectory → read sidecar → clear → createDownloadResumable → save) all
 * settle and the resumable (and its progress callback) is created. */
const tick = async () => {
  for (let i = 0; i < 6; i++) await new Promise<void>(r => setImmediate(r));
};

beforeEach(() => {
  mockCtl.cb = null;
  mockCtl.resolve = null;
  mockCtl.downloadPath = null;
  mockCtl.lastStart = null;
  mockCtl.cancelAsync.mockReset().mockResolvedValue(undefined);
  mockCtl.pauseAsync.mockReset().mockResolvedValue(SAVED);
  mockCtl.savable.mockReset().mockReturnValue(SAVED);
  mockCtl.deleteAsync.mockReset().mockResolvedValue(undefined);
  mockCtl.moveAsync.mockReset().mockResolvedValue(undefined);
  mockCtl.getInfoAsync.mockReset().mockResolvedValue({ exists: false });
  mockCtl.writeAsStringAsync.mockReset().mockResolvedValue(undefined);
  // No sidecar by default ⇒ fresh download path.
  mockCtl.readAsStringAsync
    .mockReset()
    .mockRejectedValue(new Error('no sidecar'));
  useModelStore.setState({
    selectedId: 'gemma-3-4b-it-q4',
    status: 'absent',
    progress: 0,
    bytesWritten: 0,
    bytesTotal: 0,
    error: null,
  });
});

describe('useModelStore.download', () => {
  it('drives absent -> downloading (with live progress) -> ready', async () => {
    const p = useModelStore.getState().download();
    expect(useModelStore.getState().status).toBe('downloading');
    await tick(); // let makeDirectoryAsync settle so the resumable is created

    // A mid-download progress tick updates the fraction.
    mockCtl.cb!({ totalBytesWritten: 500, totalBytesExpectedToWrite: 1000 });
    expect(useModelStore.getState().progress).toBeCloseTo(0.5);
    expect(useModelStore.getState().bytesWritten).toBe(500);

    // The download must stream to a temp `.part` file, not the final path, so an
    // interrupted download never leaves a partial that check() reads as "ready".
    expect(mockCtl.downloadPath).toBe(
      'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part',
    );

    // Completing the download flips to ready at 100%.
    mockCtl.resolve!({ uri: 'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part' });
    await p;
    expect(useModelStore.getState().status).toBe('ready');
    expect(useModelStore.getState().progress).toBe(1);
    // The completed temp file is published to the final path atomically.
    expect(mockCtl.moveAsync).toHaveBeenCalledWith({
      from: 'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part',
      to: 'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf',
    });
    expect(useModelStore.getState().activeModelPath()).toContain(
      'gemma-3-4b-it-Q4_K_M.gguf',
    );
  });

  it('returns to absent when the download resolves as cancelled (undefined)', async () => {
    const p = useModelStore.getState().download();
    await tick();
    mockCtl.resolve!(undefined);
    await p;
    expect(useModelStore.getState().status).toBe('absent');
  });

  it('pause() marks the download paused and keeps the partial (no move/cleanup)', async () => {
    const p = useModelStore.getState().download();
    await tick();
    mockCtl.cb!({ totalBytesWritten: 500, totalBytesExpectedToWrite: 1000 });
    await useModelStore.getState().pause();
    expect(useModelStore.getState().status).toBe('paused');
    expect(mockCtl.pauseAsync).toHaveBeenCalled();

    // The paused task now stops writing (resolves undefined). Because we paused
    // (not cancelled), download() must not move the file or delete the partial.
    mockCtl.deleteAsync.mockClear();
    mockCtl.resolve!(undefined);
    await p;
    expect(useModelStore.getState().status).toBe('paused');
    expect(mockCtl.moveAsync).not.toHaveBeenCalled();
    expect(mockCtl.deleteAsync).not.toHaveBeenCalled();
  });

  it('download() resumes from a saved sidecar instead of restarting', async () => {
    // A prior interrupted attempt persisted resume state and left a partial.
    mockCtl.readAsStringAsync.mockResolvedValue(JSON.stringify(SAVED));
    mockCtl.getInfoAsync.mockImplementation(async (uri: string) =>
      uri.endsWith('.part') ? { exists: true, size: 500 } : { exists: false },
    );
    const p = useModelStore.getState().download();
    await tick();
    // It must continue via resumeAsync(), not kick off a fresh downloadAsync().
    expect(mockCtl.lastStart).toBe('resume');
    mockCtl.resolve!({
      uri: 'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part',
    });
    await p;
    expect(useModelStore.getState().status).toBe('ready');
    expect(mockCtl.moveAsync).toHaveBeenCalled();
  });
});

describe('useModelStore.check', () => {
  it('reports absent (and sweeps the partial) when only a `.part` file remains', async () => {
    // Simulates an interrupted download: the final `.gguf` never materialised,
    // only the `.part` temp did. check() must NOT report this as ready.
    mockCtl.getInfoAsync.mockResolvedValue({ exists: false });
    await useModelStore.getState().check();
    expect(useModelStore.getState().status).toBe('absent');
    expect(mockCtl.deleteAsync).toHaveBeenCalledWith(
      'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part',
      { idempotent: true },
    );
  });

  it('reports ready when the completed file exists at the final path', async () => {
    mockCtl.getInfoAsync.mockResolvedValue({ exists: true });
    await useModelStore.getState().check();
    expect(useModelStore.getState().status).toBe('ready');
  });

  it('reports paused with restored progress when a resumable partial exists', async () => {
    // Interrupted download: no final file, but a sidecar + partial remain.
    mockCtl.readAsStringAsync.mockResolvedValue(JSON.stringify(SAVED));
    mockCtl.getInfoAsync.mockImplementation(async (uri: string) =>
      uri.endsWith('.part')
        ? { exists: true, size: 1_350_000_000 }
        : { exists: false },
    );
    await useModelStore.getState().check();
    expect(useModelStore.getState().status).toBe('paused');
    expect(useModelStore.getState().bytesWritten).toBe(1_350_000_000);
    expect(useModelStore.getState().progress).toBeGreaterThan(0);
    // A resumable partial must NOT be swept.
    expect(mockCtl.deleteAsync).not.toHaveBeenCalledWith(
      'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf.part',
      { idempotent: true },
    );
  });

  it('leaves an in-flight download untouched', async () => {
    const p = useModelStore.getState().download();
    await tick();
    // A check() firing mid-download (e.g. the card remounting) must not clear
    // the status or delete the partial out from under the active download.
    await useModelStore.getState().check();
    expect(useModelStore.getState().status).toBe('downloading');
    mockCtl.resolve?.(undefined);
    await p;
  });
});

describe('useModelStore.cancel / remove', () => {
  it('cancel aborts the in-flight download and discards the file', async () => {
    const p = useModelStore.getState().download();
    expect(useModelStore.getState().status).toBe('downloading');
    await tick(); // ensure the resumable exists before cancelling
    await useModelStore.getState().cancel();
    expect(mockCtl.cancelAsync).toHaveBeenCalled();
    expect(mockCtl.deleteAsync).toHaveBeenCalled();
    expect(useModelStore.getState().status).toBe('absent');
    // Let the (now-cancelled) download promise settle to avoid an open handle.
    mockCtl.resolve?.(undefined);
    await p;
  });

  it('remove deletes a ready model and returns to absent', async () => {
    useModelStore.setState({ status: 'ready', progress: 1 });
    await useModelStore.getState().remove();
    expect(mockCtl.deleteAsync).toHaveBeenCalled();
    expect(useModelStore.getState().status).toBe('absent');
    expect(useModelStore.getState().activeModelPath()).toBeNull();
  });
});
