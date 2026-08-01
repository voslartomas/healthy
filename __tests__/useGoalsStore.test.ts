import { isGoalComplete, useGoalsStore } from '../src/state/useGoalsStore';

describe('useGoalsStore', () => {
  beforeEach(() => {
    useGoalsStore.setState({ goals: [] });
  });

  it('adds a weekly goal with zero progress', () => {
    useGoalsStore.getState().addGoal('Run 5k', 3);

    const { goals } = useGoalsStore.getState();
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      title: 'Run 5k',
      targetPerWeek: 3,
      completedThisWeek: 0,
    });
  });

  it('increments progress but never past the weekly target', () => {
    useGoalsStore.getState().addGoal('Meditate', 2);
    const id = useGoalsStore.getState().goals[0].id;

    const { incrementProgress } = useGoalsStore.getState();
    incrementProgress(id);
    incrementProgress(id);
    incrementProgress(id);

    const goal = useGoalsStore.getState().goals[0];
    expect(goal.completedThisWeek).toBe(2);
    expect(isGoalComplete(goal)).toBe(true);
  });

  it('resets weekly progress while keeping goals', () => {
    useGoalsStore.getState().addGoal('Lift', 4);
    const id = useGoalsStore.getState().goals[0].id;
    useGoalsStore.getState().incrementProgress(id);

    useGoalsStore.getState().resetWeek();

    const goal = useGoalsStore.getState().goals[0];
    expect(goal.completedThisWeek).toBe(0);
    expect(isGoalComplete(goal)).toBe(false);
  });
});
