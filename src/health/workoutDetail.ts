import {
  computeHrZones,
  DEFAULT_ZONE_BOUNDARIES,
  estimateMaxHrFromAge,
  HeartRateSample,
} from './hrZones';
import { CardioZones } from './types';

/**
 * Pure derivation behind the workout detail screen: turn one session's raw
 * heart-rate stream (read on demand — see `HealthSource.readHeartRate`) into the
 * numbers and the chart series the screen draws.
 *
 * Kept here, next to `hrZones`, rather than in the screen so it is unit-tested
 * like the rest of the derivation layer, and so the zone minutes it reports come
 * from exactly the same binning (`computeHrZones`, same HRmax) as the stored
 * per-session zones the cardio screen sums. Two screens must never disagree
 * about the same workout.
 */

/** Same cap `computeHrZones` uses: a longer gap between two samples is sensor
 * dropout or a pause, not time spent at the last reading. */
const MAX_DWELL_GAP_MS = 60_000;

/** Readings outside this band are sensor noise (a strap losing contact reads 0
 * or spikes), not a heart rate — they would wreck the max and the chart scale. */
const MIN_PLAUSIBLE_BPM = 25;
const MAX_PLAUSIBLE_BPM = 240;

/** Most points the chart draws. A 1 s stream over an hour is 3,600 samples —
 * far more than a ~350 pt wide chart can show, and slow to path on device. */
export const MAX_CHART_POINTS = 120;

export interface HrPoint {
  time: number;
  bpm: number;
}

/** Lower bpm edge of each zone, from the HRmax the zones were binned against. */
export interface ZoneBpm {
  light: number;
  moderate: number;
  vigorous: number;
  peak: number;
}

export interface WorkoutHeartRate {
  /** Time-weighted average — a 1 s stream and a 5 min stream weigh the same
   * minute the same, unlike a plain sample mean. */
  avgBpm: number;
  maxBpm: number;
  minBpm: number;
  /** When {@link maxBpm} was hit (epoch ms). */
  maxAt: number;
  /** Bucket-averaged series for the chart, oldest first, ≤ {@link MAX_CHART_POINTS}. */
  series: HrPoint[];
  /** Minutes per zone, recomputed from these samples; null without an HRmax. */
  zones: CardioZones | null;
  /** HRmax the zones are relative to; null when none was resolvable. */
  hrMax: number | null;
  zoneBpm: ZoneBpm | null;
  /** Minutes the stream actually covers (gaps over a minute don't count). */
  coveredMin: number;
}

/**
 * Summarize one workout's heart rate. Samples outside `[start, end]` and
 * implausible readings are dropped. Returns null when fewer than two usable
 * samples remain — one reading is not a graph, and the screen says so rather
 * than drawing a dot.
 */
export function summarizeWorkoutHeartRate(
  samples: HeartRateSample[],
  start: number,
  end: number,
  hrMax: number | null,
  maxPoints: number = MAX_CHART_POINTS,
): WorkoutHeartRate | null {
  const s = samples
    .filter(
      x =>
        Number.isFinite(x.time) &&
        Number.isFinite(x.bpm) &&
        x.time >= start &&
        x.time <= end &&
        x.bpm >= MIN_PLAUSIBLE_BPM &&
        x.bpm <= MAX_PLAUSIBLE_BPM,
    )
    .sort((a, b) => a.time - b.time);
  if (s.length < 2) return null;

  let maxBpm = -Infinity;
  let minBpm = Infinity;
  let maxAt = s[0].time;
  for (const x of s) {
    if (x.bpm > maxBpm) {
      maxBpm = x.bpm;
      maxAt = x.time;
    }
    if (x.bpm < minBpm) minBpm = x.bpm;
  }

  // Time-weighted average with the same dwell rule as the zone binning.
  let weighted = 0;
  let coveredMs = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const dwell = Math.min(s[i + 1].time - s[i].time, MAX_DWELL_GAP_MS);
    if (dwell <= 0) continue;
    weighted += s[i].bpm * dwell;
    coveredMs += dwell;
  }
  const avgBpm =
    coveredMs > 0
      ? weighted / coveredMs
      : s.reduce((sum, x) => sum + x.bpm, 0) / s.length;

  return {
    avgBpm: Math.round(avgBpm),
    maxBpm: Math.round(maxBpm),
    minBpm: Math.round(minBpm),
    maxAt,
    series: downsample(s, maxPoints),
    zones: computeHrZones(s, hrMax),
    hrMax,
    zoneBpm: hrMax
      ? {
          light: Math.round(hrMax * DEFAULT_ZONE_BOUNDARIES.light),
          moderate: Math.round(hrMax * DEFAULT_ZONE_BOUNDARIES.moderate),
          vigorous: Math.round(hrMax * DEFAULT_ZONE_BOUNDARIES.vigorous),
          peak: Math.round(hrMax * DEFAULT_ZONE_BOUNDARIES.peak),
        }
      : null,
    coveredMin: coveredMs / 60_000,
  };
}

/**
 * Average a sorted stream into at most `maxPoints` equal-time buckets (empty
 * buckets — sensor gaps — are skipped, so the line bridges them rather than
 * dropping to zero). A stream already that short is returned as-is.
 */
export function downsample(sorted: HrPoint[], maxPoints: number): HrPoint[] {
  if (sorted.length <= maxPoints) return sorted.map(x => ({ ...x }));
  const t0 = sorted[0].time;
  const span = sorted[sorted.length - 1].time - t0;
  if (span <= 0) return [{ ...sorted[0] }];
  const width = span / maxPoints;
  const sums = new Array<{ t: number; b: number; n: number }>(maxPoints);
  for (const x of sorted) {
    const i = Math.min(maxPoints - 1, Math.floor((x.time - t0) / width));
    const cur = sums[i] ?? { t: 0, b: 0, n: 0 };
    cur.t += x.time;
    cur.b += x.bpm;
    cur.n += 1;
    sums[i] = cur;
  }
  const out: HrPoint[] = [];
  for (const b of sums) {
    if (b) out.push({ time: b.t / b.n, bpm: b.b / b.n });
  }
  return out;
}

/** Where an HRmax came from, for the screen's disclosure line: the age formula
 * when it matches the user's age, else the highest heart rate the app has seen. */
export function hrMaxBasis(
  hrMax: number | null,
  age: number | null,
): 'age' | 'observed' | null {
  if (hrMax == null) return null;
  return estimateMaxHrFromAge(age) === hrMax ? 'age' : 'observed';
}
