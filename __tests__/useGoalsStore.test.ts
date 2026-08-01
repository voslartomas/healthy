import { TRACKED } from '../src/data/goalSources';
import {
  goalCurrent,
  goalProgress,
  isGoalComplete,
  useGoalsStore,
  WeeklyGoal,
} from '../src/state/useGoalsStore';

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
