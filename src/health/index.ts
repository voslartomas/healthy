import { deriveSnapshot } from './derive';
import {
  createFoodEntry,
  deleteFoodEntry,
  fetchGoogleHealthRaw,
  FoodEntryInput,
  FoodLogResult,
  FULL_WINDOWS,
  RawFetchWindows,
  writeFoodEntry,
} from './GoogleHealthApi';
import { HealthSnapshot, RawHealthData } from './types';

export * from './types';
export { deriveSnapshot, mergeRaw } from './derive';
export {
  GOOGLE_HEALTH_SCOPES,
  FULL_WINDOWS,
  LIGHT_WINDOWS,
} from './GoogleHealthApi';
export type {
  FoodEntryInput,
  FoodLogResult,
  RawFetchWindows,
} from './GoogleHealthApi';

/**
 * Empty snapshot — every metric null/zero. Used whenever the live Google
 * Health cloud source is unavailable (not connected, failed read) so the UI
 * only ever shows real data and renders "-" for anything missing.
 */
export const EMPTY_SNAPSHOT: HealthSnapshot = {
  hrv: null,
  restingHr: null,
  sleep: null,
  stepsToday: 0,
  stepsThisWeek: 0,
  readiness: null,
  nutrition: null,
  energyBurnedToday: 0,
  activities: [],
  cardio: {
    todayLoad: 0,
    weekLoad: 0,
    zones7d: { lightMin: 0, moderateMin: 0, vigorousMin: 0, peakMin: 0 },
    daily: [],
    hasZoneData: false,
  },
  activityOptions: [],
  weeklyHistory: [],
  dailyEnergy: [],
  trends: {
    hrv: [],
    restingHr: [],
    sleepHours: [],
    sleepQuality: [],
    readiness: [],
    weight: [],
    bodyFat: [],
  },
  tracked: {},
  sources: [],
  readAt: 0,
  live: false,
};

/**
 * OAuth access-token provider for the Google Health cloud source. The native
 * sign-in flow lives in {@link ./googleAuth} and registers a getter here on app
 * start via {@link setGoogleHealthTokenProvider}. Until then this stays null
 * and every read returns {@link EMPTY_SNAPSHOT}.
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
 * Read the current health snapshot from the Google Health cloud API, returning
 * {@link EMPTY_SNAPSHOT} whenever the source is unavailable: no token provider,
 * not signed in, or a failed request. This is the single live source — the app
 * is platform-agnostic (the REST API behaves identically on iOS and Android),
 * so there is no native path.
 */
export async function readSnapshot(now: number): Promise<HealthSnapshot> {
  const raw = await fetchRaw(now, FULL_WINDOWS);
  if (!raw) return EMPTY_SNAPSHOT;
  return deriveSnapshot(raw, now);
}

/**
 * Fetch RAW multi-source records over the given {@link RawFetchWindows}, or null
 * when the source is unavailable (no provider, not signed in, or the request
 * threw). Returning raw — not a derived snapshot — is what lets the store cache
 * the deep-history read and splice a light recent read onto it
 * ({@link ./derive.mergeRaw}) instead of re-pulling everything each refresh.
 */
export async function fetchRaw(
  now: number,
  windows: RawFetchWindows = FULL_WINDOWS,
): Promise<RawHealthData | null> {
  if (!googleTokenProvider) {
    console.warn(
      '[GoogleHealth] no token provider registered — empty snapshot',
    );
    return null;
  }
  try {
    const token = await googleTokenProvider();
    if (!token) {
      console.warn(
        '[GoogleHealth] no access token (not signed in) — empty snapshot',
      );
      return null;
    }
    const raw = await fetchGoogleHealthRaw(token, now, fetch as never, windows);
    console.log('[GoogleHealth] raw counts', {
      exercise: raw.exercise.length,
      steps: raw.steps.length,
      totalEnergy: raw.totalEnergy.length,
      nutrition: raw.nutrition.length,
      windows,
    });
    return raw;
  } catch (err) {
    console.warn('[GoogleHealth] read failed', err);
    return null;
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

/**
 * Like {@link logFood} but returns the created entry's resource id (when the API
 * echoes it) so the caller can later edit or delete it. Returns `{ok:false}`
 * when not connected.
 */
export async function logFoodEntry(
  input: FoodEntryInput,
  now: number = Date.now(),
): Promise<FoodLogResult> {
  if (!googleTokenProvider) return { ok: false, error: 'not-connected' };
  const token = await googleTokenProvider();
  if (!token) return { ok: false, error: 'not-signed-in' };
  return createFoodEntry(token, input, now, fetch as never);
}

/**
 * Delete a previously logged food entry by its resource name. Returns false
 * when not connected or the delete failed.
 */
export async function removeFoodEntry(name: string): Promise<boolean> {
  if (!googleTokenProvider) return false;
  const token = await googleTokenProvider();
  if (!token) return false;
  return deleteFoodEntry(token, name, fetch as never);
}
