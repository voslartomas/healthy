import React from 'react';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '../jest/renderWithProviders';
import { CoachScreen } from '../src/features/coach/CoachScreen';
import { useAppStore } from '../src/state/useAppStore';

describe('CoachScreen', () => {
  it('shows the active AI provider in the status line', async () => {
    useAppStore.getState().setAiProvider('anthropic');
    await renderWithProviders(<CoachScreen />);

    expect(screen.getByText('Coach')).toBeOnTheScreen();
    expect(screen.getByText(/Anthropic Claude/)).toBeOnTheScreen();
  });
});

describe('useAppStore', () => {
  afterEach(() => {
    useAppStore.getState().setAiProvider('anthropic');
  });

  it('updates the selected AI provider and resets the model', () => {
    expect(useAppStore.getState().aiProvider).toBe('anthropic');

    useAppStore.getState().setAiProvider('gemini');
    expect(useAppStore.getState().aiProvider).toBe('gemini');
    expect(useAppStore.getState().model).toBe('Gemini 2.5 Pro');
  });

  it('toggles a health connection', () => {
    expect(useAppStore.getState().connections.appleHealth).toBe(true);
    useAppStore.getState().toggleConnection('appleHealth');
    expect(useAppStore.getState().connections.appleHealth).toBe(false);
    useAppStore.getState().toggleConnection('appleHealth');
    expect(useAppStore.getState().connections.appleHealth).toBe(true);
  });
});
