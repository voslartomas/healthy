import * as SQLite from 'expo-sqlite';

import { resetDbForTests } from '../src/db/database';
import {
  deleteSession,
  insertSession,
  insertWorkout,
  loadRecentSessions,
  loadWorkouts,
} from '../src/db/strengthRepository';
import { SavedWorkout, SessionSummary } from '../src/state/useStrengthStore';

// The expo-sqlite manual mock exposes the shared in-memory db handle whose
// methods are jest.fns; we script them per-query by matching on the SQL text.
const db = (SQLite as unknown as { __memoryDb: Record<string, jest.Mock> })
  .__memoryDb;

function scriptReads(rows: Record<string, unknown[]>) {
  db.getAllAsync.mockImplementation((sql: string) => {
    for (const [needle, value] of Object.entries(rows)) {
      if (sql.includes(needle)) return Promise.resolve(value);
    }
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  resetDbForTests();
  jest.clearAllMocks();
  db.execAsync.mockResolvedValue(undefined);
  db.runAsync.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
  db.getFirstAsync.mockResolvedValue(null);
  db.getAllAsync.mockResolvedValue([]);
});

describe('loadWorkouts', () => {
  it('maps rows and groups exercises under their workout in order', async () => {
    scriptReads({
      'FROM strength_workouts': [
        { id: 'wk1', name: 'Push' },
        { id: 'wk2', name: 'Pull' },
      ],
      'FROM strength_workout_exercises': [
        {
          id: 'e1',
          workout_id: 'wk1',
          exercise_id: 'ex_dumbbell_bench_press',
          position: 0,
          target_sets: 3,
          target_reps: 10,
          target_weight_kg: 20,
          rest_sec: 90,
        },
        {
          id: 'e2',
          workout_id: 'wk1',
          exercise_id: 'ex_pushups',
          position: 1,
          target_sets: 3,
          target_reps: 15,
          target_weight_kg: null,
          rest_sec: 60,
        },
        {
          id: 'e3',
          workout_id: 'wk2',
          exercise_id: 'ex_pullups',
          position: 0,
          target_sets: 3,
          target_reps: 8,
          target_weight_kg: null,
          rest_sec: 120,
        },
      ],
    });

    const workouts = await loadWorkouts();
    expect(workouts).toHaveLength(2);
    expect(workouts[0].exercises).toHaveLength(2);
    expect(workouts[0].exercises[0].exerciseId).toBe('ex_dumbbell_bench_press');
    expect(workouts[0].exercises[0].targetWeightKg).toBe(20);
    expect(workouts[0].exercises[1].targetWeightKg).toBeNull();
    expect(workouts[1].exercises).toHaveLength(1);
  });
});

describe('per-set targets persistence', () => {
  it('parses the set_targets JSON column into setTargets on load', async () => {
    scriptReads({
      'FROM strength_workouts': [{ id: 'wk1', name: 'Pyramid' }],
      'FROM strength_workout_exercises': [
        {
          id: 'e1',
          workout_id: 'wk1',
          exercise_id: 'ex_dumbbell_bench_press',
          position: 0,
          target_sets: 2,
          target_reps: 10,
          target_weight_kg: 20,
          rest_sec: 90,
          set_targets: JSON.stringify([
            { weightKg: 20, reps: 12 },
            { weightKg: 25, reps: 10 },
          ]),
        },
      ],
    });
    const workouts = await loadWorkouts();
    expect(workouts[0].exercises[0].setTargets).toEqual([
      { weightKg: 20, reps: 12 },
      { weightKg: 25, reps: 10 },
    ]);
  });

  it('leaves setTargets undefined for a legacy null column', async () => {
    scriptReads({
      'FROM strength_workouts': [{ id: 'wk1', name: 'Push' }],
      'FROM strength_workout_exercises': [
        {
          id: 'e1',
          workout_id: 'wk1',
          exercise_id: 'ex_dumbbell_bench_press',
          position: 0,
          target_sets: 3,
          target_reps: 10,
          target_weight_kg: 20,
          rest_sec: 90,
          set_targets: null,
        },
      ],
    });
    const workouts = await loadWorkouts();
    expect(workouts[0].exercises[0].setTargets).toBeUndefined();
  });

  it('serialises setTargets to JSON on insert', async () => {
    await insertWorkout({
      id: 'wk1',
      name: 'Pyramid',
      exercises: [
        {
          id: 'e1',
          exerciseId: 'ex_dumbbell_bench_press',
          targetSets: 2,
          targetReps: 10,
          targetWeightKg: 20,
          restSec: 90,
          setTargets: [
            { weightKg: 20, reps: 12 },
            { weightKg: 25, reps: 10 },
          ],
        },
      ],
    });
    const exerciseInsert = db.runAsync.mock.calls.find(c =>
      (c[0] as string).includes('INSERT INTO strength_workout_exercises'),
    )!;
    // Last bound param is the set_targets JSON.
    const json = exerciseInsert[exerciseInsert.length - 1] as string;
    expect(JSON.parse(json)).toEqual([
      { weightKg: 20, reps: 12 },
      { weightKg: 25, reps: 10 },
    ]);
  });
});

describe('insertWorkout', () => {
  it('writes the header row and one row per exercise', async () => {
    const workout: SavedWorkout = {
      id: 'wk1',
      name: 'Push',
      exercises: [
        {
          id: 'e1',
          exerciseId: 'ex_dumbbell_bench_press',
          targetSets: 3,
          targetReps: 10,
          targetWeightKg: 20,
          restSec: 90,
        },
        {
          id: 'e2',
          exerciseId: 'ex_pushups',
          targetSets: 3,
          targetReps: 15,
          targetWeightKg: null,
          restSec: 60,
        },
      ],
    };
    await insertWorkout(workout);
    const sqls = db.runAsync.mock.calls.map(c => c[0] as string);
    expect(sqls.some(s => s.includes('INSERT INTO strength_workouts'))).toBe(true);
    expect(
      sqls.filter(s => s.includes('INSERT INTO strength_workout_exercises')),
    ).toHaveLength(2);
  });
});

describe('insertSession', () => {
  it('writes the session header and one row per logged set', async () => {
    const summary: SessionSummary = {
      id: 'ss1',
      workoutId: 'wk1',
      name: 'Push',
      startedAt: 1000,
      endedAt: 61000,
      durationSec: 60,
      totalVolumeKg: 360,
      setsCompleted: 2,
      totalReps: 18,
      sets: [
        { exerciseId: 'a', position: 0, setIndex: 0, weightKg: 20, reps: 10, completedAt: 1 },
        { exerciseId: 'a', position: 0, setIndex: 1, weightKg: 20, reps: 8, completedAt: 2 },
      ],
    };
    await insertSession(summary);
    const sqls = db.runAsync.mock.calls.map(c => c[0] as string);
    expect(sqls.some(s => s.includes('INSERT INTO strength_sessions'))).toBe(true);
    expect(
      sqls.filter(s => s.includes('INSERT INTO strength_session_sets')),
    ).toHaveLength(2);
  });
});

describe('deleteSession', () => {
  it('deletes the set rows and the session row', async () => {
    await deleteSession('ss1');
    const sqls = db.runAsync.mock.calls.map(c => c[0] as string);
    expect(
      sqls.some(s => s.includes('DELETE FROM strength_session_sets')),
    ).toBe(true);
    expect(sqls.some(s => s.includes('DELETE FROM strength_sessions'))).toBe(
      true,
    );
  });
});

describe('loadRecentSessions', () => {
  it('maps a session and attaches its logged sets + derived totals', async () => {
    scriptReads({
      'FROM strength_sessions': [
        {
          id: 'ss1',
          workout_id: 'wk1',
          name: 'Push',
          started_at: 1000,
          ended_at: 61000,
          total_volume_kg: 360,
          sets_completed: 2,
        },
      ],
      'FROM strength_session_sets': [
        { session_id: 'ss1', exercise_id: 'a', position: 0, set_index: 0, weight_kg: 20, reps: 10, completed_at: 1 },
        { session_id: 'ss1', exercise_id: 'a', position: 0, set_index: 1, weight_kg: 20, reps: 8, completed_at: 2 },
      ],
    });
    const sessions = await loadRecentSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sets).toHaveLength(2);
    expect(sessions[0].totalReps).toBe(18);
    expect(sessions[0].durationSec).toBe(60);
  });
});
