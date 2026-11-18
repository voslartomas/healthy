import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';

import { mockNav, renderWithProviders } from '../jest/renderWithProviders';
import { CardioScreen } from '../src/features/cardio/CardioScreen';
import { WorkoutDetailScreen } from '../src/features/cardio/WorkoutDetailScreen';
import * as health from '../src/health';
import { EMPTY_SNAPSHOT } from '../src/health';
import { activitiesFromExercise } from '../src/health/derive';
import { useHealthStore } from '../src/state/useHealthStore';

const MIN = 60_000;
const START = Date.now() - 3 * 60 * MIN;
const END = START + 30 * MIN;

const [RUN] = activitiesFromExercise(
  [
    {
      exerciseType: 56,
      typeName: 'RUNNING',
      displayName: null,
      start: START,
      end: END,
      durationMin: 30,
      energyKcal: 340,
      hrZones: { lightMin: 5, moderateMin: 15, vigorousMin: 8, peakMin: 2 },
      source: 'com.example.watch',
    },
  ],
  Date.now(),
);

function seed() {
  useHealthStore.setState({
    snapshot: { ...EMPTY_SNAPSHOT, live: true, activities: [RUN] },
    // The HRmax the routine read binned zones against.
    cachedRaw: null,
  });
}

/** 1 sample / 10 s, climbing from 110 to ~170 bpm. */
const SAMPLES = Array.from({ length: 180 }, (_, i) => ({
  time: START + i * 10_000,
  bpm: 110 + Math.round(i / 3),
}));

describe('WorkoutDetailScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
  });

  it("reads the session's heart rate and shows the graph, stats and zones", async () => {
    seed();
    const read = jest
      .spyOn(health, 'readWorkoutHeartRate')
      .mockResolvedValue(SAMPLES);
    await renderWithProviders(
      <WorkoutDetailScreen
        navigation={mockNav()}
        route={{ params: { workoutKey: RUN.key } }}
      />,
    );

    expect(read).toHaveBeenCalledWith(START, END);
    expect(
      await screen.findByLabelText(/Heart rate from 110 to 170/),
    ).toBeOnTheScreen();
    expect(screen.getByText('170')).toBeOnTheScreen(); // max
    expect(screen.getByText('Running')).toBeOnTheScreen();
    expect(screen.getByText('Time in zones')).toBeOnTheScreen();
    expect(screen.getByText('Peak')).toBeOnTheScreen();
    expect(screen.getByText('340')).toBeOnTheScreen(); // kcal
    expect(screen.getByText('com.example.watch')).toBeOnTheScreen();
  });

  it('says so when the source recorded no heart rate, keeping stored zones', async () => {
    seed();
    jest.spyOn(health, 'readWorkoutHeartRate').mockResolvedValue([]);
    await renderWithProviders(
      <WorkoutDetailScreen
        navigation={mockNav()}
        route={{ params: { workoutKey: RUN.key } }}
      />,
    );
    expect(
      await screen.findByText(/No heart rate was recorded during this workout/),
    ).toBeOnTheScreen();
    // The zones stored from the routine read still show.
    expect(screen.getByText('15 min · 50%')).toBeOnTheScreen();
  });

  it('handles a workout that has left the recent window', async () => {
    seed();
    jest.spyOn(health, 'readWorkoutHeartRate').mockResolvedValue(SAMPLES);
    await renderWithProviders(
      <WorkoutDetailScreen
        navigation={mockNav()}
        route={{ params: { workoutKey: 'gone' } }}
      />,
    );
    expect(
      screen.getByText(/no longer in your recent activity/),
    ).toBeOnTheScreen();
  });

  it('opens from the cardio activity list', async () => {
    seed();
    const nav = mockNav();
    await renderWithProviders(<CardioScreen navigation={nav} />);
    fireEvent.press(screen.getByLabelText('Open Running workout'));
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutDetail', {
      workoutKey: RUN.key,
    });
  });
});
