/**
 * The strength-exercise catalog. The data itself is generated from the CC0
 * free-exercise-db (see {@link GENERATED_CATALOG} in exerciseCatalog.generated),
 * filtered to the kit the user trains with — dumbbells, an adjustable bench,
 * bodyweight, a pull-up bar, and kettlebells. This module owns the types,
 * display labels, and lookup helpers; regenerate the data with
 * scripts/gen_catalog.py. Saved workouts and logged sessions reference entries
 * by {@link ExerciseDef.id}.
 */

import { GENERATED_CATALOG } from './exerciseCatalog.generated';

/** The equipment families this app supports. */
export type Equipment = 'dumbbell' | 'bodyweight' | 'pullupBar' | 'kettlebell';

/** Primary muscle group, used only for grouping/filtering in the picker. */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core';

export interface ExerciseDef {
  /** Stable id persisted by saved workouts and logged sessions — never reuse. */
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment;
  /**
   * Whether a load (kg) is entered for this movement. Dumbbell/kettlebell lifts
   * are weighted; most calisthenics are not (the weight field is hidden and
   * volume is counted from reps alone).
   */
  isWeighted: boolean;
  /** Sensible starting targets pre-filled in the builder; all user-editable. */
  defaultSets: number;
  defaultReps: number;
  /** Default rest between sets, in seconds. */
  defaultRestSec: number;
  /**
   * Starting load (kg) pre-filled for weighted movements; ignored when
   * `isWeighted` is false. Omitted → the builder falls back to a generic 10kg.
   */
  defaultWeightKg?: number;
  /**
   * Fine-grained muscles worked (free-exercise-db taxonomy, e.g. `biceps`,
   * `quadriceps`), driving the picker's per-muscle filter. The coarse
   * {@link MuscleGroup} above is derived from the first of these.
   */
  primaryMuscles: string[];
  /**
   * Optional override key into the bundled two-frame media map (see
   * ExerciseMedia). When omitted the media lookup falls back to the exercise id.
   */
  mediaKey?: string;
}

/**
 * The catalog. Ids are namespaced `ex_*` and must stay stable across releases
 * because sessions/workouts persist them.
 */
export const EXERCISE_CATALOG: ExerciseDef[] = GENERATED_CATALOG;

/** Human-readable label for an equipment family (used in the picker filter). */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  dumbbell: 'Dumbbell',
  bodyweight: 'Bodyweight',
  pullupBar: 'Pull-up bar',
  kettlebell: 'Kettlebell',
};

/** Short mono badge used where a full name doesn't fit (media placeholder). */
export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
};

const BY_ID: Record<string, ExerciseDef> = Object.fromEntries(
  EXERCISE_CATALOG.map(e => [e.id, e]),
);

/** Look up an exercise definition by id, or `undefined` if unknown. */
export function getExercise(id: string): ExerciseDef | undefined {
  return BY_ID[id];
}

/**
 * Look up an exercise, falling back to a synthetic "unknown" def so a session
 * that references a since-removed catalog id still renders a label instead of
 * crashing. `plan`/`run` code always has a definition to read from.
 */
export function exerciseOrUnknown(id: string): ExerciseDef {
  return (
    BY_ID[id] ?? {
      id,
      name: 'Unknown exercise',
      muscleGroup: 'core',
      equipment: 'bodyweight',
      isWeighted: false,
      defaultSets: 3,
      defaultReps: 10,
      defaultRestSec: 60,
      primaryMuscles: [],
    }
  );
}
