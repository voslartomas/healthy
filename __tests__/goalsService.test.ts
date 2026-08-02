import * as repo from '../src/db/goalsRepository';
import { createGoal, initGoals, removeGoal } from '../src/state/goalsService';
import { useGoalsStore } from '../src/state/useGoalsStore';

jest.mock('../src/db/goalsRepository');
// Goal-history persistence is exercised in its own tests; stub it here so
// create/remove don't reach SQLite via the fire-and-forget history sync.
jest.mock('../src/db/goalHistoryRepository');
jest.mock('../src/state/goalHistoryService', () => ({
  initGoalHistory: jest.fn().mockResolvedValue(undefined),
  syncGoalHistory: jest.fn().mockResolvedValue(undefined),
}));
const mockedRepo = repo as jest.Mocked<typeof repo>;

describe('goalsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGoalsStore.setState({ goals: [], hydrated: false });
  });

  it('hydrates the store from the repository', async () => {
    mockedRepo.loadGoals.mockResolvedValue([
      { id: 'a', source: 'steps', name: 'Steps', target: 56000 },
    ]);

    await initGoals();

    expect(mockedRepo.loadGoals).toHaveBeenCalledTimes(1);
    expect(useGoalsStore.getState().goals).toHaveLength(1);
    expect(useGoalsStore.getState().hydrated).toBe(true);
  });

  it('persists then stores a created goal', async () => {
    mockedRepo.insertGoal.mockResolvedValue();

    const goal = await createGoal({
      source: 'strength',
      name: 'Lift',
      target: 3,
    });

    expect(mockedRepo.insertGoal).toHaveBeenCalledWith(goal);
    expect(useGoalsStore.getState().goals).toContainEqual(goal);
    expect(goal.id).toMatch(/^g_/);
  });

  it('persists an activity goal with a match + minimum duration', async () => {
    mockedRepo.insertGoal.mockResolvedValue();

    const goal = await createGoal({
      name: 'Core ≥15m',
      target: 5,
      match: { field: 'displayName', value: 'Trénink středu těla' },
      minDurationMin: 15,
    });

    expect(goal.match).toEqual({
      field: 'displayName',
      value: 'Trénink středu těla',
    });
    expect(goal.minDurationMin).toBe(15);
    expect(goal.source).toBeUndefined();
    expect(mockedRepo.insertGoal).toHaveBeenCalledWith(goal);
  });

  it('deletes from the repository then the store', async () => {
    mockedRepo.insertGoal.mockResolvedValue();
    mockedRepo.deleteGoal.mockResolvedValue();

    const goal = await createGoal({ source: 'core', name: 'Core', target: 5 });
    await removeGoal(goal.id);

    expect(mockedRepo.deleteGoal).toHaveBeenCalledWith(goal.id);
    expect(useGoalsStore.getState().goals).toHaveLength(0);
  });
});
