import React from 'react';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '../jest/renderWithProviders';
import {
  ExerciseMedia,
  FRAMES,
} from '../src/features/strength/components/ExerciseMedia';

it('bundles start/end photo pairs for catalog exercises', () => {
  expect(FRAMES.ex_pullups).toHaveLength(2);
  expect(FRAMES.ex_pushups).toHaveLength(2);
});

it('renders the crossfade frames for an exercise that has photos', async () => {
  await renderWithProviders(<ExerciseMedia exerciseId="ex_pullups" />);
  expect(screen.getByTestId('exercise-frame')).toBeOnTheScreen();
});

it('falls back to the placeholder for an exercise without photos', async () => {
  // An id with no catalog entry / no FRAMES pair resolves to the "unknown"
  // (core) fallback and renders the placeholder figure, not a photo.
  await renderWithProviders(<ExerciseMedia exerciseId="ex_no_such_exercise" />);
  expect(screen.queryByTestId('exercise-frame')).toBeNull();
  expect(screen.getByText('CORE')).toBeOnTheScreen();
});
