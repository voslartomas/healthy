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
  ReadinessContribution,
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
  // Zepp (Amazfit) — the user's primary strap; writes typed exercise sessions
  // (real exerciseType; titles are null) plus good HRV/sleep, so it's preferred
  // across all metrics. Package confirmed from the [HEA-ACT] dataOrigin.
  'com.huami.watch.hmwatchmanager': 45, // Zepp / Amazfit
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
>(records: T[], rankOf: (r: T) => number = r => sourceRank(r.source)): T[] {
  const sorted = [...records].sort((a, b) => a.start - b.start);
  const kept: T[] = [];
  for (const rec of sorted) {
    const overlapsHigher = kept.some(
      k => rec.start < k.end && k.start < rec.end && rankOf(k) > rankOf(rec),
    );
    if (overlapsHigher) continue;
    // Also remove already-kept records this one outranks on the same window.
    for (let i = kept.length - 1; i >= 0; i--) {
      const k = kept[i];
      if (rec.start < k.end && k.start < rec.end && rankOf(rec) > rankOf(k)) {
        kept.splice(i, 1);
      }
    }
    kept.push(rec);
  }
  return kept;
}

/**
 * De-dup rank for overlapping EXERCISE sessions across sources. A record that
 * actually IDENTIFIES the activity — a real (non-zero) exercise type and/or a
 * title — beats a generic OTHER_WORKOUT (type 0, no title) even from a
 * higher-priority app. This is what recovers the activity type when e.g. Fitbit
 * writes a session as generic type-0 while another connected app wrote the same
 * workout typed. Ties fall back to normal source priority.
 */
export function exerciseInfoRank(e: {
  exerciseType: number;
  displayName?: string | null;
  source: string;
}): number {
  // sourceRank is 0..40, so the +1000 / +100 boosts dominate: a typed session
  // always outranks an untyped one regardless of which app wrote it.
  let score = sourceRank(e.source);
  if (e.exerciseType !== 0) score += 1000;
  if (e.displayName) score += 100;
  return score;
}

const HALF_DAY_MS = DAY_MS / 2;

/**
 * The "night index" a timestamp belongs to — the material fix for HRV reading
 * LOW against the Google Health / wearable figure.
 *
 * Nightly HRV samples must be grouped by NIGHT, in LOCAL time. Bucketing them by
 * UTC day (`floor(t / DAY_MS)`) splits every night in two for any timezone off
 * UTC: in UTC+2, UTC midnight is 02:00 local, so the early hours of sleep — the
 * deep-sleep cycles where RMSSD runs highest — are filed under *yesterday*, and
 * "today" is left holding only the pre-waking tail, where RMSSD is at its lowest.
 * The displayed value came out systematically below what the source app shows.
 *
 * Grouping noon→local-noon puts a whole night in one bucket, labelled by the
 * morning it ends on — the convention wearables use. A daytime reading after
 * local noon (a nap, a spot check) files under the coming night; that is the
 * documented trade-off of a single cut point, and it is rare for nightly HRV.
 */
export function nightIndex(time: number): number {
  const localMs = time - new Date(time).getTimezoneOffset() * 60_000;
  return Math.floor((localMs + HALF_DAY_MS) / DAY_MS);
}

/** Inverse of {@link nightIndex} for display: a timestamp on the morning that
 * night ended (local midnight), so chart labels and tooltips read as that date. */
export function nightIndexToTime(index: number): number {
  const approx = index * DAY_MS;
  return approx + new Date(approx).getTimezoneOffset() * 60_000;
}

/**
 * Most-recent LOCAL-calendar midnight at or before `time`, as an epoch-ms
 * timestamp. This is the "today" cut the device's own health apps — and the user
 * — read by. The tempting `time - (time % DAY_MS)` gives UTC midnight instead,
 * which for a user east of UTC starts "today" hours late and silently drops the
 * first local hours of steps and burned energy — the persistent few-hundred-kcal
 * shortfall against the Google Health total. Matches the local-midnight window
 * the Health Connect burned-calorie aggregate already uses.
 */
export function startOfLocalDay(time: number): number {
  const offsetMs = new Date(time).getTimezoneOffset() * 60_000;
  return Math.floor((time - offsetMs) / DAY_MS) * DAY_MS + offsetMs;
}

/** How far back a self-calibrating baseline looks. Pinned so it stays a 30-day
 * baseline (as documented and as `readiness` assumes) no matter how much history
 * the fetch window returns — the deep read now spans 180 days for Trends. */
export const BASELINE_DAYS = 30;

/** Keep only the samples within the last {@link BASELINE_DAYS} of the newest one. */
function baselineWindow<T extends { time: number }>(samples: T[]): T[] {
  if (samples.length === 0) return samples;
  let newest = samples[0].time;
  for (const s of samples) if (s.time > newest) newest = s.time;
  const from = newest - BASELINE_DAYS * DAY_MS;
  return samples.filter(s => s.time >= from);
}

/** The same trailing-window trim for an already-bucketed `[nightIndex, value]`
 * map: the most recent {@link BASELINE_DAYS} nights' values. */
function baselineNights(entries: [number, number][]): number[] {
  if (entries.length === 0) return [];
  const newest = Math.max(...entries.map(([night]) => night));
  return entries
    .filter(([night]) => night > newest - BASELINE_DAYS)
    .map(([, value]) => value);
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

/** Baseline = median of one representative (latest) value per day, over the
 * trailing {@link BASELINE_DAYS} only. */
function dailyBaseline(samples: InstantSample[]): number {
  const byDay = new Map<number, InstantSample>();
  for (const s of baselineWindow(samples)) {
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

/**
 * Per-NIGHT MEAN of a metric's samples, from the single primary source. Used for
 * metrics whose source logs MANY readings through the night and whose displayed
 * figure is the night's aggregate — that is, HRV: wearables write one RMSSD value
 * every ~5 minutes of sleep, and the app shows the night's average, not an
 * arbitrary 5-minute sample.
 *
 * MEAN, not median, for parity with the source. An earlier revision used the
 * median to blunt awake-period RMSSD spikes, but the reference apps (Google
 * Health, and Fitbit's own nightly HRV) average the night's samples, and the
 * median read consistently BELOW them on real data — for a right-skewed
 * distribution like RMSSD it sits well under the mean. Matching what the user
 * sees in their own source app matters more here than our own smoothing
 * preference; the value is compared against a baseline computed the same way, so
 * the readiness heuristic is unaffected either way.
 *
 * Keyed by NIGHT (local noon→noon), not UTC day — see {@link nightIndex}.
 */
export function nightlyAverage(samples: InstantSample[]): Map<number, number> {
  const primary = primarySource(samples);
  const src = primary ? samples.filter(s => s.source === primary) : samples;
  const byNight = new Map<number, number[]>();
  for (const s of src) {
    const night = nightIndex(s.time);
    const arr = byNight.get(night);
    if (arr) arr.push(s.value);
    else byNight.set(night, [s.value]);
  }
  const out = new Map<number, number>();
  for (const [night, vals] of byNight) {
    out.set(night, vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

/**
 * HRV metric the way wearables + the Google Health app present it: the most
 * recent night's AVERAGE RMSSD (see {@link nightlyAverage}), with a baseline =
 * median of the recent nightly values. This replaces the generic
 * latest-single-sample selection for HRV, which surfaced an arbitrary 5-minute
 * value that matched neither the app nor itself day-to-day.
 */
export function hrvMetric(samples: InstantSample[]): MetricWithBaseline | null {
  const byNight = nightlyAverage(samples);
  if (byNight.size === 0) return null;
  const latestNight = Math.max(...byNight.keys());
  const value = byNight.get(latestNight) as number;
  const baseline = median(baselineNights([...byNight.entries()])) || value;
  return { value, baseline, delta: value - baseline };
}

/** Per-night average series (oldest first) — the trend counterpart of
 * {@link nightlyAverage}, for metrics shown as a nightly aggregate. */
export function nightlyAverageSeries(samples: InstantSample[]): TrendPoint[] {
  return [...nightlyAverage(samples).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([night, value]) => ({ time: nightIndexToTime(night), value }));
}

/**
 * Per-day {median, min, max} of a metric's primary-source samples, oldest first
 * — the material for a range band. HRV's nightly spread (min–max of that night's
 * ~5-min readings) is wide and informative, so the Trends chart shades it behind
 * the median line.
 */
export function dailyStats(
  samples: InstantSample[],
): { time: number; median: number; min: number; max: number }[] {
  const primary = primarySource(samples);
  const src = primary ? samples.filter(s => s.source === primary) : samples;
  const byNight = new Map<number, number[]>();
  for (const s of src) {
    const night = nightIndex(s.time);
    const arr = byNight.get(night);
    if (arr) arr.push(s.value);
    else byNight.set(night, [s.value]);
  }
  return [...byNight.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([night, vals]) => ({
      time: nightIndexToTime(night),
      median: median(vals),
      min: Math.min(...vals),
      max: Math.max(...vals),
    }));
}

/**
 * Steps in [from, to) from a SINGLE source (no cross-origin sum), but choosing
 * that source by best coverage rather than brand priority alone.
 *
 * The old rule "sum only the highest-priority source present" undercounts badly
 * when the top-priority app synced only a sparse stub for the window while a
 * lower-priority source actually tracked it — the "6 steps when I have thousands
 * this week" bug (a wearable that hadn't synced yet outranking the phone counter
 * that had). So we sum per source, then among the sources whose total is within
 * 20% of the best-covered source (i.e. they plausibly tracked the same window)
 * trust the highest-priority one. Comparable counts still defer to the trusted
 * device (no phone-vs-wearable double count); a source that clearly didn't track
 * the window (orders of magnitude fewer steps) is ignored.
 */
export function stepsInWindow(
  steps: StepsRecord[],
  from: number,
  to: number,
): number {
  const inWindow = steps.filter(s => s.end > from && s.start < to);
  if (inWindow.length === 0) return 0;
  const totals = new Map<string, number>();
  for (const s of inWindow)
    totals.set(s.source, (totals.get(s.source) ?? 0) + s.count);
  return bestCoveredTotal(totals);
}

/**
 * Among per-source totals, choose the ONE source that best covered the window —
 * preferring real coverage over brand priority. Sources whose total is within
 * 20% of the best-covered (highest-total) source are treated as having tracked
 * the same window; among those we trust the highest {@link sourceRank}. This is
 * what stops a high-priority source that wrote only a sparse stub — a watch that
 * logged one short workout, say — from shadowing the source that tracked the
 * whole day (the steps "6 steps when I walked thousands" bug and the identical
 * "BURNED 65 vs 1000+" energy undercount). Returns null for an empty map.
 */
function bestCoveredSource(totals: Map<string, number>): string | null {
  if (totals.size === 0) return null;
  const entries = [...totals.entries()].map(([source, total]) => ({
    source,
    total,
    rank: sourceRank(source),
  }));
  const maxTotal = Math.max(...entries.map(e => e.total));
  const threshold = maxTotal * 0.8;
  const candidates = entries.filter(e => e.total >= threshold);
  candidates.sort((a, b) => b.rank - a.rank || b.total - a.total);
  return candidates[0].source;
}

/** The best-covered source's total (see {@link bestCoveredSource}). */
function bestCoveredTotal(totals: Map<string, number>): number {
  const source = bestCoveredSource(totals);
  return source == null ? 0 : (totals.get(source) ?? 0);
}

/**
 * Energy summed over the UNION of the records' time coverage, prorating any
 * overlap so each instant is counted at most once. Health Connect can hold
 * overlapping or duplicate energy buckets from a SINGLE source and de-overlaps
 * them in its own aggregate (what its UI shows); a naive raw sum does not, which
 * double-counted the day's burn — the "BURNED 1800 while Health Connect shows
 * ~1000" overcount. Non-overlapping records are summed exactly as before.
 */
function unionEnergyKcal(records: EnergyRecord[]): number {
  const sorted = [...records].sort((a, b) => a.start - b.start);
  let sum = 0;
  let coveredUntil = -Infinity;
  for (const r of sorted) {
    if (r.end <= r.start) {
      // Degenerate/instant record: count once if it opens a new instant.
      if (r.start >= coveredUntil) {
        sum += r.kcal;
        coveredUntil = Math.max(coveredUntil, r.start);
      }
      continue;
    }
    if (r.start >= coveredUntil) {
      sum += r.kcal; // wholly new coverage
      coveredUntil = r.end;
    } else if (r.end > coveredUntil) {
      // Partial overlap: keep only the not-yet-covered tail, prorated by time.
      sum += r.kcal * ((r.end - coveredUntil) / (r.end - r.start));
      coveredUntil = r.end;
    }
    // else fully inside already-covered time → skip (pure duplicate bucket)
  }
  return sum;
}

/**
 * Clip an energy record to [from, to], prorating its kcal by the fraction of its
 * duration inside the window. Some sources (notably Google Fit,
 * `com.google.android.apps.fitness`) write TotalCaloriesBurned as WHOLE-DAY
 * forecast buckets that run past `now` to local midnight; summing their full
 * kcal counts hours that haven't happened yet — the "BURNED 1832 for a day
 * that's only ~960 so far" overcount. Returns null if the record lies entirely
 * outside the window.
 */
function clipEnergyToWindow(
  e: EnergyRecord,
  from: number,
  to: number,
): EnergyRecord | null {
  if (e.end <= e.start) {
    // Instantaneous record: keep iff its instant falls inside the window.
    return e.start >= from && e.start < to ? e : null;
  }
  const start = Math.max(e.start, from);
  const end = Math.min(e.end, to);
  if (end <= start) return null;
  const frac = (end - start) / (e.end - e.start);
  return { ...e, start, end, kcal: e.kcal * frac };
}

function activeEnergyInWindow(
  energy: EnergyRecord[],
  from: number,
  to: number,
): number {
  // Clip+prorate each record to the window FIRST — a source that writes a
  // full-day forecast (Google Fit) must contribute only its elapsed portion,
  // not the projected remainder of the day.
  const inWindow = energy
    .map(e => clipEnergyToWindow(e, from, to))
    .filter((e): e is EnergyRecord => e != null);
  if (inWindow.length === 0) return 0;
  // Take each source's UNION-coverage total (de-overlapped), then trust the
  // source that actually covered the window — not merely the highest-priority
  // one, and not the one reporting the largest number (which may be a whole-day
  // projection). Together this fixes the 65 undercount (sparse high-priority
  // stub), the overlapping-bucket overcount, and the Google-Fit forecast
  // overcount.
  const bySource = new Map<string, EnergyRecord[]>();
  for (const e of inWindow) {
    const arr = bySource.get(e.source);
    if (arr) arr.push(e);
    else bySource.set(e.source, [e]);
  }
  const totals = new Map<string, number>();
  for (const [source, recs] of bySource)
    totals.set(source, unionEnergyKcal(recs));
  const source = bestCoveredSource(totals);
  return source == null ? 0 : (totals.get(source) ?? 0);
}

/**
 * The energy records to treat as "burned": total expenditure (TDEE) when any
 * source writes {@link RawHealthData.totalEnergy}, else active energy as a
 * fallback. On Android several sources (notably Fitbit and Zepp/Amazfit) write
 * only `ActiveCaloriesBurned` to Health Connect and no `TotalCaloriesBurned`, so
 * keying "burned" strictly off total energy left the dashboard showing nothing
 * ("BURNED ——", no net) after the switch to Health Connect. Falling back to
 * active energy shows a real, if conservative, burned figure instead of 0.
 */
function burnEnergyRecords(raw: RawHealthData): EnergyRecord[] {
  return raw.totalEnergy.length > 0 ? raw.totalEnergy : raw.activeEnergy;
}

/**
 * Health Connect `ExerciseSessionRecord.exerciseType` enum ints we map to goal
 * sources. Values are the documented AndroidX constants. Anything not listed is
 * treated as generic cardio for the zone-2 minutes tally.
 */
// Authoritative AndroidX / react-native-health-connect exercise-type ints:
// STRENGTH_TRAINING=70, WEIGHTLIFTING=81 (NOT 65 — that's SOFTBALL, an old bug),
// PILATES=48, YOGA=83, WALKING=79.
const STRENGTH_TYPES = new Set([70, 81]); // STRENGTH_TRAINING, WEIGHTLIFTING
const CORE_TYPES = new Set([48, 83]); // PILATES, YOGA (closest core proxies)
const NON_CARDIO_TYPES = new Set([70, 81, 48, 83, 79]); // strength/pilates/yoga/walking

/**
 * Minutes a session counts toward the "Zone 2 minutes" goal — real time at an
 * aerobic-or-harder heart rate, not raw session length.
 *
 * When the session has computed HR zones we sum zone 2 and above (moderate
 * ≥60 %HRmax + vigorous + peak, i.e. everything but the light warm-up band).
 * When it does NOT — the source recorded no in-session HR, or no usable HRmax —
 * we fall back to the session's own minutes for real cardio types (non-cardio
 * types like strength/walking still contribute nothing). Without this fallback a
 * user whose watch logs workouts but not a per-session HR stream would see the
 * goal collapse to zero; the fallback keeps it meaningful while the HR path
 * makes it accurate wherever the data exists. See ADR-006.
 */
function zone2PlusMinutes(s: ExerciseRecord): number {
  const z = s.hrZones;
  if (z) return z.moderateMin + z.vigorousMin + z.peakMin;
  return NON_CARDIO_TYPES.has(s.exerciseType) ? 0 : s.durationMin;
}

/**
 * Auto-tracked weekly totals per goal source from real activity.
 *
 * `zone2` is minutes in HR zone 2 and above ({@link zone2PlusMinutes}), falling
 * back to a cardio session's own minutes only when it carries no HR zones; the
 * source adapters compute per-session HR zones for every fetched session, so the
 * figure is HR-based wherever the data allows. `core` uses pilates/yoga as the
 * closest available session types (called out in the ADR).
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
    exerciseInfoRank,
  );

  let strength = 0;
  let core = 0;
  let zone2 = 0;
  for (const s of sessions) {
    if (STRENGTH_TYPES.has(s.exerciseType)) strength += 1;
    if (CORE_TYPES.has(s.exerciseType)) core += 1;
    zone2 += zone2PlusMinutes(s);
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
 * the exercise fetch window) reaches back far enough to cover it,
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
    exerciseInfoRank,
  );
  let strength = 0;
  let core = 0;
  let zone2 = 0;
  for (const s of sessions) {
    if (STRENGTH_TYPES.has(s.exerciseType)) strength += 1;
    if (CORE_TYPES.has(s.exerciseType)) core += 1;
    zone2 += zone2PlusMinutes(s);
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
    // One tracked total per day (Mon→Sun) so the Week tile can draw per-day
    // bars. Reuses trackedForWindow, so a day's number can never disagree with
    // the week's — the week is just these seven summed.
    const dailyTracked = Array.from({ length: 7 }, (_, d) => {
      const dayStart = weekStart + d * DAY_MS;
      return trackedForWindow(
        raw.exercise,
        raw.steps,
        raw.activeEnergy,
        dayStart,
        Math.min(dayStart + DAY_MS, to),
      );
    });
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
      dailyTracked,
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
  return dedupeIntervals(
    exercise.filter(e => e.start >= from && e.start < to),
    exerciseInfoRank,
  )
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
    exerciseInfoRank,
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
    exerciseInfoRank,
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
  const startOfToday = startOfLocalDay(now);
  const from = startOfToday - 6 * DAY_MS;
  const sessions = dedupeIntervals(
    exercise.filter(e => e.start >= from && e.start <= now),
    exerciseInfoRank,
  );

  const zones7d: CardioZones = {
    lightMin: 0,
    moderateMin: 0,
    vigorousMin: 0,
    peakMin: 0,
  };
  const loadByDay = new Map<number, number>();
  let hasZoneData = false;
  let hasFallbackLoad = false;

  for (const s of sessions) {
    const day = startOfLocalDay(s.start);
    if (s.hrZones) {
      hasZoneData = true;
      zones7d.lightMin += s.hrZones.lightMin;
      zones7d.moderateMin += s.hrZones.moderateMin;
      zones7d.vigorousMin += s.hrZones.vigorousMin;
      zones7d.peakMin += s.hrZones.peakMin;
      loadByDay.set(day, (loadByDay.get(day) ?? 0) + zoneLoad(s.hrZones));
    } else if (!NON_CARDIO_TYPES.has(s.exerciseType)) {
      // A CARDIO session with no readable HR samples — e.g. Fitbit writes the
      // ExerciseSession to Health Connect but not its per-second HeartRate, so
      // we can't bin zones. Rather than let it read as 0 load (the "cardio load
      // shows 0 for Fitbit" bug), estimate a load from its duration at a
      // moderate-intensity weight. It contributes to the load number only, never
      // the (honest, HR-derived) zone breakdown. Non-cardio types (strength,
      // core, walking) are excluded so they don't inflate cardio load.
      const est = s.durationMin * CARDIO_ZONE_WEIGHTS.moderate;
      if (est > 0) {
        hasFallbackLoad = true;
        loadByDay.set(day, (loadByDay.get(day) ?? 0) + est);
      }
    }
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
    hasLoadData: hasZoneData || hasFallbackLoad,
  };
}

/** Sessions closer together than this are one interrupted sleep period; further
 * apart they are separate (a nap vs the night). */
const SLEEP_MERGE_GAP_MS = 3 * 60 * 60 * 1000;

/** Add `b`'s stage minutes into `a`. */
function addStages(a: SleepStages, b: SleepStages): SleepStages {
  return {
    deepMin: a.deepMin + b.deepMin,
    remMin: a.remMin + b.remMin,
    lightMin: a.lightMin + b.lightMin,
    awakeMin: a.awakeMin + b.awakeMin,
  };
}

/**
 * Collapse the deduped sessions into sleep PERIODS: consecutive sessions less
 * than {@link SLEEP_MERGE_GAP_MS} apart are one night, summed.
 *
 * Sources routinely write a single night as several SleepSession records — one
 * per uninterrupted block, split around a long wake-up. Treating each record as
 * a whole night made the app show only one block of an interrupted night, which
 * is the bulk of why our total ran short of the source app's. Merging on the gap
 * (rather than bucketing by clock time) also keeps an afternoon nap out of the
 * night's total, since it is hours away from it.
 */
export function sleepPeriods(sleep: SleepRecord[]): SleepRecord[] {
  const sorted = [...dedupeIntervals(sleep)].sort((a, b) => a.start - b.start);
  const out: SleepRecord[] = [];
  for (const rec of sorted) {
    const prev = out[out.length - 1];
    if (prev && rec.start - prev.end < SLEEP_MERGE_GAP_MS) {
      // Stage totals only exist for the sessions that reported them; a session
      // without stages still contributes its asleep minutes, so fold those into
      // light — the same "asleep but unclassified" rule the adapters apply.
      const merged: SleepStages | null =
        prev.stages && rec.stages
          ? addStages(prev.stages, rec.stages)
          : prev.stages
            ? {
                ...prev.stages,
                lightMin: prev.stages.lightMin + rec.durationMin,
              }
            : rec.stages
              ? {
                  ...rec.stages,
                  lightMin: rec.stages.lightMin + prev.durationMin,
                }
              : null;
      out[out.length - 1] = {
        start: Math.min(prev.start, rec.start),
        end: Math.max(prev.end, rec.end),
        durationMin: prev.durationMin + rec.durationMin,
        source: prev.source,
        stages: merged,
      };
    } else {
      out.push(rec);
    }
  }
  return out;
}

/** How far back "last night" can reach — enough for someone opening the app late
 * in the evening, without pulling in the night before that. */
const LAST_SLEEP_WINDOW_MS = 36 * 60 * 60 * 1000;

/**
 * The night the app calls "last night": the LONGEST sleep period to end within
 * {@link LAST_SLEEP_WINDOW_MS}, falling back to the most recent period when
 * nothing is that fresh.
 *
 * Not simply the latest-ending session, which was wrong twice over: it showed
 * one block of a night written as several sessions, and it let a twenty-minute
 * afternoon nap replace the previous night's seven hours purely because the nap
 * ends later.
 */
function lastSleep(
  sleep: SleepRecord[],
  now: number,
  agg?: { night: number; minutes: number }[] | null,
): SleepRecord | null {
  const byNight = mainSleepByNight(sleep, agg);
  const periods = [...byNight.values()].sort((a, b) => a.end - b.end);
  if (periods.length === 0) return null;
  const longest = (xs: SleepRecord[]) =>
    xs.reduce((a, b) => (b.durationMin > a.durationMin ? b : a));
  const recent = periods.filter(p => now - p.end <= LAST_SLEEP_WINDOW_MS);
  return recent.length > 0 ? longest(recent) : periods[periods.length - 1];
}

/**
 * Raise a night's duration to the platform's own total, crediting the difference
 * to light sleep so the stage split still adds up to what is shown.
 *
 * A FLOOR, never a ceiling. Health Connect's SLEEP_DURATION_TOTAL subtracts all
 * wake, including the brief arousals the app (and Google Health's own display)
 * count inside the sleep period, so it legitimately reads lower than what we
 * show — letting it pull the number down would reintroduce the short night. It
 * is still worth having as a floor: if the platform counts MORE sleep for a
 * night than we assembled, we are missing a session and should not under-report.
 *
 * Light is where the difference goes because that is what it is: sleep the
 * platform counted and our stage mapping did not classify — the same rule the
 * adapter applies to unlabelled time inside a session.
 */
function withPlatformTotal(period: SleepRecord, minutes: number): SleepRecord {
  const delta = minutes - period.durationMin;
  if (delta < 1) return period;
  return {
    ...period,
    durationMin: minutes,
    stages: period.stages
      ? {
          ...period.stages,
          lightMin: Math.max(0, period.stages.lightMin + delta),
        }
      : period.stages,
  };
}

/**
 * One record per night, keyed by night index — every sleep period the night
 * contains, SUMMED, then reconciled against the platform's own nightly total
 * when the read provided one.
 *
 * Summing (rather than picking the night's longest period) is what Health
 * Connect does over the same window, and it is the second half of the fix for a
 * night reading short: periods too far apart for `sleepPeriods` to merge used to
 * be dropped entirely, taking their minutes — and their light sleep — with them.
 * An afternoon nap does not inflate the night it follows: `nightIndex` cuts at
 * local noon, so it opens the next night's bucket.
 */
function mainSleepByNight(
  sleep: SleepRecord[],
  agg?: { night: number; minutes: number }[] | null,
): Map<number, SleepRecord> {
  const byNight = new Map<number, SleepRecord>();
  for (const p of sleepPeriods(sleep)) {
    const night = nightIndex(p.end);
    const cur = byNight.get(night);
    if (!cur) {
      byNight.set(night, p);
      continue;
    }
    byNight.set(night, {
      start: Math.min(cur.start, p.start),
      end: Math.max(cur.end, p.end),
      durationMin: cur.durationMin + p.durationMin,
      source: cur.source,
      stages:
        cur.stages && p.stages
          ? addStages(cur.stages, p.stages)
          : cur.stages
            ? { ...cur.stages, lightMin: cur.stages.lightMin + p.durationMin }
            : p.stages
              ? { ...p.stages, lightMin: p.stages.lightMin + cur.durationMin }
              : null,
    });
  }
  if (!agg) return byNight;
  for (const { night, minutes } of agg) {
    const period = byNight.get(night);
    if (period) byNight.set(night, withPlatformTotal(period, minutes));
  }
  return byNight;
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
  sleep: { performancePct: number; hours?: number } | null,
): ReadinessMetric | null {
  if (!hrv && !restingHr) return null;

  const parts: ReadinessContribution[] = [];
  if (hrv && hrv.baseline > 0) {
    // ±20% around baseline maps to 0..100, centered at 65.
    const ratio = (hrv.value - hrv.baseline) / hrv.baseline;
    parts.push({
      key: 'hrv',
      value: hrv.value,
      reference: hrv.baseline,
      score: clamp(65 + ratio * 175),
      weight: 0.5,
    });
  }
  if (restingHr && restingHr.baseline > 0) {
    const ratio = (restingHr.baseline - restingHr.value) / restingHr.baseline;
    parts.push({
      key: 'rhr',
      value: restingHr.value,
      reference: restingHr.baseline,
      score: clamp(65 + ratio * 300),
      weight: 0.3,
    });
  }
  if (sleep) {
    parts.push({
      key: 'sleep',
      value:
        sleep.hours ?? (sleep.performancePct / 100) * (SLEEP_NEED_MIN / 60),
      reference: SLEEP_NEED_MIN / 60,
      score: clamp(sleep.performancePct),
      weight: 0.2,
    });
  }

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const pct = Math.round(
    parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight,
  );
  const state: ReadinessMetric['state'] =
    pct >= 66 ? 'Recovered' : pct >= 34 ? 'Balanced' : 'Strained';
  // Renormalise the shares over the inputs we actually had, so what the UI
  // prints ("50% of score") is the weight that was really applied.
  const contributors = parts.map(p => ({
    ...p,
    weight: p.weight / totalWeight,
  }));
  return { pct, state, contributors };
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
  const startOfToday = startOfLocalDay(now);
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
  const burnRecords = burnEnergyRecords(raw);
  const out: DailyEnergy[] = [];
  for (let dayStart = from; dayStart < to; dayStart += DAY_MS) {
    const dayEnd = dayStart + DAY_MS;
    const meals = raw.nutrition.filter(
      e => e.start >= dayStart && e.start < dayEnd,
    );
    const eaten = meals.length
      ? Math.round(meals.reduce((s, e) => s + (e.kcal ?? 0), 0))
      : null;
    // Prefer the platform's own per-day total (see dailyBurnedAgg) — the record
    // sum is the fallback for reads without it (iOS, tests, aggregate failure).
    const burned =
      burnedFromAgg(raw.dailyBurnedAgg, dayStart, dayEnd) ??
      sumRecords(burnRecords, dayStart, dayEnd);
    const net = eaten != null && burned != null ? eaten - burned : null;
    out.push({ dayStart, eaten, burned, net });
  }
  return out;
}

/** Sum energy records that START inside the window; null when there are none. */
function sumRecords(
  records: EnergyRecord[],
  from: number,
  to: number,
): number | null {
  const buckets = records.filter(e => e.start >= from && e.start < to);
  return buckets.length
    ? Math.round(buckets.reduce((s, e) => s + e.kcal, 0))
    : null;
}

/**
 * The platform's per-day burned total for a window, or null when it has none.
 *
 * The aggregate buckets on LOCAL calendar days while these windows are UTC-day
 * aligned, so the two grids are offset by the timezone. Match on greatest
 * OVERLAP rather than on an exact boundary, and require more than half a day of
 * it so a given aggregate day is only ever credited to one window.
 */
function burnedFromAgg(
  agg: { dayStart: number; kcal: number }[] | null | undefined,
  from: number,
  to: number,
): number | null {
  if (!agg || agg.length === 0) return null;
  let best: { kcal: number; overlap: number } | null = null;
  for (const day of agg) {
    const overlap =
      Math.min(to, day.dayStart + DAY_MS) - Math.max(from, day.dayStart);
    if (overlap > DAY_MS / 2 && (!best || overlap > best.overlap)) {
      best = { kcal: day.kcal, overlap };
    }
  }
  return best ? best.kcal : null;
}

/**
 * Per-day energy balance for the last {@link ADHERENCE_DAYS} days (oldest
 * first) — the adherence trend's input.
 */
export function dailyEnergySeries(
  raw: RawHealthData,
  now: number,
): DailyEnergy[] {
  const startOfToday = startOfLocalDay(now);
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
export function sleepHoursSeries(
  sleep: SleepRecord[],
  agg?: { night: number; minutes: number }[] | null,
): TrendPoint[] {
  return [...mainSleepByNight(sleep, agg).values()]
    .sort((a, b) => a.end - b.end)
    .map(s => ({
      time: s.end,
      value: Math.round((s.durationMin / 60) * 10) / 10,
    }));
}

/**
 * A full night's worth of DEEP and REM sleep, in minutes — the reference the
 * quality score is graded against. These are the middle of the normal adult
 * ranges (deep ~13–23% of the night, REM ~20–25%) applied to the 8h sleep need,
 * so "100%" means a full night that also had a full night's restorative sleep.
 */
const DEEP_TARGET_MIN = 0.2 * SLEEP_NEED_MIN; // 96 min
const REM_TARGET_MIN = 0.22 * SLEEP_NEED_MIN; // ~105 min

/**
 * Sleep quality 0–100 — NON-CLINICAL, the same kind of disclosed blend as the
 * readiness heuristic (ADR-004):
 *   • length vs the 8h need           (weight 0.5)
 *   • deep sleep vs a full night's    (weight 0.25)
 *   • REM sleep vs a full night's     (weight 0.25)
 *
 * Graded on ABSOLUTE minutes, not on each stage's share of the night. That is
 * the point: a short night yields less deep and REM in absolute terms, and the
 * score has to fall for it. Scoring shares instead would let a bad night keep a
 * high mark just for having normal proportions.
 *
 * This replaces sleep EFFICIENCY (time asleep ÷ time in bed), which stopped
 * discriminating once brief arousals were counted inside the sleep period —
 * every night scored ~98%, including six-hour ones.
 */
export function sleepQualityScore(
  durationMin: number,
  stages: SleepStages,
): number {
  const lengthScore = clamp((durationMin / SLEEP_NEED_MIN) * 100);
  const deepScore = clamp((stages.deepMin / DEEP_TARGET_MIN) * 100);
  const remScore = clamp((stages.remMin / REM_TARGET_MIN) * 100);
  return Math.round(lengthScore * 0.5 + deepScore * 0.25 + remScore * 0.25);
}

/**
 * Per-night sleep QUALITY (see {@link sleepQualityScore}) — how restorative the
 * night was, distinct from its length alone. Only nights whose source reported
 * stages produce a point (without them we cannot judge quality, and never
 * guess). Oldest first.
 */
export function sleepQualitySeries(
  sleep: SleepRecord[],
  agg?: { night: number; minutes: number }[] | null,
): TrendPoint[] {
  const staged = sleep.filter(s => s.stages);
  return [...mainSleepByNight(staged, agg).values()]
    .sort((a, b) => a.end - b.end)
    .map(s => ({
      time: s.end,
      value: sleepQualityScore(s.durationMin, s.stages as SleepStages),
    }));
}

/** Per-day readiness, computed from that day's HRV/RHR vs the 30-day baseline
 * plus that night's sleep. Only days with HRV or RHR produce a point. */
export function readinessSeries(raw: RawHealthData): TrendPoint[] {
  // HRV uses nightly MEDIANs (per {@link hrvMetric}); RHR stays latest-per-day.
  const hrvDay = nightlyAverage(raw.hrvRmssd);
  const hrvBase = median(baselineNights([...hrvDay.entries()]));
  const rhrBase = dailyBaseline(raw.restingHr);
  const toDayMap = (pts: TrendPoint[]) =>
    new Map(pts.map(p => [nightIndex(p.time), p.value]));
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
    if (r) out.push({ time: nightIndexToTime(day), value: r.pct });
  }
  return out;
}

/**
 * A ROLLING min/max band around a daily series: for each day, the min and max of
 * the series values within a centered `±half`-day window (clamped at the ends).
 *
 * This is the material for the Trends range band, and it deliberately replaces
 * the old per-day INTRADAY min/max. Intraday spread was wrong for both banded
 * metrics: HRV's nightly spread of ~5-minute RMSSD readings is so wide it
 * flattened the median line on the shared y-axis, and resting HR has a single
 * reading per day so its intraday range collapsed to lo==hi (the "RHR shows
 * 50–50, no range" report). A rolling band of the DAILY values instead shows
 * real recent day-to-day variability, on the same scale as the line, for both.
 */
export function rollingRange(
  points: TrendPoint[],
  half = 3,
): { time: number; lo: number; hi: number }[] {
  return points.map((p, i) => {
    let lo = p.value;
    let hi = p.value;
    const from = Math.max(0, i - half);
    const to = Math.min(points.length - 1, i + half);
    for (let j = from; j <= to; j++) {
      if (points[j].value < lo) lo = points[j].value;
      if (points[j].value > hi) hi = points[j].value;
    }
    return { time: p.time, lo, hi };
  });
}

/** Build every metric's daily history for the Trends screen. */
export function buildTrendSeries(raw: RawHealthData): TrendSeries {
  // HRV line = nightly AVERAGE (matches the wearable app). RHR line = the daily
  // resting value. Both get a ROLLING min/max band
  // (see {@link rollingRange}) rather than an intraday spread.
  const hrv = nightlyAverageSeries(raw.hrvRmssd);
  const restingHr = dailySeries(raw.restingHr);
  return {
    hrv,
    hrvRange: rollingRange(hrv),
    restingHr,
    rhrRange: rollingRange(restingHr),
    sleepHours: sleepHoursSeries(raw.sleep, raw.nightlySleepAgg),
    sleepQuality: sleepQualitySeries(raw.sleep, raw.nightlySleepAgg),
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
 * RawHealthData for {@link deriveSnapshot}. EVERY time-series array is SPLICED:
 * `history` supplies everything before its cutoff, `recent` supplies cutoff→now,
 * de-duplicated by natural key so no session, sample or day is double-counted.
 * This is what lets a routine refresh read only the last few days yet still
 * derive the full history — six months of daily metrics and twelve weeks of
 * exercise — without re-paginating any of it.
 *
 * The two cutoffs differ because the two groups are fetched over different spans
 * (LIGHT_WINDOWS): `cutoff` covers the heavy exercise/steps/energy slice,
 * `metricsCutoff` the short daily-metrics slice. Each must be no older than the
 * span its group was actually read over, or the splice leaves a hole.
 */
export function mergeRaw(
  history: RawHealthData,
  recent: RawHealthData,
  cutoff: number,
  metricsCutoff: number = cutoff,
): RawHealthData {
  const sampleKey = (s: InstantSample) => `${s.time}|${s.source}`;
  const spliceSamples = (h: InstantSample[], r: InstantSample[]) =>
    spliceByKey(h, r, metricsCutoff, s => s.time, sampleKey);
  return {
    ...recent,
    hrvRmssd: spliceSamples(history.hrvRmssd, recent.hrvRmssd),
    restingHr: spliceSamples(history.restingHr, recent.restingHr),
    weight: spliceSamples(history.weight, recent.weight),
    bodyFat: spliceSamples(history.bodyFat, recent.bodyFat),
    sleep: spliceByKey(
      history.sleep,
      recent.sleep,
      metricsCutoff,
      s => s.start,
      s => `${s.start}|${s.end}|${s.source}`,
    ),
    nutrition: spliceByKey(
      history.nutrition,
      recent.nutrition,
      metricsCutoff,
      n => n.start,
      // The source's own record id when it gave one; otherwise the natural key.
      n => n.id ?? `${n.start}|${n.name}|${n.source}`,
    ),
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

/**
 * Drop everything older than `days` from a merged read, so the cache the app
 * carries forward stays bounded. `mergeRaw` deliberately keeps history the
 * latest fetch no longer covers — that is how the HRV series grows past its
 * 30-day read window — and this is the other half of that deal: the horizon the
 * app can actually display (the longest Trends range) is also its ceiling.
 */
export function pruneRaw(
  raw: RawHealthData,
  now: number,
  days: number,
): RawHealthData {
  const from = now - days * DAY_MS;
  const keepInstant = (xs: InstantSample[]) => xs.filter(x => x.time >= from);
  const keepFrom = <T extends { start: number }>(xs: T[]) =>
    xs.filter(x => x.start >= from);
  return {
    ...raw,
    hrvRmssd: keepInstant(raw.hrvRmssd),
    restingHr: keepInstant(raw.restingHr),
    weight: keepInstant(raw.weight),
    bodyFat: keepInstant(raw.bodyFat),
    sleep: keepFrom(raw.sleep),
    nutrition: keepFrom(raw.nutrition),
    steps: keepFrom(raw.steps),
    exercise: keepFrom(raw.exercise),
    activeEnergy: keepFrom(raw.activeEnergy),
    totalEnergy: keepFrom(raw.totalEnergy),
  };
}

/** Derive the full snapshot the UI consumes from one raw read. */
export function deriveSnapshot(
  raw: RawHealthData,
  now: number,
): HealthSnapshot {
  const hrvBase = hrvMetric(raw.hrvRmssd);
  // Tag with the algorithm the source actually measured: Health Connect reports
  // RMSSD (Android), HealthKit reports SDNN (iOS). These are NOT numerically
  // comparable (HEA-4), so the tag travels with every HRV value and is never
  // assumed. Legacy raw data without the field defaults to RMSSD.
  const hrv = hrvBase
    ? { ...hrvBase, algorithm: raw.hrvAlgorithm ?? ('RMSSD' as const) }
    : null;
  const restingHr = metricWithBaseline(raw.restingHr);

  const lastSleepSession = lastSleep(raw.sleep, now, raw.nightlySleepAgg);
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

  const startOfToday = startOfLocalDay(now);

  return {
    hrv,
    restingHr,
    sleep,
    stepsToday: stepsInWindow(raw.steps, startOfToday, now),
    stepsThisWeek: stepsInWindow(raw.steps, now - WEEK_MS, now),
    readiness: readiness(hrv, restingHr, sleep),
    nutrition: nutritionToday(raw.nutrition, now),
    // Prefer Health Connect's own cross-source aggregate (matches the Google
    // Health UI exactly); fall back to the single-source record computation on
    // platforms/reads without it (iOS/HealthKit, tests, aggregate failure).
    energyBurnedToday:
      raw.energyBurnedTodayAgg != null
        ? raw.energyBurnedTodayAgg
        : Math.round(
            activeEnergyInWindow(burnEnergyRecords(raw), startOfToday, now),
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
