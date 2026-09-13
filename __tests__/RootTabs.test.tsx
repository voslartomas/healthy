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
  it('renders all five numbered tabs in the floating pill', async () => {
    await renderWithProviders(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>,
    );

    for (const label of ['TODAY', 'FUEL', 'LIFT', 'TRENDS', 'SETUP']) {
      expect(await screen.findByLabelText(label)).toBeOnTheScreen();
    }
    // The Oswald numerals are the design's identity — keep them.
    for (const num of ['01', '02', '03', '04', '05']) {
      expect(screen.getByText(num)).toBeOnTheScreen();
    }
  });

  it('marks the focused tab and moves focus on press', async () => {
    await renderWithProviders(
      <NavigationContainer>
        <RootTabs />
      </NavigationContainer>,
    );

    const today = await screen.findByLabelText('TODAY');
    expect(today.props.accessibilityState.selected).toBe(true);
    expect(
      screen.getByLabelText('TRENDS').props.accessibilityState.selected,
    ).toBe(false);

    fireEvent.press(screen.getByLabelText('TRENDS'));

    await waitFor(() =>
      expect(
        screen.getByLabelText('TRENDS').props.accessibilityState.selected,
      ).toBe(true),
    );
  });
});
