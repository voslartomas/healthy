/**
 * Thin, mockable wrapper over the `SystemLlm` native module (modules/system-llm)
 * — the operating system's own on-device language model (ADR-008):
 *
 *  - Android: Gemini Nano via AICore (ML Kit GenAI Prompt API);
 *  - iOS: Apple Intelligence via the Foundation Models framework (iOS 26+).
 *
 * The OS owns the model: there is no weights download of ours, and inference
 * never leaves the device. Devices without it (older or mid-range phones, iOS
 * < 26, Apple Intelligence switched off) report `unavailable` and the coach says
 * so — there is deliberately no fallback model (ADR-008).
 *
 * The native module is resolved lazily at call time, so importing this file is
 * inert under Jest and on web; there `nativeModule()` is null and every call
 * degrades to "unavailable". The rest of the app depends only on the
 * {@link SystemModelEngine} interface, so tests inject a scripted fake.
 */

/** What the OS model can do right now. */
export type SystemModelStatus =
  | 'available'
  /** Supported, but the model isn't on the device yet; `download()` fetches it
   * (Android). */
  | 'downloadable'
  /** The OS is fetching or updating it (Android download, or iOS preparing
   * Apple Intelligence). */
  | 'downloading'
  | 'unavailable';

/** Why the model is unavailable, for the Settings copy. */
export type UnavailableReason =
  /** The phone can't run it (hardware / region / unsupported model). */
  | 'deviceNotEligible'
  /** iOS: Apple Intelligence is switched off in Settings. */
  | 'notEnabled'
  /** iOS older than 26. */
  | 'osTooOld'
  /** The OS service errored (e.g. AICore not initialised yet on a fresh device). */
  | 'error'
  /** The native module isn't in this build (Jest, web, an outdated dev client). */
  | 'missing';

export interface SystemModelInfo {
  status: SystemModelStatus;
  reason?: UnavailableReason | null;
  /** Human-readable model name ("Gemini Nano", "Apple Intelligence"). */
  modelName: string;
  /** The underlying error text, when `reason` is `error`. */
  message?: string | null;
}

export interface GenerateOptions {
  temperature?: number;
  /** Cap on generated tokens; both OS models top out around 4K. */
  maxOutputTokens?: number;
}

/** The inference surface the coach depends on. Implemented by
 * {@link systemModelEngine} (real) and by fakes in tests. */
export interface SystemModelEngine {
  status(): Promise<SystemModelInfo>;
  /** Ask the OS to fetch the model; resolves once it's done. `onProgress`
   * receives bytes downloaded so far (Android only — total isn't reported). */
  download(onProgress?: (bytes: number) => void): Promise<void>;
  /** Load the model ahead of the first request. Best-effort. */
  warmup(): Promise<void>;
  /** One stateless completion: `system` as the instructions, `prompt` as the
   * user text. Returns the generated text. */
  generate(
    system: string,
    prompt: string,
    opts?: GenerateOptions,
  ): Promise<string>;
}

interface NativeSystemLlm {
  status(): Promise<{
    status: string;
    reason?: string | null;
    modelName?: string;
    message?: string | null;
  }>;
  download(): Promise<boolean>;
  warmup(): Promise<boolean>;
  generate(
    system: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<string>;
  addListener(
    event: 'onDownloadProgress',
    cb: (e: { bytes: number }) => void,
  ): { remove(): void };
}

let cached: NativeSystemLlm | null | undefined;

/** The native module, or null when this build doesn't have it. */
function nativeModule(): NativeSystemLlm | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    cached = requireOptionalNativeModule<NativeSystemLlm>('SystemLlm');
  } catch {
    cached = null;
  }
  return cached;
}

const STATUSES: readonly SystemModelStatus[] = [
  'available',
  'downloadable',
  'downloading',
  'unavailable',
];

class NativeSystemModelEngine implements SystemModelEngine {
  async status(): Promise<SystemModelInfo> {
    const mod = nativeModule();
    if (!mod) {
      return {
        status: 'unavailable',
        reason: 'missing',
        modelName: 'On-device AI',
      };
    }
    try {
      const raw = await mod.status();
      const status = STATUSES.includes(raw.status as SystemModelStatus)
        ? (raw.status as SystemModelStatus)
        : 'unavailable';
      return {
        status,
        reason: (raw.reason as UnavailableReason | null | undefined) ?? null,
        modelName: raw.modelName ?? 'On-device AI',
        message: raw.message ?? null,
      };
    } catch (err) {
      return {
        status: 'unavailable',
        reason: 'error',
        modelName: 'On-device AI',
        message: String((err as Error)?.message ?? err),
      };
    }
  }

  async download(onProgress?: (bytes: number) => void): Promise<void> {
    const mod = nativeModule();
    if (!mod) throw new Error('On-device AI is not available in this build.');
    const sub = onProgress
      ? mod.addListener('onDownloadProgress', e => onProgress(e.bytes))
      : null;
    try {
      await mod.download();
    } finally {
      sub?.remove();
    }
  }

  async warmup(): Promise<void> {
    await nativeModule()
      ?.warmup()
      .catch(() => false);
  }

  async generate(
    system: string,
    prompt: string,
    opts: GenerateOptions = {},
  ): Promise<string> {
    const mod = nativeModule();
    if (!mod) throw new Error('On-device AI is not available in this build.');
    return mod.generate(system, prompt, {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 512,
    });
  }
}

/** Process-wide engine used by the runner and the model store. */
export const systemModelEngine: SystemModelEngine =
  new NativeSystemModelEngine();
