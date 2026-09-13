import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { NutritionScreen } from '../src/features/nutrition/NutritionScreen';
import { useHealthStore } from '../src/state/useHealthStore';

describe('NutritionScreen', () => {
  it('renders the fuel brief and reveals the log-food form on tap', async () => {
    await renderWithProviders(<NutritionScreen navigation={mockNav()} />);

    expect(screen.getByText('Energy')).toBeOnTheScreen();
    expect(screen.getByText('Macros')).toBeOnTheScreen();

    // Form is hidden until the user taps "Log food".
    expect(screen.queryByPlaceholderText('Food name')).toBeNull();
    fireEvent.press(screen.getByLabelText('Log food'));
    expect(await screen.findByPlaceholderText('Food name')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('kcal')).toBeOnTheScreen();
  });

  it('offers junk / alcohol / sweets tags on the log-food form', async () => {
    await renderWithProviders(<NutritionScreen navigation={mockNav()} />);
    fireEvent.press(screen.getByLabelText('Log food'));

    const chip = await screen.findByLabelText('ALCOHOL');
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
  // Keep this one last: its save resolves after the assertion, and those
  // trailing state updates land outside act and disturb whatever renders next.
  it('routes a submitted entry through the store logFoodEntry action', async () => {
    const logFoodEntry = jest
      .spyOn(useHealthStore.getState(), 'logFoodEntry')
      .mockResolvedValue({ ok: true, name: 'entry-1' });

    await renderWithProviders(<NutritionScreen navigation={mockNav()} />);
    fireEvent.press(screen.getByLabelText('Log food'));
    fireEvent.changeText(
      await screen.findByPlaceholderText('Food name'),
      'Banana',
    );
    fireEvent.changeText(screen.getByPlaceholderText('kcal'), '105');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('kcal').props.value).toBe('105'),
    );
    fireEvent.press(screen.getByLabelText('Save food entry'));

    await waitFor(() =>
      expect(logFoodEntry).toHaveBeenCalledWith({ name: 'Banana', kcal: 105 }),
    );
    logFoodEntry.mockRestore();
  });
});
