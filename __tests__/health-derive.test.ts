import {
  dedupeIntervals,
  deriveSnapshot,
  latestFromPrimary,
  readiness,
  sourceRank,
  stepsInWindow,
  trackedFromExercise,
} from '../src/health/derive';
import { readSnapshot, SAMPLE_SNAPSHOT } from '../src/health';
import { RawHealthData } from '../src/health/types';

const DAY = 24 * 60 * 60 * 1000;
const FITBIT = 'com.fitbit.FitbitMobile';
const WITHINGS = 'com.withings.wiscale2';
const GFIT = 'com.google.android.apps.fitness';
const NOW = 1_754_000_000_000; // fixed epoch ms so all derivations are deterministic

function emptyRaw(): RawHealthData {
  return {
    hrvRmssd: [],
    restingHr: [],
    sleep: [],
    steps: [],
    exercise: [],
    activeEnergy: [],
    nutrition: [],
    sources: [],
    readAt: NOW,
  };
}

describe('source priority', () => {
  it('ranks dedicated wearables above phone step counters', () => {
    expect(sourceRank(WITHINGS)).toBeGreaterThan(sourceRank(GFIT));
    expect(sourceRank(FITBIT)).toBeGreaterThan(sourceRank(GFIT));
    expect(sourceRank('com.unknown.app')).toBe(0);
  });
});

describe('dedupeIntervals', () => {
  it('drops a lower-priority record overlapping a higher-priority one', () => {
    const kept = dedupeIntervals([
      { start: 0, end: 100, source: GFIT },
      { start: 10, end: 90, source: WITHINGS },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].source).toBe(WITHINGS);
  });

  it('keeps non-overlapping records from different sources', () => {
    const kept = dedupeIntervals([
      { start: 0, end: 100, source: GFIT },
      { start: 200, end: 300, source: WITHINGS },
    ]);
    expect(kept).toHaveLength(2);
  });

  it('keeps equal-priority overlapping records (distinct real events)', () => {
    const kept = dedupeIntervals([
      { start: 0, end: 100, source: FITBIT },
      { start: 10, end: 90, source: FITBIT },
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe('stepsInWindow — no cross-origin double count', () => {
  it('sums only the highest-priority source present, not all sources', () => {
    const steps = [
      { count: 5000, start: NOW - DAY, end: NOW, source: GFIT },
      { count: 4800, start: NOW - DAY, end: NOW, source: WITHINGS },
    ];
    // Must NOT be 9800 (that would be the cross-origin double count).
    expect(stepsInWindow(steps, NOW - DAY, NOW + 1)).toBe(4800);
  });

  it('excludes records outside the window', () => {
    const steps = [
      { count: 1000, start: NOW - 3 * DAY, end: NOW - 2 * DAY, source: FITBIT },
      { count: 2000, start: NOW - DAY, end: NOW, source: FITBIT },
    ];
    expect(stepsInWindow(steps, NOW - 2 * DAY, NOW + 1)).toBe(2000);
  });
});

describe('latestFromPrimary', () => {
  it('picks the most recent sample from the trusted source', () => {
    const s = latestFromPrimary([
      { value: 40, time: NOW, source: GFIT },
      { value: 55, time: NOW - DAY, source: FITBIT },
      { value: 61, time: NOW - 2 * DAY, source: FITBIT },
    ]);
    expect(s?.value).toBe(55); // latest FITBIT, not the newer GFIT sample
  });
});

describe('readiness (non-clinical heuristic)', () => {
  it('is null without HRV or resting HR', () => {
    expect(readiness(null, null, { performancePct: 90 })).toBeNull();
  });

  it('scores higher when HRV is above baseline', () => {
    const high = readiness(
      { value: 70, baseline: 55, delta: 15 },
      { value: 50, baseline: 55, delta: -5 },
      { performancePct: 90 },
    );
    const low = readiness(
      { value: 40, baseline: 55, delta: -15 },
      { value: 62, baseline: 55, delta: 7 },
      { performancePct: 55 },
    );
    expect(high!.pct).toBeGreaterThan(low!.pct);
    expect(high!.state).toBe('Recovered');
  });
});

describe('trackedFromExercise', () => {
  it('counts strength sessions and cardio minutes for the week', () => {
    const wk = NOW - 2 * DAY;
    const tracked = trackedFromExercise(
      [
        { exerciseType: 70, start: wk, end: wk + 60, durationMin: 45, energyKcal: null, source: FITBIT }, // strength
        { exerciseType: 56, start: wk, end: wk + 60, durationMin: 30, energyKcal: null, source: FITBIT }, // running → zone2
        { exerciseType: 79, start: wk, end: wk + 60, durationMin: 20, energyKcal: null, source: FITBIT }, // walking → excluded from zone2
      ],
      [{ count: 41200, start: NOW - 6 * DAY, end: NOW, source: FITBIT }],
      [{ kcal: 2380, start: NOW - 6 * DAY, end: NOW, source: FITBIT }],
      NOW,
    );
    expect(tracked.strength).toBe(1);
    expect(tracked.zone2).toBe(30);
    expect(tracked.steps).toBe(41200);
    expect(tracked.calories).toBe(2380);
  });
});

describe('deriveSnapshot', () => {
  it('tags HRV as RMSSD and computes deltas vs baseline', () => {
    const raw = emptyRaw();
    raw.hrvRmssd = [
      { value: 50, time: NOW - 3 * DAY, source: FITBIT },
      { value: 55, time: NOW - 2 * DAY, source: FITBIT },
      { value: 62, time: NOW - DAY, source: FITBIT },
    ];
    raw.restingHr = [{ value: 54, time: NOW - DAY, source: FITBIT }];
    raw.sources = [FITBIT];
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.hrv?.algorithm).toBe('RMSSD');
    expect(snap.hrv?.value).toBe(62);
    expect(snap.hrv?.baseline).toBe(55); // median of 50/55/62
    expect(snap.hrv?.delta).toBe(7);
    expect(snap.live).toBe(true);
  });

  it('derives sleep hours and performance from the last session', () => {
    const raw = emptyRaw();
    raw.sleep = [
      { start: NOW - DAY, end: NOW - DAY + 6 * 3600_000, durationMin: 360, source: WITHINGS },
      { start: NOW - 12 * 3600_000, end: NOW - 4 * 3600_000, durationMin: 480, source: FITBIT },
    ];
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.sleep?.hours).toBeCloseTo(8);
    expect(snap.sleep?.performancePct).toBe(100); // 480/480 need
  });
});

describe('readSnapshot fallback', () => {
  it('returns the sample snapshot when no native module (non-Android test env)', async () => {
    const snap = await readSnapshot(NOW);
    expect(snap).toBe(SAMPLE_SNAPSHOT);
    expect(snap.live).toBe(false);
  });
});
