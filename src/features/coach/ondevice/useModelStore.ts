/**
 * Download lifecycle for on-device Gemma models.
 *
 * Owns the model file on disk (under `documentDirectory/models/`) and the UI
 * state for the Settings download card: which tier is selected, whether it's
 * absent / downloading / ready / errored, and live progress. Downloads stream
 * via `expo-file-system`'s legacy `createDownloadResumable`, whose progress
 * callback drives {@link ModelState.progress}. Only one model is kept on disk —
 * switching tiers re-checks existence, and `remove()` frees the space.
 *
 * The runner reads {@link ModelState.activeModelPath} to locate a ready model;
 * everything here is filesystem + state, no inference (see ./llamaEngine).
 */

import * as FS from 'expo-file-system/legacy';
import { create } from 'zustand';

import { DEFAULT_MODEL_ID, GemmaModel, modelById } from './models';

export type ModelStatus = 'absent' | 'downloading' | 'ready' | 'error';

const MODELS_DIR = `${FS.documentDirectory ?? ''}models/`;

function pathFor(m: GemmaModel): string {
  return MODELS_DIR + m.filename;
}

/** In-flight resumable handle, kept out of store state (not serializable). */
let resumable: FS.DownloadResumable | null = null;

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
  /** Download the selected model, streaming progress into the store. */
  download: () => Promise<void>;
  /** Cancel an in-flight download and discard the partial file. */
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
    const m = modelById(get().selectedId);
    try {
      const info = await FS.getInfoAsync(pathFor(m));
      set({ status: info.exists ? 'ready' : 'absent' });
    } catch {
      set({ status: 'absent' });
    }
  },

  download: async () => {
    if (get().status === 'downloading') return;
    const m = modelById(get().selectedId);
    set({
      status: 'downloading',
      progress: 0,
      bytesWritten: 0,
      bytesTotal: m.sizeBytes,
      error: null,
    });
    try {
      await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(
        () => undefined,
      );
      resumable = FS.createDownloadResumable(m.url, pathFor(m), {}, p => {
        const total =
          p.totalBytesExpectedToWrite > 0
            ? p.totalBytesExpectedToWrite
            : m.sizeBytes;
        set({
          bytesWritten: p.totalBytesWritten,
          bytesTotal: total,
          progress: total > 0 ? p.totalBytesWritten / total : 0,
        });
      });
      const res = await resumable.downloadAsync();
      // A cancelled download resolves to undefined.
      if (!res) {
        set({ status: 'absent', progress: 0, bytesWritten: 0 });
        return;
      }
      set({ status: 'ready', progress: 1 });
    } catch (err) {
      set({
        status: 'error',
        error: String((err as Error)?.message ?? err),
      });
    } finally {
      resumable = null;
    }
  },

  cancel: async () => {
    try {
      await resumable?.cancelAsync();
    } catch {
      // ignore — we discard the partial file regardless
    }
    resumable = null;
    try {
      await FS.deleteAsync(pathFor(modelById(get().selectedId)), {
        idempotent: true,
      });
    } catch {
      // ignore
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0 });
  },

  remove: async () => {
    try {
      await FS.deleteAsync(pathFor(modelById(get().selectedId)), {
        idempotent: true,
      });
    } catch {
      // ignore
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0, error: null });
  },
}));
