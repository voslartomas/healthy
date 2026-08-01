import * as repo from '../src/db/goalsRepository';
import { createGoal, initGoals, removeGoal } from '../src/state/goalsService';
import { useGoalsStore } from '../src/state/useGoalsStore';

jest.mock('../src/db/goalsRepository');
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

  it('deletes from the repository then the store', async () => {
    mockedRepo.insertGoal.mockResolvedValue();
    mockedRepo.deleteGoal.mockResolvedValue();

    const goal = await createGoal({ source: 'core', name: 'Core', target: 5 });
    await removeGoal(goal.id);

    expect(mockedRepo.deleteGoal).toHaveBeenCalledWith(goal.id);
    expect(useGoalsStore.getState().goals).toHaveLength(0);
  });
});
