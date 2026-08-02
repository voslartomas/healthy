import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';

describe('DashboardScreen', () => {
  it('renders the core health metrics and recovery hero', async () => {
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);

    expect(
      screen.getByText(/Good (morning|afternoon|evening)/),
    ).toBeOnTheScreen();
    expect(screen.getByText('Sleep')).toBeOnTheScreen();
    expect(screen.getByText('HRV')).toBeOnTheScreen();
    expect(screen.getByText('Recovery')).toBeOnTheScreen();
    expect(screen.getByText('Resting HR')).toBeOnTheScreen();
  });

  it('opens Settings from the avatar button', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText('Open settings'));
    expect(nav.navigate).toHaveBeenCalledWith('Settings');
  });

  it('deep-links into the recovery detail', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText(/Open recovery detail/));
    expect(nav.navigate).toHaveBeenCalledWith('Recovery');
  });
});
