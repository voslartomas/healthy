/**
 * Download lifecycle for on-device Gemma models.
 *
 * Owns the model file on disk (under `documentDirectory/models/`) and the UI
 * state for the Settings download card: which tier is selected, whether it's
 * absent / downloading / paused / ready / errored, and live progress. Downloads
 * stream via `expo-file-system`'s legacy `createDownloadResumable`, whose
 * progress callback drives {@link ModelState.progress}. Only one model is kept
 * on disk — switching tiers re-checks existence, and `remove()` frees the space.
 *
 * Downloads are resumable: the in-flight file streams to a `.part` temp and the
 * resumable's `savable()` state is persisted to a `.part.json` sidecar, so an
 * interrupted multi-GB pull (app backgrounded, killed, or a network drop) can
 * continue instead of restarting. {@link ModelState.pause} is wired to app
 * backgrounding; {@link ModelState.download} doubles as "resume" when a sidecar
 * + partial exist. Only a completed download is moved onto the final path, so
 * `check()` can still trust that path's existence as "ready".
 *
 * The runner reads {@link ModelState.activeModelPath} to locate a ready model;
 * everything here is filesystem + state, no inference (see ./llamaEngine).
 */

import * as FS from 'expo-file-system/legacy';
import { create } from 'zustand';

import { DEFAULT_MODEL_ID, GemmaModel, modelById } from './models';

export type ModelStatus =
  | 'absent'
  | 'downloading'
  | 'paused'
  | 'ready'
  | 'error';

const MODELS_DIR = `${FS.documentDirectory ?? ''}models/`;

function pathFor(m: GemmaModel): string {
  return MODELS_DIR + m.filename;
}

/** Where an in-flight download streams to. We only move it onto {@link pathFor}
 * once the download completes, so a file at the final path always means a
 * finished download — never a partial left behind by an interrupted one. */
function partPathFor(m: GemmaModel): string {
  return pathFor(m) + '.part';
}

/** Sidecar holding the resumable's `savable()` state (url, fileUri, options and
 * — after a pause — the resumeData token) so an interrupted download can be
 * rebuilt and resumed across app restarts. */
function metaPathFor(m: GemmaModel): string {
  return pathFor(m) + '.part.json';
}

/** In-flight resumable handle, kept out of store state (not serializable). */
let resumable: FS.DownloadResumable | null = null;

/** Read the persisted resume state, or null if none/parse failure. */
async function readResumeState(
  m: GemmaModel,
): Promise<FS.DownloadPauseState | null> {
  try {
    const raw = await FS.readAsStringAsync(metaPathFor(m));
    return JSON.parse(raw) as FS.DownloadPauseState;
  } catch {
    return null;
  }
}

/** Persist the resume state so a later launch can rebuild the download. */
async function writeResumeState(
  m: GemmaModel,
  state: FS.DownloadPauseState,
): Promise<void> {
  try {
    await FS.writeAsStringAsync(metaPathFor(m), JSON.stringify(state));
  } catch {
    // Best-effort — losing the sidecar only costs us a restart, not the file.
  }
}

/** Drop the resume sidecar (idempotent). */
async function clearResumeState(m: GemmaModel): Promise<void> {
  await FS.deleteAsync(metaPathFor(m), { idempotent: true }).catch(
    () => undefined,
  );
}

/** Progress-callback factory: normalises the server total (falling back to the
 * registry estimate) and streams the fraction into the store. */
function onProgress(
  set: (partial: Partial<ModelState>) => void,
  m: GemmaModel,
): (p: FS.DownloadProgressData) => void {
  return p => {
    const total =
      p.totalBytesExpectedToWrite > 0
        ? p.totalBytesExpectedToWrite
        : m.sizeBytes;
    set({
      bytesWritten: p.totalBytesWritten,
      bytesTotal: total,
      progress: total > 0 ? p.totalBytesWritten / total : 0,
    });
  };
}

interface ModelState {
  /** The currently selected tier (mirrors the MODEL pill in Settings). */
  selectedId: string;
  status: ModelStatus;
  /** 0..1 download fraction. */
  progress: number;
  bytesWritten: number;
  /** Total bytes (server-reported, or the registry estimate as a fallback). */
  bytesTotal: number;
  error: string | null;

  /** Absolute file path of the ready model, or null if none is ready. */
  activeModelPath: () => string | null;
  /** Switch tiers and re-check whether that model is already downloaded. */
  select: (id: string) => Promise<void>;
  /** Refresh `status` for the selected model from the filesystem. */
  check: () => Promise<void>;
  /**
   * Download the selected model, streaming progress into the store. Doubles as
   * "resume": if an interrupted download left a `.part` + sidecar, it continues
   * from there instead of restarting.
   */
  download: () => Promise<void>;
  /** Pause an in-flight download, persisting resume state (wired to app
   * backgrounding). Safe to call when not downloading — it no-ops. */
  pause: () => Promise<void>;
  /** Cancel an in-flight/paused download and discard the partial file. */
  cancel: () => Promise<void>;
  /** Delete the downloaded model file and free its space. */
  remove: () => Promise<void>;
}

export const useModelStore = create<ModelState>((set, get) => ({
  selectedId: DEFAULT_MODEL_ID,
  status: 'absent',
  progress: 0,
  bytesWritten: 0,
  bytesTotal: modelById(DEFAULT_MODEL_ID).sizeBytes,
  error: null,

  activeModelPath: () =>
    get().status === 'ready' ? pathFor(modelById(get().selectedId)) : null,

  select: async (id: string) => {
    if (id === get().selectedId) return;
    set({
      selectedId: id,
      status: 'absent',
      progress: 0,
      bytesWritten: 0,
      bytesTotal: modelById(id).sizeBytes,
      error: null,
    });
    await get().check();
  },

  check: async () => {
    // Don't second-guess an in-flight/paused download — the final file
    // legitimately doesn't exist yet, and sweeping the partial would corrupt it.
    if (get().status === 'downloading' || get().status === 'paused') return;
    const m = modelById(get().selectedId);
    // A file at the final path only ever appears via the completed-download
    // move, so its existence is a trustworthy "ready".
    try {
      const info = await FS.getInfoAsync(pathFor(m));
      if (info.exists) {
        set({ status: 'ready' });
        return;
      }
    } catch {
      // fall through to the resume/absent checks below
    }
    // No final file. A resume sidecar + partial means an interrupted download we
    // can continue — surface it as 'paused' with its progress instead of wiping.
    const saved = await readResumeState(m);
    const partInfo = saved
      ? await FS.getInfoAsync(partPathFor(m)).catch(() => ({
          exists: false as const,
        }))
      : { exists: false as const };
    if (saved && partInfo.exists) {
      const total = m.sizeBytes;
      const written =
        'size' in partInfo && typeof partInfo.size === 'number'
          ? partInfo.size
          : 0;
      set({
        status: 'paused',
        bytesWritten: written,
        bytesTotal: total,
        progress: total > 0 ? Math.min(written / total, 1) : 0,
      });
      return;
    }
    // Nothing resumable: sweep any stray partial + sidecar and report absent.
    await FS.deleteAsync(partPathFor(m), { idempotent: true }).catch(
      () => undefined,
    );
    await clearResumeState(m);
    set({ status: 'absent', progress: 0, bytesWritten: 0 });
  },

  download: async () => {
    if (get().status === 'downloading') return;
    const m = modelById(get().selectedId);
    const part = partPathFor(m);
    set({ status: 'downloading', error: null });
    try {
      await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(
        () => undefined,
      );
      // Resume when an interrupted attempt left a sidecar + partial; otherwise
      // start clean. Existence of the partial guards against a stale sidecar.
      const saved = await readResumeState(m);
      const partInfo =
        saved &&
        (await FS.getInfoAsync(part).catch(() => ({ exists: false as const })));
      const resuming = Boolean(saved && partInfo && partInfo.exists);

      let res: FS.FileSystemDownloadResult | undefined;
      if (resuming && saved) {
        resumable = FS.createDownloadResumable(
          m.url,
          part,
          saved.options ?? {},
          onProgress(set, m),
          saved.resumeData,
        );
        await writeResumeState(m, resumable.savable());
        try {
          res = await resumable.resumeAsync();
        } catch {
          // Resume unsupported here (e.g. iOS after a hard kill, no token) —
          // fall back to a clean restart rather than getting stuck.
          await clearResumeState(m);
          await FS.deleteAsync(part, { idempotent: true }).catch(
            () => undefined,
          );
          set({ progress: 0, bytesWritten: 0, bytesTotal: m.sizeBytes });
          resumable = FS.createDownloadResumable(
            m.url,
            part,
            {},
            onProgress(set, m),
          );
          await writeResumeState(m, resumable.savable());
          res = await resumable.downloadAsync();
        }
      } else {
        await clearResumeState(m);
        await FS.deleteAsync(part, { idempotent: true }).catch(() => undefined);
        set({ progress: 0, bytesWritten: 0, bytesTotal: m.sizeBytes });
        resumable = FS.createDownloadResumable(
          m.url,
          part,
          {},
          onProgress(set, m),
        );
        await writeResumeState(m, resumable.savable());
        res = await resumable.downloadAsync();
      }

      // undefined ⇒ the task stopped writing (paused or cancelled). A background
      // pause() flips status to 'paused' and keeps the partial + sidecar for a
      // later resume; anything else is a cancel, already cleaned up by cancel().
      if (!res) {
        if (get().status !== 'paused') {
          await clearResumeState(m);
          await FS.deleteAsync(part, { idempotent: true }).catch(
            () => undefined,
          );
          set({ status: 'absent', progress: 0, bytesWritten: 0 });
        }
        return;
      }
      // Publish atomically: only now does a file appear at the final path, so a
      // later check() can trust its existence as a completed download.
      await FS.moveAsync({ from: part, to: pathFor(m) });
      await clearResumeState(m);
      set({ status: 'ready', progress: 1 });
    } catch (err) {
      // Transient failure (network drop, killed mid-flight): keep the partial +
      // sidecar so RETRY resumes instead of restarting the multi-GB pull.
      try {
        if (resumable) await writeResumeState(m, resumable.savable());
      } catch {
        // ignore — worst case retry restarts
      }
      set({
        status: 'error',
        error: String((err as Error)?.message ?? err),
      });
    } finally {
      resumable = null;
    }
  },

  pause: async () => {
    if (get().status !== 'downloading' || !resumable) return;
    try {
      const state = await resumable.pauseAsync();
      await writeResumeState(modelById(get().selectedId), state);
      // Flip before the download promise resolves(undefined) so download()'s
      // !res branch knows this was a pause, not a cancel, and keeps the file.
      set({ status: 'paused' });
    } catch {
      // Couldn't pause cleanly — leave it downloading; worst case it restarts.
    }
  },

  cancel: async () => {
    try {
      await resumable?.cancelAsync();
    } catch {
      // ignore — we discard the partial file regardless
    }
    resumable = null;
    const m = modelById(get().selectedId);
    await clearResumeState(m);
    for (const p of [partPathFor(m), pathFor(m)]) {
      try {
        await FS.deleteAsync(p, { idempotent: true });
      } catch {
        // ignore
      }
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0 });
  },

  remove: async () => {
    const m = modelById(get().selectedId);
    await clearResumeState(m);
    for (const p of [partPathFor(m), pathFor(m)]) {
      try {
        await FS.deleteAsync(p, { idempotent: true });
      } catch {
        // ignore
      }
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0, error: null });
  },
}));
