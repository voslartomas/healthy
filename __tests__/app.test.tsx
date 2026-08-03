import React from 'react';
import { screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { CoachScreen } from '../src/features/coach/CoachScreen';
import { useAppStore } from '../src/state/useAppStore';

describe('CoachScreen', () => {
  it('shows the active AI provider in the status line', async () => {
    useAppStore.getState().setAiProvider('anthropic');
    await renderWithProviders(<CoachScreen navigation={mockNav()} />);

    expect(screen.getByText(/ANTHROPIC CLAUDE/)).toBeOnTheScreen();
    expect(
      screen.getByPlaceholderText('Tell coach what you ate…'),
    ).toBeOnTheScreen();
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

  it('sets the Google Health connection state', () => {
    expect(useAppStore.getState().connections.googleHealth).toBe(false);
    useAppStore.getState().setConnection('googleHealth', true);
    expect(useAppStore.getState().connections.googleHealth).toBe(true);
    useAppStore.getState().setConnection('googleHealth', false);
    expect(useAppStore.getState().connections.googleHealth).toBe(false);
  });

  it('marks the user onboarded once past the Welcome screen', () => {
    expect(useAppStore.getState().onboarded).toBe(false);
    useAppStore.getState().setOnboarded(true);
    expect(useAppStore.getState().onboarded).toBe(true);
    useAppStore.getState().setOnboarded(false);
  });
});
