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

export type WhisperStatus = 'absent' | 'downloading' | 'ready' | 'error';

const MODELS_DIR = `${FS.documentDirectory ?? ''}models/`;
const MODEL_PATH = MODELS_DIR + WHISPER_MODEL.filename;

/** In-flight resumable handle, kept out of store state (not serializable). */
let resumable: FS.DownloadResumable | null = null;

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
  /** Download the model, streaming progress into the store. */
  download: () => Promise<void>;
  /** Cancel an in-flight download and discard the partial file. */
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
    try {
      const info = await FS.getInfoAsync(MODEL_PATH);
      set({ status: info.exists ? 'ready' : 'absent' });
    } catch {
      set({ status: 'absent' });
    }
  },

  download: async () => {
    if (get().status === 'downloading') return;
    set({
      status: 'downloading',
      progress: 0,
      bytesWritten: 0,
      bytesTotal: WHISPER_MODEL.sizeBytes,
      error: null,
    });
    try {
      await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true }).catch(
        () => undefined,
      );
      resumable = FS.createDownloadResumable(
        WHISPER_MODEL.url,
        MODEL_PATH,
        {},
        p => {
          const total =
            p.totalBytesExpectedToWrite > 0
              ? p.totalBytesExpectedToWrite
              : WHISPER_MODEL.sizeBytes;
          set({
            bytesWritten: p.totalBytesWritten,
            bytesTotal: total,
            progress: total > 0 ? p.totalBytesWritten / total : 0,
          });
        },
      );
      const res = await resumable.downloadAsync();
      // A cancelled download resolves to undefined.
      if (!res) {
        set({ status: 'absent', progress: 0, bytesWritten: 0 });
        return;
      }
      set({ status: 'ready', progress: 1 });
    } catch (err) {
      set({ status: 'error', error: String((err as Error)?.message ?? err) });
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
      await FS.deleteAsync(MODEL_PATH, { idempotent: true });
    } catch {
      // ignore
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0 });
  },

  remove: async () => {
    // Free the native context first so we're not deleting a mapped file.
    await whisperEngine.release().catch(() => undefined);
    try {
      await FS.deleteAsync(MODEL_PATH, { idempotent: true });
    } catch {
      // ignore
    }
    set({ status: 'absent', progress: 0, bytesWritten: 0, error: null });
  },

  transcribe: async (audioUri: string, language?: string) => {
    if (get().status !== 'ready') {
      throw new Error('Voice model not downloaded.');
    }
    await whisperEngine.load(MODEL_PATH);
    return whisperEngine.transcribe(audioUri, { language });
  },
}));
