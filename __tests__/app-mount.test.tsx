import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import App from '../App';

describe('App', () => {
  it('mounts the navigation tree and shows the Today dashboard', async () => {
    render(<App />);

    // The default tab renders the dashboard greeting; goals hydrate from the
    // (mocked) SQLite layer without throwing.
    await waitFor(() =>
      expect(
        screen.getByText(/Good (morning|afternoon|evening)/),
      ).toBeOnTheScreen(),
    );
  });
});
