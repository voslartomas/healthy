import {
  EnergyRecord,
  ExerciseRecord,
  InstantSample,
  NutritionEntry,
  RawHealthData,
  SleepRecord,
  SleepStages,
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

/**
 * OAuth scopes. Reads cover every dashboard metric plus nutrition; the one
 * WRITE scope (`nutrition`, non-readonly) is what lets the user log food back to
 * their own Google Health account. Writing is limited to nutrition on purpose —
 * we never write derived body metrics (HRV/RHR/sleep), only the user's own
 * food log, which they authored (privacy boundary; see ADR-005 §write).
 */
export const GOOGLE_HEALTH_SCOPES = [
  'openid',
  'profile',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  // Nutrition has no `.readonly` scope in the v4 API — only `.writeonly`, which
  // covers adding food entries plus reading/editing/deleting the ones we added.
  'https://www.googleapis.com/auth/googlehealth.nutrition.writeonly',
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

interface SleepStageSummaryEntry {
  type?: string;
  minutes?: string;
  count?: string;
}

interface SleepDataPoint {
  dataSource?: DataSource;
  sleep?: {
    interval?: { startTime?: string; endTime?: string };
    type?: string;
    stages?: { startTime?: string; endTime?: string; type?: string }[];
    summary?: {
      minutesAsleep?: string;
      minutesInSleepPeriod?: string;
      minutesAwake?: string;
      stagesSummary?: SleepStageSummaryEntry[];
    };
  };
}

/** A civil (wall-clock) date-time — the rollup endpoints return these instead
 * of RFC3339 `startTime`/`endTime`. `time` may be empty (⇒ midnight). */
interface CivilDateTime {
  date?: CivilDate;
  time?: { hours?: number; minutes?: number; seconds?: number; nanos?: number };
}

interface StepsRollupDataPoint {
  startTime?: string;
  endTime?: string;
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  steps?: { countSum?: string };
}

/** A kcal sum as the API returns it: a bare number, a numeric string, or an
 * object carrying `parsedValue`/`source`. Mirrors the reference dashboard's
 * KcalValue + kcalValue() extractor. */
type KcalSum = number | string | { parsedValue?: number; source?: string } | null | undefined;

interface KcalField {
  kcalSum?: KcalSum;
}

/** A daily-rollup calories point. The sum lands under one of several field
 * names depending on the source; we read whichever is present (total first). */
interface CaloriesRollupDataPoint {
  startTime?: string;
  endTime?: string;
  civilStartTime?: CivilDateTime;
  civilEndTime?: CivilDateTime;
  totalCalories?: KcalField;
  totalEnergyBurned?: KcalField;
  energy?: KcalField;
  calories?: KcalField;
  activeCaloriesBurned?: KcalField;
  activeEnergyBurned?: KcalField;
}

interface ExerciseDataPoint {
  /** Some sources put the localized title at the top level of the point. */
  displayName?: string;
  exercise?: {
    interval?: { startTime?: string; endTime?: string };
    exerciseType?: string;
    /** Localized workout title, e.g. "Trénink středu těla" / "Posilování". */
    displayName?: string;
    activeDuration?: string;
    metricsSummary?: {
      caloriesKcal?: number;
      caloriesBurned?: number;
      activeZoneMinutes?: string;
      averageHeartRateBeatsPerMinute?: string;
      heartRateZoneDurations?: {
        lightTime?: string;
        moderateTime?: string;
        vigorousTime?: string;
        peakTime?: string;
      };
    };
  };
}

/** A `nutrition-log` data point. Field paths mirror the reference dashboard's
 * NutritionDataPoint (google-health-web-dashboard/src/types/health.ts). */
interface NutritionDataPoint {
  /** Data point resource name (id), e.g. "users/me/.../dataPoints/{id}". */
  name?: string;
  dataSource?: DataSource;
  nutritionLog?: {
    interval?: { startTime?: string; endTime?: string };
    energy?: { kcal?: number };
    totalCarbohydrate?: { grams?: number };
    totalFat?: { grams?: number };
    totalProtein?: { grams?: number };
    nutrients?: { nutrient?: string; quantity?: { grams?: number; kcal?: number } }[];
    mealType?: string;
    foodDisplayName?: string;
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

/** A civil date-time (rollup start/end) → epoch ms. Empty `time` ⇒ midnight.
 * Anchored in UTC to match the day-bucket math in derive.ts. */
function civilToMs(c: CivilDateTime | undefined): number | null {
  if (!c?.date) return null;
  const t = c.time ?? {};
  return Date.UTC(
    c.date.year,
    c.date.month - 1,
    c.date.day,
    t.hours ?? 0,
    t.minutes ?? 0,
    t.seconds ?? 0,
  );
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

/** Coerce a `kcalSum` value to a number: a bare number, a numeric string, or an
 * object carrying `parsedValue`/`source`. 0 when absent/unparseable. Mirrors the
 * reference dashboard's kcalValue() exactly. */
function kcalValue(v: KcalSum): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') return Number(v) || 0;
  if (v && typeof v === 'object') {
    if (typeof v.parsedValue === 'number') return v.parsedValue;
    if (typeof v.source === 'string') return Number(v.source) || 0;
  }
  return 0;
}

/** Per-stage sleep minutes from a `stagesSummary` array, or null when the
 * source reported no hypnogram. Entries are {type: DEEP|REM|LIGHT|AWAKE,
 * minutes: string}. */
function sleepStages(
  summary: SleepStageSummaryEntry[] | undefined,
): SleepStages | null {
  if (!summary || summary.length === 0) return null;
  const min = (type: string): number => {
    const hit = summary.find(s => s.type?.toUpperCase() === type);
    const n = hit?.minutes ? parseFloat(hit.minutes) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  return {
    deepMin: min('DEEP'),
    remMin: min('REM'),
    lightMin: min('LIGHT'),
    awakeMin: min('AWAKE'),
  };
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
  nutrition: NutritionDataPoint[];
}

/** Grams for a named nutrient, checking the explicit total field first then the
 * generic `nutrients[]` array (Google returns protein either way). */
function nutrientGrams(
  log: NonNullable<NutritionDataPoint['nutritionLog']>,
  total: number | undefined,
  nutrientName: string,
): number | null {
  if (total != null) return total;
  const hit = log.nutrients?.find(
    n => n.nutrient?.toUpperCase() === nutrientName,
  );
  return hit?.quantity?.grams ?? null;
}

/**
 * Map raw Google Health v4 payloads into our normalized {@link RawHealthData}.
 *
 * HRV: use the daily average field (`averageHeartRateVariabilityMilliseconds`)
 * so our number matches what the Google Health app shows the user; fall back to
 * the deep-sleep RMSSD field only when the average is absent. The derivation
 * layer tags this as SDNN (the daily average is SDNN-class, not the deep-sleep
 * RMSSD). Value and baseline come from the same field, so deltas stay
 * self-consistent — the HEA-4 "never mix algorithms" rule still holds.
 *
 * Calories: total energy expenditure (TDEE) for the deficit; `kcalSum` may be a
 * number, string, or {parsedValue} object (see {@link kcalValue}).
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
      h.averageHeartRateVariabilityMilliseconds ??
      h.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds;
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
    sleep.push({
      start,
      end,
      durationMin,
      source,
      stages: sleepStages(dp.sleep?.summary?.stagesSummary),
    });
  }

  // Rollups are server-aggregated across sources, so they arrive pre-deduped
  // with a single synthetic origin. Tagging them all 'Google Health' means the
  // dedup layer treats them as one source (no cross-origin double counting).
  const steps: StepsRecord[] = [];
  for (const dp of p.steps) {
    const count = dp.steps?.countSum ? parseInt(dp.steps.countSum, 10) : NaN;
    const start = isoToMs(dp.startTime) ?? civilToMs(dp.civilStartTime);
    const end = isoToMs(dp.endTime) ?? civilToMs(dp.civilEndTime);
    if (!Number.isFinite(count) || start == null || end == null) continue;
    steps.push({ count, start, end, source: 'Google Health' });
  }

  // One calories rollup point can carry BOTH an active-energy figure (for the
  // "calories" activity goal) and a total figure (TDEE, for the deficit). We
  // extract both. `kcalSum` may be a number, string, or {parsedValue|source}.
  const activeEnergy: EnergyRecord[] = [];
  const totalEnergy: EnergyRecord[] = [];
  for (const dp of p.calories) {
    const start = isoToMs(dp.startTime) ?? civilToMs(dp.civilStartTime);
    const end = isoToMs(dp.endTime) ?? civilToMs(dp.civilEndTime);
    if (start == null || end == null) continue;
    const active =
      kcalValue(dp.activeCaloriesBurned?.kcalSum) ||
      kcalValue(dp.activeEnergyBurned?.kcalSum);
    const total =
      kcalValue(dp.totalCalories?.kcalSum) ||
      kcalValue(dp.totalEnergyBurned?.kcalSum) ||
      kcalValue(dp.energy?.kcalSum) ||
      kcalValue(dp.calories?.kcalSum);
    if (active > 0) {
      activeEnergy.push({ kcal: active, start, end, source: 'Google Health' });
    }
    if (total > 0) {
      totalEnergy.push({ kcal: total, start, end, source: 'Google Health' });
    }
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
    const zoneDur = dp.exercise?.metricsSummary?.heartRateZoneDurations;
    const hrZones = zoneDur
      ? {
          lightMin: durationToMin(zoneDur.lightTime) ?? 0,
          moderateMin: durationToMin(zoneDur.moderateTime) ?? 0,
          vigorousMin: durationToMin(zoneDur.vigorousTime) ?? 0,
          peakMin: durationToMin(zoneDur.peakTime) ?? 0,
        }
      : null;
    exercise.push({
      exerciseType: exerciseTypeToHc(dp.exercise?.exerciseType),
      typeName: dp.exercise?.exerciseType ?? 'WORKOUT',
      displayName: dp.exercise?.displayName ?? dp.displayName ?? null,
      start,
      end,
      durationMin,
      energyKcal,
      hrZones,
      source: 'Google Health',
    });
  }

  const nutrition: NutritionEntry[] = [];
  for (const dp of p.nutrition) {
    const log = dp.nutritionLog;
    if (!log) continue;
    const start = isoToMs(log.interval?.startTime);
    const end = isoToMs(log.interval?.endTime) ?? start;
    if (start == null || end == null) continue;
    const source = sourceLabel(dp.dataSource);
    sources.add(source);
    nutrition.push({
      start,
      end,
      name: log.foodDisplayName ?? 'Food',
      mealType: log.mealType ?? null,
      kcal: log.energy?.kcal ?? null,
      proteinG: nutrientGrams(log, log.totalProtein?.grams, 'PROTEIN'),
      carbsG: nutrientGrams(log, log.totalCarbohydrate?.grams, 'CARBS'),
      fatG: nutrientGrams(log, log.totalFat?.grams, 'FAT'),
      id: dp.name ?? null,
      source,
    });
  }

  return {
    hrvRmssd,
    restingHr,
    sleep,
    steps,
    exercise,
    activeEnergy,
    totalEnergy,
    nutrition,
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
  // Short label for logs, e.g. "steps" from ".../dataTypes/steps/dataPoints".
  const label = (path: string) =>
    path.match(/dataTypes\/([^/]+)/)?.[1] ?? path;

  async function getList<T>(path: string): Promise<T[]> {
    const name = label(path);
    try {
      const res = await fetchImpl(`${BASE_URL}${path}`, { headers: auth });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(
          `[GoogleHealth] GET ${name} → HTTP ${res.status}`,
          detail.slice(0, 500),
        );
        return [];
      }
      const body = (await res.json()) as ListResponse<T>;
      const points = body.dataPoints ?? [];
      console.log(`[GoogleHealth] GET ${name} → ${points.length} points`);
      return points;
    } catch (err) {
      console.warn(`[GoogleHealth] GET ${name} threw`, err);
      return [];
    }
  }

  async function postRollup<T>(path: string): Promise<T[]> {
    const name = label(path);
    try {
      const res = await fetchImpl(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        // total-calories rollups reject windows > 14 days
        // (INVALID_ROLLUP_QUERY_DURATION, observed as a live 400). Cap the
        // rollup window — we only need today + this week out of rollups anyway.
        body: dailyRollupBody(now, Math.min(daysBack, 14)),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(
          `[GoogleHealth] POST ${name} → HTTP ${res.status}`,
          detail.slice(0, 500),
        );
        return [];
      }
      const body = (await res.json()) as RollupResponse<T>;
      const points = body.rollupDataPoints ?? [];
      console.log(`[GoogleHealth] POST ${name} → ${points.length} points`);
      return points;
    } catch (err) {
      console.warn(`[GoogleHealth] POST ${name} threw`, err);
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

  // Exercise (and sleep) are HARD-CAPPED at pageSize 25 by the API — larger
  // values are silently truncated — and results are newest-first, so a single
  // read only ever returns the 25 most-recent sessions (~a week for an active
  // user). To get history we PAGINATE via nextPageToken, bounded by a civil
  // start-time filter. `exercise.interval.civil_start_time` is the documented
  // filter field (users.dataTypes.dataPoints.list reference). A ~60-day window
  // comfortably covers the 6-week goal-history view. (This — not any cloud
  // retention limit — is why older weeks were previously missing.)
  const EXERCISE_HISTORY_DAYS = 60;
  const EXERCISE_MAX_PAGES = 20; // 20 × 25 = 500 sessions — a hard safety bound
  const exerciseFilter = encodeURIComponent(
    `exercise.interval.civil_start_time >= "${isoDaysAgo(now, EXERCISE_HISTORY_DAYS)}"`,
  );
  async function getExercise(): Promise<ExerciseDataPoint[]> {
    const out: ExerciseDataPoint[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < EXERCISE_MAX_PAGES; page++) {
      const tokenParam = pageToken
        ? `&pageToken=${encodeURIComponent(pageToken)}`
        : '';
      const url = `${BASE_URL}/users/me/dataTypes/exercise/dataPoints?filter=${exerciseFilter}&pageSize=25${tokenParam}`;
      try {
        const res = await fetchImpl(url, { headers: auth });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          console.warn(
            `[GoogleHealth] GET exercise p${page} → HTTP ${res.status}`,
            detail.slice(0, 300),
          );
          break;
        }
        const body = (await res.json()) as ListResponse<ExerciseDataPoint>;
        const pts = body.dataPoints ?? [];
        out.push(...pts);
        pageToken = body.nextPageToken || undefined;
        if (!pageToken || pts.length === 0) break;
      } catch (err) {
        console.warn(`[GoogleHealth] GET exercise p${page} threw`, err);
        break;
      }
    }
    console.log(`[GoogleHealth] exercise → ${out.length} sessions (paginated)`);
    return out;
  }

  const [hrv, restingHr, sleep, steps, calories, exercise, nutrition] =
    await Promise.all([
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
      getExercise(),
      getList<NutritionDataPoint>(
        '/users/me/dataTypes/nutrition-log/dataPoints?page_size=100',
      ),
    ]);

  // Diagnostic: dump the first calories rollup point so the exact field/value
  // shape is visible in logs if burned calories ever looks wrong.
  if (calories.length > 0) {
    console.log('[GoogleHealth] calories[0] raw:', JSON.stringify(calories[0]));
  }

  return mapGoogleHealthRaw(
    { hrv, restingHr, sleep, steps, calories, exercise, nutrition },
    now,
  );
}

// ---------------------------------------------------------------------------
// Write path — logging food back to the user's Google Health nutrition log.
//
// The reference dashboard is read-only, so unlike the read paths above the
// exact create endpoint/body is NOT contract-verified against a live sample.
// The payload mirrors the SHAPE we read back (`nutritionLog`), and the builder
// is isolated + unit-tested so that if the live wire format differs we correct
// one pure function, not the caller. Verifying this end-to-end needs a real
// OAuth client ID + a Google Health account (see index.ts wiring notes).
// ---------------------------------------------------------------------------

/** What the user types when logging a meal. Macros optional (calorie-only ok). */
export interface FoodEntryInput {
  name: string;
  kcal: number;
  mealType?: string;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  /** Meal time; defaults to `now` at the call site. */
  at?: number;
}

/** RFC3339 UTC timestamp for an epoch-ms value. */
function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** The device's UTC offset at `ms` as a protobuf duration (e.g. "7200s",
 * "-18000s"). Required by the API's SessionTimeInterval. */
function utcOffsetString(ms: number): string {
  // getTimezoneOffset returns minutes to ADD to local time to reach UTC, so the
  // actual offset from UTC is its negation.
  return `${-new Date(ms).getTimezoneOffset() * 60}s`;
}

/**
 * Build the create body for one food entry — a v4 `DataPoint` carrying a
 * `nutritionLog` (verified against the health:v4 discovery doc). Notes: the body
 * is the DataPoint itself (no `dataPoint` wrapper); protein has no dedicated
 * field, so it goes in `nutrients[]` as a `PROTEIN` `NutrientQuantity`; the
 * interval is a SessionTimeInterval and needs start/end UTC offsets.
 */
export function buildNutritionLogPayload(
  input: FoodEntryInput,
  now: number,
): { nutritionLog: Record<string, unknown> } {
  const at = input.at ?? now;
  // The API rejects an interval whose start equals its end ("start time must be
  // strictly earlier than end time"), so give the entry a nominal 1-minute span.
  const endAt = at + 60_000;
  const offset = utcOffsetString(at);
  const log: Record<string, unknown> = {
    interval: {
      startTime: msToIso(at),
      endTime: msToIso(endAt),
      startUtcOffset: offset,
      endUtcOffset: offset,
    },
    foodDisplayName: input.name,
    energy: { kcal: input.kcal },
  };
  if (input.mealType) log.mealType = input.mealType;
  if (input.carbsG != null) log.totalCarbohydrate = { grams: input.carbsG };
  if (input.fatG != null) log.totalFat = { grams: input.fatG };
  if (input.proteinG != null) {
    log.nutrients = [
      { nutrient: 'PROTEIN', quantity: { grams: input.proteinG } },
    ];
  }
  return { nutritionLog: log };
}

/** Result of a food-log write: whether it succeeded and, when the API echoes
 * it, the created data point's resource name — needed to update/delete the
 * entry later (see {@link deleteFoodEntry}). */
export interface FoodLogResult {
  ok: boolean;
  /** Resource name, e.g. "users/me/dataTypes/nutrition-log/dataPoints/{id}". */
  name?: string;
  /** Failure reason for diagnostics + user messaging (unset on success). */
  error?: string;
}

/**
 * Create one food entry in the signed-in user's Google Health nutrition log and
 * return the created data point's resource name (when present) so the caller can
 * later edit or delete it. `accessToken` must carry the `googlehealth.nutrition`
 * (write) scope. Never throws for a normal API failure — resolves `{ok:false}` —
 * so a failed log never crashes the screen.
 *
 * The create response shape is NOT contract-verified against a live sample (the
 * reference dashboard is read-only), so the resource name is read defensively;
 * when it is absent the entry is still logged, only later edits are unavailable.
 */
export async function createFoodEntry(
  accessToken: string,
  input: FoodEntryInput,
  now: number,
  fetchImpl: FetchLike,
): Promise<FoodLogResult> {
  try {
    const res = await fetchImpl(
      `${BASE_URL}/users/me/dataTypes/nutrition-log/dataPoints`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(buildNutritionLogPayload(input, now)),
      },
    );
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        detail = '';
      }
      console.warn(
        `[GoogleHealth] POST nutrition-log → HTTP ${res.status}`,
        detail,
      );
      return {
        ok: false,
        error: `HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }
    let name: string | undefined;
    try {
      const body = (await res.json()) as {
        name?: string;
        dataPoint?: { name?: string };
      };
      name = body?.name ?? body?.dataPoint?.name;
    } catch {
      name = undefined;
    }
    return { ok: true, name };
  } catch (err) {
    console.warn('[GoogleHealth] food write threw', err);
    return {
      ok: false,
      error: `network error: ${String((err as Error)?.message ?? err)}`,
    };
  }
}

/**
 * Delete a previously created nutrition-log data point by its resource `name`
 * (as returned by {@link createFoodEntry}). Used to edit an entry (delete + re-
 * create). Never throws — resolves false on any failure. Like the write path
 * this endpoint is not live-contract-verified.
 */
export async function deleteFoodEntry(
  accessToken: string,
  name: string,
  fetchImpl: FetchLike,
): Promise<boolean> {
  try {
    // The v4 API has no per-resource DELETE; deletion is the batchDelete method
    // (POST …/dataPoints:batchDelete with the resource names).
    const res = await fetchImpl(
      `${BASE_URL}/users/me/dataTypes/nutrition-log/dataPoints:batchDelete`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ names: [name] }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Write one food entry to the signed-in user's Google Health nutrition log.
 * Returns true on a 2xx. Thin boolean-returning wrapper over
 * {@link createFoodEntry} for callers that don't need the created id.
 */
export async function writeFoodEntry(
  accessToken: string,
  input: FoodEntryInput,
  now: number,
  fetchImpl: FetchLike,
): Promise<boolean> {
  return (await createFoodEntry(accessToken, input, now, fetchImpl)).ok;
}
