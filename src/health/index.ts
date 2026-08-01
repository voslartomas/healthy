import { TRACKED } from '../data/goalSources';
import { deriveSnapshot } from './derive';
import {
  fetchGoogleHealthRaw,
  FoodEntryInput,
  writeFoodEntry,
} from './GoogleHealthApi';
import { HealthSnapshot } from './types';

export * from './types';
export { GOOGLE_HEALTH_SCOPES } from './GoogleHealthApi';
export type { FoodEntryInput } from './GoogleHealthApi';

/**
 * Sample fallback snapshot — the numbers transcribed from the design prototype.
 * Used verbatim when the live Google Health cloud source is unavailable (no
 * client ID configured, not connected, or an empty read) so the UI is never
 * blank and looks exactly like the design before the user connects an account.
 */
export const SAMPLE_SNAPSHOT: HealthSnapshot = {
  hrv: { value: 62, baseline: 55, delta: 7, algorithm: 'RMSSD' },
  restingHr: { value: 54, baseline: 55, delta: -1 },
  sleep: { hours: 462 / 60, performancePct: 84, lastSessionEnd: 0 },
  stepsToday: 8400,
  stepsThisWeek: TRACKED.steps,
  readiness: { pct: 68, state: 'Recovered' },
  nutrition: {
    eaten: 1840,
    proteinG: 128,
    carbsG: 172,
    fatG: 48,
    meals: [
      { name: 'Greek yogurt & berries', mealType: 'BREAKFAST', kcal: 320, time: 0 },
      { name: 'Chicken & rice bowl', mealType: 'LUNCH', kcal: 640, time: 0 },
      { name: 'Protein shake', mealType: 'SNACK', kcal: 220, time: 0 },
    ],
  },
  tracked: { ...TRACKED },
  sources: ['Apple Watch', 'Oura Ring', 'Withings scale'],
  readAt: 0,
  live: false,
};

function hasAnyMetric(s: HealthSnapshot): boolean {
  return (
    s.hrv != null ||
    s.restingHr != null ||
    s.sleep != null ||
    s.stepsThisWeek > 0 ||
    s.nutrition != null
  );
}

/**
 * OAuth access-token provider for the Google Health cloud source. The OAuth /
 * PKCE flow lives in {@link ./googleAuth} (it needs the platform keychain and a
 * Google client ID) and registers a getter here on app start via
 * {@link setGoogleHealthTokenProvider}. Until then this stays null and every
 * read cleanly falls back to {@link SAMPLE_SNAPSHOT}.
 */
type TokenProvider = () => Promise<string | null>;
let googleTokenProvider: TokenProvider | null = null;

export function setGoogleHealthTokenProvider(fn: TokenProvider | null): void {
  googleTokenProvider = fn;
}

/** True once a Google Health token provider has been registered. */
export function isGoogleHealthConfigured(): boolean {
  return googleTokenProvider != null;
}

/**
 * Read the current health snapshot from the Google Health cloud API, falling
 * back to {@link SAMPLE_SNAPSHOT} whenever the source is unavailable: no token
 * provider, not signed in, a failed request, or a read that surfaced no usable
 * metric. This is the single live source — the app is platform-agnostic (the
 * REST API behaves identically on iOS and Android), so there is no native path.
 */
export async function readSnapshot(now: number): Promise<HealthSnapshot> {
  if (!googleTokenProvider) return SAMPLE_SNAPSHOT;

  try {
    const token = await googleTokenProvider();
    if (!token) return SAMPLE_SNAPSHOT;
    const raw = await fetchGoogleHealthRaw(token, now, fetch as never);
    const snapshot = deriveSnapshot(raw, now);
    return hasAnyMetric(snapshot) ? snapshot : SAMPLE_SNAPSHOT;
  } catch (err) {
    console.warn('Google Health read failed; using sample data', err);
    return SAMPLE_SNAPSHOT;
  }
}

/**
 * Log a food entry to the signed-in user's Google Health nutrition log.
 * Returns false (a no-op) when not connected — the caller surfaces that. This is
 * the only WRITE the app performs, and only for user-authored food data.
 */
export async function logFood(
  input: FoodEntryInput,
  now: number = Date.now(),
): Promise<boolean> {
  if (!googleTokenProvider) return false;
  const token = await googleTokenProvider();
  if (!token) return false;
  return writeFoodEntry(token, input, now, fetch as never);
}
