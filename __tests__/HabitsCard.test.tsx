import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { HabitsCard } from '../src/features/habits/HabitsCard';
import { EMPTY_SNAPSHOT } from '../src/health';
import { Habit, startOfDayMs, startOfWeek } from '../src/state/habits';
import { useFoodTagsStore } from '../src/state/useFoodTagsStore';
import { dayKey, useHabitsStore } from '../src/state/useHabitsStore';
import { useHealthStore } from '../src/state/useHealthStore';

jest.mock('../src/db/habitsRepository', () => ({
  loadHabits: jest.fn(async () => []),
  insertHabit: jest.fn(async () => undefined),
  updateHabit: jest.fn(async () => undefined),
  deleteHabit: jest.fn(async () => undefined),
  loadHabitDays: jest.fn(async () => []),
  setHabitDay: jest.fn(async () => undefined),
  clearHabitDay: jest.fn(async () => undefined),
  pruneHabitDays: jest.fn(async () => undefined),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

const habit: Habit = {
  id: 'h1',
  name: 'No junk food',
  type: 'food',
  auto: true,
  allowance: 'week',
  tag: 'junk',
  createdAt: Date.now() - 60 * DAY_MS,
};

beforeEach(() => {
  useHabitsStore.setState({ habits: [habit], days: {}, hydrated: true });
  useFoodTagsStore.setState({ rows: [], hydrated: true });
  useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
});

describe('the Today habits card', () => {
  it('shows one cell per day of the week, Monday to Sunday', async () => {
    await renderWithProviders(<HabitsCard navigation={mockNav()} />);

    // Two Ts and two Ss in a week, so the labels repeat by design.
    const cells = await screen.findAllByLabelText(/^No junk food, [MTWFS]$/);
    expect(cells).toHaveLength(7);
  });

  it('records a miss when a clean past day is tapped', async () => {
    // Monday reads 'auto' — the log saw nothing. Tapping it is the user saying
    // the day broke anyway, which has to be written down explicitly.
    const monday = startOfWeek(startOfDayMs(Date.now()));
    await renderWithProviders(<HabitsCard navigation={mockNav()} />);

    const cells = await screen.findAllByLabelText(/^No junk food, [MTWFS]$/);
    fireEvent.press(cells[0]);

    await waitFor(() =>
      expect(useHabitsStore.getState().days[dayKey('h1', monday)]).toBe('miss'),
    );
  });

  it('checks an open day when its cell is tapped, and un-checks it again', async () => {
    const today = startOfDayMs(Date.now());
    await renderWithProviders(<HabitsCard navigation={mockNav()} />);

    // Today is 'open' for an auto food habit — it only passes at midnight.
    fireEvent.press(await screen.findByLabelText('No junk food'));
    await waitFor(() =>
      expect(useHabitsStore.getState().days[dayKey('h1', today)]).toBe('held'),
    );

    fireEvent.press(screen.getByLabelText('No junk food'));
    await waitFor(() =>
      expect(
        useHabitsStore.getState().days[dayKey('h1', today)],
      ).toBeUndefined(),
    );
  });

  it("lets a brand-new habit's earlier days in the week be filled in", async () => {
    // Created this morning: Monday onwards has no data, but the strip still
    // shows those days and a tap still records them.
    const today = startOfDayMs(Date.now());
    const monday = startOfWeek(today);
    useHabitsStore.setState({
      habits: [{ ...habit, createdAt: Date.now() }],
      days: {},
      hydrated: true,
    });
    await renderWithProviders(<HabitsCard navigation={mockNav()} />);

    const cells = await screen.findAllByLabelText(/^No junk food, [MTWFS]$/);
    expect(cells).toHaveLength(7);

    if (monday !== today) {
      fireEvent.press(cells[0]);
      await waitFor(() =>
        expect(useHabitsStore.getState().days[dayKey('h1', monday)]).toBe(
          'held',
        ),
      );
    }
  });

  it('prompts to add a habit when there are none', async () => {
    useHabitsStore.setState({ habits: [], days: {}, hydrated: true });
    await renderWithProviders(<HabitsCard navigation={mockNav()} />);

    expect(await screen.findByText(/No habits yet/)).toBeOnTheScreen();
  });

  it('opens the habit sheet for editing from the row', async () => {
    const nav = mockNav();
    await renderWithProviders(<HabitsCard navigation={nav} />);

    fireEvent.press(await screen.findByLabelText('Edit No junk food'));
    expect(nav.navigate).toHaveBeenCalledWith('HabitDefine', {
      habitId: 'h1',
    });
  });

  it('checks TODAY from the row, not the last day of the week', async () => {
    // The evaluated window runs past today to Sunday so the strip can show the
    // whole week — which makes "the last day of the range" the wrong day to
    // write to on every day except Sunday. Pin a Wednesday so that distinction
    // actually bites.
    const wednesday = Date.UTC(2026, 8, 9, 10, 0);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(wednesday);
    try {
      useHabitsStore.setState({
        habits: [{ ...habit, createdAt: wednesday - 30 * DAY_MS }],
        days: {},
        hydrated: true,
      });
      await renderWithProviders(<HabitsCard navigation={mockNav()} />);

      fireEvent.press(await screen.findByLabelText('No junk food'));

      const today = startOfDayMs(wednesday);
      await waitFor(() =>
        expect(useHabitsStore.getState().days[dayKey('h1', today)]).toBe(
          'held',
        ),
      );
      // …and nothing was written to the end of the week.
      const sunday = startOfWeek(today) + 6 * DAY_MS;
      expect(
        useHabitsStore.getState().days[dayKey('h1', sunday)],
      ).toBeUndefined();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
