jest.mock('../src/db/strengthRepository');

/* eslint-disable import/first -- jest.mock must be hoisted above imports */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import * as repo from '../src/db/strengthRepository';
import { WorkoutRunScreen } from '../src/features/strength/WorkoutRunScreen';
import { buildSession } from '../src/state/strengthService';
import { PlannedExercise, useStrengthStore } from '../src/state/useStrengthStore';

function reset() {
  useStrengthStore.setState({
    workouts: [],
    hydrated: false,
    draft: null,
    session: null,
    lastSummary: null,
    sessions: [],
  });
}

function entry(o: Partial<PlannedExercise>): PlannedExercise {
  return {
    id: o.id ?? 'pe',
    exerciseId: o.exerciseId ?? 'ex_dumbbell_bench_press',
    targetSets: o.targetSets ?? 3,
    targetReps: o.targetReps ?? 10,
    targetWeightKg: o.targetWeightKg === undefined ? 20 : o.targetWeightKg,
    restSec: o.restSec ?? 60,
  };
}

beforeEach(() => {
  reset();
  jest.clearAllMocks();
  (repo.insertSession as jest.Mock).mockResolvedValue(undefined);
});

it('shows the current exercise and its set counter', async () => {
  useStrengthStore
    .getState()
    .startSession(
      buildSession('wk1', 'Push', [entry({ id: 'a', targetSets: 3 })], 0),
    );
  await renderWithProviders(<WorkoutRunScreen navigation={mockNav()} />);
  // Appears in the header and again in the plan overview, so match either.
  expect(screen.getAllByText('Dumbbell Bench Press').length).toBeGreaterThan(0);
  expect(screen.getByText('SET 1/3')).toBeOnTheScreen();
  expect(screen.getByLabelText('Complete set')).toBeOnTheScreen();
});

it('enters rest after completing a non-final set', async () => {
  useStrengthStore
    .getState()
    .startSession(
      buildSession('wk1', 'Push', [entry({ id: 'a', targetSets: 2 })], 0),
    );
  await renderWithProviders(<WorkoutRunScreen navigation={mockNav()} />);
  fireEvent.press(screen.getByLabelText('Complete set'));
  expect(await screen.findByLabelText('Skip rest')).toBeOnTheScreen();
  expect(useStrengthStore.getState().session!.resting).toBe(true);
});

it('adjusts reps via the steppers', async () => {
  useStrengthStore
    .getState()
    .startSession(
      buildSession('wk1', 'Push', [entry({ id: 'a', targetReps: 10 })], 0),
    );
  await renderWithProviders(<WorkoutRunScreen navigation={mockNav()} />);
  fireEvent.press(screen.getByLabelText('Increase reps'));
  expect(useStrengthStore.getState().session!.reps).toBe(11);
});

it('adjusts weight in 0.5 kg steps', async () => {
  useStrengthStore
    .getState()
    .startSession(
      buildSession(
        'wk1',
        'Push',
        [entry({ id: 'a', targetWeightKg: 20 })],
        0,
      ),
    );
  await renderWithProviders(<WorkoutRunScreen navigation={mockNav()} />);
  fireEvent.press(screen.getByLabelText('Increase weight'));
  expect(useStrengthStore.getState().session!.weightKg).toBe(20.5);
});

it('finishes into the summary on the final set', async () => {
  const nav = mockNav();
  useStrengthStore
    .getState()
    .startSession(
      buildSession('wk1', 'Push', [entry({ id: 'a', targetSets: 1 })], 0),
    );
  await renderWithProviders(<WorkoutRunScreen navigation={nav} />);
  fireEvent.press(screen.getByLabelText('Finish workout'));
  await waitFor(() => {
    expect(nav.replace).toHaveBeenCalledWith('WorkoutSummary');
  });
  expect(repo.insertSession).toHaveBeenCalledTimes(1);
});

it('shows a total-time clock counting from the session start', async () => {
  const startedAt = Date.now() - 3_661_000; // 1h 1m 1s ago
  useStrengthStore
    .getState()
    .startSession(
      buildSession('wk1', 'Push', [entry({ id: 'a' })], startedAt),
    );
  await renderWithProviders(<WorkoutRunScreen navigation={mockNav()} />);
  expect(screen.getByText('TOTAL TIME')).toBeOnTheScreen();
  expect(screen.getByText('1:01:01')).toBeOnTheScreen();
});

it('blocks back navigation while a workout is running', async () => {
  const nav = mockNav();
  let onBeforeRemove:
    | ((e: { preventDefault: () => void }) => void)
    | undefined;
  (nav.addListener as jest.Mock).mockImplementation(
    (type: string, cb: (e: { preventDefault: () => void }) => void) => {
      if (type === 'beforeRemove') onBeforeRemove = cb;
      return jest.fn();
    },
  );
  useStrengthStore
    .getState()
    .startSession(buildSession('wk1', 'Push', [entry({ id: 'a' })], 0));
  await renderWithProviders(<WorkoutRunScreen navigation={nav} />);

  const event = { preventDefault: jest.fn() };
  onBeforeRemove?.(event);
  expect(event.preventDefault).toHaveBeenCalled();
});
