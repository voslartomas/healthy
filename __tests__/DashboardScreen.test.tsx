import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { DashboardScreen } from '../src/features/dashboard/DashboardScreen';
import { EMPTY_SNAPSHOT, startOfLocalDay } from '../src/health';
import { readiness } from '../src/health/derive';
import { useHealthStore } from '../src/state/useHealthStore';
import { useJournalStore } from '../src/state/useJournalStore';

describe('DashboardScreen', () => {
  afterEach(() => {
    useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
    useJournalStore.setState({ entries: [] });
  });

  it('renders the brief cards and the recovery hero', async () => {
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);

    // The recovery card carries the four overnight chips; then habits, the
    // week's goals and body & food, each its own card.
    expect(screen.getByText('SLEEP')).toBeOnTheScreen();
    expect(screen.getByText('LOAD')).toBeOnTheScreen();
    expect(screen.getByText('Body & food')).toBeOnTheScreen();
    expect(screen.getByText('This week')).toBeOnTheScreen();
    expect(screen.getByText('Today’s habits')).toBeOnTheScreen();
    // With no snapshot the recovery card says nothing is connected — and how
    // to fix it.
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
    expect(
      screen.getByText('Connect a source in Me to start'),
    ).toBeOnTheScreen();
  });

  it('shows the score, its meaning and the inputs it was counted from', async () => {
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
    expect(screen.getByText('Recovered')).toBeOnTheScreen();
    expect(screen.getByText('Ready to add load today')).toBeOnTheScreen();
    expect(screen.getByText('62')).toBeOnTheScreen(); // HRV chip
    expect(screen.getByText('54')).toBeOnTheScreen(); // resting HR chip
    expect(screen.getByText('▲7')).toBeOnTheScreen(); // HRV above baseline
  });

  it('puts a journalled sickness ahead of the score’s advice', async () => {
    const hrv = { value: 62, baseline: 55, delta: 7 };
    const rhr = { value: 54, baseline: 56, delta: -2 };
    useHealthStore.setState({
      snapshot: {
        ...EMPTY_SNAPSHOT,
        readiness: readiness(hrv, rhr, { performancePct: 96, hours: 7.7 }),
      },
    });
    useJournalStore.setState({
      entries: [
        {
          day: startOfLocalDay(Date.now()),
          tags: ['sick'],
          ended: [],
          note: '',
          updatedAt: 0,
        },
      ],
    });
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);
    // The score is left alone (ADR-004); only the suggestion changes.
    expect(screen.getByText('Recovered')).toBeOnTheScreen();
    expect(
      screen.getByText('You logged sick — rest comes first'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Ready to add load today')).toBeNull();
  });

  it('deep-links into the recovery detail from the hero', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    // The HRV/RHR grid cells also deep-link to Recovery; press the hero, which
    // carries the fuller "no recovery data" label when nothing is connected.
    fireEvent.press(
      screen.getByLabelText(/Open recovery detail, no recovery data/),
    );
    expect(nav.navigate).toHaveBeenCalledWith('Recovery');
  });

  it('opens the Sleep detail from the sleep card', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText('Open sleep detail'));
    expect(nav.navigate).toHaveBeenCalledWith('Sleep');
  });

  it('says last night has not synced yet when connected but empty', async () => {
    useHealthStore.setState({ snapshot: { ...EMPTY_SNAPSHOT, live: true } });
    await renderWithProviders(<DashboardScreen navigation={mockNav()} />);
    expect(screen.getByText('Not synced yet')).toBeOnTheScreen();
  });

  it('opens the Food tab from the body & food card', async () => {
    const nav = mockNav();
    await renderWithProviders(<DashboardScreen navigation={nav} />);

    fireEvent.press(screen.getByLabelText('Open fuel detail'));
    expect(nav.navigate).toHaveBeenCalledWith('Nutrition');
  });
});
