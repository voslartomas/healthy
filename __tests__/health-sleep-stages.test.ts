import {
  buildTrendSeries,
  nightIndex,
  sleepPeriods,
} from '../src/health/derive';
import { accumulateStages } from '../src/health/HealthConnectSource';
import { RawHealthData, SleepRecord } from '../src/health/types';

const T0 = Date.UTC(2026, 8, 2, 0, 0, 0); // session start
const iso = (offsetMin: number) =>
  new Date(T0 + offsetMin * 60_000).toISOString();

/** One stage segment, in minutes from the session start. */
function seg(from: number, to: number, stage: number) {
  return { startTime: iso(from), endTime: iso(to), stage };
}

describe('accumulateStages (Health Connect)', () => {
  const sessionEnd = T0 + 480 * 60_000; // an 8-hour session

  it('counts the unlabelled remainder of the session as light sleep', () => {
    // The writer labelled only 3h of an 8h session: 1h deep, 1h REM, 30m light,
    // 30m awake. The other 5h are unclassified — and used to vanish, which is
    // what made our total read short against the Google Health figure.
    const acc = accumulateStages(
      [
        seg(0, 60, 5), // deep
        seg(60, 120, 6), // REM
        seg(120, 150, 4), // light
        seg(150, 180, 1), // awake
      ],
      T0,
      sessionEnd,
    );
    expect(acc).not.toBeNull();
    expect(acc!.stages.deepMin).toBe(60);
    expect(acc!.stages.remMin).toBe(60);
    expect(acc!.stages.awakeMin).toBe(30);
    // 30m labelled light + the 300m nothing claimed.
    expect(acc!.stages.lightMin).toBe(330);
    // Asleep + awake now accounts for the whole session.
    const total =
      acc!.stages.deepMin +
      acc!.stages.remMin +
      acc!.stages.lightMin +
      acc!.stages.awakeMin;
    expect(total).toBe(480);
  });

  it('keeps out-of-bed time out of the sleep total, and reports it', () => {
    const acc = accumulateStages(
      [seg(0, 420, 4), seg(420, 480, 3)], // 7h light, then 1h out of bed
      T0,
      sessionEnd,
    );
    expect(acc!.stages.lightMin).toBe(420);
    expect(acc!.stages.awakeMin).toBe(0);
    // The caller deducts this from the session span to get sleep duration.
    expect(acc!.outOfBedMin).toBe(60);
  });

  it('maps generic asleep and unknown segments to light', () => {
    const acc = accumulateStages(
      [seg(0, 240, 2), seg(240, 480, 0)],
      T0,
      sessionEnd,
    );
    expect(acc!.stages.lightMin).toBe(480);
  });

  it('leaves a fully-labelled session untouched', () => {
    const acc = accumulateStages(
      [seg(0, 120, 5), seg(120, 240, 6), seg(240, 450, 4), seg(450, 480, 1)],
      T0,
      sessionEnd,
    );
    expect(acc!.stages).toEqual({
      deepMin: 120,
      remMin: 120,
      lightMin: 210,
      awakeMin: 30,
    });
  });

  it('returns null when the session reported no stages at all', () => {
    expect(accumulateStages(undefined, T0, sessionEnd)).toBeNull();
    expect(accumulateStages([], T0, sessionEnd)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const SRC = 'com.fitbit.FitbitMobile';

/** A local wall-clock time, as epoch ms. */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

function session(start: number, end: number, asleepMin?: number): SleepRecord {
  const span = (end - start) / 60_000;
  return {
    start,
    end,
    durationMin: asleepMin ?? span,
    source: SRC,
    stages: null,
  };
}

function rawWithSleep(
  sleep: SleepRecord[],
  nightlySleepAgg: { night: number; minutes: number }[] | null = null,
): RawHealthData {
  return {
    hrvRmssd: [],
    hrvAlgorithm: 'RMSSD',
    restingHr: [],
    sleep,
    nightlySleepAgg,
    steps: [],
    exercise: [],
    activeEnergy: [],
    totalEnergy: [],
    nutrition: [],
    weight: [],
    bodyFat: [],
    sources: [SRC],
    readAt: at(2026, 9, 2, 12),
  };
}

describe('sleepPeriods — a night split across sessions', () => {
  it('merges blocks of one interrupted night into a single period', () => {
    // 23:00→03:00, a 40-minute wake-up, then 03:40→07:00. One night, written as
    // two sessions — the app used to show only the second block.
    const periods = sleepPeriods([
      session(at(2026, 9, 1, 23), at(2026, 9, 2, 3)),
      session(at(2026, 9, 2, 3, 40), at(2026, 9, 2, 7)),
    ]);
    expect(periods).toHaveLength(1);
    expect(periods[0].durationMin).toBe(240 + 200);
    expect(periods[0].start).toBe(at(2026, 9, 1, 23));
    expect(periods[0].end).toBe(at(2026, 9, 2, 7));
  });

  it('keeps an afternoon nap separate from the night', () => {
    const periods = sleepPeriods([
      session(at(2026, 9, 1, 23), at(2026, 9, 2, 7)),
      session(at(2026, 9, 2, 14), at(2026, 9, 2, 14, 20)),
    ]);
    expect(periods).toHaveLength(2);
    expect(periods.map(p => p.durationMin)).toEqual([480, 20]);
  });
});

describe('sleep trend — one point per night', () => {
  it('reports the merged night, not its last block', () => {
    const t = buildTrendSeries(
      rawWithSleep([
        session(at(2026, 9, 1, 23), at(2026, 9, 2, 3)),
        session(at(2026, 9, 2, 3, 40), at(2026, 9, 2, 7)),
      ]),
    );
    expect(t.sleepHours).toHaveLength(1);
    expect(t.sleepHours[0].value).toBeCloseTo(7.3, 1);
  });

  it('reports the main sleep for the night, not a later nap', () => {
    const t = buildTrendSeries(
      rawWithSleep([
        session(at(2026, 9, 1, 23), at(2026, 9, 2, 7)),
        session(at(2026, 9, 2, 14), at(2026, 9, 2, 14, 20)),
      ]),
    );
    // The night reads 8h. The nap is after local noon, so it opens the NEXT
    // night's bucket — where the real night, once slept, will outrank it.
    expect(t.sleepHours.map(p => p.value)).toEqual([8, 0.3]);
  });
});

describe('nightly reconciliation against the platform total', () => {
  // The night the app assembles from records can come out short of what Health
  // Connect counts for that night — a block we drop, or one our merge does not
  // join. The platform total is authoritative, and the difference is sleep we
  // failed to classify, so it lands in light.
  const night = [session(at(2026, 9, 1, 23), at(2026, 9, 2, 7), 454)].map(
    s => ({
      ...s,
      stages: { deepMin: 100, remMin: 89, lightMin: 265, awakeMin: 41 },
    }),
  );

  it('adopts the platform total and credits the gap to light', () => {
    const t = buildTrendSeries(
      rawWithSleep(night, [
        { night: nightIndex(at(2026, 9, 2, 7)), minutes: 487 },
      ]),
    );
    expect(t.sleepHours[0].value).toBeCloseTo(487 / 60, 1); // 8:07
  });

  it('never lets the platform total pull a night DOWN', () => {
    // Health Connect's aggregate subtracts every wake minute, including the
    // arousals we count inside the sleep period, so it reads lower than what we
    // show. Adopting it would reintroduce the short night.
    const t = buildTrendSeries(
      rawWithSleep(night, [
        { night: nightIndex(at(2026, 9, 2, 7)), minutes: 400 },
      ]),
    );
    expect(t.sleepHours[0].value).toBeCloseTo(454 / 60, 1);
  });

  it('falls back to our own sum when the platform gives nothing', () => {
    const t = buildTrendSeries(rawWithSleep(night, null));
    expect(t.sleepHours[0].value).toBeCloseTo(454 / 60, 1);
  });
});

describe('a night whose blocks are too far apart to merge', () => {
  it('still counts every block toward the night', () => {
    // 22:00→01:00, awake 3.5h (past the merge gap), then 04:30→07:30. Health
    // Connect counts both for the night; taking only the longest block dropped
    // three hours — the shape of the "night reads short" report.
    const t = buildTrendSeries(
      rawWithSleep([
        session(at(2026, 9, 1, 22), at(2026, 9, 2, 1)),
        session(at(2026, 9, 2, 4, 30), at(2026, 9, 2, 7, 30)),
      ]),
    );
    expect(t.sleepHours).toHaveLength(1);
    expect(t.sleepHours[0].value).toBe(6);
  });
});

describe('the logged night of 2026-09-02 (real HEA-SLEEP data)', () => {
  // Session 23:47 → 08:02 = 495 min, stages tiling it exactly:
  // deep 74, REM 114, light 266, awake 41.
  // Google Health showed 8:07 total and 4:59 light for this night; Health
  // Connect's own SLEEP_DURATION_TOTAL aggregate reported 7:34 (= 495 − 41).
  // The 41 wake minutes split 8 at the edges + 33 as interior arousals.
  const S = at(2026, 9, 1, 23, 47);
  const E = at(2026, 9, 2, 8, 2);
  const m = (from: number, to: number, stage: number) => ({
    startTime: new Date(S + from * 60_000).toISOString(),
    endTime: new Date(S + to * 60_000).toISOString(),
    stage,
  });

  // 5 min falling asleep, arousals through the night, 3 min awake before rising.
  const segments = [
    m(0, 5, 1), // edge wake (sleep latency)
    m(5, 79, 5), // deep 74
    m(79, 90, 1), // arousal 11
    m(90, 204, 6), // REM 114
    m(204, 226, 1), // arousal 22
    m(226, 492, 4), // light 266
    m(492, 495, 1), // edge wake before getting up
  ];

  it('matches the Google Health figures for that night', () => {
    const acc = accumulateStages(segments, S, E)!;
    expect(acc.stages.deepMin).toBe(74);
    expect(acc.stages.remMin).toBe(114);
    // 266 labelled light + the 33 minutes of interior arousal.
    expect(acc.stages.lightMin).toBe(299); // 4:59
    // Only the 5 + 3 minutes at the edges of the night remain awake.
    expect(acc.stages.awakeMin).toBe(8);

    const asleep = acc.stages.deepMin + acc.stages.remMin + acc.stages.lightMin;
    expect(asleep).toBe(487); // 8:07
    // And the stages still account for the whole session.
    expect(asleep + acc.stages.awakeMin).toBe(495);
  });

  it('keeps counting all wake as awake when the night is only wake', () => {
    // No sleep stage at all → nothing is "interior", so nothing becomes light.
    const acc = accumulateStages([m(0, 30, 1)], S, S + 30 * 60_000)!;
    expect(acc.stages.awakeMin).toBe(30);
    expect(acc.stages.lightMin).toBe(0);
  });
});
