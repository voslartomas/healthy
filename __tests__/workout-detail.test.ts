import { activitiesFromExercise, sessionLoad } from '../src/health/derive';
import { computeHrZones, HeartRateSample } from '../src/health/hrZones';
import { ExerciseRecord } from '../src/health/types';
import {
  downsample,
  hrMaxBasis,
  summarizeWorkoutHeartRate,
} from '../src/health/workoutDetail';

const START = 1_754_000_000_000;
const MIN = 60_000;

/** One sample every `stepMs` from START, bpm given by `bpmAt(i)`. */
function stream(
  n: number,
  bpmAt: (i: number) => number,
  stepMs = 5_000,
): HeartRateSample[] {
  return Array.from({ length: n }, (_, i) => ({
    time: START + i * stepMs,
    bpm: bpmAt(i),
  }));
}

describe('summarizeWorkoutHeartRate', () => {
  it('reports time-weighted avg, max (and when), min and coverage', () => {
    // 10 min at 120, then 10 min at 160 — 1 sample / 5 s.
    const s = stream(240, i => (i < 120 ? 120 : 160));
    const hr = summarizeWorkoutHeartRate(s, START, START + 20 * MIN, 190);
    expect(hr).not.toBeNull();
    expect(hr!.avgBpm).toBe(140);
    expect(hr!.maxBpm).toBe(160);
    expect(hr!.maxAt).toBe(START + 120 * 5_000);
    expect(hr!.minBpm).toBe(120);
    expect(hr!.coveredMin).toBeCloseTo((239 * 5_000) / MIN);
  });

  it('weights by time, not by sample count', () => {
    // A burst of 1 s samples at 180 for 10 s, then 5-min-spaced readings at 100
    // for 20 min: a plain mean would be dominated by the burst.
    const burst = stream(10, () => 180, 1_000);
    const sparse = Array.from({ length: 5 }, (_, i) => ({
      time: START + 10_000 + i * 5 * MIN,
      bpm: 100,
    }));
    const hr = summarizeWorkoutHeartRate(
      [...burst, ...sparse],
      START,
      START + 30 * MIN,
      190,
    );
    // Gaps over a minute are capped like the zone binning, so the sparse
    // readings still only count 1 min each — but that already outweighs 10 s.
    expect(hr!.avgBpm).toBeLessThan(140);
  });

  it('bins zones exactly like the stored per-session zones', () => {
    const s = stream(360, i => 100 + (i % 90));
    const hr = summarizeWorkoutHeartRate(s, START, START + 30 * MIN, 185);
    expect(hr!.zones).toEqual(computeHrZones(s, 185));
    expect(hr!.zoneBpm).toEqual({
      light: 93,
      moderate: 111,
      vigorous: 130,
      peak: 157,
    });
  });

  it('drops samples outside the session and implausible readings', () => {
    const s = [
      { time: START - MIN, bpm: 200 }, // before the session
      { time: START, bpm: 110 },
      { time: START + 5_000, bpm: 0 }, // strap lost contact
      { time: START + 10_000, bpm: 300 }, // spike
      { time: START + 15_000, bpm: 130 },
      { time: START + 2 * MIN, bpm: 199 }, // after the session
    ];
    const hr = summarizeWorkoutHeartRate(s, START, START + MIN, 190);
    expect(hr!.maxBpm).toBe(130);
    expect(hr!.minBpm).toBe(110);
  });

  it('is null with fewer than two usable readings', () => {
    expect(summarizeWorkoutHeartRate([], START, START + MIN, 190)).toBeNull();
    expect(
      summarizeWorkoutHeartRate(
        [{ time: START, bpm: 120 }],
        START,
        START + MIN,
        190,
      ),
    ).toBeNull();
  });

  it('has no zones without an HRmax, but still the stats and the graph', () => {
    const hr = summarizeWorkoutHeartRate(
      stream(20, () => 120),
      START,
      START + 5 * MIN,
      null,
    );
    expect(hr!.zones).toBeNull();
    expect(hr!.zoneBpm).toBeNull();
    expect(hr!.series.length).toBe(20);
  });
});

describe('downsample', () => {
  it('caps the series and keeps the overall shape', () => {
    const s = stream(3600, i => (i < 1800 ? 100 : 170), 1_000);
    const out = downsample(s, 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out[0].bpm).toBe(100);
    expect(out[out.length - 1].bpm).toBe(170);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].time).toBeGreaterThan(out[i - 1].time);
    }
  });

  it('skips empty buckets instead of dropping to zero', () => {
    const s = [
      ...stream(10, () => 120, 1_000),
      ...stream(10, () => 140, 1_000).map(x => ({
        ...x,
        time: x.time + 30 * MIN,
      })),
    ];
    const out = downsample(s, 5);
    expect(out.every(p => p.bpm >= 120)).toBe(true);
  });
});

describe('hrMaxBasis', () => {
  it('says whether the HRmax came from the age formula', () => {
    expect(hrMaxBasis(186, 34)).toBe('age');
    expect(hrMaxBasis(178, 34)).toBe('observed');
    expect(hrMaxBasis(178, null)).toBe('observed');
    expect(hrMaxBasis(null, 34)).toBeNull();
  });
});

describe('per-session load on the activity summary', () => {
  const ex = (over: Partial<ExerciseRecord>): ExerciseRecord => ({
    exerciseType: 56,
    typeName: 'RUNNING',
    displayName: null,
    start: START,
    end: START + 40 * MIN,
    durationMin: 40,
    energyKcal: 420,
    hrZones: null,
    source: 'com.example.watch',
    ...over,
  });

  it('weights zone minutes for a session with heart rate', () => {
    const z = { lightMin: 10, moderateMin: 20, vigorousMin: 5, peakMin: 1 };
    expect(sessionLoad(ex({ hrZones: z }))).toEqual({
      value: 10 + 40 + 15 + 4,
      estimated: false,
    });
  });

  it('estimates cardio without heart rate, and gives strength none', () => {
    expect(sessionLoad(ex({}))).toEqual({ value: 80, estimated: true });
    expect(
      sessionLoad(ex({ exerciseType: 70, typeName: 'STRENGTH_TRAINING' })),
    ).toBeNull();
  });

  it('carries what the detail screen needs to find and draw the session', () => {
    const [a] = activitiesFromExercise([ex({})], START + 60 * MIN);
    expect(a.key).toBe(`${START}|RUNNING|com.example.watch`);
    expect(a.end).toBe(START + 40 * MIN);
    expect(a.source).toBe('com.example.watch');
    expect(a.load).toBe(80);
    expect(a.loadEstimated).toBe(true);
    expect(a.zone2PlusMin).toBe(40);
  });
});
