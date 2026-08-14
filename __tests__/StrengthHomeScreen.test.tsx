jest.mock('../src/db/strengthRepository');

/* eslint-disable import/first -- jest.mock must be hoisted above imports */
import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import * as repo from '../src/db/strengthRepository';
import { StrengthHomeScreen } from '../src/features/strength/StrengthHomeScreen';
import { SessionSummary, useStrengthStore } from '../src/state/useStrengthStore';

function summary(o: Partial<SessionSummary>): SessionSummary {
  return {
    id: o.id ?? 's1',
    workoutId: o.workoutId ?? null,
    name: o.name ?? 'Push A',
    startedAt: o.startedAt ?? 0,
    endedAt: o.endedAt ?? 0,
    durationSec: o.durationSec ?? 0,
    totalVolumeKg: o.totalVolumeKg ?? 100,
    setsCompleted: o.setsCompleted ?? 6,
    totalReps: o.totalReps ?? 60,
    sets: o.sets ?? [],
  };
}

beforeEach(() => {
  useStrengthStore.setState({
    workouts: [],
    hydrated: false,
    draft: null,
    session: null,
    lastSummary: null,
    sessions: [],
  });
  jest.clearAllMocks();
  (repo.deleteSession as jest.Mock).mockResolvedValue(undefined);
});

it('long-pressing a session confirms then deletes it from history', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useStrengthStore.setState({
    sessions: [
      summary({ id: 'a', name: 'Push A', startedAt: 1 }),
      summary({ id: 'b', name: 'Pull B', startedAt: 2 }),
    ],
  });

  await renderWithProviders(<StrengthHomeScreen navigation={mockNav()} />);
  fireEvent(
    screen.getByLabelText(/Push A session/i),
    'longPress',
  );

  // The confirm dialog is shown; fire its destructive action.
  expect(alertSpy).toHaveBeenCalledWith(
    'Delete session',
    expect.stringContaining('Push A'),
    expect.any(Array),
  );
  const buttons = alertSpy.mock.calls[0][2] as {
    text: string;
    onPress?: () => void;
  }[];
  buttons.find(b => b.text === 'Delete')!.onPress!();

  await waitFor(() => expect(repo.deleteSession).toHaveBeenCalledWith('a'));
  expect(useStrengthStore.getState().sessions.map(s => s.id)).toEqual(['b']);
  alertSpy.mockRestore();
});
