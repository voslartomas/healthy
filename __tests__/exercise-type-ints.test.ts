import { trackedFromExercise } from '../src/health/derive';
import { CardioZones, ExerciseRecord } from '../src/health/types';

const NOW = 1_754_000_000_000;
const HOUR = 60 * 60 * 1000;
const SRC = 'com.huami.watch.hmwatchmanager';

// 30 min at an aerobic-or-harder heart rate → 30 zone-2+ minutes.
const Z2: CardioZones = {
  lightMin: 0,
  moderateMin: 24,
  vigorousMin: 5,
  peakMin: 1,
};

function session(
  exerciseType: number,
  offsetHours: number,
  hrZones: CardioZones | null = null,
): ExerciseRecord {
  const start = NOW - offsetHours * HOUR;
  return {
    exerciseType,
    typeName: String(exerciseType),
    displayName: null,
    start,
    end: start + 30 * 60 * 1000, // 30 min
    durationMin: 30,
    energyKcal: null,
    hrZones,
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
    // Strength type, and no HR zones supplied → no zone-2 minutes.
    expect(tracked.zone2).toBe(0);
  });

  it('does NOT count SOFTBALL (65) as strength; its zone-2+ minutes count', () => {
    const tracked = trackedFromExercise([session(65, 1, Z2)], [], [], NOW);
    expect(tracked.strength).toBe(0);
    expect(tracked.zone2).toBe(30);
  });

  it('counts a type-0 OTHER_WORKOUT (e.g. floorball) zone-2+ minutes', () => {
    const tracked = trackedFromExercise([session(0, 1, Z2)], [], [], NOW);
    expect(tracked.strength).toBe(0);
    expect(tracked.core).toBe(0);
    expect(tracked.zone2).toBe(30);
  });

  it('falls back to session minutes for a cardio session with no HR zones', () => {
    // A running-type session (56) with hrZones null → the source logged the
    // workout but no per-session HR, so zone-2 counts its full 30 minutes rather
    // than collapsing to 0.
    const tracked = trackedFromExercise([session(56, 1, null)], [], [], NOW);
    expect(tracked.zone2).toBe(30);
  });

  it('never counts a strength/walking session with no HR zones', () => {
    const tracked = trackedFromExercise(
      [session(70, 1, null), session(79, 2, null)],
      [],
      [],
      NOW,
    );
    expect(tracked.zone2).toBe(0);
  });
});
