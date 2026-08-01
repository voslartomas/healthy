import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { NutritionScreen } from '../src/features/nutrition/NutritionScreen';
import { useHealthStore } from '../src/state/useHealthStore';

describe('NutritionScreen', () => {
  it('renders the fuel view and reveals the log-food form on tap', async () => {
    await renderWithProviders(<NutritionScreen navigation={mockNav()} />);

    expect(screen.getByText('Fuel')).toBeOnTheScreen();
    expect(screen.getByText('Macros')).toBeOnTheScreen();

    // Form is hidden until the user taps "Log food".
    expect(screen.queryByPlaceholderText('Food name')).toBeNull();
    fireEvent.press(screen.getByLabelText('Log food'));
    expect(await screen.findByPlaceholderText('Food name')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('kcal')).toBeOnTheScreen();
  });

  it('routes a submitted entry through the store logFood action', async () => {
    const logFood = jest
      .spyOn(useHealthStore.getState(), 'logFood')
      .mockResolvedValue(true);

    await renderWithProviders(<NutritionScreen navigation={mockNav()} />);
    fireEvent.press(screen.getByLabelText('Log food'));
    fireEvent.changeText(await screen.findByPlaceholderText('Food name'), 'Banana');
    fireEvent.changeText(screen.getByPlaceholderText('kcal'), '105');
    // Wait for the controlled inputs to commit so the submit handler closes over
    // the latest values before we press Save.
    await waitFor(() =>
      expect(screen.getByPlaceholderText('kcal').props.value).toBe('105'),
    );
    fireEvent.press(screen.getByLabelText('Save food entry'));

    await waitFor(() =>
      expect(logFood).toHaveBeenCalledWith({ name: 'Banana', kcal: 105 }),
    );
    logFood.mockRestore();
  });
});
