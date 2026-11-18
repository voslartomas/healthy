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

    expect(screen.getByText('How it’s scored')).toBeOnTheScreen();

    // One row per input, named. "HRV" is both an overnight chip and a row.
    expect(screen.getAllByText('HRV')).toHaveLength(2);
    expect(screen.getByText('Resting HR')).toBeOnTheScreen();
    expect(screen.getByText('Sleep')).toBeOnTheScreen();

    // Each row states its weight and its reference value.
    expect(screen.getByText('· 50% of score')).toBeOnTheScreen();
    expect(screen.getByText('· 30% of score')).toBeOnTheScreen();
    expect(screen.getByText('· 20% of score')).toBeOnTheScreen();
    expect(
      screen.getByText('62 ms vs your 55 ms baseline · higher is better'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('54 bpm vs your 56 bpm baseline · lower is better'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('7h 42m vs your 8h 00m need · longer is better'),
    ).toBeOnTheScreen();
    // And says plainly that it is not a medical measurement.
    expect(screen.getByText(/not a medical measurement/)).toBeOnTheScreen();
  });

  it('explains itself instead of blanking when there is no data', async () => {
    await renderWithProviders(<RecoveryScreen navigation={mockNav()} />);
    expect(screen.getByText('How it’s scored')).toBeOnTheScreen();
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
    expect(
      screen.getByText(/Connect a source with overnight HRV/),
    ).toBeOnTheScreen();
  });

  it('says "not synced yet", not "not connected", when connected but empty', async () => {
    useHealthStore.setState({ snapshot: { ...EMPTY_SNAPSHOT, live: true } });
    await renderWithProviders(<RecoveryScreen navigation={mockNav()} />);
    expect(screen.getByText('Not synced yet')).toBeOnTheScreen();
    expect(screen.queryByText('Not connected')).toBeNull();
  });
});
