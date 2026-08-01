import { GoalSourceKey } from '../data/goalSources';
import {
  EnergyRecord,
  ExerciseRecord,
  HealthSnapshot,
  InstantSample,
  MetricWithBaseline,
  NutritionEntry,
  NutritionSummary,
  RawHealthData,
  ReadinessMetric,
  SleepRecord,
  StepsRecord,
} from './types';

/**
 * Pure, platform-independent derivation of a {@link HealthSnapshot} from raw
 * multi-source Health Connect records. Everything here is deterministic given
 * `(raw, now)`, which is what makes the correctness-critical rules (dedup, unit
 * normalization, baselines, readiness) unit-testable without a device.
 *
 * Two hazards this layer exists to neutralize (HEA-4 §3, HEA-13 finding 3):
 *   1. Multi-source double counting — Fitbit + Withings + Google Fit can each
 *      write the same steps/sleep/workout. We pick ONE source per metric by a
 *      documented priority rather than summing across origins.
 *   2. HRV algorithm confusion — Android RMSSD ≠ iOS SDNN. Tagging is carried
 *      through {@link types.HrvMetric}; this file never mixes the two.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Source priority for de-duplication. A dedicated wearable/scale is trusted
 * over a phone pedometer when both wrote the same window. Higher = preferred.
 * Unknown sources rank at 0 (below all named devices but still usable when
 * they are the only writer). Tune as we learn real-world source quality.
 */
const SOURCE_PRIORITY: Record<string, number> = {
  'com.withings.wiscale2': 40, // Withings (scale, sleep mat)
  'com.fitbit.FitbitMobile': 35, // Fitbit (band/watch)
  'com.ouraring.oura': 35, // Oura
  'com.garmin.android.apps.connectmobile': 30, // Garmin
  'com.google.android.apps.fitness': 10, // Google Fit (often phone-derived)
  'com.google.android.apps.healthdata': 5, // HC phone source
};

export function sourceRank(source: string): number {
  return SOURCE_PRIORITY[source] ?? 0;
}

/** The highest-priority source that actually has records in the given set. */
function primarySource(records: { source: string }[]): string | null {
  let best: string | null = null;
  let bestRank = -Infinity;
  for (const r of records) {
    const rank = sourceRank(r.source);
    if (rank > bestRank) {
      bestRank = rank;
      best = r.source;
    }
  }
  return best;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Drop interval records that overlap a higher-priority source's record. When
 * two sources cover the same time window we keep only the trusted one; equal
 * priority keeps both (they are assumed distinct real events, e.g. two runs).
 */
export function dedupeIntervals<T extends { start: number; end: number; source: string }>(
  records: T[],
): T[] {
  const sorted = [...records].sort((a, b) => a.start - b.start);
  const kept: T[] = [];
  for (const rec of sorted) {
    const overlapsHigher = kept.some(
      k =>
        rec.start < k.end &&
        k.start < rec.end &&
        sourceRank(k.source) > sourceRank(rec.source),
    );
    if (overlapsHigher) continue;
    // Also remove already-kept records this one outranks on the same window.
    for (let i = kept.length - 1; i >= 0; i--) {
      const k = kept[i];
      if (
        rec.start < k.end &&
        k.start < rec.end &&
        sourceRank(rec.source) > sourceRank(k.source)
      ) {
        kept.splice(i, 1);
      }
    }
    kept.push(rec);
  }
  return kept;
}

/** Most recent sample from the highest-priority source that has any samples. */
export function latestFromPrimary(samples: InstantSample[]): InstantSample | null {
  const primary = primarySource(samples);
  if (primary == null) return null;
  const fromPrimary = samples.filter(s => s.source === primary);
  return fromPrimary.reduce((a, b) => (b.time > a.time ? b : a));
}

/** Baseline = median of one representative (latest) value per day. */
function dailyBaseline(samples: InstantSample[]): number {
  const byDay = new Map<number, InstantSample>();
  for (const s of samples) {
    const day = Math.floor(s.time / DAY_MS);
    const existing = byDay.get(day);
    if (!existing || s.time > existing.time) byDay.set(day, s);
  }
  return median([...byDay.values()].map(s => s.value));
}

function metricWithBaseline(
  samples: InstantSample[],
): MetricWithBaseline | null {
  const latest = latestFromPrimary(samples);
  if (!latest) return null;
  const baseline = dailyBaseline(samples) || latest.value;
  return {
    value: latest.value,
    baseline,
    delta: latest.value - baseline,
  };
}

/** Steps in [from, to), summed from a single primary source (no cross-origin sum). */
export function stepsInWindow(
  steps: StepsRecord[],
  from: number,
  to: number,
): number {
  const inWindow = steps.filter(s => s.end > from && s.start < to);
  const primary = primarySource(inWindow);
  if (primary == null) return 0;
  return inWindow
    .filter(s => s.source === primary)
    .reduce((sum, s) => sum + s.count, 0);
}

function activeEnergyInWindow(
  energy: EnergyRecord[],
  from: number,
  to: number,
): number {
  const inWindow = energy.filter(e => e.end > from && e.start < to);
  const primary = primarySource(inWindow);
  if (primary == null) return 0;
  return inWindow
    .filter(e => e.source === primary)
    .reduce((sum, e) => sum + e.kcal, 0);
}

/**
 * Health Connect `ExerciseSessionRecord.exerciseType` enum ints we map to goal
 * sources. Values are the documented AndroidX constants. Anything not listed is
 * treated as generic cardio for the zone-2 minutes tally.
 */
const STRENGTH_TYPES = new Set([70, 65]); // STRENGTH_TRAINING, WEIGHTLIFTING
const CORE_TYPES = new Set([48, 83]); // PILATES, YOGA (closest core proxies)
const NON_CARDIO_TYPES = new Set([70, 65, 48, 83, 79]); // + WALKING(79) excluded from zone-2

/**
 * Auto-tracked weekly totals per goal source from real activity.
 *
 * Known simplification (documented, not silent): `zone2` minutes is the sum of
 * *cardio session minutes*, not a true heart-rate-zone computation — Health
 * Connect exposes sessions, and per-zone time needs the HR series binned to the
 * user's zones, which is follow-up work. `core` uses pilates/yoga as the
 * closest available session types. Both are called out in the ADR.
 */
export function trackedFromExercise(
  exercise: ExerciseRecord[],
  steps: StepsRecord[],
  energy: EnergyRecord[],
  now: number,
): Partial<Record<GoalSourceKey, number>> {
  const weekAgo = now - WEEK_MS;
  const sessions = dedupeIntervals(
    exercise.filter(e => e.end > weekAgo && e.start <= now),
  );

  let strength = 0;
  let core = 0;
  let zone2 = 0;
  for (const s of sessions) {
    if (STRENGTH_TYPES.has(s.exerciseType)) strength += 1;
    if (CORE_TYPES.has(s.exerciseType)) core += 1;
    if (!NON_CARDIO_TYPES.has(s.exerciseType)) zone2 += s.durationMin;
  }

  return {
    steps: stepsInWindow(steps, weekAgo, now),
    calories: Math.round(activeEnergyInWindow(energy, weekAgo, now)),
    strength,
    core,
    zone2: Math.round(zone2),
  };
}

/** Most recent sleep session (dedup keeps the trusted source per night). */
function lastSleep(sleep: SleepRecord[]): SleepRecord | null {
  const deduped = dedupeIntervals(sleep);
  if (deduped.length === 0) return null;
  return deduped.reduce((a, b) => (b.end > a.end ? b : a));
}

const SLEEP_NEED_MIN = 8 * 60;

/**
 * Composite readiness ("recovery") score — NON-CLINICAL, see ADR-004.
 *
 * A transparent 0–100 blend of three real, directly-measured inputs, each
 * scored relative to the user's own baseline so it self-calibrates:
 *   • HRV vs 30-day baseline   (weight 0.5) — higher HRV ⇒ more recovered
 *   • Resting HR vs baseline   (weight 0.3) — lower RHR ⇒ more recovered
 *   • Last sleep vs 8h need    (weight 0.2)
 * This is our interpretation layer, deliberately simple and disclosed; it makes
 * no medical claim and is not a substitute for the proprietary scores wearables
 * compute. Returns null unless at least HRV or RHR is available.
 */
export function readiness(
  hrv: MetricWithBaseline | null,
  restingHr: MetricWithBaseline | null,
  sleep: { performancePct: number } | null,
): ReadinessMetric | null {
  if (!hrv && !restingHr) return null;

  const parts: { score: number; weight: number }[] = [];
  if (hrv && hrv.baseline > 0) {
    // ±20% around baseline maps to 0..100, centered at 65.
    const ratio = (hrv.value - hrv.baseline) / hrv.baseline;
    parts.push({ score: clamp(65 + ratio * 175), weight: 0.5 });
  }
  if (restingHr && restingHr.baseline > 0) {
    const ratio = (restingHr.baseline - restingHr.value) / restingHr.baseline;
    parts.push({ score: clamp(65 + ratio * 300), weight: 0.3 });
  }
  if (sleep) {
    parts.push({ score: clamp(sleep.performancePct), weight: 0.2 });
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const pct = Math.round(
    parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight,
  );
  const state: ReadinessMetric['state'] =
    pct >= 66 ? 'Recovered' : pct >= 34 ? 'Balanced' : 'Strained';
  return { pct, state };
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Today's nutrition, summed from the day's logged food entries. Nutrition is
 * single-source (the user logs it), so there is no cross-origin dedup here —
 * every entry the user wrote counts. Returns null when nothing was logged today.
 */
export function nutritionToday(
  entries: NutritionEntry[],
  now: number,
): NutritionSummary | null {
  const startOfToday = now - (now % DAY_MS);
  const today = entries.filter(e => e.start >= startOfToday && e.start <= now);
  if (today.length === 0) return null;

  let eaten = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const e of today) {
    eaten += e.kcal ?? 0;
    proteinG += e.proteinG ?? 0;
    carbsG += e.carbsG ?? 0;
    fatG += e.fatG ?? 0;
  }

  const meals = today
    .map(e => ({
      name: e.name,
      mealType: e.mealType,
      kcal: Math.round(e.kcal ?? 0),
      time: e.start,
    }))
    .sort((a, b) => a.time - b.time);

  return {
    eaten: Math.round(eaten),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    meals,
  };
}

/** Derive the full snapshot the UI consumes from one raw read. */
export function deriveSnapshot(raw: RawHealthData, now: number): HealthSnapshot {
  const hrvBase = metricWithBaseline(raw.hrvRmssd);
  const hrv = hrvBase ? { ...hrvBase, algorithm: 'RMSSD' as const } : null;
  const restingHr = metricWithBaseline(raw.restingHr);

  const lastSleepSession = lastSleep(raw.sleep);
  const sleep = lastSleepSession
    ? {
        hours: lastSleepSession.durationMin / 60,
        performancePct: Math.round(
          clamp((lastSleepSession.durationMin / SLEEP_NEED_MIN) * 100),
        ),
        lastSessionEnd: lastSleepSession.end,
      }
    : null;

  const startOfToday = now - (now % DAY_MS);

  return {
    hrv,
    restingHr,
    sleep,
    stepsToday: stepsInWindow(raw.steps, startOfToday, now),
    stepsThisWeek: stepsInWindow(raw.steps, now - WEEK_MS, now),
    readiness: readiness(hrv, restingHr, sleep),
    nutrition: nutritionToday(raw.nutrition, now),
    tracked: trackedFromExercise(raw.exercise, raw.steps, raw.activeEnergy, now),
    sources: raw.sources,
    readAt: raw.readAt,
    live: true,
  };
}
