import {
  activityGoalOptions,
  ADHERENCE_DAYS,
  cardioFromExercise,
  dailyEnergySeries,
  dailySeries,
  dedupeIntervals,
  deriveSnapshot,
  latestFromPrimary,
  mergeRaw,
  readiness,
  sleepHoursSeries,
  sleepQualitySeries,
  sourceRank,
  stepsInWindow,
  trackedFromExercise,
  weeklyGoalHistory,
  weekStartMs,
} from '../src/health/derive';
import { EMPTY_SNAPSHOT, readSnapshot } from '../src/health';
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
    totalEnergy: [],
    nutrition: [],
    weight: [],
    bodyFat: [],
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
        {
          exerciseType: 70,
          typeName: 'STRENGTH_TRAINING',
          start: wk,
          end: wk + 60,
          durationMin: 45,
          energyKcal: null,
          source: FITBIT,
        }, // strength
        {
          exerciseType: 56,
          typeName: 'RUNNING',
          start: wk,
          end: wk + 60,
          durationMin: 30,
          energyKcal: null,
          source: FITBIT,
        }, // running → zone2
        {
          exerciseType: 79,
          typeName: 'WALKING',
          start: wk,
          end: wk + 60,
          durationMin: 20,
          energyKcal: null,
          source: FITBIT,
        }, // walking → excluded from zone2
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
  it('tags HRV as SDNN and computes deltas vs baseline', () => {
    const raw = emptyRaw();
    raw.hrvRmssd = [
      { value: 50, time: NOW - 3 * DAY, source: FITBIT },
      { value: 55, time: NOW - 2 * DAY, source: FITBIT },
      { value: 62, time: NOW - DAY, source: FITBIT },
    ];
    raw.restingHr = [{ value: 54, time: NOW - DAY, source: FITBIT }];
    raw.sources = [FITBIT];
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.hrv?.algorithm).toBe('SDNN');
    expect(snap.hrv?.value).toBe(62);
    expect(snap.hrv?.baseline).toBe(55); // median of 50/55/62
    expect(snap.hrv?.delta).toBe(7);
    expect(snap.live).toBe(true);
  });

  it('derives sleep hours and performance from the last session', () => {
    const raw = emptyRaw();
    raw.sleep = [
      {
        start: NOW - DAY,
        end: NOW - DAY + 6 * 3600_000,
        durationMin: 360,
        source: WITHINGS,
        stages: null,
      },
      {
        start: NOW - 12 * 3600_000,
        end: NOW - 4 * 3600_000,
        durationMin: 480,
        source: FITBIT,
        stages: null,
      },
    ];
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.sleep?.hours).toBeCloseTo(8);
    expect(snap.sleep?.performancePct).toBe(100); // 480/480 need
  });
});

describe('readSnapshot fallback', () => {
  it('returns the empty snapshot when no token provider is registered', async () => {
    const snap = await readSnapshot(NOW);
    expect(snap).toBe(EMPTY_SNAPSHOT);
    expect(snap.live).toBe(false);
  });
});

describe('trend series', () => {
  const dayStart = NOW - (NOW % DAY);

  it('builds one point per day, oldest first', () => {
    const samples = [
      { value: 50, time: dayStart - 2 * DAY + 1000, source: FITBIT },
      { value: 55, time: dayStart - DAY + 1000, source: FITBIT },
      { value: 62, time: dayStart + 1000, source: FITBIT },
    ];
    expect(dailySeries(samples).map(p => p.value)).toEqual([50, 55, 62]);
  });

  it('keeps the latest reading within a day', () => {
    const samples = [
      { value: 40, time: dayStart + 1000, source: FITBIT },
      { value: 48, time: dayStart + 3_600_000, source: FITBIT },
    ];
    const s = dailySeries(samples);
    expect(s).toHaveLength(1);
    expect(s[0].value).toBe(48);
  });

  it('maps sleep sessions to per-night hours', () => {
    const sleep = [
      {
        start: dayStart - 8 * 3_600_000,
        end: dayStart - 3_600_000,
        durationMin: 420,
        source: FITBIT,
        stages: null,
      },
    ];
    const s = sleepHoursSeries(sleep);
    expect(s).toHaveLength(1);
    expect(s[0].value).toBe(7);
  });

  it('computes sleep quality (efficiency %) only for nights with stages', () => {
    const sleep = [
      {
        start: dayStart - 8 * 3_600_000,
        end: dayStart - 3_600_000,
        durationMin: 420,
        source: FITBIT,
        // 6h30 asleep (deep+rem+light) of 7h total → 92.9% → 93%.
        stages: { deepMin: 90, remMin: 120, lightMin: 180, awakeMin: 30 },
      },
      {
        start: dayStart - 2 * DAY,
        end: dayStart - 2 * DAY + 6 * 3_600_000,
        durationMin: 360,
        source: FITBIT,
        stages: null, // no stages → no quality point
      },
    ];
    const q = sleepQualitySeries(sleep);
    expect(q).toHaveLength(1);
    expect(q[0].value).toBe(93);
  });
});

describe('dailyEnergySeries', () => {
  it('computes per-day net only when both eaten and burned exist', () => {
    const raw = emptyRaw();
    const startOfToday = NOW - (NOW % DAY);
    raw.nutrition = [
      {
        start: startOfToday + 3_600_000,
        end: startOfToday + 3_600_000,
        name: 'Lunch',
        mealType: null,
        kcal: 1800,
        proteinG: null,
        carbsG: null,
        fatG: null,
        source: 'x',
      },
    ];
    raw.totalEnergy = [
      // Today: eaten 1800, burned 2400 → net -600.
      {
        kcal: 2400,
        start: startOfToday,
        end: startOfToday + DAY,
        source: 'Google Health',
      },
      // Yesterday: burned only, no food logged → net null.
      {
        kcal: 2300,
        start: startOfToday - DAY,
        end: startOfToday,
        source: 'Google Health',
      },
    ];
    const series = dailyEnergySeries(raw, NOW);
    expect(series).toHaveLength(ADHERENCE_DAYS);

    const today = series[series.length - 1];
    expect(today.eaten).toBe(1800);
    expect(today.burned).toBe(2400);
    expect(today.net).toBe(-600);

    const yesterday = series[series.length - 2];
    expect(yesterday.burned).toBe(2300);
    expect(yesterday.eaten).toBeNull();
    expect(yesterday.net).toBeNull();
  });
});

describe('activityGoalOptions', () => {
  it('lists distinct types and displayNames from the window, most-frequent first', () => {
    const wk = NOW - 2 * DAY;
    const opts = activityGoalOptions(
      [
        {
          exerciseType: 70,
          typeName: 'STRENGTH_TRAINING',
          displayName: 'Posilování',
          start: wk,
          end: wk + 60,
          durationMin: 42,
          energyKcal: null,
          source: FITBIT,
        },
        {
          exerciseType: 70,
          typeName: 'STRENGTH_TRAINING',
          displayName: 'Posilování',
          start: wk + DAY,
          end: wk + DAY + 60,
          durationMin: 51,
          energyKcal: null,
          source: FITBIT,
        },
        {
          exerciseType: 0,
          typeName: 'WORKOUT',
          displayName: 'Trénink středu těla',
          start: wk + 2 * DAY,
          end: wk + 2 * DAY + 60,
          durationMin: 9,
          energyKcal: null,
          source: FITBIT,
        },
      ],
      NOW,
    );

    const strengthType = opts.find(
      o => o.field === 'type' && o.value === 'STRENGTH_TRAINING',
    );
    expect(strengthType?.count).toBe(2);
    expect(strengthType?.maxDurationMin).toBe(51);
    expect(
      opts.some(
        o => o.field === 'displayName' && o.value === 'Trénink středu těla',
      ),
    ).toBe(true);
    expect(
      opts.some(o => o.field === 'displayName' && o.value === 'Posilování'),
    ).toBe(true);
    // A 2-session option outranks a 1-session one.
    expect(opts[0].count).toBe(2);
  });

  it('includes sessions within the 12-week window', () => {
    const wk6 = NOW - 42 * DAY;
    const opts = activityGoalOptions(
      [
        {
          exerciseType: 70,
          typeName: 'ROWING',
          displayName: null,
          start: wk6,
          end: wk6 + 60,
          durationMin: 40,
          energyKcal: null,
          source: FITBIT,
        },
      ],
      NOW,
    );
    expect(opts.some(o => o.field === 'type' && o.value === 'ROWING')).toBe(
      true,
    );
  });

  it('excludes sessions older than the 12-week window', () => {
    const old = NOW - 90 * DAY;
    const opts = activityGoalOptions(
      [
        {
          exerciseType: 70,
          typeName: 'STRENGTH_TRAINING',
          displayName: null,
          start: old,
          end: old + 60,
          durationMin: 40,
          energyKcal: null,
          source: FITBIT,
        },
      ],
      NOW,
    );
    expect(opts).toHaveLength(0);
  });
});

describe('weekStartMs', () => {
  it('snaps to the UTC Monday 00:00 of the week', () => {
    const ts = Date.UTC(2026, 6, 31, 10, 18, 0);
    const ws = weekStartMs(ts);
    expect(ws).toBeLessThanOrEqual(ts);
    expect(ts - ws).toBeLessThan(7 * DAY);
    expect(new Date(ws).getUTCDay()).toBe(1); // Monday
    expect(new Date(ws).getUTCHours()).toBe(0);
    // Idempotent and weekly-periodic.
    expect(weekStartMs(ws)).toBe(ws);
    expect(weekStartMs(ts + 7 * DAY)).toBe(ws + 7 * DAY);
  });
});

describe('weeklyGoalHistory', () => {
  it('buckets sessions and metrics into calendar weeks with coverage flags', () => {
    const raw = emptyRaw();
    const weekStart = weekStartMs(NOW);
    const thisWeek = weekStart + 2 * DAY;
    const lastWeek = weekStart - 5 * DAY;
    raw.exercise = [
      {
        exerciseType: 70,
        typeName: 'STRENGTH_TRAINING',
        displayName: 'Posilování',
        start: thisWeek,
        end: thisWeek + 3_600_000,
        durationMin: 40,
        energyKcal: null,
        source: FITBIT,
      },
      {
        exerciseType: 70,
        typeName: 'STRENGTH_TRAINING',
        displayName: 'Posilování',
        start: lastWeek,
        end: lastWeek + 3_600_000,
        durationMin: 35,
        energyKcal: null,
        source: FITBIT,
      },
    ];
    raw.steps = [
      {
        count: 5000,
        start: thisWeek,
        end: thisWeek + 3_600_000,
        source: FITBIT,
      },
    ];
    raw.activeEnergy = [
      { kcal: 300, start: thisWeek, end: thisWeek + 3_600_000, source: FITBIT },
    ];

    const weeks = weeklyGoalHistory(raw, NOW, 4);
    expect(weeks).toHaveLength(4);

    const current = weeks[weeks.length - 1];
    const prev = weeks[weeks.length - 2];
    expect(current.weekStart).toBe(weekStart);
    expect(current.complete).toBe(false); // in progress
    expect(prev.complete).toBe(true);
    expect(current.tracked.strength).toBe(1);
    expect(prev.tracked.strength).toBe(1);
    expect(current.activities.map(a => a.displayName)).toContain('Posilování');
    // Coverage: steps/calories only where records exist; activity within 30d.
    expect(current.coverage.steps).toBe(true);
    expect(current.coverage.activity).toBe(true);
    expect(prev.coverage.steps).toBe(false); // no steps records that week
  });

  it('marks only weeks the exercise data reaches as activity-covered', () => {
    const raw = emptyRaw();
    const recent = weekStartMs(NOW) + 2 * DAY; // one session in the current week
    raw.exercise = [
      {
        exerciseType: 70,
        typeName: 'STRENGTH_TRAINING',
        displayName: null,
        start: recent,
        end: recent + 3_600_000,
        durationMin: 40,
        energyKcal: null,
        source: FITBIT,
      },
    ];
    const weeks = weeklyGoalHistory(raw, NOW, 6);
    // Current week has data → covered; older weeks (before any session) → not.
    expect(weeks[weeks.length - 1].coverage.activity).toBe(true);
    expect(weeks[0].coverage.activity).toBe(false);
  });

  it('covers no week when the exercise read is empty (never a fabricated miss)', () => {
    const weeks = weeklyGoalHistory(emptyRaw(), NOW, 6);
    expect(weeks.every(w => w.coverage.activity === false)).toBe(true);
  });

  it('fills per-week energy days and flags energy coverage for deficit goals', () => {
    const raw = emptyRaw();
    const weekStart = weekStartMs(NOW);
    const thisWeek = weekStart + 2 * DAY;
    raw.nutrition = [
      {
        start: thisWeek + 3_600_000,
        end: thisWeek + 3_600_000,
        name: 'Lunch',
        mealType: null,
        kcal: 2000,
        proteinG: null,
        carbsG: null,
        fatG: null,
        source: 'x',
      },
    ];
    raw.totalEnergy = [
      {
        kcal: 2600,
        start: thisWeek,
        end: thisWeek + DAY,
        source: 'Google Health',
      },
    ];

    const weeks = weeklyGoalHistory(raw, NOW, 4);
    const current = weeks[weeks.length - 1];
    // The day with both figures has net = eaten − burned = 2000 − 2600 = −600.
    const covered = current.energy.find(d => d.net != null);
    expect(covered?.net).toBe(-600);
    expect(current.coverage.energy).toBe(true);
    // A week with no nutrition/energy records is not energy-covered.
    expect(weeks[0].coverage.energy).toBe(false);
  });
});

describe('mergeRaw (cached history + recent slice)', () => {
  const ex = (start: number, source = FITBIT) => ({
    exerciseType: 70,
    typeName: 'STRENGTH_TRAINING',
    displayName: null,
    start,
    end: start + 3_600_000,
    durationMin: 40,
    energyKcal: null,
    source,
  });
  const kcal = (start: number, kcalV: number) => ({
    kcal: kcalV,
    start,
    end: start + DAY,
    source: 'Google Health',
  });

  it('keeps history before the cutoff, recent after, deduping the overlap', () => {
    const cutoff = NOW - 14 * DAY;
    const history: RawHealthData = {
      ...emptyRaw(),
      hrvRmssd: [{ value: 40, time: NOW - 20 * DAY, source: FITBIT }], // stale
      exercise: [ex(NOW - 30 * DAY), ex(NOW - 2 * DAY)], // old kept; recent one dup
      totalEnergy: [kcal(NOW - 30 * DAY, 2000), kcal(NOW - 2 * DAY, 9999)],
      sources: ['A'],
    };
    const recent: RawHealthData = {
      ...emptyRaw(),
      hrvRmssd: [{ value: 55, time: NOW - DAY, source: FITBIT }], // fresh
      exercise: [ex(NOW - 2 * DAY), ex(NOW - DAY)], // boundary dup + newest
      totalEnergy: [kcal(NOW - 2 * DAY, 2400), kcal(NOW - DAY, 2500)],
      sources: ['B'],
    };

    const merged = mergeRaw(history, recent, cutoff);

    // Cheap metrics come wholly from `recent`.
    expect(merged.hrvRmssd).toEqual(recent.hrvRmssd);
    // Exercise: old (−30d) + the shared −2d ONCE + newest (−1d) = 3, no dup.
    const starts = merged.exercise.map(e => e.start).sort((a, b) => a - b);
    expect(starts).toEqual([NOW - 30 * DAY, NOW - 2 * DAY, NOW - DAY]);
    // The overlap day takes the RECENT value (2400), not the stale 9999.
    const overlap = merged.totalEnergy.find(e => e.start === NOW - 2 * DAY);
    expect(overlap?.kcal).toBe(2400);
    // Source labels are unioned across both reads.
    expect(new Set(merged.sources)).toEqual(new Set(['A', 'B']));
  });

  it('drops history at/after the cutoff (recent owns that window)', () => {
    const cutoff = NOW - 14 * DAY;
    const history: RawHealthData = {
      ...emptyRaw(),
      exercise: [ex(NOW - 10 * DAY)], // inside recent window → dropped
    };
    const recent: RawHealthData = { ...emptyRaw(), exercise: [ex(NOW - DAY)] };
    const merged = mergeRaw(history, recent, cutoff);
    expect(merged.exercise.map(e => e.start)).toEqual([NOW - DAY]);
  });
});

describe('cardioFromExercise', () => {
  it('sums HR-zone minutes and weights them into daily / weekly load', () => {
    const today = NOW - (NOW % DAY);
    const y = today - DAY;
    const c = cardioFromExercise(
      [
        {
          exerciseType: 56,
          typeName: 'RUNNING',
          start: today + 3_600_000,
          end: today + 7_200_000,
          durationMin: 40,
          energyKcal: null,
          hrZones: {
            lightMin: 10,
            moderateMin: 20,
            vigorousMin: 5,
            peakMin: 0,
          },
          source: FITBIT,
        },
        {
          exerciseType: 56,
          typeName: 'RUNNING',
          start: y + 3_600_000,
          end: y + 5_400_000,
          durationMin: 30,
          energyKcal: null,
          hrZones: { lightMin: 0, moderateMin: 0, vigorousMin: 0, peakMin: 10 },
          source: FITBIT,
        },
        {
          exerciseType: 70,
          typeName: 'STRENGTH_TRAINING',
          start: today + 20_000_000,
          end: today + 22_000_000,
          durationMin: 30,
          energyKcal: null,
          source: FITBIT,
        }, // no HR zones
      ],
      NOW,
    );
    expect(c.zones7d).toEqual({
      lightMin: 10,
      moderateMin: 20,
      vigorousMin: 5,
      peakMin: 10,
    });
    expect(c.todayLoad).toBe(65); // 10×1 + 20×2 + 5×3 + 0×4
    expect(c.weekLoad).toBe(105); // + yesterday 10×4 = 40
    expect(c.daily).toHaveLength(7);
    expect(c.hasZoneData).toBe(true);
  });

  it('reports no zone data when sessions lack HR zones', () => {
    const today = NOW - (NOW % DAY);
    const c = cardioFromExercise(
      [
        {
          exerciseType: 70,
          typeName: 'STRENGTH_TRAINING',
          start: today + 3_600_000,
          end: today + 7_200_000,
          durationMin: 45,
          energyKcal: null,
          source: FITBIT,
        },
      ],
      NOW,
    );
    expect(c.hasZoneData).toBe(false);
    expect(c.weekLoad).toBe(0);
    expect(c.zones7d).toEqual({
      lightMin: 0,
      moderateMin: 0,
      vigorousMin: 0,
      peakMin: 0,
    });
  });
});
