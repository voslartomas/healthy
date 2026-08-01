/**
 * On-device speech-to-text — clean TypeScript contract over a native whisper.cpp bridge.
 *
 * PRIVACY INVARIANT (non-negotiable): every implementation of this interface runs
 * inference fully on-device. No method here accepts a network sink, and no
 * implementation may transmit audio, PCM, or intermediate features off the device.
 * Model *weights* are downloaded over HTTPS (see ModelManager); user audio is not.
 *
 * See ADR-0001 and docs/spikes/HEA-3-whisper-viability.md for the runtime decision
 * and the benchmark data behind it.
 */

/** English-only models are the committed set: our users log in English and *.en
 *  is materially more accurate on short utterances than the multilingual variants. */
export type WhisperModelId = 'tiny.en' | 'base.en' | 'small.en';

/** q5_0 is the shipping default (best size/accuracy trade on mid-range); f16 for
 *  reference/QA only. Chosen per HEA-3 benchmarks. */
export type Quantization = 'q5_0' | 'q8_0' | 'f16';

export interface ModelDescriptor {
  id: WhisperModelId;
  quant: Quantization;
  /** Size on disk in bytes — surfaced to the user before download. */
  sizeBytes: number;
  /** Integrity check; download is rejected on mismatch. */
  sha256: string;
}

export interface Progress {
  /** 0..1 */
  fraction: number;
}

export interface DownloadOptions {
  onProgress?: (p: Progress) => void;
  /** Cancels an in-flight download; the partial file is discarded. */
  signal?: AbortSignal;
}

/** Storage + lifecycle for model weights. Downloads are resumable and integrity-checked. */
export interface ModelManager {
  isInstalled(model: WhisperModelId, quant: Quantization): Promise<boolean>;
  /** Ensures the model is present locally, downloading if needed. Idempotent. */
  ensure(
    model: WhisperModelId,
    quant: Quantization,
    opts?: DownloadOptions,
  ): Promise<ModelDescriptor>;
  remove(model: WhisperModelId, quant: Quantization): Promise<void>;
  /** Absolute on-device path, or null if not installed. */
  localPath(model: WhisperModelId, quant: Quantization): Promise<string | null>;
  /** Total bytes used by installed models — for a "manage storage" screen. */
  bytesOnDisk(): Promise<number>;
}

export interface TranscribeOptions {
  /** Locked to English; translate is intentionally unsupported (privacy + accuracy). */
  language?: 'en';
  /** Native inference threads. Default: min(4, big-core count). More is not always faster. */
  maxThreads?: number;
  /** Reports decode progress 0..1 so the UI can show a determinate spinner. */
  onProgress?: (p: Progress) => void;
  /** Cancellation — frees the native context and returns a rejected promise. */
  signal?: AbortSignal;
}

export interface TranscriptSegment {
  t0Ms: number;
  t1Ms: number;
  text: string;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  audioDurationMs: number;
  /** Wall-clock inference time — logged locally for on-device perf telemetry only. */
  inferenceMs: number;
  model: WhisperModelId;
  quant: Quantization;
}

/**
 * The transcription surface the app talks to. Batch (record-then-transcribe) only —
 * see HEA-3: live streaming on mid-range Android is ~5x slower than real-time and is
 * out of scope for voice food/activity logging.
 */
export interface SpeechToText {
  readonly models: ModelManager;

  /** Transcribe a finished recording. `wavPath` must be 16 kHz mono PCM WAV on-device. */
  transcribeFile(
    wavPath: string,
    model: WhisperModelId,
    quant: Quantization,
    opts?: TranscribeOptions,
  ): Promise<TranscriptResult>;

  /** Transcribe already-decoded PCM (e.g. straight from the recorder ring buffer). */
  transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    model: WhisperModelId,
    quant: Quantization,
    opts?: TranscribeOptions,
  ): Promise<TranscriptResult>;
}
