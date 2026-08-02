import { DailyEnergy } from '../src/health';
import {
  adherenceSeries,
  adherenceSummary,
  CalorieGoal,
  currentCalorieGoal,
  isCalorieGoalHit,
  weeklyAdherence,
} from '../src/state/useCalorieGoalsStore';

const DAY = 24 * 60 * 60 * 1000;
const AUG1 = Date.UTC(2026, 7, 1);
const AUG28 = Date.UTC(2026, 7, 28);

const goals: CalorieGoal[] = [
  { id: 'a', effectiveFrom: AUG1, targetNet: -400 },
  { id: 'b', effectiveFrom: AUG28, targetNet: -200 },
];

describe('currentCalorieGoal', () => {
  it('picks the most recent goal effective on or before now', () => {
    // Mid-August: only the Aug 1 goal is in force.
    expect(currentCalorieGoal(goals, AUG1 + 10 * DAY)?.id).toBe('a');
    // After Aug 28: the newer goal supersedes.
    expect(currentCalorieGoal(goals, AUG28 + DAY)?.id).toBe('b');
    // On the effective day itself (inclusive).
    expect(currentCalorieGoal(goals, AUG28)?.id).toBe('b');
  });

  it('returns null before any goal takes effect, or with no goals', () => {
    expect(currentCalorieGoal(goals, AUG1 - DAY)).toBeNull();
    expect(currentCalorieGoal([], AUG28)).toBeNull();
  });
});

describe('isCalorieGoalHit', () => {
  it('hits a deficit target when net is at or below it', () => {
    expect(isCalorieGoalHit(-400, -500)).toBe(true); // deeper deficit
    expect(isCalorieGoalHit(-400, -400)).toBe(true); // exactly
    expect(isCalorieGoalHit(-400, -300)).toBe(false); // not enough deficit
  });

  it('hits a surplus target when net is at or above it', () => {
    expect(isCalorieGoalHit(300, 350)).toBe(true);
    expect(isCalorieGoalHit(300, 300)).toBe(true);
    expect(isCalorieGoalHit(300, 250)).toBe(false);
  });
});

describe('adherence', () => {
  const day = (i: number) => AUG1 + i * DAY;
  const daily: DailyEnergy[] = [
    { dayStart: day(0), eaten: 1800, burned: 2200, net: -400 }, // hits −400
    { dayStart: day(1), eaten: 2000, burned: 2200, net: -200 }, // misses −400
    { dayStart: day(2), eaten: null, burned: 2200, net: null }, // no data
  ];

  it('joins each day with the goal in force and a hit flag', () => {
    const series = adherenceSeries(goals, daily);
    expect(series[0].target).toBe(-400);
    expect(series[0].hit).toBe(true);
    expect(series[1].hit).toBe(false);
    expect(series[2].hit).toBeNull();
  });

  it('summarizes only judgeable days', () => {
    const s = adherenceSummary(adherenceSeries(goals, daily));
    expect(s.daysWithData).toBe(2);
    expect(s.daysHit).toBe(1);
    expect(s.adherencePct).toBe(50);
    expect(s.avgNet).toBe(-300); // (−400 + −200) / 2
  });

  it('groups the series into 7-day weeks', () => {
    const weeks = weeklyAdherence(adherenceSeries(goals, daily));
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toBe(day(0));
    expect(weeks[0].summary.adherencePct).toBe(50);
  });
});
