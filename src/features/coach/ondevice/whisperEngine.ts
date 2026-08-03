/**
 * Thin, mockable wrapper over `whisper.rn` (whisper.cpp bindings) for on-device
 * speech-to-text.
 *
 * The rest of the app depends only on the {@link SpeechToText} interface, so the
 * native runtime is injectable — callers take an engine, and unit tests pass a
 * scripted fake, never touching `whisper.rn`. `whisper.rn` is `require`d lazily
 * inside {@link load} (the type import below is erased at compile time), so
 * importing this module is inert on web and under Jest.
 *
 * A single `WhisperContext` is held and reused; loading the same model twice is
 * a no-op, and switching models releases the previous context first. Mirrors the
 * inference-side {@link ./llamaEngine} for the coach's language model.
 */

/**
 * Minimal local shape of the `whisper.rn` surface we use. The full types live in
 * the package, but its `exports` map omits the root (`.`) entry, so importing
 * from the bare `whisper.rn` specifier fails under TS's bundler resolution
 * (Metro falls back to `main` at runtime). Modelling just `initWhisper` and the
 * two context calls we need keeps us decoupled from that packaging quirk.
 */
interface WhisperCtx {
  transcribe(
    path: string,
    opts: { language?: string; temperature?: number; beamSize?: number },
  ): { stop: () => Promise<void>; promise: Promise<{ result: string }> };
  release(): Promise<void>;
}
interface WhisperModule {
  initWhisper(opts: {
    filePath: string;
    useGpu?: boolean;
  }): Promise<WhisperCtx>;
}

/** The speech-to-text surface the coach depends on. Implemented by
 * {@link whisperEngine} (real) and by fakes in tests. */
export interface SpeechToText {
  /** Load a GGML Whisper model from an absolute file path. No-op if already
   * loaded. */
  load(modelPath: string): Promise<void>;
  /** Transcribe an audio file (16 kHz mono WAV) and return the decoded text.
   * `language` is a Whisper code (e.g. `'en'`) or `'auto'` to autodetect. */
  transcribe(audioPath: string, opts?: { language?: string }): Promise<string>;
  /** Release the native context and free the model's memory. */
  release(): Promise<void>;
  /** True when a model (optionally the one at `path`) is loaded. */
  isLoaded(path?: string): boolean;
}

class WhisperEngine implements SpeechToText {
  private ctx: WhisperCtx | null = null;
  private loadedPath: string | null = null;
  /** De-dupes concurrent loads of the same path. */
  private loading: Promise<void> | null = null;

  isLoaded(path?: string): boolean {
    if (!this.ctx) return false;
    return path == null || this.loadedPath === path;
  }

  async load(modelPath: string): Promise<void> {
    if (this.isLoaded(modelPath)) return;
    if (this.loading) await this.loading;
    if (this.isLoaded(modelPath)) return;

    this.loading = (async () => {
      if (this.ctx) await this.release();
      // Lazy require so the native module is only pulled in on a real device
      // when the user actually uses voice input.
      // Require the explicit `/index` subpath: whisper.rn's `exports` map covers
      // `./*` but not the root, so the bare specifier fails to resolve (under
      // Node and Metro's package-exports) while `whisper.rn/index` resolves.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load
      const { initWhisper } = require('whisper.rn/index') as WhisperModule;
      // useGpu enables Metal on iOS (and is ignored elsewhere); no Core ML model
      // is bundled, so GPU is the acceleration path.
      this.ctx = await initWhisper({ filePath: modelPath, useGpu: true });
      this.loadedPath = modelPath;
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  async transcribe(
    audioPath: string,
    opts: { language?: string } = {},
  ): Promise<string> {
    if (!this.ctx) throw new Error('No speech model loaded — call load() first.');
    const { promise } = this.ctx.transcribe(audioPath, {
      language: opts.language ?? 'auto',
      // Deterministic decoding plus a small beam search: both lift accuracy on
      // short utterances at a modest cost, which is fine for one-shot dictation.
      temperature: 0,
      beamSize: 2,
    });
    const { result } = await promise;
    return result.trim();
  }

  async release(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    this.loadedPath = null;
    if (ctx) await ctx.release();
  }
}

/** Process-wide singleton engine used by the coach's voice input. */
export const whisperEngine: SpeechToText = new WhisperEngine();
