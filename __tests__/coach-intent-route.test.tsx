import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { CoachOverlay } from '../src/features/coach/CoachOverlay';
import { CoachScreen } from '../src/features/coach/CoachScreen';
import { COACH_INTENTS, coachIntentByKey } from '../src/features/coach/intents';

// `mock`-prefixed names are the only ones a jest.mock factory may close over.
const mockNavigate = jest.fn();
jest.mock('../src/app/navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    getCurrentRoute: () => ({ name: 'Today' }),
    addListener: () => () => undefined,
  },
  navigate: (...args: unknown[]) => mockNavigate(...args),
}));

beforeEach(() => mockNavigate.mockClear());

describe('the coach FAB', () => {
  it('opens the chat with no action armed on a tap', async () => {
    await renderWithProviders(<CoachOverlay />);
    fireEvent.press(screen.getByLabelText('Open coach'));
    expect(mockNavigate).toHaveBeenCalledWith('Coach', undefined);
  });

  it('shows the two quick actions on a long press', async () => {
    await renderWithProviders(<CoachOverlay />);
    expect(screen.queryByLabelText('Log food')).toBeNull();

    fireEvent(screen.getByLabelText('Open coach'), 'longPress');

    expect(await screen.findByLabelText('Log food')).toBeOnTheScreen();
    expect(screen.getByLabelText('New workout')).toBeOnTheScreen();
  });

  it('opens the chat with that action armed when one is picked', async () => {
    await renderWithProviders(<CoachOverlay />);
    fireEvent(screen.getByLabelText('Open coach'), 'longPress');
    fireEvent.press(await screen.findByLabelText('New workout'));

    expect(mockNavigate).toHaveBeenCalledWith('Coach', { intent: 'workout' });
  });

  it('dismisses the menu without opening anything', async () => {
    await renderWithProviders(<CoachOverlay />);
    fireEvent(screen.getByLabelText('Open coach'), 'longPress');
    fireEvent.press(await screen.findByLabelText('Close coach actions'));

    expect(await screen.findByLabelText('Open coach')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Log food')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('the coach composer chips', () => {
  it('offers the same actions the FAB menu does', async () => {
    await renderWithProviders(<CoachScreen navigation={mockNav()} />);
    for (const intent of COACH_INTENTS) {
      expect(await screen.findByLabelText(intent.label)).toBeOnTheScreen();
    }
  });

  it('arrives with the route param already selected', async () => {
    await renderWithProviders(
      <CoachScreen
        navigation={mockNav()}
        route={{ params: { intent: 'food' } }}
      />,
    );
    const chip = await screen.findByLabelText(
      'Log food selected, tap to cancel',
    );
    expect(chip).toBeOnTheScreen();
  });

  it('ignores an intent key it does not know', () => {
    expect(coachIntentByKey('nonsense')).toBeNull();
    expect(coachIntentByKey(undefined)).toBeNull();
    expect(coachIntentByKey('food')?.tool).toBe('log_food');
  });
});
