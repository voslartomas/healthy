import { EMPTY_SNAPSHOT } from '../src/health';
import { GoalWeekData } from '../src/health/types';
import {
  countMatchingSessions,
  goalCurrent,
  goalProgress,
  goalWeekly,
  isGoalComplete,
  useGoalsStore,
  WeeklyGoal,
} from '../src/state/useGoalsStore';
import { useHealthStore } from '../src/state/useHealthStore';

// Auto-tracked weekly totals the goal helpers read from the health snapshot.
const TRACKED = { steps: 41200, strength: 2, core: 3, zone2: 64, calories: 2380 };

beforeAll(() => {
  useHealthStore.setState({
    snapshot: { ...EMPTY_SNAPSHOT, tracked: TRACKED },
  });
});

const strengthGoal: WeeklyGoal = {
  id: '1',
  source: 'strength',
  name: 'Strength workouts',
  target: 3,
};

describe('useGoalsStore', () => {
  beforeEach(() => {
    useGoalsStore.setState({ goals: [], hydrated: false });
  });

  it('hydrates goals from a persisted list', () => {
    useGoalsStore.getState().setGoals([strengthGoal]);

    expect(useGoalsStore.getState().goals).toHaveLength(1);
    expect(useGoalsStore.getState().hydrated).toBe(true);
  });

  it('adds and removes goals in memory', () => {
    useGoalsStore.getState().addGoalLocal(strengthGoal);
    expect(useGoalsStore.getState().goals).toHaveLength(1);

    useGoalsStore.getState().removeGoalLocal('1');
    expect(useGoalsStore.getState().goals).toHaveLength(0);
  });
});

describe('goal progress helpers', () => {
  it('derives progress from auto-tracked totals', () => {
    // strength tracked = 2, target = 3 → 2/3
    expect(goalCurrent(strengthGoal)).toBe(TRACKED.strength);
    expect(goalProgress(strengthGoal)).toBeCloseTo(2 / 3);
    expect(isGoalComplete(strengthGoal)).toBe(false);
  });

  it('clamps progress at 1 and marks completion', () => {
    const easy: WeeklyGoal = {
      id: '2',
      source: 'core',
      name: 'Core',
      target: 2,
    };
    // core tracked = 3, target = 2 → complete, clamped to 1
    expect(goalProgress(easy)).toBe(1);
    expect(isGoalComplete(easy)).toBe(true);
  });

  it('handles a zero target safely', () => {
    const zero: WeeklyGoal = {
      id: '3',
      source: 'steps',
      name: 'Steps',
      target: 0,
    };
    expect(goalProgress(zero)).toBe(0);
  });
});

describe('activity goals (match by type / displayName + min duration)', () => {
  const activities = [
    { name: 'Posilování', type: 'STRENGTH_TRAINING', displayName: 'Posilování', durationMin: 42, energyKcal: null, start: 0 },
    { name: 'Posilování', type: 'STRENGTH_TRAINING', displayName: 'Posilování', durationMin: 20, energyKcal: null, start: 0 },
    { name: 'Trénink středu těla', type: 'WORKOUT', displayName: 'Trénink středu těla', durationMin: 9, energyKcal: null, start: 0 },
  ];

  beforeAll(() => {
    useHealthStore.setState({
      snapshot: { ...EMPTY_SNAPSHOT, tracked: TRACKED, activities },
    });
  });

  it('counts sessions matching an exercise type', () => {
    const g: WeeklyGoal = {
      id: 'a',
      name: 'Strength',
      target: 3,
      match: { field: 'type', value: 'STRENGTH_TRAINING' },
    };
    expect(goalCurrent(g)).toBe(2);
  });

  it('applies the minimum-duration filter', () => {
    const g: WeeklyGoal = {
      id: 'a',
      name: 'Strength ≥30m',
      target: 3,
      match: { field: 'type', value: 'STRENGTH_TRAINING' },
      minDurationMin: 30,
    };
    expect(goalCurrent(g)).toBe(1); // only the 42-min session qualifies
  });

  it('matches a localized displayName case-insensitively', () => {
    const g: WeeklyGoal = {
      id: 'b',
      name: 'Core',
      target: 5,
      match: { field: 'displayName', value: 'trénink středu těla' },
    };
    expect(goalCurrent(g)).toBe(1);
    expect(isGoalComplete(g)).toBe(false);
  });

  it('countMatchingSessions is a pure helper', () => {
    expect(
      countMatchingSessions(activities, {
        field: 'displayName',
        value: 'Posilování',
      }),
    ).toBe(2);
    expect(
      countMatchingSessions(
        activities,
        { field: 'displayName', value: 'Posilování' },
        30,
      ),
    ).toBe(1);
  });
});

describe('goalWeekly (per-week attainment)', () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const sess = (dur: number) => ({
    name: 'S',
    type: 'STRENGTH_TRAINING',
    displayName: 'Posilování',
    durationMin: dur,
    energyKcal: null,
    start: 0,
  });

  it('computes hit/miss per week for an activity goal and flags coverage', () => {
    const goal: WeeklyGoal = {
      id: 'a',
      name: 'Strength',
      target: 2,
      match: { field: 'type', value: 'STRENGTH_TRAINING' },
    };
    const history: GoalWeekData[] = [
      { weekStart: 0, complete: true, activities: [sess(40), sess(50)], tracked: {}, coverage: { steps: true, calories: true, activity: true } },
      { weekStart: WEEK, complete: true, activities: [sess(40)], tracked: {}, coverage: { steps: true, calories: true, activity: true } },
      { weekStart: 2 * WEEK, complete: true, activities: [], tracked: {}, coverage: { steps: true, calories: true, activity: false } },
    ];
    const weeks = goalWeekly(goal, history);
    expect(weeks[0]).toMatchObject({ current: 2, hit: true, covered: true });
    expect(weeks[1]).toMatchObject({ current: 1, hit: false, covered: true });
    expect(weeks[2].covered).toBe(false); // no activity coverage → not a miss
  });

  it('reads source-goal coverage from the matching source flag', () => {
    const goal: WeeklyGoal = { id: 'b', name: 'Steps', target: 50000, source: 'steps' };
    const history: GoalWeekData[] = [
      { weekStart: 0, complete: true, activities: [], tracked: { steps: 60000 }, coverage: { steps: true, calories: false, activity: false } },
      { weekStart: WEEK, complete: true, activities: [], tracked: { steps: 10000 }, coverage: { steps: false, calories: false, activity: false } },
    ];
    const weeks = goalWeekly(goal, history);
    expect(weeks[0]).toMatchObject({ current: 60000, hit: true, covered: true });
    expect(weeks[1].covered).toBe(false); // no steps coverage that week
  });
});
