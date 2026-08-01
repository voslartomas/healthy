import {
  EnergyRecord,
  ExerciseRecord,
  InstantSample,
  RawHealthData,
  SleepRecord,
  StepsRecord,
} from './types';

/**
 * Google Health cloud API (`health.googleapis.com/v4`) data source.
 *
 * This is the CROSS-PLATFORM alternative to the on-device Health Connect module
 * (see {@link ./HealthConnect}). Instead of reading records locally on Android,
 * it fetches the signed-in user's own health data from their Google Health
 * account over an OAuth2 bearer token. It maps every response into the SAME
 * {@link RawHealthData} boundary shape, so the entire correctness-critical
 * derivation layer ({@link ./derive}) — dedup, baselines, readiness — is reused
 * verbatim and stays fully unit-tested.
 *
 * Privacy note (ADR-005): unlike the on-device path, this route reads body data
 * from Google's cloud. It goes device↔Google directly over TLS with explicit
 * user OAuth consent; it never passes through any HealthApp backend (we have
 * none) and no third party beyond Google — with whom the user already stored
 * this data — ever sees it. The read is strictly read-only.
 *
 * Endpoints, field paths, and OAuth scopes mirror the accepted reference
 * dashboard (voslartomas/google-health-web-dashboard) so the wire contract is
 * not guessed. The functions here are deliberately pure + fetch-injectable so
 * the mapping can be tested without network or credentials.
 */

const BASE_URL = 'https://health.googleapis.com/v4';

/** OAuth read scopes required for the metrics the dashboard consumes. */
export const GOOGLE_HEALTH_SCOPES = [
  'openid',
  'profile',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
] as const;

// ---------------------------------------------------------------------------
// Wire types — the subset of the v4 responses we actually read. Mirrors
// google-health-web-dashboard/src/types/health.ts.
// ---------------------------------------------------------------------------

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

interface DataSource {
  device?: { manufacturer?: string; displayName?: string };
  application?: { packageName?: string };
}

interface ListResponse<T> {
  dataPoints?: T[];
  nextPageToken?: string;
}

interface RollupResponse<T> {
  rollupDataPoints?: T[];
}

interface HrvDataPoint {
  dataSource?: DataSource;
  dailyHeartRateVariability?: {
    date: CivilDate;
    averageHeartRateVariabilityMilliseconds?: number;
    deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: number;
  };
}

interface RestingHrDataPoint {
  dataSource?: DataSource;
  dailyRestingHeartRate?: {
    date: CivilDate;
    beatsPerMinute?: string;
  };
}

interface SleepDataPoint {
  dataSource?: DataSource;
  sleep?: {
    interval?: { startTime?: string; endTime?: string };
    summary?: { minutesAsleep?: string };
  };
}

interface StepsRollupDataPoint {
  startTime?: string;
  endTime?: string;
  steps?: { countSum?: string };
}

interface CaloriesRollupDataPoint {
  startTime?: string;
  endTime?: string;
  activeEnergyBurned?: { kcalSum?: number };
  totalCalories?: { kcalSum?: number };
}

interface ExerciseDataPoint {
  exercise?: {
    interval?: { startTime?: string; endTime?: string };
    exerciseType?: string;
    activeDuration?: string;
    metricsSummary?: { caloriesKcal?: number; caloriesBurned?: number };
  };
}

// ---------------------------------------------------------------------------
// Exercise type mapping. Google Health returns STRING enums; our derivation
// (trackedFromExercise) keys off the Health Connect NUMERIC enum ints. This
// table bridges the two so a Google-sourced workout is categorized identically
// to a Health-Connect-sourced one. The five ints that matter to derive.ts are
// STRENGTH_TRAINING=70, WEIGHTLIFTING=65, PILATES=48, YOGA=83, WALKING=79
// (all others fall through to the zone-2 cardio bucket).
// ---------------------------------------------------------------------------

const EXERCISE_TYPE_TO_HC: Record<string, number> = {
  STRENGTH_TRAINING: 70,
  WEIGHTLIFTING: 65,
  PILATES: 48,
  YOGA: 83,
  WALKING: 79,
  RUNNING: 56,
  BIKING: 8,
  SWIMMING: 74,
  HIKING: 37,
  HIIT: 36,
  WORKOUT: 0,
  OTHER: 0,
};

/** Health Connect enum for a Google exercise string; 0 (other/cardio) if unknown. */
export function exerciseTypeToHc(type: string | undefined): number {
  if (!type) return 0;
  return EXERCISE_TYPE_TO_HC[type] ?? 0;
}

// ---------------------------------------------------------------------------
// Time helpers.
// ---------------------------------------------------------------------------

/** A daily metric (HRV/RHR) carries only a civil date — anchor it at noon UTC
 * so it lands unambiguously inside one day bucket regardless of timezone. */
function civilDateToMs(d: CivilDate): number {
  return Date.UTC(d.year, d.month - 1, d.day, 12, 0, 0);
}

/** Parse an RFC3339 timestamp to epoch ms; NaN-safe → null. */
function isoToMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Parse a protobuf duration string like "3600s" or "3600.5s" to minutes. */
function durationToMin(dur: string | undefined): number | null {
  if (!dur) return null;
  const secs = parseFloat(dur);
  return Number.isFinite(secs) ? secs / 60 : null;
}

/** Human-facing source label from a data point's dataSource. */
function sourceLabel(ds: DataSource | undefined): string {
  return (
    ds?.device?.displayName ??
    ds?.device?.manufacturer ??
    ds?.application?.packageName ??
    'Google Health'
  );
}

// ---------------------------------------------------------------------------
// Raw payload bundle → RawHealthData mapping (pure, fully testable).
// ---------------------------------------------------------------------------

export interface GoogleHealthPayloads {
  hrv: HrvDataPoint[];
  restingHr: RestingHrDataPoint[];
  sleep: SleepDataPoint[];
  steps: StepsRollupDataPoint[];
  calories: CaloriesRollupDataPoint[];
  exercise: ExerciseDataPoint[];
}

/**
 * Map raw Google Health v4 payloads into our normalized {@link RawHealthData}.
 *
 * HRV: prefer the explicit RMSSD field
 * (`deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds`) because the
 * derivation layer tags all Android-side HRV as RMSSD and the two algorithms
 * (RMSSD vs the generic average, which is SDNN-like) are NOT interchangeable
 * (HEA-4 landmine). We fall back to the average only when RMSSD is absent — a
 * documented approximation, see ADR-005.
 *
 * Active calories: prefer `activeEnergyBurned` over `totalCalories` (the latter
 * includes BMR and would inflate the "active calories" goal).
 */
export function mapGoogleHealthRaw(
  p: GoogleHealthPayloads,
  now: number,
): RawHealthData {
  const sources = new Set<string>();

  const hrvRmssd: InstantSample[] = [];
  for (const dp of p.hrv) {
    const h = dp.dailyHeartRateVariability;
    if (!h) continue;
    const value =
      h.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ??
      h.averageHeartRateVariabilityMilliseconds;
    if (value == null) continue;
    const source = sourceLabel(dp.dataSource);
    sources.add(source);
    hrvRmssd.push({ value, time: civilDateToMs(h.date), source });
  }

  const restingHr: InstantSample[] = [];
  for (const dp of p.restingHr) {
    const r = dp.dailyRestingHeartRate;
    if (!r?.beatsPerMinute) continue;
    const value = parseFloat(r.beatsPerMinute);
    if (!Number.isFinite(value)) continue;
    const source = sourceLabel(dp.dataSource);
    sources.add(source);
    restingHr.push({ value, time: civilDateToMs(r.date), source });
  }

  const sleep: SleepRecord[] = [];
  for (const dp of p.sleep) {
    const start = isoToMs(dp.sleep?.interval?.startTime);
    const end = isoToMs(dp.sleep?.interval?.endTime);
    if (start == null || end == null || end <= start) continue;
    const asleep = dp.sleep?.summary?.minutesAsleep
      ? parseFloat(dp.sleep.summary.minutesAsleep)
      : NaN;
    const durationMin = Number.isFinite(asleep)
      ? asleep
      : (end - start) / 60000;
    const source = sourceLabel(dp.dataSource);
    sources.add(source);
    sleep.push({ start, end, durationMin, source });
  }

  // Rollups are server-aggregated across sources, so they arrive pre-deduped
  // with a single synthetic origin. Tagging them all 'Google Health' means the
  // dedup layer treats them as one source (no cross-origin double counting).
  const steps: StepsRecord[] = [];
  for (const dp of p.steps) {
    const count = dp.steps?.countSum ? parseInt(dp.steps.countSum, 10) : NaN;
    const start = isoToMs(dp.startTime);
    const end = isoToMs(dp.endTime);
    if (!Number.isFinite(count) || start == null || end == null) continue;
    steps.push({ count, start, end, source: 'Google Health' });
  }

  const activeEnergy: EnergyRecord[] = [];
  for (const dp of p.calories) {
    const kcal = dp.activeEnergyBurned?.kcalSum ?? dp.totalCalories?.kcalSum;
    const start = isoToMs(dp.startTime);
    const end = isoToMs(dp.endTime);
    if (kcal == null || start == null || end == null) continue;
    activeEnergy.push({ kcal, start, end, source: 'Google Health' });
  }

  const exercise: ExerciseRecord[] = [];
  for (const dp of p.exercise) {
    const start = isoToMs(dp.exercise?.interval?.startTime);
    const end = isoToMs(dp.exercise?.interval?.endTime);
    if (start == null || end == null || end <= start) continue;
    const durationMin =
      durationToMin(dp.exercise?.activeDuration) ?? (end - start) / 60000;
    const energyKcal =
      dp.exercise?.metricsSummary?.caloriesKcal ??
      dp.exercise?.metricsSummary?.caloriesBurned ??
      null;
    exercise.push({
      exerciseType: exerciseTypeToHc(dp.exercise?.exerciseType),
      start,
      end,
      durationMin,
      energyKcal,
      source: 'Google Health',
    });
  }

  return {
    hrvRmssd,
    restingHr,
    sleep,
    steps,
    exercise,
    activeEnergy,
    sources: [...sources],
    readAt: now,
  };
}

// ---------------------------------------------------------------------------
// Fetch layer — thin, fetch-injectable, no credential handling of its own.
// ---------------------------------------------------------------------------

/** Minimal fetch signature so tests can inject a stub without a real network. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

function isoDaysAgo(now: number, daysBack: number): string {
  return new Date(now - daysBack * 86_400_000).toISOString().split('T')[0];
}

/** POST body for a 1-day rollup window over the last `daysBack` days. */
function dailyRollupBody(now: number, daysBack: number): string {
  const start = new Date(now - daysBack * 86_400_000);
  const end = new Date(now);
  return JSON.stringify({
    range: {
      start: {
        date: {
          year: start.getUTCFullYear(),
          month: start.getUTCMonth() + 1,
          day: start.getUTCDate(),
        },
        time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
      },
      end: {
        date: {
          year: end.getUTCFullYear(),
          month: end.getUTCMonth() + 1,
          day: end.getUTCDate(),
        },
        time: { hours: 23, minutes: 59, seconds: 59, nanos: 0 },
      },
    },
    windowSizeDays: 1,
  });
}

/**
 * Fetch every supported metric from Google Health and map to RawHealthData.
 * `accessToken` is a valid OAuth2 bearer token for {@link GOOGLE_HEALTH_SCOPES};
 * obtaining it (the OAuth/PKCE flow + keychain storage) is the caller's job and
 * is intentionally NOT bundled here — see {@link ./index} wiring notes.
 *
 * A per-metric fetch that fails degrades only that metric to empty (mirroring
 * the native module's per-type try/catch), so one missing scope never blanks
 * the whole snapshot.
 */
export async function fetchGoogleHealthRaw(
  accessToken: string,
  now: number,
  fetchImpl: FetchLike,
  daysBack = 30,
): Promise<RawHealthData> {
  const auth = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

  async function getList<T>(path: string): Promise<T[]> {
    try {
      const res = await fetchImpl(`${BASE_URL}${path}`, { headers: auth });
      if (!res.ok) return [];
      const body = (await res.json()) as ListResponse<T>;
      return body.dataPoints ?? [];
    } catch {
      return [];
    }
  }

  async function postRollup<T>(path: string): Promise<T[]> {
    try {
      const res = await fetchImpl(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: dailyRollupBody(now, daysBack),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as RollupResponse<T>;
      return body.rollupDataPoints ?? [];
    } catch {
      return [];
    }
  }

  const hrvFilter = encodeURIComponent(
    `daily_heart_rate_variability.date >= "${isoDaysAgo(now, daysBack)}"`,
  );
  const rhrFilter = encodeURIComponent(
    `daily_resting_heart_rate.date >= "${isoDaysAgo(now, daysBack)}"`,
  );
  const sleepFilter = encodeURIComponent(
    `sleep.interval.civil_end_time >= "${isoDaysAgo(now, daysBack)}"`,
  );

  const [hrv, restingHr, sleep, steps, calories, exercise] = await Promise.all([
    getList<HrvDataPoint>(
      `/users/me/dataTypes/daily-heart-rate-variability/dataPoints?filter=${hrvFilter}`,
    ),
    getList<RestingHrDataPoint>(
      `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?filter=${rhrFilter}`,
    ),
    getList<SleepDataPoint>(
      `/users/me/dataTypes/sleep/dataPoints?filter=${sleepFilter}&page_size=20`,
    ),
    postRollup<StepsRollupDataPoint>(
      '/users/me/dataTypes/steps/dataPoints:dailyRollUp',
    ),
    postRollup<CaloriesRollupDataPoint>(
      '/users/me/dataTypes/total-calories/dataPoints:dailyRollUp',
    ),
    getList<ExerciseDataPoint>(
      '/users/me/dataTypes/exercise/dataPoints?page_size=100',
    ),
  ]);

  return mapGoogleHealthRaw(
    { hrv, restingHr, sleep, steps, calories, exercise },
    now,
  );
}
