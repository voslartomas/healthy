import {
  LoggedSet,
  PlannedExercise,
  SavedWorkout,
  SessionSummary,
  SetTarget,
} from '../state/useStrengthStore';
import { getDb } from './database';

/**
 * Persistence for the strength feature: saved workouts (with their ordered
 * exercise rows) and completed sessions (with their logged set rows). This is
 * the single place that knows the SQLite schema; the rest of the app works with
 * the plain {@link SavedWorkout} / {@link SessionSummary} shapes from the store.
 *
 * A workout's exercises are stored in a child table keyed by `workout_id`;
 * updating a workout replaces its child rows wholesale (delete + re-insert),
 * which keeps ordering/position trivially correct without a diff.
 */

interface WorkoutRow {
  id: string;
  name: string;
}

interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: number;
  target_weight_kg: number | null;
  rest_sec: number;
  set_targets: string | null;
}

/** Parse the persisted per-set targets JSON, tolerating legacy nulls and any
 * malformed value (falls back to uniform targets rather than throwing). */
function parseSetTargets(raw: string | null): SetTarget[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed.map(p => ({
      weightKg:
        typeof p?.weightKg === 'number' ? p.weightKg : null,
      reps: typeof p?.reps === 'number' ? p.reps : 0,
    }));
  } catch {
    return undefined;
  }
}

function rowToPlanned(row: WorkoutExerciseRow): PlannedExercise {
  const planned: PlannedExercise = {
    id: row.id,
    exerciseId: row.exercise_id,
    targetSets: row.target_sets,
    targetReps: row.target_reps,
    targetWeightKg: row.target_weight_kg,
    restSec: row.rest_sec,
  };
  const setTargets = parseSetTargets(row.set_targets);
  if (setTargets) planned.setTargets = setTargets;
  return planned;
}

/** Load all saved workouts, newest first, each with its ordered exercises. */
export async function loadWorkouts(): Promise<SavedWorkout[]> {
  const db = await getDb();
  const workouts = await db.getAllAsync<WorkoutRow>(
    'SELECT id, name FROM strength_workouts ORDER BY sort_order DESC, created_at DESC;',
  );
  const exercises = await db.getAllAsync<WorkoutExerciseRow>(
    'SELECT id, workout_id, exercise_id, position, target_sets, target_reps, target_weight_kg, rest_sec, set_targets FROM strength_workout_exercises ORDER BY position ASC;',
  );
  const byWorkout = new Map<string, PlannedExercise[]>();
  for (const row of exercises) {
    const list = byWorkout.get(row.workout_id) ?? [];
    list.push(rowToPlanned(row));
    byWorkout.set(row.workout_id, list);
  }
  return workouts.map(w => ({
    id: w.id,
    name: w.name,
    exercises: byWorkout.get(w.id) ?? [],
  }));
}

/** Insert the workout header rows + its exercise rows. */
async function insertExerciseRows(
  db: Awaited<ReturnType<typeof getDb>>,
  workoutId: string,
  exercises: PlannedExercise[],
): Promise<void> {
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    await db.runAsync(
      `INSERT INTO strength_workout_exercises
         (id, workout_id, exercise_id, position, target_sets, target_reps, target_weight_kg, rest_sec, set_targets)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      e.id,
      workoutId,
      e.exerciseId,
      i,
      e.targetSets,
      e.targetReps,
      e.targetWeightKg ?? null,
      e.restSec,
      e.setTargets ? JSON.stringify(e.setTargets) : null,
    );
  }
}

/** Insert a new saved workout, ordered ahead of existing ones. */
export async function insertWorkout(workout: SavedWorkout): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const order = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM strength_workouts;',
  );
  await db.runAsync(
    `INSERT INTO strength_workouts (id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?);`,
    workout.id,
    workout.name,
    order?.next ?? 0,
    now,
    now,
  );
  await insertExerciseRows(db, workout.id, workout.exercises);
}

/** Update a saved workout in place, replacing its exercise rows wholesale. */
export async function updateWorkout(workout: SavedWorkout): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE strength_workouts SET name = ?, updated_at = ? WHERE id = ?;',
    workout.name,
    Date.now(),
    workout.id,
  );
  await db.runAsync(
    'DELETE FROM strength_workout_exercises WHERE workout_id = ?;',
    workout.id,
  );
  await insertExerciseRows(db, workout.id, workout.exercises);
}

/** Delete a saved workout and its exercise rows. */
export async function deleteWorkout(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM strength_workout_exercises WHERE workout_id = ?;', id);
  await db.runAsync('DELETE FROM strength_workouts WHERE id = ?;', id);
}

/** Persist a finished session: the header row + one row per logged set. */
export async function insertSession(summary: SessionSummary): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO strength_sessions
       (id, workout_id, name, started_at, ended_at, total_volume_kg, sets_completed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    summary.id,
    summary.workoutId ?? null,
    summary.name,
    summary.startedAt,
    summary.endedAt,
    summary.totalVolumeKg,
    summary.setsCompleted,
    Date.now(),
  );
  for (const s of summary.sets) {
    await db.runAsync(
      `INSERT INTO strength_session_sets
         (id, session_id, exercise_id, position, set_index, weight_kg, reps, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      `${summary.id}_${s.position}_${s.setIndex}`,
      summary.id,
      s.exerciseId,
      s.position,
      s.setIndex,
      s.weightKg ?? null,
      s.reps,
      s.completedAt,
    );
  }
}

/** Delete a finished session and its logged set rows. */
export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM strength_session_sets WHERE session_id = ?;', id);
  await db.runAsync('DELETE FROM strength_sessions WHERE id = ?;', id);
}

interface SessionRow {
  id: string;
  workout_id: string | null;
  name: string;
  started_at: number;
  ended_at: number | null;
  total_volume_kg: number;
  sets_completed: number;
}

interface SessionSetRow {
  session_id: string;
  exercise_id: string;
  position: number;
  set_index: number;
  weight_kg: number | null;
  reps: number;
  completed_at: number;
}

/** Load recent finished sessions, newest first, each with its logged sets. */
export async function loadRecentSessions(
  limit = 20,
): Promise<SessionSummary[]> {
  const db = await getDb();
  const sessions = await db.getAllAsync<SessionRow>(
    'SELECT id, workout_id, name, started_at, ended_at, total_volume_kg, sets_completed FROM strength_sessions ORDER BY started_at DESC LIMIT ?;',
    limit,
  );
  if (sessions.length === 0) return [];
  const sets = await db.getAllAsync<SessionSetRow>(
    'SELECT session_id, exercise_id, position, set_index, weight_kg, reps, completed_at FROM strength_session_sets ORDER BY position ASC, set_index ASC;',
  );
  const bySession = new Map<string, LoggedSet[]>();
  for (const row of sets) {
    const list = bySession.get(row.session_id) ?? [];
    list.push({
      exerciseId: row.exercise_id,
      position: row.position,
      setIndex: row.set_index,
      weightKg: row.weight_kg,
      reps: row.reps,
      completedAt: row.completed_at,
    });
    bySession.set(row.session_id, list);
  }
  return sessions.map(s => {
    const endedAt = s.ended_at ?? s.started_at;
    const sessionSets = bySession.get(s.id) ?? [];
    return {
      id: s.id,
      workoutId: s.workout_id,
      name: s.name,
      startedAt: s.started_at,
      endedAt,
      durationSec: Math.max(0, Math.round((endedAt - s.started_at) / 1000)),
      totalVolumeKg: s.total_volume_kg,
      setsCompleted: s.sets_completed,
      totalReps: sessionSets.reduce((sum, x) => sum + x.reps, 0),
      sets: sessionSets,
    };
  });
}
