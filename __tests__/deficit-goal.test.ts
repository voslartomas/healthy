import { dailyEnergyInWindow } from '../src/health/derive';
import { weeklyDeficitAvg } from '../src/state/useGoalsStore';
import { RawHealthData } from '../src/health/types';

const DAY = 24 * 60 * 60 * 1000;
const SRC = 'com.fitbit.FitbitMobile';
const MON = Date.UTC(2026, 8, 31); // a Monday 00:00 UTC

function meal(dayStart: number, kcal: number) {
  return {
    start: dayStart + 12 * 60 * 60 * 1000,
    end: dayStart + 12 * 60 * 60 * 1000 + 60_000,
    name: 'Lunch',
    mealType: null,
    kcal,
    proteinG: null,
    carbsG: null,
    fatG: null,
    source: SRC,
  };
}

function raw(over: Partial<RawHealthData>): RawHealthData {
  return {
    hrvRmssd: [],
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
    readAt: MON + 3 * DAY,
    ...over,
  };
}

describe('calorie-deficit goal — per-day burned', () => {
  it('uses the platform aggregate when no raw energy records exist', () => {
    // The reported bug: sources that expose only aggregates left every day's
    // `burned` null, so no day produced a net and the goal showed nothing.
    const days = dailyEnergyInWindow(
      raw({
        nutrition: [meal(MON, 2000), meal(MON + DAY, 2100)],
        totalEnergy: [],
        activeEnergy: [],
        dailyBurnedAgg: [
          { dayStart: MON, kcal: 2600 },
          { dayStart: MON + DAY, kcal: 2500 },
        ],
      }),
      MON,
      MON + 2 * DAY,
    );
    expect(days.map(d => d.burned)).toEqual([2600, 2500]);
    expect(days.map(d => d.net)).toEqual([-600, -400]);
    // Deficit is the average of the daily deficits: (600 + 400) / 2.
    expect(weeklyDeficitAvg(days)).toBe(500);
  });

  it('still falls back to raw records when the platform gives no aggregate', () => {
    const days = dailyEnergyInWindow(
      raw({
        nutrition: [meal(MON, 2000)],
        totalEnergy: [
          {
            start: MON + 3600_000,
            end: MON + 7200_000,
            kcal: 2400,
            source: SRC,
          },
        ],
      }),
      MON,
      MON + DAY,
    );
    expect(days[0].burned).toBe(2400);
    expect(days[0].net).toBe(-400);
  });

  it('credits an aggregate day to a single window when the grids are offset', () => {
    // Local-midnight buckets sit a couple of hours off the UTC-day windows; the
    // overlap rule must not count one aggregate day into two.
    const localOffset = 2 * 60 * 60 * 1000;
    const days = dailyEnergyInWindow(
      raw({
        nutrition: [meal(MON, 2000), meal(MON + DAY, 2000)],
        dailyBurnedAgg: [
          { dayStart: MON - localOffset, kcal: 2600 },
          { dayStart: MON + DAY - localOffset, kcal: 2500 },
        ],
      }),
      MON,
      MON + 2 * DAY,
    );
    expect(days.map(d => d.burned)).toEqual([2600, 2500]);
  });

  it('averages only the days that have both sides', () => {
    const days = dailyEnergyInWindow(
      raw({
        nutrition: [meal(MON, 2000)], // only day 1 has food logged
        dailyBurnedAgg: [
          { dayStart: MON, kcal: 2500 },
          { dayStart: MON + DAY, kcal: 2500 },
        ],
      }),
      MON,
      MON + 2 * DAY,
    );
    expect(days[1].net).toBeNull();
    expect(weeklyDeficitAvg(days)).toBe(500);
  });
});
