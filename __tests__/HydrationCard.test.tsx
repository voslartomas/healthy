import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { HydrationCard } from '../src/features/nutrition/HydrationCard';
import { EMPTY_SNAPSHOT } from '../src/health';
import { useHabitsStore } from '../src/state/useHabitsStore';
import { useHealthStore } from '../src/state/useHealthStore';

afterEach(() => {
  useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
  useHabitsStore.setState({ habits: [], days: {} });
});

describe('HydrationCard (top of the Food screen)', () => {
  it('measures against the water habit and links to it', async () => {
    useHealthStore.setState({
      snapshot: { ...EMPTY_SNAPSHOT, waterTodayMl: 1800 },
    });
    useHabitsStore.setState({
      habits: [
        {
          id: 'w1',
          name: 'Drink 3 L a day',
          type: 'water',
          auto: true,
          allowance: 'never',
          targetMl: 3000,
          createdAt: 0,
        },
      ],
    });
    const nav = mockNav();
    await renderWithProviders(<HydrationCard navigation={nav} />);
    expect(screen.getByLabelText('Water 1.8 L of 3 L')).toBeOnTheScreen();
    expect(screen.getByText(/1\.2 L to go/)).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Edit habit Drink 3 L a day'));
    expect(nav.navigate).toHaveBeenCalledWith('HabitDefine', {
      habitId: 'w1',
    });
  });

  it('offers to make it a habit, and never invents a number', async () => {
    const nav = mockNav();
    await renderWithProviders(<HydrationCard navigation={nav} />);
    expect(screen.getByText('—')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Water not logged of 2.5 L'),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Make water a daily habit'));
    expect(nav.navigate).toHaveBeenCalledWith('HabitDefine', {
      habitType: 'water',
    });
  });
});
