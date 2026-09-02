import {
  nightlyAverageSeries,
  hrvMetric,
  nightIndex,
  readiness,
} from '../src/health/derive';
import { InstantSample } from '../src/health/types';

const FITBIT = 'com.fitbit.FitbitMobile';

/** A local wall-clock time, as epoch ms — so these tests describe the night the
 * user actually slept regardless of the timezone the suite runs in. */
function local(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

function hrv(time: number, value: number): InstantSample {
  return { time, value, source: FITBIT };
}

describe('nightIndex', () => {
  it('puts a whole night in one bucket, labelled by the morning it ends', () => {
    // 23:00 on the 1st and 03:00 on the 2nd are the same night's sleep.
    expect(nightIndex(local(2026, 9, 1, 23))).toBe(
      nightIndex(local(2026, 9, 2, 3)),
    );
    // 06:00 on the 2nd is still that night; the next evening is the next one.
    expect(nightIndex(local(2026, 9, 2, 6))).toBe(
      nightIndex(local(2026, 9, 1, 23)),
    );
    expect(nightIndex(local(2026, 9, 2, 23))).toBe(
      nightIndex(local(2026, 9, 1, 23)) + 1,
    );
  });

  it('cuts at local noon, so consecutive nights are consecutive indices', () => {
    const a = nightIndex(local(2026, 9, 2, 11, 59));
    const b = nightIndex(local(2026, 9, 2, 12, 1));
    expect(b).toBe(a + 1);
  });
});

describe('hrvMetric — nightly value', () => {
  // The bug this covers: bucketing by UTC day split every night for any timezone
  // off UTC, leaving "today" holding only the pre-waking tail — the lowest part
  // of the night — so the displayed HRV read below the source app's figure.
  const samples = [
    // Night of Sep 1 → 2. Early-sleep readings run high, pre-waking ones low.
    hrv(local(2026, 9, 1, 23, 30), 70),
    hrv(local(2026, 9, 2, 0, 30), 66),
    hrv(local(2026, 9, 2, 3, 0), 54),
    hrv(local(2026, 9, 2, 5, 30), 50),
  ];

  it('spans the whole night, not just the hours after midnight', () => {
    const m = hrvMetric(samples);
    // Average of all four = 60. Taking only the post-midnight tail (66, 54, 50)
    // averages 56.7 — the low reading the old UTC-day bucketing produced.
    expect(m?.value).toBeCloseTo(60);
  });

  it('averages the night rather than taking its middle value', () => {
    // A right-skewed night: the median (54) sits well below the mean, which is
    // what made our figure read low against the source app.
    const skewed = [
      hrv(local(2026, 9, 1, 23, 30), 92),
      hrv(local(2026, 9, 2, 1, 0), 60),
      hrv(local(2026, 9, 2, 3, 0), 54),
      hrv(local(2026, 9, 2, 5, 0), 48),
      hrv(local(2026, 9, 2, 6, 0), 46),
    ];
    expect(hrvMetric(skewed)?.value).toBeCloseTo(60);
  });

  it('produces one trend point per night', () => {
    const series = nightlyAverageSeries(samples);
    expect(series).toHaveLength(1);
  });
});

describe('readiness contributors', () => {
  const hrvIn = { value: 62, baseline: 55, delta: 7 };
  const rhrIn = { value: 54, baseline: 56, delta: -2 };

  it('reports each input with the share actually applied', () => {
    const r = readiness(hrvIn, rhrIn, { performancePct: 84, hours: 7.7 });
    expect(r).not.toBeNull();
    expect(r!.contributors.map(cont => cont.key)).toEqual([
      'hrv',
      'rhr',
      'sleep',
    ]);
    // All three present: the design weights (0.5 / 0.3 / 0.2) already sum to 1.
    const shares = r!.contributors.map(cont => cont.weight);
    expect(shares).toEqual([0.5, 0.3, 0.2]);
    // Each carries what it was measured against, for the screen's "vs X" line.
    expect(r!.contributors[0].reference).toBe(55);
    expect(r!.contributors[2].reference).toBe(8);
  });

  it('renormalises the shares when an input is missing', () => {
    const r = readiness(hrvIn, rhrIn, null);
    const shares = r!.contributors.map(cont => cont.weight);
    expect(shares[0] + shares[1]).toBeCloseTo(1);
    expect(shares[0]).toBeCloseTo(0.625); // 0.5 / 0.8
  });

  it('blends the sub-scores it reports into the headline percentage', () => {
    const r = readiness(hrvIn, rhrIn, { performancePct: 84, hours: 7.7 });
    const blended = r!.contributors.reduce(
      (sum, cont) => sum + cont.score * cont.weight,
      0,
    );
    expect(Math.round(blended)).toBe(r!.pct);
  });
});
