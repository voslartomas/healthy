/**
 * Download lifecycle for the on-device Whisper speech-to-text model, plus the
 * transcription entry point.
 *
 * Owns the model file on disk (under `documentDirectory/models/`, alongside the
 * Gemma model) and the UI state for the Settings voice-input card: absent /
 * downloading / ready / errored, and live progress. Streams via
 * `expo-file-system`'s `createDownloadResumable`, exactly like the Gemma
 * {@link ./useModelStore}. The one extra responsibility over that store is
 * {@link WhisperState.transcribe}, which lazy-loads the model into
 * {@link ./whisperEngine} on first use and decodes an audio file to text.
 *
 * Recording (mic capture) lives in the {@link ../useVoiceInput} hook — it needs
 * expo-audio's React hooks — and calls {@link WhisperState.transcribe} with the
 * recorded file.
 */

import * as FS from 'expo-file-system/legacy';
import { create } from 'zustand';

import { whisperEngine } from './whisperEngine';
import { WHISPER_MODEL } from './whisperModels';

export type WhisperStatus =
  | 'absent'
  | 'downloading'
  | 'paused'
  | 'ready'
  | 'error';

const MODELS_DIR = `${FS.documentDirectory ?? ''}models/`;
const MODEL_PATH = MODELS_DIR + WHISPER_MODEL.filename;
/** In-flight download target. Only moved onto MODEL_PATH once complete, so a
 * file at the final path always means a finished download — an interrupted one
 * leaves a `.part` that check() resumes or sweeps instead of reporting "ready". */
const PART_PATH = MODEL_PATH + '.part';
/** Sidecar holding the resumable's `savable()` state so an interrupted download
 * can be rebuilt and resumed across app restarts (mirrors {@link ./useModelStore}). */
const META_PATH = MODEL_PATH + '.part.json';

/** Voice-model files from earlier tiers, deleted on `check` so a model bump
 * doesn't orphan a few-hundred-MB download on disk. */
const LEGACY_FILENAMES = ['ggml-small-q5_1.bin'];

/** In-flight resumable handle, kept out of store state (not serializable). */
let resumable: FS.DownloadResumable | null = null;

/** Read the persisted resume state, or null if none/parse failure. */
async function readResumeState(): Promise<FS.DownloadPauseState | null> {
  try {
    return JSON.parse(
      await FS.readAsStringAsync(META_PATH),
    ) as FS.DownloadPauseState;
  } catch {
    return null;
  }
}

/** Persist the resume state so a later launch can rebuild the download. */
async function writeResumeState(state: FS.DownloadPauseState): Promise<void> {
  try {
    await FS.writeAsStringAsync(META_PATH, JSON.stringify(state));
  } catch {
    // Best-effort — losing the sidecar only costs us a restart, not the file.
  }
}

/** Drop the resume sidecar (idempotent). */
async function clearResumeState(): Promise<void> {
  await FS.deleteAsync(META_PATH, { idempotent: true }).catch(() => undefined);
}

/** Progress-callback factory shared by download + resume. */
function onProgress(
  set: (partial: Partial<WhisperState>) => void,
): (p: FS.DownloadProgressData) => void {
  return p => {
    const total =
      p.totalBytesExpectedToWrite > 0
        ? p.totalBytesExpectedToWrite
        : WHISPER_MODEL.sizeBytes;
    set({
      bytesWritten: p.totalBytesWritten,
      bytesTotal: total,
      progress: total > 0 ? p.totalBytesWritten / total : 0,
    });
  };
}

interface WhisperState {
  status: WhisperStatus;
  /** 0..1 download fraction. */
  progress: number;
  bytesWritten: number;
  /** Total bytes (server-reported, or the registry estimate as a fallback). */
  bytesTotal: number;
  error: string | null;

  /** True when the model is downloaded and ready to transcribe. */
  isReady: () => boolean;
  /** Refresh `status` from the filesystem. */
  check: () => Promise<void>;
  /**
   * Download the model, streaming progress into the store. Doubles as "resume":
   * if an interrupted download left a `.part` + sidecar, it continues from there.
   */
  download: () => Promise<void>;
  /** Pause an in-flight download, persisting resume state (wired to app
   * backgrounding). Safe to call when not downloading — it no-ops. */
  pause: () => Promise<void>;
  /** Cancel an in-flight/paused download and discard the partial file. */
  cancel: () => Promise<void>;
  /** Delete the downloaded model file and free its space. */
  remove: () => Promise<void>;
  /**
   * Transcribe an audio file to text. Ensures the model is loaded into the
   * native engine first. Throws if the model isn't downloaded yet.
   */
  transcribe: (audioUri: string, language?: string) => Promise<string>;
}

export const useWhisperStore = create<WhisperState>((set, get) => ({
  status: 'absent',
  progress: 0,
  bytesWritten: 0,
  bytesTotal: WHISPER_MODEL.sizeBytes,
  error: null,

  isReady: () => get().status === 'ready',

  check: async () => {
    // Don't second-guess an in-flight/paused download — its file legitimately
    // isn't at the final path yet, and sweeping the partial would corrupt it.
    if (get().status === 'downloading' || get().status === 'paused') return;
    // Sweep away superseded model files (idempotent; a no-op once gone).
    for (const name of LEGACY_FILENAMES) {
      if (name !== WHISPER_MODEL.filename) {
        await FS.deleteAsync(MODELS_DIR + name, { idempotent: true }).catch(
          () => undefined,
        );
      }
    }
    // A file at the final path only ever appears via the completed-download
    // move, so its existence is a trustworthy "ready".
    try {
      const info = await FS.getInfoAsync(MODEL_PATH);
      if (info.exists) {
        set({ status: 'ready' });
        return;
      }
    } catch {
      // fall through to the resume/absent checks below
    }
    // No final file. A resume sidecar + partial means an interrupted download we
    // can continue — surface it as 'paused' with its progress instead of wiping.
    const saved = await readResumeState();
    const partInfo = saved
      ? await FS.getInfoAsync(PART_PATH).catch(() => ({
          exists: false as const,
        }))
      : { exists: false as const };
    if (saved && partInfo.exists) {
      const total = WHISPER_MODEL.sizeBytes;
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
    await FS.deleteAsync(PART_PATH, { idempotent: true }).catch(() => undefined);
    await clearResumeState();
    set({ status: 'absent', progress: 0, bytesWritten: 0 });
  },

  download: async () => {
    if (get().status === 'downloading') return;
    set({ status: 'downloading', error: null });
    try {
      await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(
        () => undefined,
      );
      // Resume when an interrupted attempt left a sidecar + partial; otherwise
      // start clean. Existence of the partial guards against a stale sidecar.
      const saved = await readResumeState();
      const partInfo =
        saved &&
        (await FS.getInfoAsync(PART_PATH).catch(() => ({
          exists: false as const,
        })));
      const resuming = Boolean(saved && partInfo && partInfo.exists);

      let res: FS.FileSystemDownloadResult | undefined;
      if (resuming && saved) {
        resumable = FS.createDownloadResumable(
          WHISPER_MODEL.url,
          PART_PATH,
          saved.options ?? {},
          onProgress(set),
          saved.resumeData,
        );
        await writeResumeState(resumable.savable());
        try {
          res = await resumable.resumeAsync();
        } catch {
          // Resume unsupported here (e.g. iOS after a hard kill, no token) —
          // fall back to a clean restart rather than getting stuck.
          await clearResumeState();
          await FS.deleteAsync(PART_PATH, { idempotent: true }).catch(
            () => undefined,
          );
          set({
            progress: 0,
            bytesWritten: 0,
            bytesTotal: WHISPER_MODEL.sizeBytes,
          });
          resumable = FS.createDownloadResumable(
            WHISPER_MODEL.url,
            PART_PATH,
            {},
            onProgress(set),
          );
          await writeResumeState(resumable.savable());
          res = await resumable.downloadAsync();
        }
      } else {
        await clearResumeState();
        await FS.deleteAsync(PART_PATH, { idempotent: true }).catch(
          () => undefined,
        );
        set({
          progress: 0,
          bytesWritten: 0,
          bytesTotal: WHISPER_MODEL.sizeBytes,
        });
        resumable = FS.createDownloadResumable(
          WHISPER_MODEL.url,
          PART_PATH,
          {},
          onProgress(set),
        );
        await writeResumeState(resumable.savable());
        res = await resumable.downloadAsync();
      }

      // undefined ⇒ the task stopped writing (paused or cancelled). A background
      // pause() keeps the partial + sidecar for a later resume; anything else is
      // a cancel, already cleaned up by cancel().
      if (!res) {
        if (get().status !== 'paused') {
          await clearResumeState();
          await FS.deleteAsync(PART_PATH, { idempotent: true }).catch(
            () => undefined,
          );
          set({ status: 'absent', progress: 0, bytesWritten: 0 });
        }
        return;
      }
      // Publish atomically: only now does a file appear at the final path, so a
      // later check() can trust its existence as a completed download.
      await FS.moveAsync({ from: PART_PATH, to: MODEL_PATH });
      await clearResumeState();
      set({ status: 'ready', progress: 1 });
    } catch (err) {
      // Transient failure: keep the partial + sidecar so RETRY resumes.
      try {
        if (resumable) await writeResumeState(resumable.savable());
      } catch {
        // ignore — worst case retry restarts
      }
      set({ status: 'error', error: String((err as Error)?.message ?? err) });
    } finally {
      resumable = null;
    }
  },

  pause: async () => {
    if (get().status !== 'downloading' || !resumable) return;
    try {
      const state = await resumable.pauseAsync();
      await writeResumeState(state);
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
    await clearResumeState();
    for (const p of [PART_PATH, MODEL_PATH]) {
      try {
        await FS.deleteAsync(p, { idempotent: true });
      } catch {
        // ignore
      }
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0 });
  },

  remove: async () => {
    // Free the native context first so we're not deleting a mapped file.
    await whisperEngine.release().catch(() => undefined);
    await clearResumeState();
    for (const p of [PART_PATH, MODEL_PATH]) {
      try {
        await FS.deleteAsync(p, { idempotent: true });
      } catch {
        // ignore
      }
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0, error: null });
  },

  transcribe: async (audioUri: string, language?: string) => {
    if (get().status !== 'ready') {
      throw new Error('Voice model not downloaded.');
    }
    await whisperEngine.load(MODEL_PATH);
    try {
      return await whisperEngine.transcribe(audioUri, { language });
    } finally {
      // Free the model's memory as soon as the transcript is out. Voice is
      // one-shot dictation, so there's no need to keep Whisper resident — and
      // this stops it co-residing with the ~2.7 GB on-device coach model, which
      // is what would otherwise risk an out-of-memory kill (and blocks moving to
      // a larger, more accurate Whisper model). Reloaded on the next mic tap.
      await whisperEngine.release().catch(() => undefined);
    }
  },
}));
