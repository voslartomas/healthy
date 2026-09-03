/**
 * Platform-neutral fetch-window sizing and food-log I/O types.
 *
 * These describe HOW MUCH history a read covers and the shape of a food-log
 * write/result — independent of which native source (Health Connect / HealthKit)
 * serves them. Kept in their own module (rather than any one adapter) so both
 * adapters, `./index`, and the store share one definition.
 */

/**
 * How far back (days) each metric group is read. The heavy pulls — exercise
 * sessions + their per-session heart-rate (for zones) and the per-day energy
 * buckets — dominate load time, so the caller shrinks them for a routine
 * ("light") refresh and reserves the deep ("full") pull for first load /
 * periodic backfill.
 *
 * The same split applies to the daily metrics (HRV, resting HR, sleep,
 * nutrition, weight, body fat): the deep read covers the longest span Trends can
 * show, while a routine refresh re-reads only the last few days. `mergeRaw`
 * splices the metric arrays onto the cached history exactly like the heavy ones,
 * so opening the app in the morning costs one short read — not a re-pull of six
 * months — and the long trend series survives untouched.
 */
export interface RawFetchWindows {
  metricsDays: number;
  /** HRV gets its own, shorter span. Wearables write a raw RMSSD sample every
   * ~5 minutes of sleep — roughly 100 records a NIGHT, two orders of magnitude
   * more than any other daily metric — so reading it as deep as the rest would
   * mean tens of thousands of records per refresh. The long HRV history instead
   * accumulates in the cache, which `mergeRaw` extends rather than replaces. */
  hrvDays: number;
  exerciseDays: number;
  stepsDays: number;
  caloriesDays: number;
}

/** How much daily metric history the DEEP read covers — the longest span the
 * Trends screen offers (see TREND_RANGES). Baselines stay pinned to their own
 * 30-day window regardless of this (see BASELINE_DAYS in ./derive). */
export const FULL_METRICS_DAYS = 180;

/** The deep HRV span. Shorter than the rest because of the per-5-minute sample
 * rate (see {@link RawFetchWindows.hrvDays}) — at ~100 records a night this is
 * already ~9,000 records, on par with the heaviest existing read. Older nights
 * survive in the cache, which `mergeRaw` extends rather than replaces, so the
 * HRV and recovery trends reach the full 180 days the longer the app is used. */
export const FULL_HRV_DAYS = 90;

/** How much the routine read re-covers. Only the last few days can still change
 * (a night's sleep lands late, a weigh-in is back-dated), so this is short on
 * purpose — everything older is spliced from cache. */
export const LIGHT_METRICS_DAYS = 7;

/** Deep history — first load and periodic backfill (slower: full read). */
export const FULL_WINDOWS: RawFetchWindows = {
  metricsDays: FULL_METRICS_DAYS,
  hrvDays: FULL_HRV_DAYS,
  exerciseDays: 90,
  stepsDays: 90,
  caloriesDays: 84,
};

/** Recent slice — routine + foreground refresh. Covers today and the current
 * Mon–Sun goal week; older weeks come from the cached history the caller
 * splices on (`./derive.mergeRaw`). */
export const LIGHT_WINDOWS: RawFetchWindows = {
  metricsDays: LIGHT_METRICS_DAYS,
  hrvDays: LIGHT_METRICS_DAYS,
  exerciseDays: 14,
  stepsDays: 14,
  caloriesDays: 14,
};

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

/** Result of a food-log write: whether it succeeded and, when the store echoes
 * it, the created record's id — needed to update/delete the entry later. */
export interface FoodLogResult {
  ok: boolean;
  /** Native record id/uuid for the created entry, when available. */
  name?: string;
  /** Failure reason for diagnostics + user messaging (unset on success). */
  error?: string;
}

/** A completed strength/lift session to write to the OS exercise store. The
 * session records its own time window; heart rate recorded during it by a
 * wearable (e.g. Fitbit → Health Connect) is a separate time series the OS
 * correlates by overlap, so nothing about HR is written here. */
export interface ExerciseSessionInput {
  /** Session start (epoch ms). */
  startMs: number;
  /** Session end (epoch ms). */
  endMs: number;
  /** Title shown in Health Connect / Google Health, e.g. the workout name. */
  title: string;
  /** Which exercise type to record it as: 'strength' → STRENGTH_TRAINING,
   * 'core' → EXERCISE_CLASS (Google Health's label for core sessions). Defaults
   * to 'strength'. */
  kind?: 'strength' | 'core';
  /** Optional summary (sets · reps · volume) written to the record's notes. */
  notes?: string;
}

/** Result of an exercise-session write. */
export interface ExerciseLogResult {
  ok: boolean;
  /** Native record id/uuid for the created session, when available. */
  id?: string | null;
  /** Failure reason for diagnostics (unset on success). */
  error?: string;
}
