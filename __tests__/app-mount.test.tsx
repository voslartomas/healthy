import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import App from '../App';

describe('App', () => {
  it('opens on the branded splash, then the first-run Welcome brief', async () => {
    render(<App />);

    // The launch splash shows first, branded "Health Buddy".
    await waitFor(() =>
      expect(screen.getByText('Health Buddy')).toBeOnTheScreen(),
    );

    // After the splash beat, a fresh install (not onboarded) lands on the
    // Welcome screen with its connect call-to-action.
    await waitFor(
      () => expect(screen.getByText('CONNECT GOOGLE HEALTH')).toBeOnTheScreen(),
      { timeout: 3000 },
    );
  });
});
