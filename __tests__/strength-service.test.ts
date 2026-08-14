jest.mock('../src/db/strengthRepository');

/* eslint-disable import/first -- jest.mock must be hoisted above imports */
import * as repo from '../src/db/strengthRepository';
import {
  buildSession,
  buildSummary,
  finishSession,
  removeSession,
  saveDraft,
  startDraftSession,
  startWorkoutSession,
  totalVolume,
  volumeTrendPoints,
} from '../src/state/strengthService';
import {
  ActiveSession,
  PlannedExercise,
  SessionSummary,
  useStrengthStore,
} from '../src/state/useStrengthStore';

function summary(o: Partial<SessionSummary>): SessionSummary {
  return {
    id: o.id ?? 's1',
    workoutId: o.workoutId ?? null,
    name: o.name ?? 'S',
    startedAt: o.startedAt ?? 0,
    endedAt: o.endedAt ?? 0,
    durationSec: o.durationSec ?? 0,
    totalVolumeKg: o.totalVolumeKg ?? 0,
    setsCompleted: o.setsCompleted ?? 0,
    totalReps: o.totalReps ?? 0,
    sets: o.sets ?? [],
  };
}

function reset() {
  useStrengthStore.setState({
    workouts: [],
    hydrated: false,
    draft: null,
    session: null,
    lastSummary: null,
    sessions: [],
  });
}

beforeEach(() => {
  reset();
  jest.clearAllMocks();
  (repo.insertWorkout as jest.Mock).mockResolvedValue(undefined);
  (repo.updateWorkout as jest.Mock).mockResolvedValue(undefined);
  (repo.deleteWorkout as jest.Mock).mockResolvedValue(undefined);
  (repo.insertSession as jest.Mock).mockResolvedValue(undefined);
  (repo.deleteSession as jest.Mock).mockResolvedValue(undefined);
  (repo.loadWorkouts as jest.Mock).mockResolvedValue([]);
  (repo.loadRecentSessions as jest.Mock).mockResolvedValue([]);
});

function entry(o: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    id: o.id ?? 'pe1',
    exerciseId: o.exerciseId ?? 'ex_dumbbell_bench_press',
    targetSets: o.targetSets ?? 3,
    targetReps: o.targetReps ?? 10,
    targetWeightKg: o.targetWeightKg === undefined ? 20 : o.targetWeightKg,
    restSec: o.restSec ?? 60,
  };
}

describe('pure calculations', () => {
  it('totalVolume sums weight × reps and treats bodyweight as zero load', () => {
    expect(
      totalVolume([
        { exerciseId: 'a', position: 0, setIndex: 0, weightKg: 20, reps: 10, completedAt: 1 },
        { exerciseId: 'a', position: 0, setIndex: 1, weightKg: 20, reps: 8, completedAt: 2 },
        { exerciseId: 'b', position: 1, setIndex: 0, weightKg: null, reps: 15, completedAt: 3 },
      ]),
    ).toBe(20 * 10 + 20 * 8);
  });

  it('buildSummary rolls up volume, sets, reps and duration', () => {
    const s = buildSession(null, 'Test', [entry({ targetWeightKg: 20 })], 1000);
    s.completed = [
      { exerciseId: 'a', position: 0, setIndex: 0, weightKg: 20, reps: 10, completedAt: 1 },
      { exerciseId: 'a', position: 0, setIndex: 1, weightKg: 25, reps: 8, completedAt: 2 },
    ];
    const rollup = buildSummary(s, 61_000);
    expect(rollup.totalVolumeKg).toBe(20 * 10 + 25 * 8);
    expect(rollup.setsCompleted).toBe(2);
    expect(rollup.totalReps).toBe(18);
    expect(rollup.durationSec).toBe(60);
  });

  it('volumeTrendPoints drops bodyweight-only runs and orders oldest → newest', () => {
    // Store order is newest-first; expect chronological output.
    const points = volumeTrendPoints([
      summary({ id: 'c', startedAt: 300, totalVolumeKg: 900 }),
      summary({ id: 'bw', startedAt: 250, totalVolumeKg: 0 }),
      summary({ id: 'b', startedAt: 200, totalVolumeKg: 700 }),
      summary({ id: 'a', startedAt: 100, totalVolumeKg: 500 }),
    ]);
    expect(points.map(p => p.volume)).toEqual([500, 700, 900]);
  });

  it('volumeTrendPoints caps to the most recent `limit` weighted sessions', () => {
    // Store order is newest-first, so index 0 is the most recent (startedAt 11).
    const many = Array.from({ length: 12 }, (_, i) =>
      summary({ id: `s${i}`, startedAt: 11 - i, totalVolumeKg: (12 - i) * 100 }),
    );
    const points = volumeTrendPoints(many, 8);
    expect(points).toHaveLength(8);
    // Output is oldest → newest, so the last point is the most recent session.
    expect(points[points.length - 1].startedAt).toBe(11);
  });
});

describe('saveDraft', () => {
  it('inserts a new workout and adds it to the store', async () => {
    const store = useStrengthStore.getState();
    store.startDraft();
    store.setDraftName('Push A');
    store.addDraftExercise('ex_dumbbell_bench_press');

    const saved = await saveDraft();
    expect(saved).not.toBeNull();
    expect(repo.insertWorkout).toHaveBeenCalledTimes(1);
    expect(useStrengthStore.getState().workouts).toHaveLength(1);
    expect(useStrengthStore.getState().workouts[0].name).toBe('Push A');
    // Draft is cleared after a successful save.
    expect(useStrengthStore.getState().draft).toBeNull();
  });

  it('updates in place when editing an existing workout', async () => {
    const saved = {
      id: 'wk1',
      name: 'Legs',
      exercises: [entry({ id: 'e1' })],
    };
    useStrengthStore.setState({ workouts: [saved] });
    const store = useStrengthStore.getState();
    store.startDraft(saved);
    store.setDraftName('Legs B');

    await saveDraft();
    expect(repo.updateWorkout).toHaveBeenCalledTimes(1);
    expect(repo.insertWorkout).not.toHaveBeenCalled();
    expect(useStrengthStore.getState().workouts[0].name).toBe('Legs B');
  });

  it('returns null for an empty draft and persists nothing', async () => {
    useStrengthStore.getState().startDraft();
    const saved = await saveDraft();
    expect(saved).toBeNull();
    expect(repo.insertWorkout).not.toHaveBeenCalled();
  });
});

describe('sessions', () => {
  it('startWorkoutSession seeds an active session from a workout', () => {
    startWorkoutSession({
      id: 'wk1',
      name: 'Push',
      exercises: [entry({ targetWeightKg: 20, targetReps: 10 })],
    });
    const s = useStrengthStore.getState().session as ActiveSession;
    expect(s.workoutId).toBe('wk1');
    expect(s.weightKg).toBe(20);
    expect(s.reps).toBe(10);
  });

  it('startDraftSession runs the draft ad-hoc (no workoutId) and returns true', () => {
    const store = useStrengthStore.getState();
    store.startDraft();
    store.addDraftExercise('ex_dumbbell_bench_press');
    expect(startDraftSession()).toBe(true);
    expect(useStrengthStore.getState().session?.workoutId).toBeNull();
  });

  it('finishSession persists a non-empty run, records history, and clears it', async () => {
    startWorkoutSession({
      id: 'wk1',
      name: 'Push',
      exercises: [entry({ targetSets: 1, targetWeightKg: 20, targetReps: 10 })],
    });
    useStrengthStore.getState().logCurrentSet(); // last set → finished

    const summary = await finishSession();
    expect(summary?.setsCompleted).toBe(1);
    expect(repo.insertSession).toHaveBeenCalledTimes(1);
    expect(useStrengthStore.getState().session).toBeNull();
    expect(useStrengthStore.getState().lastSummary?.id).toBe(summary?.id);
    expect(useStrengthStore.getState().sessions).toHaveLength(1);
  });

  it('finishSession persists nothing for a run with no logged sets', async () => {
    startWorkoutSession({
      id: 'wk1',
      name: 'Push',
      exercises: [entry({ targetSets: 3 })],
    });
    const summary = await finishSession();
    expect(summary?.setsCompleted).toBe(0);
    expect(repo.insertSession).not.toHaveBeenCalled();
    expect(useStrengthStore.getState().sessions).toHaveLength(0);
  });

  it('removeSession deletes from SQLite and drops it from history', async () => {
    useStrengthStore.setState({
      sessions: [
        summary({ id: 'a', totalVolumeKg: 100 }),
        summary({ id: 'b', totalVolumeKg: 200 }),
      ],
    });
    await removeSession('a');
    expect(repo.deleteSession).toHaveBeenCalledWith('a');
    const ids = useStrengthStore.getState().sessions.map(s => s.id);
    expect(ids).toEqual(['b']);
  });
});
