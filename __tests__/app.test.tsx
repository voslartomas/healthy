import React from 'react';
import { render } from '@testing-library/react-native';

import { CoachScreen } from '../src/features/coach/CoachScreen';
import { useAppStore } from '../src/state/useAppStore';

describe('CoachScreen', () => {
  it('shows the selected AI provider', async () => {
    const { getByText } = await render(<CoachScreen />);
    expect(getByText('Selected provider: anthropic')).toBeOnTheScreen();
  });
});

describe('useAppStore', () => {
  it('updates the selected AI provider', () => {
    expect(useAppStore.getState().aiProvider).toBe('anthropic');
    useAppStore.getState().setAiProvider('gemini');
    expect(useAppStore.getState().aiProvider).toBe('gemini');
    useAppStore.getState().setAiProvider('anthropic');
  });
});
