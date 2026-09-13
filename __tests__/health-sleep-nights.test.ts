import { deriveSnapshot } from '../src/health/derive';
import { RawHealthData, SleepRecord } from '../src/health/types';

const FITBIT = 'com.fitbit.FitbitMobile';

/** A local wall-clock time, as epoch ms, so these read as the night the user
 * actually slept regardless of the suite's timezone. */
function local(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

function localMidnight(y: number, m: number, d: number): number {
  return local(y, m, d, 0, 0);
}

function night(start: number, end: number): SleepRecord {
  return {
    start,
    end,
    durationMin: Math.round((end - start) / 60_000),
    source: FITBIT,
    stages: null,
  };
}

function raw(sleep: SleepRecord[]): RawHealthData {
  return {
    hrvRmssd: [],
    hrvAlgorithm: 'RMSSD',
    restingHr: [],
    sleep,
    steps: [],
    exercise: [],
    activeEnergy: [],
    totalEnergy: [],
    nutrition: [],
    weight: [],
    bodyFat: [],
    sources: [FITBIT],
    readAt: local(2026, 9, 3, 9),
  };
}

/**
 * The habits layer asks "which DAY does this night belong to?", and the answer
 * has to be the evening the night began on — your bedtime on Sunday is Sunday's.
 * Getting this backwards puts every sleep habit's verdict on the wrong row.
 */
describe('snapshot.sleepNights', () => {
  it('keys a night to the evening it began, not the morning it ended', () => {
    // Asleep 22:40 on the 1st, awake 06:30 on the 2nd → that is the 1st's night.
    const snap = deriveSnapshot(
      raw([night(local(2026, 9, 1, 22, 40), local(2026, 9, 2, 6, 30))]),
      local(2026, 9, 2, 9),
    );

    expect(snap.sleepNights).toHaveLength(1);
    expect(snap.sleepNights[0].day).toBe(localMidnight(2026, 9, 1));
    expect(snap.sleepNights[0].onset).toBe(local(2026, 9, 1, 22, 40));
  });

  it('keeps an after-midnight bedtime on the evening that started it', () => {
    // Asleep 00:20 on the 2nd is still the 1st's night — you went to bed "on
    // the 1st". Bucketing on the calendar date of the onset would say the 2nd.
    const snap = deriveSnapshot(
      raw([night(local(2026, 9, 2, 0, 20), local(2026, 9, 2, 7, 0))]),
      local(2026, 9, 2, 9),
    );

    expect(snap.sleepNights[0].day).toBe(localMidnight(2026, 9, 1));
  });

  it('returns consecutive nights on consecutive days, oldest first', () => {
    const snap = deriveSnapshot(
      raw([
        night(local(2026, 9, 2, 23, 10), local(2026, 9, 3, 6, 40)),
        night(local(2026, 9, 1, 22, 40), local(2026, 9, 2, 6, 30)),
      ]),
      local(2026, 9, 3, 9),
    );

    expect(snap.sleepNights.map(n => n.day)).toEqual([
      localMidnight(2026, 9, 1),
      localMidnight(2026, 9, 2),
    ]);
  });

  it('exposes the latest night on `sleep` as well, for the detail screens', () => {
    const snap = deriveSnapshot(
      raw([night(local(2026, 9, 2, 23, 10), local(2026, 9, 3, 6, 40))]),
      local(2026, 9, 3, 9),
    );

    expect(snap.sleep?.lastSessionStart).toBe(local(2026, 9, 2, 23, 10));
    expect(snap.sleep?.lastSessionEnd).toBe(local(2026, 9, 3, 6, 40));
  });
});
