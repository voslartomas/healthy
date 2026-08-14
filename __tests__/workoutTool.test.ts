import { EXERCISE_CATALOG } from '../src/data/exerciseCatalog';
import {
  buildPlanned,
  normalizeMuscles,
  pickExercises,
} from '../src/features/coach/workoutTool';
import { SessionSummary } from '../src/state/useStrengthStore';

describe('normalizeMuscles', () => {
  it('maps synonyms/case and drops unknowns, deduped in order', () => {
    expect(
      normalizeMuscles(['Biceps', 'hamstring', 'quads', 'xyz', 'arms', 'biceps']),
    ).toEqual(['biceps', 'hamstrings', 'quadriceps', 'arms']);
  });
});

describe('pickExercises', () => {
  it('spreads the count across the requested muscles', () => {
    const picked = pickExercises(
      EXERCISE_CATALOG,
      ['biceps', 'hamstrings'],
      6,
      () => false,
    );
    expect(picked).toHaveLength(6);
    for (const e of picked) {
      expect(
        e.primaryMuscles.includes('biceps') ||
          e.primaryMuscles.includes('hamstrings'),
      ).toBe(true);
    }
    const biceps = picked.filter(e =>
      e.primaryMuscles.includes('biceps'),
    ).length;
    expect(biceps).toBeGreaterThanOrEqual(2);
    expect(biceps).toBeLessThanOrEqual(4);
  });

  it('prefers exercises the user has already trained', () => {
    const all = pickExercises(EXERCISE_CATALOG, ['biceps'], 20, () => false);
    const target = all[3]; // not the alphabetical first
    const picked = pickExercises(
      EXERCISE_CATALOG,
      ['biceps'],
      1,
      id => id === target.id,
    );
    expect(picked[0].id).toBe(target.id);
  });
});

describe('buildPlanned', () => {
  const bicep = EXERCISE_CATALOG.find(
    e => e.primaryMuscles.includes('biceps') && e.isWeighted,
  )!;

  function sessionWith(exerciseId: string): SessionSummary {
    return {
      id: 's',
      workoutId: null,
      name: 'x',
      startedAt: 0,
      endedAt: 0,
      durationSec: 0,
      totalVolumeKg: 0,
      setsCompleted: 1,
      totalReps: 8,
      sets: [
        {
          exerciseId,
          position: 0,
          setIndex: 0,
          weightKg: 22.5,
          reps: 8,
          completedAt: 100,
        },
      ],
    };
  }

  it('seeds weight/reps from the last logged set', () => {
    const p = buildPlanned(bicep, [sessionWith(bicep.id)], []);
    expect(p.exerciseId).toBe(bicep.id);
    expect(p.targetWeightKg).toBe(22.5);
    expect(p.targetReps).toBe(8);
  });

  it('falls back to catalog defaults without history', () => {
    const p = buildPlanned(bicep, [], []);
    expect(p.targetReps).toBe(bicep.defaultReps);
    expect(p.targetSets).toBe(bicep.defaultSets);
  });
});
