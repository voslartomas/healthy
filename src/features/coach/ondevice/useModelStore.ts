/**
 * Availability of the coach's on-device model (ADR-008).
 *
 * The model is the operating system's own — Gemini Nano (Android, AICore) or
 * Apple Intelligence (iOS 26+) — so there is no file of ours to download,
 * pause, resume or delete. This store only mirrors what the OS reports
 * ({@link SystemModelEngine.status}) for the Settings card, the coach and the
 * daily brief, which gate on `status === 'ready'`; plus Android's one action,
 * asking AICore to fetch Gemini Nano when it's `downloadable`.
 *
 * It replaced the GGUF download lifecycle of the llama.rn era (resumable
 * multi-GB downloads with a `.part.json` sidecar). Users of that build may still
 * have the old file on disk; {@link removeLegacyModelFiles} frees it once.
 */

import { create } from 'zustand';

import {
  SystemModelEngine,
  systemModelEngine,
  UnavailableReason,
} from './systemLlm';

export type ModelStatus =
  /** Not asked the OS yet (cold start). */
  | 'checking'
  | 'ready'
  /** Supported; Android can fetch Gemini Nano on request. */
  | 'downloadable'
  /** The OS is fetching / preparing the model. */
  | 'downloading'
  /** This device can't run it (see `reason`). */
  | 'unavailable'
  /** Asking AICore to download failed. */
  | 'error';

interface ModelState {
  status: ModelStatus;
  reason: UnavailableReason | null;
  /** "Gemini Nano" / "Apple Intelligence", as the OS names it. */
  modelName: string;
  /** Bytes fetched so far while `downloading` (Android; total isn't known). */
  bytesDownloaded: number;
  /** Underlying error text for `error` / an OS-service failure. */
  error: string | null;
  /** Ask the OS what it can do right now. Safe to call repeatedly. */
  check: () => Promise<void>;
  /** Android: ask AICore to fetch Gemini Nano. No-op unless `downloadable`. */
  download: () => Promise<void>;
}

/** Injectable for tests; the real engine talks to the native module. */
let engine: SystemModelEngine = systemModelEngine;
export function setModelEngineForTests(e: SystemModelEngine): void {
  engine = e;
}

/** De-duplicates concurrent `check()` calls (App start, Settings, the brief). */
let inFlightCheck: Promise<void> | null = null;

export const useModelStore = create<ModelState>((set, get) => ({
  status: 'checking',
  reason: null,
  modelName: 'On-device AI',
  bytesDownloaded: 0,
  error: null,

  check: async () => {
    // Don't clobber a download we started — its own flow reports completion.
    if (get().status === 'downloading' && get().bytesDownloaded > 0) return;
    if (inFlightCheck) return inFlightCheck;
    inFlightCheck = (async () => {
      const info = await engine.status();
      set({
        status:
          info.status === 'available'
            ? 'ready'
            : info.status === 'downloadable'
              ? 'downloadable'
              : info.status === 'downloading'
                ? 'downloading'
                : 'unavailable',
        reason: info.reason ?? null,
        modelName: info.modelName,
        error: info.message ?? null,
      });
      // Load it ahead of the first request so the first answer isn't the slow one.
      if (info.status === 'available') void engine.warmup();
    })().finally(() => {
      inFlightCheck = null;
    });
    return inFlightCheck;
  },

  download: async () => {
    const st = get().status;
    if (st !== 'downloadable' && st !== 'error') return;
    set({ status: 'downloading', bytesDownloaded: 0, error: null });
    try {
      await engine.download(bytes => set({ bytesDownloaded: bytes }));
      set({ bytesDownloaded: 0 });
      await get().check();
    } catch (err) {
      set({
        status: 'error',
        bytesDownloaded: 0,
        error: String((err as Error)?.message ?? err),
      });
    }
  },
}));

/** The llama.rn build's Gemma GGUF and its partial-download leftovers. */
const LEGACY_GEMMA = 'models/gemma-3-4b-it-Q4_K_M.gguf';
const LEGACY_FILES = [
  LEGACY_GEMMA,
  `${LEGACY_GEMMA}.part`,
  `${LEGACY_GEMMA}.part.json`,
];

/**
 * One-time cleanup after the move off llama.rn (ADR-008): the previous build
 * stored Gemma as a ~2.7 GB GGUF in `documentDirectory/models/`. Nothing reads
 * it any more, so free the space. Best-effort and idempotent — absent files are
 * the normal case.
 *
 * Deletes those exact files, NOT the `models/` directory: the Whisper voice
 * model lives in the same directory (see useWhisperStore) and must survive.
 */
export async function removeLegacyModelFiles(): Promise<void> {
  try {
    type LegacyFS = typeof import('expo-file-system/legacy');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load
    const FS = require('expo-file-system/legacy') as LegacyFS;
    if (!FS.documentDirectory) return;
    for (const rel of LEGACY_FILES) {
      await FS.deleteAsync(FS.documentDirectory + rel, { idempotent: true });
    }
  } catch {
    // Freeing space is a courtesy; never let it break startup.
  }
}
