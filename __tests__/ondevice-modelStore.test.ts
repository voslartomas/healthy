/**
 * Model download lifecycle. Overrides expo-file-system/legacy with a controllable
 * resumable so we can drive progress ticks and resolution by hand (jest.mock
 * factory vars must be `mock`-prefixed).
 */

const mockCtl: {
  cb:
    | ((p: {
        totalBytesWritten: number;
        totalBytesExpectedToWrite: number;
      }) => void)
    | null;
  resolve: ((v: { uri: string } | undefined) => void) | null;
  cancelAsync: jest.Mock;
  deleteAsync: jest.Mock;
} = {
  cb: null,
  resolve: null,
  cancelAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
};

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn(async () => {}),
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  deleteAsync: (...args: unknown[]) => mockCtl.deleteAsync(...args),
  createDownloadResumable: (
    _url: string,
    _path: string,
    _opts: unknown,
    cb: (p: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void,
  ) => {
    mockCtl.cb = cb;
    return {
      downloadAsync: () =>
        new Promise<{ uri: string } | undefined>(res => {
          mockCtl.resolve = res;
        }),
      cancelAsync: mockCtl.cancelAsync,
    };
  },
}));

// eslint-disable-next-line import/first -- must follow the jest.mock above
import { useModelStore } from '../src/features/coach/ondevice/useModelStore';

/** Flush pending microtasks so download()'s `await makeDirectoryAsync` settles
 * and the resumable (and its progress callback) is created. */
const tick = () => new Promise<void>(r => setImmediate(() => r()));

beforeEach(() => {
  mockCtl.cb = null;
  mockCtl.resolve = null;
  mockCtl.cancelAsync.mockClear();
  mockCtl.deleteAsync.mockClear();
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

    // Completing the download flips to ready at 100%.
    mockCtl.resolve!({ uri: 'file:///doc/models/gemma-3-4b-it-Q4_K_M.gguf' });
    await p;
    expect(useModelStore.getState().status).toBe('ready');
    expect(useModelStore.getState().progress).toBe(1);
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
