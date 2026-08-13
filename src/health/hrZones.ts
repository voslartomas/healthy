import { CardioZones } from './types';

/**
 * Heart-rate-zone derivation (ADR-006).
 *
 * Google Health handed us pre-bucketed per-workout HR-zone minutes; neither
 * native source (Android Health Connect, iOS HealthKit) does. So each adapter
 * pulls the raw heart-rate samples recorded DURING a workout and bins their
 * dwell time into the four cardio zones here, emitting the same
 * {@link CardioZones} shape the derivation layer (`cardioFromExercise`) already
 * consumes. Everything in this file is pure and unit-tested without a device.
 *
 * The zone boundaries and the HRmax estimate are transparent, non-clinical
 * heuristics (same spirit as the readiness score, ADR-004) — disclosed, not
 * medical. When we cannot compute zones honestly (no samples, no usable HRmax)
 * we return null so the session contributes nothing and the UI shows "-".
 */

/** One heart-rate reading taken during a workout: epoch-ms time + beats/min. */
export interface HeartRateSample {
  time: number;
  bpm: number;
}

/**
 * Lower %HRmax edge of each of the four zones. A sample below `light` is warm-up
 * / rest and counted in no zone. Defaults follow the common five-zone model
 * collapsed to Google's four buckets (light 50–60, moderate 60–70, vigorous
 * 70–85, peak ≥85 %HRmax).
 */
export interface ZoneBoundaries {
  light: number;
  moderate: number;
  vigorous: number;
  peak: number;
}

export const DEFAULT_ZONE_BOUNDARIES: ZoneBoundaries = {
  light: 0.5,
  moderate: 0.6,
  vigorous: 0.7,
  peak: 0.85,
};

/** Largest gap (ms) between two consecutive samples we still treat as continuous
 * dwell time. A longer gap is sensor dropout (or the workout paused), so we cap
 * it rather than invent minutes in whatever zone the last sample sat in. */
const MAX_DWELL_GAP_MS = 60_000;

/** Below this the observed-max fallback is too low to trust as an HRmax (a calm
 * session would otherwise make everything read as "peak"). */
const MIN_TRUSTED_OBSERVED_MAX = 100;

/** Classic age-based HRmax (220 − age). Null for an implausible age so callers
 * fall back to the observed-max estimate. */
export function estimateMaxHrFromAge(age: number | null | undefined): number | null {
  if (age == null || !Number.isFinite(age) || age <= 0 || age > 120) return null;
  return 220 - age;
}

/** Fallback HRmax when no age is known (Health Connect exposes no birth date):
 * the highest observed bpm across the given samples, but only when it clears
 * {@link MIN_TRUSTED_OBSERVED_MAX} so a low-intensity session can't skew zones. */
export function estimateMaxHrFromObserved(
  samples: HeartRateSample[],
): number | null {
  let max = 0;
  for (const s of samples) {
    if (Number.isFinite(s.bpm) && s.bpm > max) max = s.bpm;
  }
  return max >= MIN_TRUSTED_OBSERVED_MAX ? max : null;
}

/**
 * Resolve an HRmax to bin against: prefer the age-based estimate (from the user
 * profile), else the observed maximum across the supplied samples. Returns null
 * when neither is available, which makes {@link computeHrZones} return null.
 */
export function resolveMaxHr(
  age: number | null | undefined,
  observedSamples: HeartRateSample[],
): number | null {
  return estimateMaxHrFromAge(age) ?? estimateMaxHrFromObserved(observedSamples);
}

/**
 * Bin a workout's HR samples into per-zone minutes by %HRmax. Each sample is
 * credited with the dwell time until the NEXT sample (capped at
 * {@link MAX_DWELL_GAP_MS}) in the zone that sample's bpm falls into. Returns
 * null when there is too little data or no usable HRmax, so the caller leaves
 * `hrZones` null and the session honestly contributes no zone data.
 */
export function computeHrZones(
  samples: HeartRateSample[],
  hrMax: number | null,
  boundaries: ZoneBoundaries = DEFAULT_ZONE_BOUNDARIES,
): CardioZones | null {
  if (!hrMax || hrMax <= 0) return null;
  const sorted = samples
    .filter(s => Number.isFinite(s.bpm) && Number.isFinite(s.time) && s.bpm > 0)
    .sort((a, b) => a.time - b.time);
  if (sorted.length < 2) return null;

  const zones: CardioZones = {
    lightMin: 0,
    moderateMin: 0,
    vigorousMin: 0,
    peakMin: 0,
  };
  for (let i = 0; i < sorted.length - 1; i++) {
    const dwellMs = Math.min(sorted[i + 1].time - sorted[i].time, MAX_DWELL_GAP_MS);
    if (dwellMs <= 0) continue;
    const minutes = dwellMs / 60_000;
    const frac = sorted[i].bpm / hrMax;
    if (frac >= boundaries.peak) zones.peakMin += minutes;
    else if (frac >= boundaries.vigorous) zones.vigorousMin += minutes;
    else if (frac >= boundaries.moderate) zones.moderateMin += minutes;
    else if (frac >= boundaries.light) zones.lightMin += minutes;
    // below the light edge: warm-up / rest, credited to no zone.
  }

  const total =
    zones.lightMin + zones.moderateMin + zones.vigorousMin + zones.peakMin;
  return total > 0 ? zones : null;
}
