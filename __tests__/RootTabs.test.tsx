import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { renderWithProviders } from '../jest/renderWithProviders';
import { RootTabs } from '../src/app/navigation/RootTabs';

/**
 * The tab bar is the one piece of chrome on every screen, and `app-mount` stops
 * at the Welcome gate without ever reaching it. This renders the navigator for
 * real so a crash in the bar itself — the floating pill's BlurView included —
 * can't slip through.
 */
describe('the tab navigator', () => {
  it('renders all five tabs in the floating pill', async () => {
    await renderWithProviders(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>,
    );

    for (const label of ['Today', 'Food', 'Lift', 'Progress', 'Me']) {
      expect(await screen.findByLabelText(label)).toBeOnTheScreen();
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  it('marks the focused tab and moves focus on press', async () => {
    await renderWithProviders(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>,
    );

    const today = await screen.findByLabelText('Today');
    expect(today.props.accessibilityState.selected).toBe(true);
    expect(
      screen.getByLabelText('Progress').props.accessibilityState.selected,
    ).toBe(false);

    fireEvent.press(screen.getByLabelText('Progress'));

    await waitFor(() =>
      expect(
        screen.getByLabelText('Progress').props.accessibilityState.selected,
      ).toBe(true),
    );
  });
});
