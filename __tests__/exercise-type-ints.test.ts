import { trackedFromExercise } from '../src/health/derive';
import { ExerciseRecord } from '../src/health/types';

const NOW = 1_754_000_000_000;
const HOUR = 60 * 60 * 1000;
const SRC = 'com.huami.watch.hmwatchmanager';

function session(exerciseType: number, offsetHours: number): ExerciseRecord {
  const start = NOW - offsetHours * HOUR;
  return {
    exerciseType,
    typeName: String(exerciseType),
    displayName: null,
    start,
    end: start + 30 * 60 * 1000, // 30 min
    durationMin: 30,
    energyKcal: null,
    hrZones: null,
    source: SRC,
  };
}

describe('exercise-type categorization (authoritative HC ints)', () => {
  it('counts WEIGHTLIFTING (81) and STRENGTH_TRAINING (70) as strength', () => {
    const tracked = trackedFromExercise(
      [session(70, 1), session(81, 3)],
      [],
      [],
      NOW,
    );
    expect(tracked.strength).toBe(2);
    // Neither is cardio (both in NON_CARDIO), so zone2 stays 0.
    expect(tracked.zone2).toBe(0);
  });

  it('does NOT count SOFTBALL (65) as strength — it is cardio/zone-2', () => {
    const tracked = trackedFromExercise([session(65, 1)], [], [], NOW);
    expect(tracked.strength).toBe(0);
    expect(tracked.zone2).toBe(30);
  });

  it('counts a type-0 OTHER_WORKOUT (e.g. floorball) as zone-2 cardio', () => {
    const tracked = trackedFromExercise([session(0, 1)], [], [], NOW);
    expect(tracked.strength).toBe(0);
    expect(tracked.core).toBe(0);
    expect(tracked.zone2).toBe(30);
  });
});
