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

/** Per-stage minutes for a sleep session. All zero when the source provides no
 * hypnogram (only a total duration). */
export interface SleepStages {
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
}

/** A sleep session with a precomputed duration in minutes. */
export interface SleepRecord {
  start: number;
  end: number;
  durationMin: number;
  source: string;
  /** Stage breakdown; null when the source reported no stages. */
  stages: SleepStages | null;
}

/** An exercise session. `exerciseType` is the raw Health Connect enum int;
 * `typeName` is the original human-readable source label (e.g. "RUNNING"). */
export interface ExerciseRecord {
  exerciseType: number;
  typeName: string;
  /** Source-provided localized workout title (e.g. "Trénink středu těla");
   * null/absent when the source only gave a type. Enables displayName goals. */
  displayName?: string | null;
  start: number;
  end: number;
  durationMin: number;
  energyKcal: number | null;
  /** Time in each Google HR zone (minutes) from metricsSummary; null if none. */
  hrZones?: CardioZones | null;
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
  /** The data point's resource name (id), used to edit or delete the entry.
   * Null when the source didn't provide one. */
  id?: string | null;
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
  /** Active energy burned (exercise/movement), for the calories activity goal. */
  activeEnergy: EnergyRecord[];
  /** Total energy expenditure (TDEE = active + basal), for the deficit. */
  totalEnergy: EnergyRecord[];
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
  /** Last session's stage breakdown (minutes); null when no hypnogram. */
  stages: SleepStages | null;
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
  /** Resource id for editing/deleting the entry; null when unknown. */
  id?: string | null;
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

/** A single dated point in a metric trend (one per day). */
export interface TrendPoint {
  time: number;
  value: number;
}

/** Per-metric daily history (oldest first) for the Trends screen, derived from
 * the ~30-day raw reads. */
export interface TrendSeries {
  hrv: TrendPoint[];
  restingHr: TrendPoint[];
  sleepHours: TrendPoint[];
  readiness: TrendPoint[];
}

/**
 * One day's energy balance, for the calorie-adherence trend. `net = eaten −
 * burned` (negative = deficit). `eaten`/`burned`/`net` are null when that day
 * lacks the data (no food logged, or outside the ~14-day burned window).
 */
export interface DailyEnergy {
  /** Day-bucket start (UTC midnight epoch ms). */
  dayStart: number;
  eaten: number | null;
  burned: number | null;
  net: number | null;
}

/** One recorded workout, for the activities list (from an {@link ExerciseRecord}). */
export interface ActivitySummary {
  /** Human-readable activity name — the source displayName when present, else
   * the humanized type, e.g. "Running". */
  name: string;
  /** Raw source enum string, e.g. "RUNNING". */
  type: string;
  /** Source-provided localized title, e.g. "Trénink středu těla"; null if none. */
  displayName: string | null;
  durationMin: number;
  energyKcal: number | null;
  start: number;
}

/**
 * A distinct activity the user actually recorded recently (last ~14 days),
 * offered as a choice in the goal-definition picker so goals are built from real
 * history rather than a hard-coded list. `field` says whether a goal built from
 * this option matches sessions on the raw exercise `type` or the localized
 * `displayName`; `value` is the string to match.
 */
export interface ActivityOption {
  field: 'type' | 'displayName';
  value: string;
  /** Human label for the picker (humanized type, or the displayName verbatim). */
  label: string;
  /** Sessions seen in the window — used to rank options most-frequent first. */
  count: number;
  /** Longest session duration seen (min); lets the UI suggest a min-duration. */
  maxDurationMin: number;
}

/** Minutes spent in each of Google Health's four HR zones over a window. */
export interface CardioZones {
  lightMin: number;
  moderateMin: number;
  vigorousMin: number;
  peakMin: number;
}

/** One day's cardio training load. */
export interface CardioDay {
  dayStart: number;
  load: number;
}

/**
 * Cardio training load for the cardio-load screen. `load` is a transparent,
 * non-clinical HR-zone-weighted minute blend (harder zones weigh more); see
 * cardioFromExercise. `hasZoneData` is false when no session in the window
 * carried HR-zone data, so the screen can render "-" honestly instead of 0.
 */
export interface CardioSummary {
  /** Today's load. */
  todayLoad: number;
  /** Total load across the last 7 days. */
  weekLoad: number;
  /** Minutes per HR zone summed over the last 7 days. */
  zones7d: CardioZones;
  /** Per-day load for the last 7 days, oldest first. */
  daily: CardioDay[];
  hasZoneData: boolean;
}

/**
 * Which data sources actually reach a given week. Used to avoid fabricating a
 * "missed" week for a period no source can see: the steps/active-energy rollups
 * only reach ~14 days, exercise ~30. A week without coverage for a goal's source
 * is shown as "no data", never as a miss, and is not persisted.
 */
export interface WeekCoverage {
  steps: boolean;
  calories: boolean;
  /** Whether the ~30-day exercise fetch window covers this week (for activity /
   * zone2 / strength / core goals). */
  activity: boolean;
}

/**
 * One calendar week (Mon–Sun) of the raw material goal-attainment needs: the
 * week's deduped sessions (for activity-goal matching) and its aggregate metric
 * totals (for source goals), plus per-source {@link WeekCoverage}. The goal
 * layer turns this into per-goal hit/miss; the persistence layer diffs the
 * covered weeks into the durable `goal_weeks` history.
 */
export interface GoalWeekData {
  /** UTC Monday 00:00 of the week. */
  weekStart: number;
  /** True once the whole week is in the past. */
  complete: boolean;
  activities: ActivitySummary[];
  tracked: Partial<Record<GoalSourceKey, number>>;
  coverage: WeekCoverage;
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
  /** Active energy burned today (kcal), from the calories rollup. */
  energyBurnedToday: number;
  /** Recent recorded workouts (last 7 days), newest first. */
  activities: ActivitySummary[];
  /** HR-zone time + training load for the cardio-load screen. */
  cardio: CardioSummary;
  /** Distinct recent activities (~14 days) for the goal-definition picker. */
  activityOptions: ActivityOption[];
  /** Recent calendar weeks (Mon–Sun) for computing per-goal weekly attainment. */
  weeklyHistory: GoalWeekData[];
  /** Per-day energy balance (~last 14 days, oldest first), for adherence trends. */
  dailyEnergy: DailyEnergy[];
  /** Per-metric daily history (~30 days) for the Trends screen. */
  trends: TrendSeries;
  /** Auto-tracked weekly totals per goal source, from real activity. */
  tracked: Partial<Record<GoalSourceKey, number>>;
  /** Distinct writing apps, for the "Synced via …" line. */
  sources: string[];
  readAt: number;
  /** True when this came from real platform reads, false for sample fallback. */
  live: boolean;
}
