import { buildTrendSeries, dailyStats, rollingRange } from '../src/health/derive';
import { RawHealthData } from '../src/health/types';
import { buildMetrics } from '../src/features/trends/metrics';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_754_000_000_000;
const SRC = 'com.fitbit.FitbitMobile';

function rawWithHrv(samples: { value: number; time: number }[]): RawHealthData {
  return {
    hrvRmssd: samples.map(s => ({ ...s, source: SRC })),
    hrvAlgorithm: 'RMSSD',
    restingHr: [],
    sleep: [],
    steps: [],
    exercise: [],
    activeEnergy: [],
    totalEnergy: [],
    nutrition: [],
    weight: [],
    bodyFat: [],
    sources: [SRC],
    readAt: NOW,
  };
}

// Two nights: day A (older) values 40/50/90 → median 50, min 40, max 90;
// day B (newer) values 30/32/34 → median 32, min 30, max 34.
const dayA = Math.floor((NOW - DAY) / DAY) * DAY;
const dayB = Math.floor(NOW / DAY) * DAY;
const raw = rawWithHrv([
  { value: 40, time: dayA + 1000 },
  { value: 90, time: dayA + 2000 },
  { value: 50, time: dayA + 3000 },
  { value: 30, time: dayB + 1000 },
  { value: 34, time: dayB + 2000 },
  { value: 32, time: dayB + 3000 },
]);

describe('dailyStats', () => {
  it('computes per-day median/min/max, oldest first', () => {
    const stats = dailyStats(raw.hrvRmssd);
    expect(stats).toHaveLength(2);
    expect(stats[0]).toMatchObject({ median: 50, min: 40, max: 90 });
    expect(stats[1]).toMatchObject({ median: 32, min: 30, max: 34 });
    expect(stats[0].time).toBeLessThan(stats[1].time);
  });
});

describe('buildTrendSeries HRV median + rolling range', () => {
  it('hrv line is the nightly median; hrvRange is a rolling min/max band', () => {
    const t = buildTrendSeries(raw);
    expect(t.hrv.map(p => p.value)).toEqual([50, 32]);
    // Rolling band (±3 days): with only two days in range, each day's band spans
    // both medians (min 32, max 50) — NOT the wide intraday nightly spread.
    expect(t.hrvRange).toEqual([
      { time: t.hrv[0].time, lo: 32, hi: 50 },
      { time: t.hrv[1].time, lo: 32, hi: 50 },
    ]);
  });

  it('a restless night (spike) does not inflate the median', () => {
    // day A has a 90 spike but median stays 50 — the fix for "should be 32".
    expect(buildTrendSeries(raw).hrv[0].value).toBe(50);
  });
});

describe('rollingRange', () => {
  it('bands each point by the min/max of a centered ±half window', () => {
    const pts = [
      { time: 1, value: 50 },
      { time: 2, value: 54 },
      { time: 3, value: 48 },
      { time: 4, value: 60 },
    ];
    // half=1 → each point sees itself and its immediate neighbours.
    expect(rollingRange(pts, 1)).toEqual([
      { time: 1, lo: 50, hi: 54 },
      { time: 2, lo: 48, hi: 54 },
      { time: 3, lo: 48, hi: 60 },
      { time: 4, lo: 48, hi: 60 },
    ]);
  });

  it('gives a single-reading-per-day metric (RHR) a real, non-degenerate band', () => {
    // Resting HR has one value per day, so the OLD intraday range collapsed to
    // lo==hi ("50–50"). A rolling band spans neighbouring days instead.
    const rhr: RawHealthData = {
      ...raw,
      hrvRmssd: [],
      restingHr: [
        { value: 52, time: dayA + 1000, source: SRC },
        { value: 58, time: dayB + 1000, source: SRC },
      ],
    };
    const t = buildTrendSeries(rhr);
    expect(t.restingHr.map(p => p.value)).toEqual([52, 58]);
    expect(t.rhrRange).toEqual([
      { time: t.restingHr[0].time, lo: 52, hi: 58 },
      { time: t.restingHr[1].time, lo: 52, hi: 58 },
    ]);
  });
});

describe('buildMetrics HRV band + times', () => {
  it('exposes a band aligned to points, plus per-point times', () => {
    const hrv = buildMetrics(buildTrendSeries(raw)).find(m => m.key === 'hrv')!;
    expect(hrv.points).toEqual([50, 32]);
    expect(hrv.times).toHaveLength(2);
    expect(hrv.band).toEqual([
      { lo: 32, hi: 50 },
      { lo: 32, hi: 50 },
    ]);
  });

  it('non-banded metrics (weight) carry no band', () => {
    const weight = buildMetrics(buildTrendSeries(raw)).find(
      m => m.key === 'weight',
    )!;
    expect(weight.band).toBeUndefined();
  });
});
