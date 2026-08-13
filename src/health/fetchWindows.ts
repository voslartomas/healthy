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
 * periodic backfill. `metricsDays` stays wide even when light: instantaneous
 * metrics are cheap and the 30-day span is needed for baselines + trend charts.
 */
export interface RawFetchWindows {
  metricsDays: number;
  exerciseDays: number;
  stepsDays: number;
  caloriesDays: number;
}

/** Deep history — first load and periodic backfill (slower: full read). */
export const FULL_WINDOWS: RawFetchWindows = {
  metricsDays: 30,
  exerciseDays: 90,
  stepsDays: 90,
  caloriesDays: 84,
};

/** Recent slice — routine + foreground refresh. Covers today and the current
 * Mon–Sun goal week; older weeks come from the cached history the caller
 * splices on (`./derive.mergeRaw`). */
export const LIGHT_WINDOWS: RawFetchWindows = {
  metricsDays: 30,
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
