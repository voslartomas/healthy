import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { NutritionScreen } from '../src/features/nutrition/NutritionScreen';

describe('NutritionScreen', () => {
  it('renders the food screen with hydration first', async () => {
    await renderWithProviders(<NutritionScreen navigation={mockNav()} />);

    expect(screen.getByText('Hydration')).toBeOnTheScreen();
    // The energy balance lives in the hero card's chips now.
    expect(screen.getByText('EATEN')).toBeOnTheScreen();
    expect(screen.getByText('Quick add')).toBeOnTheScreen();
    expect(screen.getByText('Macros')).toBeOnTheScreen();
    expect(screen.getByText('Eaten today')).toBeOnTheScreen();
    // No inline form any more: logging happens on its own screen.
    expect(screen.queryByPlaceholderText('Food name')).toBeNull();
  });

  it('opens Log food and Log a meal as their own screens', async () => {
    const nav = mockNav();
    await renderWithProviders(<NutritionScreen navigation={nav} />);
    fireEvent.press(screen.getByLabelText('Log food'));
    expect(nav.navigate).toHaveBeenCalledWith('LogFood');
    fireEvent.press(screen.getByLabelText('Log a meal'));
    expect(nav.navigate).toHaveBeenCalledWith('MealLog');
  });
});
