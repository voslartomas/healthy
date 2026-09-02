import React from 'react';
import { screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { EMPTY_SNAPSHOT } from '../src/health';
import { readiness } from '../src/health/derive';
import { RecoveryScreen } from '../src/features/recovery/RecoveryScreen';
import { useHealthStore } from '../src/state/useHealthStore';

const hrv = { value: 62, baseline: 55, delta: 7 };
const rhr = { value: 54, baseline: 56, delta: -2 };

function seedSnapshot() {
  useHealthStore.setState({
    snapshot: {
      ...EMPTY_SNAPSHOT,
      live: true,
      hrv: { ...hrv, algorithm: 'RMSSD' as const },
      restingHr: rhr,
      sleep: {
        hours: 7.7,
        performancePct: 96,
        lastSessionEnd: Date.now(),
        stages: null,
      },
      readiness: readiness(hrv, rhr, { performancePct: 96, hours: 7.7 }),
    },
  });
}

describe('RecoveryScreen — how the score is counted', () => {
  afterEach(() => {
    useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
  });

  it('shows every input, what it was measured against, and its share', async () => {
    seedSnapshot();
    await renderWithProviders(<RecoveryScreen navigation={mockNav()} />);

    expect(screen.getByText('How this is scored')).toBeOnTheScreen();

    // One row per input, named.
    expect(screen.getByText('HRV')).toBeOnTheScreen();
    expect(screen.getByText('Resting HR')).toBeOnTheScreen();
    expect(screen.getByText('Sleep')).toBeOnTheScreen();

    // Each row states its weight and its reference value.
    expect(screen.getByText('50% OF SCORE')).toBeOnTheScreen();
    expect(screen.getByText('30% OF SCORE')).toBeOnTheScreen();
    expect(screen.getByText('20% OF SCORE')).toBeOnTheScreen();
    expect(
      screen.getByText('VS 55 BASELINE · HIGHER IS BETTER'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('VS 56 BASELINE · LOWER IS BETTER'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('VS 8:00 NEED · LONGER IS BETTER'),
    ).toBeOnTheScreen();
  });

  it('explains itself instead of blanking when there is no data', async () => {
    await renderWithProviders(<RecoveryScreen navigation={mockNav()} />);
    expect(screen.getByText('How this is scored')).toBeOnTheScreen();
    expect(
      screen.getByText(/Connect a source with overnight HRV/),
    ).toBeOnTheScreen();
  });
});
