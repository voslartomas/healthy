import { GoalSourceKey } from '../data/goalSources';

/**
 * Raw + derived types for the health-data layer.
 *
 * The `Raw*` types are the normalized shape the native Health Connect module
 * returns — one array per record type, each sample tagged with its writing app
 * (`source`, a package name) so the derivation layer can de-duplicate across
 * origins (see HEA-4 §3 / HEA-13 finding 3: Fitbit + Withings + Google Fit can
 * each write the same metric and would otherwise double-count).
 *
 * The `HealthSnapshot` is what the UI consumes — already deduped, normalized,
 * and aggregated. Nothing above the derivation layer sees raw multi-source data.
 */

/** HRV algorithm. The Google Health API exposes RMSSD (deep-sleep RMSSD field);
 * SDNN is retained in the union because it is NOT numerically comparable to
 * RMSSD, so every HRV value stays explicitly tagged (HEA-4 landmine). */
export type HrvAlgorithm = 'RMSSD' | 'SDNN';

/** A single instantaneous sample (HRV, resting HR). Times are epoch ms. */
export interface InstantSample {
  value: number;
  time: number;
  source: string;
}

/** A steps record over an interval. */
export interface StepsRecord {
  count: number;
  start: number;
  end: number;
  source: string;
}

/** A sleep session with a precomputed duration in minutes. */
export interface SleepRecord {
  start: number;
  end: number;
  durationMin: number;
  source: string;
}

/** An exercise session. `exerciseType` is the raw Health Connect enum int. */
export interface ExerciseRecord {
  exerciseType: number;
  start: number;
  end: number;
  durationMin: number;
  energyKcal: number | null;
  source: string;
}

/** An active-energy record over an interval. */
export interface EnergyRecord {
  kcal: number;
  start: number;
  end: number;
  source: string;
}

/**
 * One logged food / nutrition entry. Unlike the other record types this is the
 * one thing the user *writes* (see {@link ./GoogleHealthApi.writeFoodEntry}) as
 * well as reads. `start`/`end` bound the meal; macros are grams; `kcal` is the
 * entry's energy. All macros optional — a quick calorie-only log is valid.
 */
export interface NutritionEntry {
  start: number;
  end: number;
  name: string;
  mealType: string | null;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  source: string;
}

/**
 * Everything the native module reads in one pass, normalized to the units above
 * but NOT yet deduped or aggregated. This is the boundary between native and TS.
 */
export interface RawHealthData {
  hrvRmssd: InstantSample[];
  restingHr: InstantSample[];
  sleep: SleepRecord[];
  steps: StepsRecord[];
  exercise: ExerciseRecord[];
  activeEnergy: EnergyRecord[];
  nutrition: NutritionEntry[];
  /** Distinct source packages seen across all record types. */
  sources: string[];
  /** Epoch ms when the read completed. */
  readAt: number;
}

/** A single metric value plus its change vs the 30-day baseline. */
export interface MetricWithBaseline {
  value: number;
  baseline: number;
  /** value − baseline, positive = above baseline. */
  delta: number;
}

export interface HrvMetric extends MetricWithBaseline {
  algorithm: HrvAlgorithm;
}

export interface SleepMetric {
  hours: number;
  /** Duration as a % of the 8h sleep-need target, clamped 0–100. */
  performancePct: number;
  lastSessionEnd: number;
}

/** Our composite readiness ("recovery") score. Non-clinical; see ADR-004. */
export interface ReadinessMetric {
  pct: number;
  state: 'Recovered' | 'Balanced' | 'Strained';
}

/** One meal row for the nutrition screen (derived from a {@link NutritionEntry}). */
export interface MealSummary {
  name: string;
  mealType: string | null;
  kcal: number;
  time: number;
}

/** Today's aggregated nutrition, derived from the day's logged food entries. */
export interface NutritionSummary {
  /** Total energy eaten today (kcal). */
  eaten: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  meals: MealSummary[];
}

/**
 * The fully-derived view of a user's health data that the dashboard reads.
 * Any field can be `null` when the underlying data is absent (a permission was
 * denied, or the wearable simply wrote nothing — indistinguishable on iOS).
 */
export interface HealthSnapshot {
  hrv: HrvMetric | null;
  restingHr: MetricWithBaseline | null;
  sleep: SleepMetric | null;
  stepsToday: number;
  stepsThisWeek: number;
  readiness: ReadinessMetric | null;
  /** Today's logged nutrition, null when nothing has been logged today. */
  nutrition: NutritionSummary | null;
  /** Auto-tracked weekly totals per goal source, from real activity. */
  tracked: Partial<Record<GoalSourceKey, number>>;
  /** Distinct writing apps, for the "Synced via …" line. */
  sources: string[];
  readAt: number;
  /** True when this came from real platform reads, false for sample fallback. */
  live: boolean;
}
