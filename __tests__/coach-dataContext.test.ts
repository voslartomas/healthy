import { buildDataContext } from '../src/features/coach/dataContext';
import { EMPTY_SNAPSHOT } from '../src/health';
import { useCalorieGoalsStore } from '../src/state/useCalorieGoalsStore';
import { useGoalsStore } from '../src/state/useGoalsStore';
import { useHealthStore } from '../src/state/useHealthStore';

beforeEach(() => {
  useGoalsStore.setState({ goals: [] });
  useCalorieGoalsStore.setState({ goals: [] });
  useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
});

describe('buildDataContext', () => {
  it('reports missing data safely when nothing is connected', () => {
    const ctx = buildDataContext();
    expect(ctx).toContain('No health data is connected');
    expect(ctx).toContain('Nutrition today: nothing logged yet.');
  });

  it('summarizes nutrition, steps, goals and the calorie target from the snapshot', () => {
    useHealthStore.setState({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        live: true,
        stepsToday: 8200,
        stepsThisWeek: 41000,
        tracked: { strength: 2 },
        nutrition: {
          eaten: 1850,
          proteinG: 120,
          carbsG: 180,
          fatG: 60,
          meals: [],
        },
      },
    });
    useGoalsStore.setState({
      goals: [{ id: '1', source: 'strength', name: 'Strength', target: 3 }],
    });
    useCalorieGoalsStore.setState({
      goals: [{ id: 'g', effectiveFrom: 0, targetNet: -500 }],
    });

    const ctx = buildDataContext();
    expect(ctx).toContain('1,850 kcal');
    expect(ctx).toContain('120g protein');
    expect(ctx).toContain('8,200 steps today (41,000 this week)');
    expect(ctx).toContain('Strength 2/3');
    expect(ctx).toContain('net −500 kcal/day');
  });
});
