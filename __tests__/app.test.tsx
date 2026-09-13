import React from 'react';
import { screen, userEvent } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { CoachScreen } from '../src/features/coach/CoachScreen';
import { useAppStore } from '../src/state/useAppStore';

describe('CoachScreen', () => {
  it('shows the active AI provider in the status line', async () => {
    useAppStore.getState().setAiProvider('anthropic');
    await renderWithProviders(<CoachScreen navigation={mockNav()} />);

    expect(screen.getByText(/ANTHROPIC CLAUDE/)).toBeOnTheScreen();
    // Open-ended by default: food logging has its own explicit action chip, so
    // the bare composer no longer has to double as the way to log a meal.
    expect(
      screen.getByPlaceholderText('Ask your coach anything…'),
    ).toBeOnTheScreen();
  });

  /**
   * Picking an action is what makes logging reliable: with no chip the model is
   * left to infer intent from the wording and often just replies instead of
   * calling log_food. Arming the chip re-points the composer at describing the
   * meal, and the send path forces the tool (see aiClient.ToolChoice).
   */
  it('arms an intent chip and repoints the composer at it', async () => {
    useAppStore.getState().setAiProvider('anthropic');
    // `userEvent`, not `fireEvent.press`: a Pressable's host View carries only
    // responder handlers, so fireEvent finds no `onPress` and silently no-ops.
    const user = userEvent.setup();
    await renderWithProviders(<CoachScreen navigation={mockNav()} />);

    // By role+name: the chip's own visible text is also "Log food", so a bare
    // label query matches two nodes.
    await user.press(screen.getByRole('button', { name: 'Log food' }));
    expect(
      screen.getByPlaceholderText('Describe what you ate…'),
    ).toBeOnTheScreen();

    // Tapping the armed chip cancels it and restores open conversation.
    await user.press(
      screen.getByRole('button', { name: 'Log food selected, tap to cancel' }),
    );
    expect(
      screen.getByPlaceholderText('Ask your coach anything…'),
    ).toBeOnTheScreen();
  });
});

describe('useAppStore', () => {
  afterEach(() => {
    useAppStore.getState().setAiProvider('ondevice');
  });

  it('updates the selected AI provider and resets the model', () => {
    useAppStore.getState().setAiProvider('anthropic');
    expect(useAppStore.getState().model).toBe('Claude Sonnet 4.5');

    useAppStore.getState().setAiProvider('gemini');
    expect(useAppStore.getState().aiProvider).toBe('gemini');
    expect(useAppStore.getState().model).toBe('Gemini 2.5 Pro');
  });

  it('sets the device health-source connection state', () => {
    expect(useAppStore.getState().connections.device).toBe(false);
    useAppStore.getState().setConnection('device', true);
    expect(useAppStore.getState().connections.device).toBe(true);
    useAppStore.getState().setConnection('device', false);
    expect(useAppStore.getState().connections.device).toBe(false);
  });

  it('marks the user onboarded once past the Welcome screen', () => {
    expect(useAppStore.getState().onboarded).toBe(false);
    useAppStore.getState().setOnboarded(true);
    expect(useAppStore.getState().onboarded).toBe(true);
    useAppStore.getState().setOnboarded(false);
  });
});
