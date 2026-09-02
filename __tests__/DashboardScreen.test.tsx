import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';
import { EMPTY_SNAPSHOT } from '../src/health';
import { readiness } from '../src/health/derive';
import { useHealthStore } from '../src/state/useHealthStore';

describe('DashboardScreen', () => {
  afterEach(() => {
    useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
  });

  it('renders the brief cards and the recovery hero', async () => {
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);

    expect(screen.getByText('Sleep →')).toBeOnTheScreen();
    expect(screen.getByText('Body & fuel')).toBeOnTheScreen();
    expect(screen.getByText('Fuel →')).toBeOnTheScreen();
    expect(screen.getByText('Week')).toBeOnTheScreen();
    // With no snapshot the recovery hero reads "not connected".
    expect(screen.getByText('NOT CONNECTED')).toBeOnTheScreen();
  });

  it('names what the recovery score was counted from', async () => {
    const hrv = { value: 62, baseline: 55, delta: 7 };
    const rhr = { value: 54, baseline: 56, delta: -2 };
    // Seeded before mount, so no state update happens during render.
    useHealthStore.setState({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        hrv: { ...hrv, algorithm: 'RMSSD' as const },
        restingHr: rhr,
        readiness: readiness(hrv, rhr, { performancePct: 96, hours: 7.7 }),
      },
    });
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);
    expect(screen.getByText('HRV 62 · RHR 54 · SLEEP 96% →')).toBeOnTheScreen();
  });

  it('deep-links into the recovery detail from the hero', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText(/Open recovery detail/));
    expect(nav.navigate).toHaveBeenCalledWith('Recovery');
  });

  it('opens the Sleep detail from the sleep card', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText('Open sleep detail'));
    expect(nav.navigate).toHaveBeenCalledWith('Sleep');
  });

  it('opens the Fuel tab from the fuel row', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText('Open fuel detail'));
    expect(nav.navigate).toHaveBeenCalledWith('Nutrition');
  });
});
