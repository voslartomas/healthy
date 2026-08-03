import * as repo from '../src/db/goalHistoryRepository';
import { EMPTY_SNAPSHOT } from '../src/health';
import { GoalWeekData } from '../src/health/types';
import { syncGoalHistory } from '../src/state/goalHistoryService';
import { useGoalsStore } from '../src/state/useGoalsStore';
import { useHealthStore } from '../src/state/useHealthStore';

jest.mock('../src/db/goalHistoryRepository');
const mockedRepo = repo as jest.Mocked<typeof repo>;

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** One covered week (a strength session) and one uncovered older week. */
function weekData(): GoalWeekData[] {
  return [
    {
      weekStart: 0,
      complete: true,
      activities: [
        {
          name: 'S',
          type: 'STRENGTH_TRAINING',
          displayName: 'Posilování',
          durationMin: 40,
          energyKcal: null,
          start: 0,
        },
      ],
      tracked: {},
      energy: [],
      coverage: { steps: true, calories: true, activity: true, energy: false },
    },
    {
      weekStart: WEEK,
      complete: true,
      activities: [],
      tracked: {},
      energy: [],
      coverage: { steps: true, calories: true, activity: false, energy: false }, // uncovered
    },
  ];
}

describe('syncGoalHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRepo.loadGoalWeeks.mockResolvedValue([]);
    mockedRepo.upsertGoalWeeks.mockResolvedValue();
    useGoalsStore.setState({
      goals: [
        {
          id: 'g1',
          name: 'Strength',
          target: 1,
          match: { field: 'type', value: 'STRENGTH_TRAINING' },
        },
      ],
      hydrated: true,
    });
    useHealthStore.setState({
      snapshot: { ...EMPTY_SNAPSHOT, weeklyHistory: weekData() },
    });
  });

  it('persists only covered weeks and reloads the store', async () => {
    await syncGoalHistory();

    expect(mockedRepo.upsertGoalWeeks).toHaveBeenCalledTimes(1);
    const rows = mockedRepo.upsertGoalWeeks.mock.calls[0][0];
    // Only the covered week (weekStart 0), never the uncovered older one.
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      goalId: 'g1',
      weekStart: 0,
      current: 1,
      target: 1,
    });
    expect(mockedRepo.loadGoalWeeks).toHaveBeenCalled();
  });

  it('skips the upsert when there are no goals', async () => {
    useGoalsStore.setState({ goals: [], hydrated: true });
    await syncGoalHistory();
    expect(mockedRepo.upsertGoalWeeks).not.toHaveBeenCalled();
    expect(mockedRepo.loadGoalWeeks).toHaveBeenCalled();
  });
});
