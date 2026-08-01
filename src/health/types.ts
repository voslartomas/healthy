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

/** HRV algorithm. Android exposes RMSSD, iOS HealthKit exposes SDNN — they are
 * NOT numerically comparable, so every HRV value is tagged (HEA-4 landmine). */
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
  /** Auto-tracked weekly totals per goal source, from real activity. */
  tracked: Partial<Record<GoalSourceKey, number>>;
  /** Distinct writing apps, for the "Synced via …" line. */
  sources: string[];
  readAt: number;
  /** True when this came from real platform reads, false for sample fallback. */
  live: boolean;
}
