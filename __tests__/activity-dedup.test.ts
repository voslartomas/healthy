import {
  activitiesFromExercise,
  dedupeIntervals,
  exerciseInfoRank,
} from '../src/health/derive';
import { ExerciseRecord } from '../src/health/types';

const NOW = 1_754_000_000_000;
const FITBIT = 'com.fitbit.FitbitMobile';
const GFIT = 'com.google.android.apps.fitness';

function ex(partial: Partial<ExerciseRecord>): ExerciseRecord {
  return {
    exerciseType: 0,
    typeName: 'WORKOUT',
    displayName: null,
    start: NOW - 60 * 60 * 1000,
    end: NOW - 30 * 60 * 1000,
    durationMin: 30,
    energyKcal: null,
    hrZones: null,
    source: FITBIT,
    ...partial,
  };
}

describe('exerciseInfoRank', () => {
  it('ranks a typed session above an untyped one, regardless of source', () => {
    const typedLowPriority = ex({ exerciseType: 8, source: GFIT });
    const untypedHighPriority = ex({ exerciseType: 0, source: FITBIT });
    expect(exerciseInfoRank(typedLowPriority)).toBeGreaterThan(
      exerciseInfoRank(untypedHighPriority),
    );
  });

  it('falls back to source priority when both are untyped', () => {
    expect(exerciseInfoRank(ex({ source: FITBIT }))).toBeGreaterThan(
      exerciseInfoRank(ex({ source: GFIT })),
    );
  });
});

describe('dedupeIntervals with exerciseInfoRank', () => {
  it('keeps the typed copy of a session over a higher-priority type-0 copy', () => {
    // Same workout window written by Fitbit (type 0) and Google Fit (biking=8).
    const fitbit = ex({ exerciseType: 0, source: FITBIT });
    const gfit = ex({ exerciseType: 8, source: GFIT });
    const kept = dedupeIntervals([fitbit, gfit], exerciseInfoRank);
    expect(kept).toHaveLength(1);
    expect(kept[0].exerciseType).toBe(8);
    expect(kept[0].source).toBe(GFIT);
  });

  it('activitiesFromExercise names the session from the typed copy', () => {
    const fitbit = ex({ exerciseType: 0, typeName: 'WORKOUT', source: FITBIT });
    const gfit = ex({ exerciseType: 56, typeName: 'RUNNING', source: GFIT });
    const activities = activitiesFromExercise([fitbit, gfit], NOW);
    expect(activities).toHaveLength(1);
    expect(activities[0].name).toBe('Running');
  });
});
