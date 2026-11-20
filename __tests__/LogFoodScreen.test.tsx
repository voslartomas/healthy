import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import {
  habitsBrokenBy,
  LogFoodScreen,
} from '../src/features/nutrition/LogFoodScreen';
import { MealLogScreen } from '../src/features/nutrition/MealLogScreen';
import { useHealthStore } from '../src/state/useHealthStore';

describe('MealLogScreen', () => {
  it('pins the log action and starts disabled', async () => {
    await renderWithProviders(<MealLogScreen navigation={mockNav()} />);
    expect(screen.getByText('In this meal')).toBeOnTheScreen();
    // The meal type is guessed from the clock, so match any of the four.
    expect(
      screen.getByLabelText(/^Log (Breakfast|Lunch|Dinner|Snack)$/),
    ).toBeDisabled();
  });
});

describe('LogFoodScreen', () => {
  it('offers junk / alcohol / sweets tags', async () => {
    await renderWithProviders(<LogFoodScreen navigation={mockNav()} />);
    const chip = screen.getByLabelText('ALCOHOL');
    expect(screen.getByLabelText('JUNK FOOD')).toBeOnTheScreen();
    expect(screen.getByLabelText('SWEETS')).toBeOnTheScreen();
    expect(chip.props.accessibilityState.checked).toBe(false);
    fireEvent.press(chip);
    await waitFor(() =>
      expect(
        screen.getByLabelText('ALCOHOL').props.accessibilityState.checked,
      ).toBe(true),
    );
  });

  it('names the habits a tag would break', () => {
    const habits = [
      { type: 'food', auto: true, tag: 'junk' as const, name: 'No junk food' },
      { type: 'water', auto: true, name: 'Drink 3 L a day' },
    ];
    expect(habitsBrokenBy(habits, ['junk'])).toEqual(['No junk food']);
    expect(habitsBrokenBy(habits, ['sweets'])).toEqual([]);
  });

  it('hands off to the coach with Log food armed', async () => {
    const nav = mockNav();
    await renderWithProviders(<LogFoodScreen navigation={nav} />);
    fireEvent.press(screen.getByLabelText('Tell the coach what you ate'));
    expect(nav.goBack).toHaveBeenCalled();
    expect(nav.navigate).toHaveBeenCalledWith('Coach', { intent: 'food' });
  });

  // Keep this one LAST in the file: the save resolves after the assertion, and
  // those trailing state updates disturb whatever renders next.
  it('logs through logFoodEntry and closes', async () => {
    const logFoodEntry = jest
      .spyOn(useHealthStore.getState(), 'logFoodEntry')
      .mockResolvedValue({ ok: true, name: 'entry-1' });
    const nav = mockNav();
    await renderWithProviders(<LogFoodScreen navigation={nav} />);
    fireEvent.changeText(screen.getByPlaceholderText('Food name'), 'Banana');
    fireEvent.changeText(screen.getByPlaceholderText('kcal'), '105');
    await waitFor(() =>
      expect(screen.getByLabelText('Save food entry')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Log 105 kcal')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Save food entry'));
    await waitFor(() =>
      expect(logFoodEntry).toHaveBeenCalledWith({ name: 'Banana', kcal: 105 }),
    );
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    logFoodEntry.mockRestore();
  });
});
