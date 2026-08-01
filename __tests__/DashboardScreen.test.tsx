import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';

describe('DashboardScreen', () => {
  it('renders the core health metrics', async () => {
    await render(<DashboardScreen />);

    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Sleep')).toBeOnTheScreen();
    expect(screen.getByText('HRV')).toBeOnTheScreen();
    expect(screen.getByText('Recovery')).toBeOnTheScreen();
  });
});
