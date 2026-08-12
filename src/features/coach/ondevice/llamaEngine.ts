/**
 * Thin, mockable wrapper over `llama.rn` (llama.cpp bindings) for on-device
 * Gemma inference.
 *
 * The rest of the app depends only on the {@link OnDeviceEngine} interface, so
 * the native runtime is injectable — the runner takes an engine, and unit tests
 * pass a scripted fake, never touching `llama.rn`. `llama.rn` itself is
 * `require`d lazily inside {@link load} (the type import below is erased at
 * compile time), so importing this module is inert on web and under Jest.
 *
 * A single `LlamaContext` is held and reused; loading the same model path twice
 * is a no-op, and switching models releases the previous context first (only
 * one multi-GB model should ever be resident).
 */

import type { LlamaContext } from 'llama.rn';

export interface CompleteOptions {
  /** GBNF grammar constraining the output (see models.ts ACTION_GRAMMAR). */
  grammar?: string;
  /** Stop sequences that end generation. */
  stop?: string[];
  /** Max tokens to predict. */
  nPredict?: number;
  temperature?: number;
}

/** The inference surface the coach depends on. Implemented by
 * {@link llamaEngine} (real) and by fakes in tests. */
export interface OnDeviceEngine {
  /** Load a GGUF model from an absolute file path. No-op if already loaded. */
  load(modelPath: string, onProgress?: (pct: number) => void): Promise<void>;
  /** Run one completion and return the raw generated text. */
  complete(prompt: string, opts?: CompleteOptions): Promise<string>;
  /** Release the native context and free the model's memory. */
  release(): Promise<void>;
  /** True when a model (optionally the one at `path`) is loaded. */
  isLoaded(path?: string): boolean;
}

/** Context window. Gemma 3 supports far more, but 4096 keeps memory bounded and
 * is ample for a short coaching chat plus tool results. */
const N_CTX = 4096;

class LlamaEngine implements OnDeviceEngine {
  private ctx: LlamaContext | null = null;
  private loadedPath: string | null = null;
  /**
   * Serializes every native context operation (load / complete / release). A
   * `LlamaContext` runs ONE generation at a time — overlapping callers (e.g. the
   * startup daily brief and the first chat message, or two rapid sends) would
   * otherwise make llama.rn throw "Exception in host function: context is busy".
   * Ops queue on this tail promise and run strictly one after another.
   */
  private lock: Promise<unknown> = Promise.resolve();

  /** Run `fn` once all previously-queued context ops have settled. Serializes
   * access so no two operations ever touch the context concurrently. */
  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.lock.then(fn);
    // Keep the queue moving even if this op rejects; the caller still sees it.
    this.lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  isLoaded(path?: string): boolean {
    if (!this.ctx) return false;
    return path == null || this.loadedPath === path;
  }

  async load(
    modelPath: string,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    // Fast path: already loaded ⇒ don't queue behind an in-flight completion.
    if (this.isLoaded(modelPath)) return;
    await this.withLock(async () => {
      // Re-check under the lock — a concurrent load may have finished first.
      if (this.isLoaded(modelPath)) return;
      if (this.ctx) await this.releaseCtx();
      // Lazy require so the native module is only pulled in on a real device
      // when the user actually runs the on-device coach.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load
      const { initLlama } = require('llama.rn') as typeof import('llama.rn');
      this.ctx = await initLlama(
        {
          model: modelPath,
          n_ctx: N_CTX,
          // Offload as many layers as the device's GPU/NPU allows; llama.cpp
          // clamps this to what fits.
          n_gpu_layers: 99,
        },
        onProgress ? p => onProgress(p) : undefined,
      );
      this.loadedPath = modelPath;
    });
  }

  async complete(prompt: string, opts: CompleteOptions = {}): Promise<string> {
    return this.withLock(async () => {
      if (!this.ctx) throw new Error('No model loaded — call load() first.');
      const res = await this.ctx.completion({
        prompt,
        grammar: opts.grammar,
        stop: opts.stop,
        n_predict: opts.nPredict ?? 1024,
        temperature: opts.temperature ?? 0.3,
      });
      return res.text ?? '';
    });
  }

  async release(): Promise<void> {
    await this.withLock(() => this.releaseCtx());
  }

  /** Free the context. Assumes the caller already holds {@link lock}. */
  private async releaseCtx(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    this.loadedPath = null;
    if (ctx) await ctx.release();
  }
}

/** Process-wide singleton engine used by the runner. */
export const llamaEngine: OnDeviceEngine = new LlamaEngine();
