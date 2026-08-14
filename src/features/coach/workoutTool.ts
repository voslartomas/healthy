/**
 * The AI coach's workout-building tool. Given target muscles and a count, it
 * picks exercises from the app's catalog and seeds each one's weight/reps from
 * the user's own logged history (falling back to their saved workouts, then
 * catalog defaults), then saves the workout. So "make me a biceps + hamstrings
 * workout with 6 exercises" produces a real, saved workout using weights the
 * user has actually trained with.
 */

import {
  EXERCISE_CATALOG,
  ExerciseDef,
  exerciseOrUnknown,
} from '../../data/exerciseCatalog';
import { addWorkout } from '../../state/strengthService';
import {
  newStrengthId,
  PlannedExercise,
  SavedWorkout,
  SessionSummary,
  useStrengthStore,
} from '../../state/useStrengthStore';
import { ToolExecutor, ToolSpec } from './aiClient';

/** The 6 coarse groups; anything else is treated as a specific primary muscle. */
const GROUPS = new Set(['chest', 'back', 'shoulders', 'arms', 'legs', 'core']);

/** Free-text muscle words → a canonical group or primary-muscle token. */
const MUSCLE_SYNONYMS: Record<string, string> = {
  chest: 'chest', pec: 'chest', pecs: 'chest',
  back: 'back', lat: 'lats', lats: 'lats',
  shoulder: 'shoulders', shoulders: 'shoulders', delt: 'shoulders', delts: 'shoulders',
  trap: 'traps', traps: 'traps', neck: 'neck',
  arm: 'arms', arms: 'arms',
  bicep: 'biceps', biceps: 'biceps',
  tricep: 'triceps', triceps: 'triceps',
  forearm: 'forearms', forearms: 'forearms',
  leg: 'legs', legs: 'legs',
  quad: 'quadriceps', quads: 'quadriceps', quadriceps: 'quadriceps',
  hamstring: 'hamstrings', hamstrings: 'hamstrings', ham: 'hamstrings', hams: 'hamstrings',
  glute: 'glutes', glutes: 'glutes',
  calf: 'calves', calves: 'calves',
  core: 'core', ab: 'abdominals', abs: 'abdominals', abdominal: 'abdominals', abdominals: 'abdominals',
};

/** Normalize free-text muscle words to canonical tokens, de-duped in order. */
export function normalizeMuscles(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const key = String(r).trim().toLowerCase();
    const tok = MUSCLE_SYNONYMS[key] ?? (GROUPS.has(key) ? key : undefined);
    if (tok && !out.includes(tok)) out.push(tok);
  }
  return out;
}

/** Exercises matching a token: by group when it's a group, else by primary muscle. */
function matchExercises(catalog: ExerciseDef[], token: string): ExerciseDef[] {
  return GROUPS.has(token)
    ? catalog.filter(e => e.muscleGroup === token)
    : catalog.filter(e => e.primaryMuscles.includes(token));
}

/**
 * Choose `count` exercises spread across the requested muscle tokens, round-robin
 * so each muscle gets a fair share. Within a muscle, exercises the user has
 * trained before (so their weights are known) come first. Deduped; spills to
 * other muscles if one runs out.
 */
export function pickExercises(
  catalog: ExerciseDef[],
  tokens: string[],
  count: number,
  hasHistory: (id: string) => boolean,
): ExerciseDef[] {
  const buckets = tokens.map(tok =>
    matchExercises(catalog, tok).sort(
      (a, b) =>
        Number(hasHistory(b.id)) - Number(hasHistory(a.id)) ||
        a.name.localeCompare(b.name),
    ),
  );
  const chosen: ExerciseDef[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (chosen.length < count && progressed) {
    progressed = false;
    for (const bucket of buckets) {
      if (chosen.length >= count) break;
      const next = bucket.find(e => !seen.has(e.id));
      if (next) {
        seen.add(next.id);
        chosen.push(next);
        progressed = true;
      }
    }
  }
  return chosen;
}

/** The user's most recently logged set for an exercise, or null. */
function lastLogged(
  sessions: SessionSummary[],
  exerciseId: string,
): { weightKg: number | null; reps: number } | null {
  let best: { weightKg: number | null; reps: number; at: number } | null = null;
  for (const s of sessions) {
    for (const set of s.sets) {
      if (set.exerciseId !== exerciseId) continue;
      if (!best || set.completedAt > best.at) {
        best = { weightKg: set.weightKg, reps: set.reps, at: set.completedAt };
      }
    }
  }
  return best ? { weightKg: best.weightKg, reps: best.reps } : null;
}

/** The exercise's target from any saved workout that already contains it. */
function plannedTarget(
  workouts: SavedWorkout[],
  exerciseId: string,
): { weightKg: number | null; reps: number } | null {
  for (const w of workouts) {
    const e = w.exercises.find(x => x.exerciseId === exerciseId);
    if (e) return { weightKg: e.targetWeightKg, reps: e.targetReps };
  }
  return null;
}

/**
 * Seed one exercise's targets: prefer the user's last logged set, then a saved
 * workout's target, then the catalog default. Bodyweight movements carry no load.
 */
export function buildPlanned(
  def: ExerciseDef,
  sessions: SessionSummary[],
  workouts: SavedWorkout[],
): PlannedExercise {
  const src =
    lastLogged(sessions, def.id) ??
    plannedTarget(workouts, def.id) ?? {
      weightKg: def.defaultWeightKg ?? (def.isWeighted ? 10 : null),
      reps: def.defaultReps,
    };
  return {
    id: newStrengthId('pe'),
    exerciseId: def.id,
    targetSets: def.defaultSets,
    targetReps: src.reps,
    targetWeightKg: def.isWeighted
      ? (src.weightKg ?? def.defaultWeightKg ?? 10)
      : null,
    restSec: def.defaultRestSec,
  };
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

function defaultName(tokens: string[]): string {
  const label = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return tokens.map(label).join(' + ');
}

export const WORKOUT_TOOLS: ToolSpec[] = [
  {
    name: 'create_workout',
    description:
      "Create and save a new strength workout from the app's exercise database. " +
      'Give the muscles to target and how many exercises to include; the tool ' +
      "picks matching exercises and sets each one's weight and reps from the " +
      "user's own logged history when available (otherwise their saved workouts, " +
      'then sensible defaults). Call this whenever the user asks to build, make, ' +
      'or create a workout (e.g. "make a biceps and hamstrings workout with 6 ' +
      'exercises").',
    parameters: {
      type: 'object',
      properties: {
        muscles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Muscles/groups to target. Groups: chest, back, shoulders, arms, ' +
            'legs, core. Specific muscles: biceps, triceps, forearms, chest, ' +
            'lats, traps, quadriceps, hamstrings, glutes, calves, abdominals.',
        },
        exerciseCount: {
          type: 'number',
          description: 'How many exercises to include (default 5, max 12).',
        },
        name: {
          type: 'string',
          description:
            'Optional workout name. If omitted, one is generated from the muscles.',
        },
        equipment: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional equipment filter: dumbbell, bodyweight, pullupBar, kettlebell.',
        },
      },
      required: ['muscles'],
    },
  },
];

export interface WorkoutToolset {
  tools: ToolSpec[];
  exec: ToolExecutor;
}

/**
 * Build the workout toolset for one chat session. `onCreate` is called with a
 * short human summary when a workout is saved so the screen can show a
 * confirmation line (mirrors the food toolset).
 */
export function makeWorkoutToolset(
  onCreate: (summary: string) => void,
): WorkoutToolset {
  const exec: ToolExecutor = async (name, args) => {
    if (name !== 'create_workout') {
      return JSON.stringify({ ok: false, error: `Unknown tool ${name}.` });
    }
    const tokens = normalizeMuscles(
      Array.isArray(args.muscles) ? args.muscles.map(String) : [],
    );
    if (tokens.length === 0) {
      return JSON.stringify({
        ok: false,
        error:
          'No recognizable muscles. Use groups (chest, back, shoulders, arms, ' +
          'legs, core) or specific muscles (biceps, triceps, hamstrings, ' +
          'quadriceps, glutes, calves, chest, lats, traps, forearms, abdominals).',
      });
    }
    const count = clamp(Math.round(Number(args.exerciseCount) || 5), 1, 12);
    const equip = Array.isArray(args.equipment)
      ? args.equipment.map(e => String(e).toLowerCase())
      : [];
    const catalog = equip.length
      ? EXERCISE_CATALOG.filter(e => equip.includes(e.equipment.toLowerCase()))
      : EXERCISE_CATALOG;

    const { sessions, workouts } = useStrengthStore.getState();
    const trained = new Set(sessions.flatMap(s => s.sets.map(x => x.exerciseId)));
    const picked = pickExercises(catalog, tokens, count, id => trained.has(id));
    if (picked.length === 0) {
      return JSON.stringify({
        ok: false,
        error: 'No exercises matched those muscles (and equipment filter).',
      });
    }
    const plan = picked.map(def => buildPlanned(def, sessions, workouts));
    const workoutName = String(args.name ?? '').trim() || defaultName(tokens);
    const workout = await addWorkout(workoutName, plan);
    onCreate(
      `Created "${workout.name}" — ${plan.length} exercise${plan.length === 1 ? '' : 's'}.`,
    );
    return JSON.stringify({
      ok: true,
      workout: {
        id: workout.id,
        name: workout.name,
        exercises: plan.map(p => ({
          name: exerciseOrUnknown(p.exerciseId).name,
          sets: p.targetSets,
          reps: p.targetReps,
          weightKg: p.targetWeightKg,
        })),
      },
      hint: 'The workout is saved. The user can start it from the Strength tab.',
    });
  };
  return { tools: WORKOUT_TOOLS, exec };
}
