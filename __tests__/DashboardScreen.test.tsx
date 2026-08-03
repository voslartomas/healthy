import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';

describe('DashboardScreen', () => {
  it('renders the numbered brief sections and the recovery hero', async () => {
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);

    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(screen.getByText('Fuel')).toBeOnTheScreen();
    expect(screen.getByText('Week')).toBeOnTheScreen();
    // With no snapshot the recovery hero reads "not connected".
    expect(screen.getByText('NOT CONNECTED')).toBeOnTheScreen();
  });

  it('deep-links into the recovery detail from the hero', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText(/Open recovery detail/));
    expect(nav.navigate).toHaveBeenCalledWith('Recovery');
  });

  it('opens the Fuel tab from the fuel section header', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByText('Fuel'));
    expect(nav.navigate).toHaveBeenCalledWith('Nutrition');
  });
});
