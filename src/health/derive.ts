import { GoalSourceKey } from '../data/goalSources';
import {
  ActivityOption,
  ActivitySummary,
  CardioDay,
  CardioSummary,
  CardioZones,
  DailyEnergy,
  EnergyRecord,
  ExerciseRecord,
  GoalWeekData,
  HealthSnapshot,
  InstantSample,
  MetricWithBaseline,
  NutritionEntry,
  NutritionSummary,
  RawHealthData,
  ReadinessMetric,
  SleepRecord,
  SleepStages,
  StepsRecord,
  TrendPoint,
  TrendSeries,
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
export function dedupeIntervals<
  T extends { start: number; end: number; source: string },
>(records: T[]): T[] {
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
export function latestFromPrimary(
  samples: InstantSample[],
): InstantSample | null {
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

/** How many recent weeks of goal history the snapshot exposes for computation.
 * Matches the Trends 12-week grid; the paginated exercise fetch (see
 * EXERCISE_HISTORY_DAYS in GoogleHealthApi) reaches back far enough to cover it,
 * and older weeks additionally persist in SQLite. Weeks with no data still read
 * as "no data" (never a fabricated miss) via {@link WeekCoverage}. */
const HISTORY_WEEKS = 12;

/** UTC Monday 00:00 for a timestamp — weeks run Mon–Sun, matching the goals UI.
 * (Epoch day 0 = Thursday, so the Monday offset is (dayIndex + 3) mod 7.) */
export function weekStartMs(ts: number): number {
  const dayIndex = Math.floor(ts / DAY_MS);
  const mondayOffset = (((dayIndex + 3) % 7) + 7) % 7;
  return (dayIndex - mondayOffset) * DAY_MS;
}

/** Per-source auto-tracked totals for an arbitrary [from, to) window (sessions
 * bucketed by start). Generalizes {@link trackedFromExercise} to any week. */
export function trackedForWindow(
  exercise: ExerciseRecord[],
  steps: StepsRecord[],
  energy: EnergyRecord[],
  from: number,
  to: number,
): Partial<Record<GoalSourceKey, number>> {
  const sessions = dedupeIntervals(
    exercise.filter(e => e.start >= from && e.start < to),
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
    steps: stepsInWindow(steps, from, to),
    calories: Math.round(activeEnergyInWindow(energy, from, to)),
    strength,
    core,
    zone2: Math.round(zone2),
  };
}

/**
 * The last {@link HISTORY_WEEKS} calendar weeks (Mon–Sun, oldest first) with the
 * per-week sessions and metric totals goal-attainment needs, plus per-source
 * {@link WeekCoverage}. Coverage is what stops us persisting a fabricated "miss"
 * for a week older than the data window. This is the input the persistence layer
 * diffs into `goal_weeks`.
 */
export function weeklyGoalHistory(
  raw: RawHealthData,
  now: number,
  weeks: number = HISTORY_WEEKS,
): GoalWeekData[] {
  const current = weekStartMs(now);
  // Activity coverage is DATA-DRIVEN, and stricter for completed weeks than for
  // the one in progress. A completed week can only be judged hit/miss if the
  // fetched exercise data reaches its START (`weekStart >= oldest`); otherwise
  // we'd undercount and fabricate a miss (the cloud only retains ~a recent
  // window, so a partially-covered older week must read as "no data"). The
  // in-progress week is "covered" as soon as it has any session — it's shown as
  // progress, never judged as a final miss.
  const starts = raw.exercise.map(e => e.start);
  const oldest = starts.length ? Math.min(...starts) : Infinity;
  const out: GoalWeekData[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = current - i * WEEK_MS;
    const weekEnd = weekStart + WEEK_MS;
    const to = Math.min(weekEnd, now);
    const complete = weekEnd <= now;
    const activities = activitiesInWindow(raw.exercise, weekStart, to);
    const energy = dailyEnergyInWindow(raw, weekStart, to);
    out.push({
      weekStart,
      complete,
      activities,
      tracked: trackedForWindow(
        raw.exercise,
        raw.steps,
        raw.activeEnergy,
        weekStart,
        to,
      ),
      energy,
      coverage: {
        steps: raw.steps.some(s => s.end > weekStart && s.start < to),
        calories: raw.activeEnergy.some(e => e.end > weekStart && e.start < to),
        activity: complete ? weekStart >= oldest : activities.length > 0,
        // A deficit needs BOTH sides on at least one day. Judged the same for
        // complete and in-progress weeks: if no day has both, it's "no data".
        energy: energy.some(d => d.net != null),
      },
    });
  }
  return out;
}

/** "STRENGTH_TRAINING" → "Strength training". */
export function humanizeExerciseType(type: string): string {
  const words = type.trim().toLowerCase().replace(/_/g, ' ');
  if (!words) return 'Workout';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Map one exercise record to the display / goal-matching summary shape. */
function toSummary(e: ExerciseRecord): ActivitySummary {
  return {
    name: e.displayName ?? humanizeExerciseType(e.typeName),
    type: e.typeName,
    displayName: e.displayName ?? null,
    durationMin: Math.round(e.durationMin),
    energyKcal: e.energyKcal != null ? Math.round(e.energyKcal) : null,
    start: e.start,
  };
}

/** Deduped sessions whose START falls in [from, to), newest first. Start-based
 * bucketing assigns each session to exactly one calendar week (no double-count
 * across a week boundary). */
export function activitiesInWindow(
  exercise: ExerciseRecord[],
  from: number,
  to: number,
): ActivitySummary[] {
  return dedupeIntervals(exercise.filter(e => e.start >= from && e.start < to))
    .sort((a, b) => b.start - a.start)
    .map(toSummary);
}

/**
 * Recent workouts as a display list — deduped across sources, within the last
 * week, newest first. Distinct from {@link trackedFromExercise}, which counts
 * sessions into goals; this preserves each session for the activities screen.
 */
export function activitiesFromExercise(
  exercise: ExerciseRecord[],
  now: number,
): ActivitySummary[] {
  const weekAgo = now - WEEK_MS;
  return dedupeIntervals(
    exercise.filter(e => e.end > weekAgo && e.start <= now),
  )
    .sort((a, b) => b.start - a.start)
    .map(toSummary);
}

/** How many days of history the goal-definition picker draws its options from.
 * 12 weeks — matches the exercise fetch window (EXERCISE_HISTORY_DAYS) and the
 * goal-history grid, so infrequent activities (e.g. an occasional rowing
 * session) still surface as goal options instead of dropping off after 2 weeks. */
const OPTIONS_WINDOW_MS = 84 * DAY_MS;

/**
 * Distinct recent activities for the goal-definition picker, from the last ~12
 * weeks of deduped sessions. Emits one option per exercise *type* and one per
 * distinct *displayName* the user actually recorded, each carrying a session
 * count and the longest duration seen (so the UI can suggest a min-duration).
 * Ordered most-frequent first — this is what makes the picker reflect real data
 * instead of a hard-coded source list.
 */
export function activityGoalOptions(
  exercise: ExerciseRecord[],
  now: number,
  windowMs: number = OPTIONS_WINDOW_MS,
): ActivityOption[] {
  const from = now - windowMs;
  const sessions = dedupeIntervals(
    exercise.filter(e => e.end > from && e.start <= now),
  );

  const byKey = new Map<string, ActivityOption>();
  const add = (
    field: 'type' | 'displayName',
    value: string,
    label: string,
    dur: number,
  ) => {
    const key = `${field}:${value.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.maxDurationMin = Math.max(existing.maxDurationMin, dur);
    } else {
      byKey.set(key, { field, value, label, count: 1, maxDurationMin: dur });
    }
  };

  for (const s of sessions) {
    const dur = Math.round(s.durationMin);
    if (s.typeName)
      add('type', s.typeName, humanizeExerciseType(s.typeName), dur);
    if (s.displayName) add('displayName', s.displayName, s.displayName, dur);
  }

  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || b.maxDurationMin - a.maxDurationMin,
  );
}

/** HR-zone weights for the training-load blend (non-clinical, transparent —
 * like readiness/ADR-004): harder zones cost more per minute. */
const CARDIO_ZONE_WEIGHTS = { light: 1, moderate: 2, vigorous: 3, peak: 4 };

function zoneLoad(z: CardioZones): number {
  return (
    z.lightMin * CARDIO_ZONE_WEIGHTS.light +
    z.moderateMin * CARDIO_ZONE_WEIGHTS.moderate +
    z.vigorousMin * CARDIO_ZONE_WEIGHTS.vigorous +
    z.peakMin * CARDIO_ZONE_WEIGHTS.peak
  );
}

/**
 * Cardio training load from the last 7 days (rolling, ending `now` — matches the
 * screen's day strip). `load` is an HR-zone-weighted minute blend summed per
 * day; `zones7d` totals minutes per Google HR zone. Sessions without HR-zone
 * data contribute nothing and flip nothing; `hasZoneData` stays false until at
 * least one session carries zones, so the UI shows "-" rather than a fake 0.
 */
export function cardioFromExercise(
  exercise: ExerciseRecord[],
  now: number,
): CardioSummary {
  const startOfToday = now - (now % DAY_MS);
  const from = startOfToday - 6 * DAY_MS;
  const sessions = dedupeIntervals(
    exercise.filter(e => e.start >= from && e.start <= now),
  );

  const zones7d: CardioZones = {
    lightMin: 0,
    moderateMin: 0,
    vigorousMin: 0,
    peakMin: 0,
  };
  const loadByDay = new Map<number, number>();
  let hasZoneData = false;

  for (const s of sessions) {
    if (!s.hrZones) continue;
    hasZoneData = true;
    zones7d.lightMin += s.hrZones.lightMin;
    zones7d.moderateMin += s.hrZones.moderateMin;
    zones7d.vigorousMin += s.hrZones.vigorousMin;
    zones7d.peakMin += s.hrZones.peakMin;
    const day = s.start - (s.start % DAY_MS);
    loadByDay.set(day, (loadByDay.get(day) ?? 0) + zoneLoad(s.hrZones));
  }

  const daily: CardioDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfToday - i * DAY_MS;
    daily.push({ dayStart, load: Math.round(loadByDay.get(dayStart) ?? 0) });
  }

  return {
    todayLoad: daily[daily.length - 1].load,
    weekLoad: daily.reduce((sum, d) => sum + d.load, 0),
    zones7d: {
      lightMin: Math.round(zones7d.lightMin),
      moderateMin: Math.round(zones7d.moderateMin),
      vigorousMin: Math.round(zones7d.vigorousMin),
      peakMin: Math.round(zones7d.peakMin),
    },
    daily,
    hasZoneData,
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
      id: e.id ?? null,
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

/** How many days of energy-balance history we surface (bounded by the
 * total-calories rollup's 14-day window). */
export const ADHERENCE_DAYS = 14;

/**
 * Per-day energy balance for each whole-day bucket in [from, to) (day-aligned
 * `from`, oldest first). `eaten` sums the day's logged food; `burned` sums the
 * day's total-energy bucket; `net = eaten − burned` only when BOTH exist (a
 * partial day can't be judged, so its net is null). Shared by the adherence
 * trend and the per-week deficit-goal computation so they never disagree.
 */
export function dailyEnergyInWindow(
  raw: RawHealthData,
  from: number,
  to: number,
): DailyEnergy[] {
  const out: DailyEnergy[] = [];
  for (let dayStart = from; dayStart < to; dayStart += DAY_MS) {
    const dayEnd = dayStart + DAY_MS;
    const meals = raw.nutrition.filter(
      e => e.start >= dayStart && e.start < dayEnd,
    );
    const eaten = meals.length
      ? Math.round(meals.reduce((s, e) => s + (e.kcal ?? 0), 0))
      : null;
    const buckets = raw.totalEnergy.filter(
      e => e.start >= dayStart && e.start < dayEnd,
    );
    const burned = buckets.length
      ? Math.round(buckets.reduce((s, e) => s + e.kcal, 0))
      : null;
    const net = eaten != null && burned != null ? eaten - burned : null;
    out.push({ dayStart, eaten, burned, net });
  }
  return out;
}

/**
 * Per-day energy balance for the last {@link ADHERENCE_DAYS} days (oldest
 * first) — the adherence trend's input.
 */
export function dailyEnergySeries(
  raw: RawHealthData,
  now: number,
): DailyEnergy[] {
  const startOfToday = now - (now % DAY_MS);
  const from = startOfToday - (ADHERENCE_DAYS - 1) * DAY_MS;
  return dailyEnergyInWindow(raw, from, startOfToday + DAY_MS);
}

/** One representative value per day from instantaneous samples (primary source,
 * latest reading in each day), oldest first — the shape the Trends charts want. */
export function dailySeries(samples: InstantSample[]): TrendPoint[] {
  const primary = primarySource(samples);
  const src = primary ? samples.filter(s => s.source === primary) : samples;
  const byDay = new Map<number, InstantSample>();
  for (const s of src) {
    const day = Math.floor(s.time / DAY_MS);
    const cur = byDay.get(day);
    if (!cur || s.time > cur.time) byDay.set(day, s);
  }
  return [...byDay.values()]
    .sort((a, b) => a.time - b.time)
    .map(s => ({ time: s.time, value: s.value }));
}

/** Per-night sleep hours (deduped, one session per night), oldest first. */
export function sleepHoursSeries(sleep: SleepRecord[]): TrendPoint[] {
  const byDay = new Map<number, SleepRecord>();
  for (const s of dedupeIntervals(sleep)) {
    const day = Math.floor(s.end / DAY_MS);
    const cur = byDay.get(day);
    if (!cur || s.end > cur.end) byDay.set(day, s);
  }
  return [...byDay.values()]
    .sort((a, b) => a.end - b.end)
    .map(s => ({
      time: s.end,
      value: Math.round((s.durationMin / 60) * 10) / 10,
    }));
}

/**
 * Per-night sleep QUALITY (efficiency %) — time actually asleep as a share of
 * the whole session (deep+REM+light ÷ including awake), from the stage
 * breakdown. This is distinct from sleep *length*: a long but restless night
 * scores low. Only nights whose source reported stages produce a point (else we
 * cannot judge quality, never guess). Oldest first.
 */
export function sleepQualitySeries(sleep: SleepRecord[]): TrendPoint[] {
  const staged = sleep.filter(s => s.stages);
  const byDay = new Map<number, SleepRecord>();
  for (const s of dedupeIntervals(staged)) {
    const day = Math.floor(s.end / DAY_MS);
    const cur = byDay.get(day);
    if (!cur || s.end > cur.end) byDay.set(day, s);
  }
  return [...byDay.values()]
    .sort((a, b) => a.end - b.end)
    .map(s => {
      const st = s.stages as SleepStages;
      const asleep = st.deepMin + st.remMin + st.lightMin;
      const total = asleep + st.awakeMin;
      return {
        time: s.end,
        value: total > 0 ? Math.round((asleep / total) * 100) : 0,
      };
    });
}

/** Per-day readiness, computed from that day's HRV/RHR vs the 30-day baseline
 * plus that night's sleep. Only days with HRV or RHR produce a point. */
export function readinessSeries(raw: RawHealthData): TrendPoint[] {
  const hrvBase = dailyBaseline(raw.hrvRmssd);
  const rhrBase = dailyBaseline(raw.restingHr);
  const toDayMap = (pts: TrendPoint[]) =>
    new Map(pts.map(p => [Math.floor(p.time / DAY_MS), p.value]));
  const hrvDay = toDayMap(dailySeries(raw.hrvRmssd));
  const rhrDay = toDayMap(dailySeries(raw.restingHr));
  const sleepDay = toDayMap(sleepHoursSeries(raw.sleep));

  const days = [...new Set([...hrvDay.keys(), ...rhrDay.keys()])].sort(
    (a, b) => a - b,
  );
  const out: TrendPoint[] = [];
  for (const day of days) {
    const hv = hrvDay.get(day);
    const rv = rhrDay.get(day);
    const hrv =
      hv != null && hrvBase > 0
        ? { value: hv, baseline: hrvBase, delta: hv - hrvBase }
        : null;
    const rhr =
      rv != null && rhrBase > 0
        ? { value: rv, baseline: rhrBase, delta: rv - rhrBase }
        : null;
    const sh = sleepDay.get(day);
    const sleep =
      sh != null
        ? { performancePct: clamp(((sh * 60) / SLEEP_NEED_MIN) * 100) }
        : null;
    const r = readiness(hrv, rhr, sleep);
    if (r) out.push({ time: day * DAY_MS, value: r.pct });
  }
  return out;
}

/** Build every metric's daily history for the Trends screen. */
export function buildTrendSeries(raw: RawHealthData): TrendSeries {
  return {
    hrv: dailySeries(raw.hrvRmssd),
    restingHr: dailySeries(raw.restingHr),
    sleepHours: sleepHoursSeries(raw.sleep),
    sleepQuality: sleepQualitySeries(raw.sleep),
    readiness: readinessSeries(raw),
    weight: dailySeries(raw.weight),
    bodyFat: dailySeries(raw.bodyFat),
  };
}

/** Keep `recent` first (authoritative), then history entries strictly older
 * than `cutoff` whose key hasn't already been seen — so a session/day present
 * in both reads (boundary overlap) is counted exactly once. */
function spliceByKey<T>(
  history: T[],
  recent: T[],
  cutoff: number,
  timeOf: (t: T) => number,
  keyOf: (t: T) => string,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of recent) {
    const k = keyOf(r);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  for (const h of history) {
    if (timeOf(h) >= cutoff) continue; // recent owns everything from cutoff on
    const k = keyOf(h);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

/**
 * Merge a cached deep-history read with a fresh recent read into one
 * RawHealthData for {@link deriveSnapshot}. The cheap, wide metrics (HRV, RHR,
 * sleep, weight, body-fat, nutrition) are taken entirely from `recent` — the
 * light refresh still fetches those at full 30-day depth. The heavy, sequential
 * exercise/steps/energy arrays are SPLICED: `history` supplies everything before
 * `cutoff`, `recent` supplies `cutoff`→now, de-duplicated by natural key so no
 * session or day is double-counted. This is what lets a routine refresh pull
 * only the recent slice yet still derive the full 12-week history.
 */
export function mergeRaw(
  history: RawHealthData,
  recent: RawHealthData,
  cutoff: number,
): RawHealthData {
  return {
    ...recent,
    exercise: spliceByKey(
      history.exercise,
      recent.exercise,
      cutoff,
      e => e.start,
      e => `${e.start}|${e.typeName}|${e.source}`,
    ),
    steps: spliceByKey(
      history.steps,
      recent.steps,
      cutoff,
      s => s.start,
      s => `${s.start}|${s.source}`,
    ),
    activeEnergy: spliceByKey(
      history.activeEnergy,
      recent.activeEnergy,
      cutoff,
      e => e.start,
      e => `${e.start}|${e.source}`,
    ),
    totalEnergy: spliceByKey(
      history.totalEnergy,
      recent.totalEnergy,
      cutoff,
      e => e.start,
      e => `${e.start}|${e.source}`,
    ),
    // Union the source labels seen across both reads.
    sources: [...new Set([...recent.sources, ...history.sources])],
  };
}

/** Derive the full snapshot the UI consumes from one raw read. */
export function deriveSnapshot(
  raw: RawHealthData,
  now: number,
): HealthSnapshot {
  const hrvBase = metricWithBaseline(raw.hrvRmssd);
  // Tagged SDNN: the mapping now uses the daily-average HRV field (what the
  // Google Health app shows), which is SDNN-class, not the deep-sleep RMSSD.
  const hrv = hrvBase ? { ...hrvBase, algorithm: 'SDNN' as const } : null;
  const restingHr = metricWithBaseline(raw.restingHr);

  const lastSleepSession = lastSleep(raw.sleep);
  const sleep = lastSleepSession
    ? {
        hours: lastSleepSession.durationMin / 60,
        performancePct: Math.round(
          clamp((lastSleepSession.durationMin / SLEEP_NEED_MIN) * 100),
        ),
        lastSessionEnd: lastSleepSession.end,
        stages: lastSleepSession.stages,
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
    energyBurnedToday: Math.round(
      activeEnergyInWindow(raw.totalEnergy, startOfToday, now),
    ),
    activities: activitiesFromExercise(raw.exercise, now),
    cardio: cardioFromExercise(raw.exercise, now),
    activityOptions: activityGoalOptions(raw.exercise, now),
    weeklyHistory: weeklyGoalHistory(raw, now),
    dailyEnergy: dailyEnergySeries(raw, now),
    trends: buildTrendSeries(raw),
    tracked: trackedFromExercise(
      raw.exercise,
      raw.steps,
      raw.activeEnergy,
      now,
    ),
    sources: raw.sources,
    readAt: raw.readAt,
    live: true,
  };
}
