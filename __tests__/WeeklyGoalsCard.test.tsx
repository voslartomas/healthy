import React from 'react';
import { screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { WeeklyGoalsCard } from '../src/features/goals/WeeklyGoalsCard';
import { EMPTY_SNAPSHOT } from '../src/health';
import { GoalWeekData } from '../src/health/types';
import { useGoalsStore } from '../src/state/useGoalsStore';
import { useHealthStore } from '../src/state/useHealthStore';

const currentWeek = (over: Partial<GoalWeekData>): GoalWeekData => ({
  weekStart: 0,
  complete: false,
  activities: [],
  tracked: {},
  energy: [],
  coverage: { steps: true, calories: true, activity: true, energy: true },
  ...over,
});

describe('WeeklyGoalsCard — zone-2 renders per-day bars', () => {
  afterEach(() => {
    useGoalsStore.setState({ goals: [], hydrated: false });
    useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
  });

  it('draws one filled bar per zone-2 day that has minutes (same as any goal)', async () => {
    useGoalsStore.setState({
      goals: [{ id: 'z', name: 'Zone 2', target: 90, source: 'zone2' }],
      hydrated: true,
    });
    useHealthStore.setState({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        weeklyHistory: [
          currentWeek({
            tracked: { zone2: 45 },
            // Mon/Tue/Wed have minutes; the rest of the week is empty.
            dailyTracked: [
              { zone2: 13 },
              { zone2: 6 },
              { zone2: 26 },
              {},
              {},
              {},
              {},
            ],
          }),
        ],
      },
    });

    await renderWithProviders(<WeeklyGoalsCard navigation={mockNav()} />);

    // Three days with minutes → three filled bars, four empty stubs. Proves the
    // zone-2 goal renders per-day bars, not a single track.
    expect(screen.getAllByTestId('weekly-goal-bar-filled')).toHaveLength(3);
    expect(screen.getAllByTestId('weekly-goal-bar-empty')).toHaveLength(4);
  });

  it('shows only empty stubs when the zone-2 week has no minutes', async () => {
    useGoalsStore.setState({
      goals: [{ id: 'z', name: 'Zone 2', target: 90, source: 'zone2' }],
      hydrated: true,
    });
    useHealthStore.setState({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        weeklyHistory: [
          currentWeek({ dailyTracked: [{}, {}, {}, {}, {}, {}, {}] }),
        ],
      },
    });

    await renderWithProviders(<WeeklyGoalsCard navigation={mockNav()} />);

    // No minutes anywhere → seven empty stubs, zero filled bars (the render for
    // a week with no zone-2 work at all).
    expect(screen.queryAllByTestId('weekly-goal-bar-filled')).toHaveLength(0);
    expect(screen.getAllByTestId('weekly-goal-bar-empty')).toHaveLength(7);
  });
});
