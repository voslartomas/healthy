import {
  computeHrZones,
  DEFAULT_ZONE_BOUNDARIES,
  estimateMaxHrFromAge,
  estimateMaxHrFromObserved,
  HeartRateSample,
  resolveMaxHr,
} from '../src/health/hrZones';

const MIN = 60_000;

/** Build one HR sample per minute at a fixed bpm, starting at t0. */
function ramp(t0: number, bpms: number[]): HeartRateSample[] {
  return bpms.map((bpm, i) => ({ time: t0 + i * MIN, bpm }));
}

describe('estimateMaxHrFromAge', () => {
  it('is 220 − age for a plausible age', () => {
    expect(estimateMaxHrFromAge(30)).toBe(190);
    expect(estimateMaxHrFromAge(50)).toBe(170);
  });
  it('rejects implausible / missing ages', () => {
    expect(estimateMaxHrFromAge(null)).toBeNull();
    expect(estimateMaxHrFromAge(0)).toBeNull();
    expect(estimateMaxHrFromAge(130)).toBeNull();
  });
});

describe('estimateMaxHrFromObserved', () => {
  it('uses the observed max when it clears the trust floor', () => {
    expect(estimateMaxHrFromObserved(ramp(0, [120, 150, 175]))).toBe(175);
  });
  it('returns null when the observed max is too low to trust', () => {
    expect(estimateMaxHrFromObserved(ramp(0, [70, 80, 90]))).toBeNull();
  });
});

describe('resolveMaxHr', () => {
  it('prefers age over observed', () => {
    expect(resolveMaxHr(40, ramp(0, [200]))).toBe(180);
  });
  it('falls back to observed when no age', () => {
    expect(resolveMaxHr(null, ramp(0, [120, 185]))).toBe(185);
  });
  it('is null when neither is available', () => {
    expect(resolveMaxHr(null, ramp(0, [80]))).toBeNull();
  });
});

describe('computeHrZones', () => {
  it('returns null without a usable HRmax', () => {
    expect(computeHrZones(ramp(0, [120, 130]), null)).toBeNull();
  });

  it('returns null with fewer than two samples', () => {
    expect(computeHrZones(ramp(0, [150]), 190)).toBeNull();
  });

  it('bins dwell time into the right zone by %HRmax', () => {
    // HRmax 200 → boundaries: light 100, moderate 120, vigorous 140, peak 170.
    // Samples every minute; each sample credits the minute until the next.
    // 110 (light) → 130 (moderate) → 150 (vigorous) → 180 (peak) → 180 (last,
    // no dwell). Expect 1 min each in light/moderate/vigorous, 1 in peak.
    const zones = computeHrZones(ramp(0, [110, 130, 150, 180, 180]), 200);
    expect(zones).not.toBeNull();
    expect(zones!.lightMin).toBeCloseTo(1);
    expect(zones!.moderateMin).toBeCloseTo(1);
    expect(zones!.vigorousMin).toBeCloseTo(1);
    expect(zones!.peakMin).toBeCloseTo(1);
  });

  it('does not credit below-light (warm-up) samples to any zone', () => {
    // 80/200 = 0.4 < light(0.5) → no zone; then one moderate minute.
    const zones = computeHrZones(ramp(0, [80, 130, 130]), 200);
    expect(zones!.lightMin).toBe(0);
    // Only sample[1]'s 1-minute dwell counts; sample[0] (warm-up) and the last
    // sample (no dwell) contribute nothing.
    expect(zones!.moderateMin).toBeCloseTo(1);
  });

  it('caps a long sensor gap so it never invents minutes', () => {
    // Two samples 10 minutes apart → dwell capped at 1 minute.
    const zones = computeHrZones(
      [
        { time: 0, bpm: 150 },
        { time: 10 * MIN, bpm: 150 },
      ],
      200,
    );
    expect(zones!.vigorousMin).toBeCloseTo(1);
  });

  it('uses the provided boundaries', () => {
    expect(DEFAULT_ZONE_BOUNDARIES.peak).toBe(0.85);
  });
});
