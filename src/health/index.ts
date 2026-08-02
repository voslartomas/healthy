import { deriveSnapshot } from './derive';
import {
  createFoodEntry,
  deleteFoodEntry,
  fetchGoogleHealthRaw,
  FoodEntryInput,
  FoodLogResult,
  writeFoodEntry,
} from './GoogleHealthApi';
import { HealthSnapshot } from './types';

export * from './types';
export { GOOGLE_HEALTH_SCOPES } from './GoogleHealthApi';
export type { FoodEntryInput, FoodLogResult } from './GoogleHealthApi';

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
  trends: { hrv: [], restingHr: [], sleepHours: [], readiness: [] },
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
  if (!googleTokenProvider) {
    console.warn('[GoogleHealth] no token provider registered — empty snapshot');
    return EMPTY_SNAPSHOT;
  }

  try {
    const token = await googleTokenProvider();
    if (!token) {
      console.warn('[GoogleHealth] no access token (not signed in) — empty snapshot');
      return EMPTY_SNAPSHOT;
    }
    console.log('[GoogleHealth] got access token, fetching…');
    const raw = await fetchGoogleHealthRaw(token, now, fetch as never);
    console.log('[GoogleHealth] raw counts', {
      hrv: raw.hrvRmssd.length,
      restingHr: raw.restingHr.length,
      sleep: raw.sleep.length,
      steps: raw.steps.length,
      exercise: raw.exercise.length,
      activeEnergy: raw.activeEnergy.length,
      nutrition: raw.nutrition.length,
      sources: raw.sources,
    });
    const snapshot = deriveSnapshot(raw, now);
    console.log('[GoogleHealth] derived snapshot', {
      hrv: snapshot.hrv?.value ?? null,
      restingHr: snapshot.restingHr?.value ?? null,
      sleepH: snapshot.sleep?.hours ?? null,
      stepsWeek: snapshot.stepsThisWeek,
      readiness: snapshot.readiness?.pct ?? null,
      nutrition: snapshot.nutrition?.eaten ?? null,
      live: snapshot.live,
    });
    console.log('[GoogleHealth] cardio', {
      hasZoneData: snapshot.cardio.hasZoneData,
      weekLoad: snapshot.cardio.weekLoad,
      zones7d: snapshot.cardio.zones7d,
    });
    return snapshot;
  } catch (err) {
    console.warn('[GoogleHealth] read failed', err);
    return EMPTY_SNAPSHOT;
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
