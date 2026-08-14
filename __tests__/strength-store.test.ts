import { buildSession } from '../src/state/strengthService';
import {
  nextCursor,
  PlannedExercise,
  useStrengthStore,
} from '../src/state/useStrengthStore';

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

beforeEach(reset);

function entry(o: Partial<PlannedExercise>): PlannedExercise {
  return {
    id: o.id ?? 'pe',
    exerciseId: o.exerciseId ?? 'ex_dumbbell_bench_press',
    targetSets: o.targetSets ?? 3,
    targetReps: o.targetReps ?? 10,
    targetWeightKg: o.targetWeightKg === undefined ? 20 : o.targetWeightKg,
    restSec: o.restSec ?? 60,
  };
}

describe('nextCursor', () => {
  const plan = [
    entry({ id: 'a', targetSets: 2 }),
    entry({ id: 'b', targetSets: 1 }),
  ];
  it('advances within an exercise', () => {
    expect(nextCursor(plan, 0, 0)).toEqual({ exerciseIndex: 0, setIndex: 1 });
  });
  it('rolls over to the next exercise after the last set', () => {
    expect(nextCursor(plan, 0, 1)).toEqual({ exerciseIndex: 1, setIndex: 0 });
  });
  it('returns null after the final set of the final exercise', () => {
    expect(nextCursor(plan, 1, 0)).toBeNull();
  });
});

describe('builder draft', () => {
  it('adds, edits, reorders and removes exercises', () => {
    const s = useStrengthStore.getState();
    s.startDraft();
    s.addDraftExercise('ex_dumbbell_bench_press');
    s.addDraftExercise('ex_pushups');
    let draft = useStrengthStore.getState().draft!;
    expect(draft.exercises).toHaveLength(2);

    const firstId = draft.exercises[0].id;
    s.updateDraftExercise(firstId, { targetSets: 5 });
    expect(useStrengthStore.getState().draft!.exercises[0].targetSets).toBe(5);

    s.moveDraftExercise(firstId, 1);
    expect(useStrengthStore.getState().draft!.exercises[1].id).toBe(firstId);

    s.removeDraftExercise(firstId);
    expect(useStrengthStore.getState().draft!.exercises).toHaveLength(1);
  });

  it('seeds bodyweight exercises with a null target weight', () => {
    const s = useStrengthStore.getState();
    s.startDraft();
    s.addDraftExercise('ex_pushups');
    expect(useStrengthStore.getState().draft!.exercises[0].targetWeightKg).toBeNull();
  });
});

describe('per-set targets', () => {
  it('toggles per-set on (seeded from uniform) and off', () => {
    const s = useStrengthStore.getState();
    s.startDraft();
    s.addDraftExercise('ex_dumbbell_bench_press'); // weighted, 3×10
    const id = useStrengthStore.getState().draft!.exercises[0].id;
    const uniform = useStrengthStore.getState().draft!.exercises[0];

    s.toggleDraftPerSet(id, true);
    const on = useStrengthStore.getState().draft!.exercises[0];
    expect(on.setTargets).toHaveLength(uniform.targetSets);
    expect(on.setTargets![0]).toEqual({
      weightKg: uniform.targetWeightKg,
      reps: uniform.targetReps,
    });

    s.toggleDraftPerSet(id, false);
    expect(useStrengthStore.getState().draft!.exercises[0].setTargets).toBeUndefined();
  });

  it('edits an individual set and resizes when the set count changes', () => {
    const s = useStrengthStore.getState();
    s.startDraft();
    s.addDraftExercise('ex_dumbbell_bench_press');
    const id = useStrengthStore.getState().draft!.exercises[0].id;
    s.toggleDraftPerSet(id, true);

    s.updateDraftSetTarget(id, 1, { weightKg: 30, reps: 8 });
    expect(useStrengthStore.getState().draft!.exercises[0].setTargets![1]).toEqual({
      weightKg: 30,
      reps: 8,
    });

    // Growing the set count keeps existing targets and clones for new sets.
    s.updateDraftExercise(id, { targetSets: 4 });
    const grown = useStrengthStore.getState().draft!.exercises[0];
    expect(grown.setTargets).toHaveLength(4);
    expect(grown.setTargets![1]).toEqual({ weightKg: 30, reps: 8 });

    // Shrinking trims the tail.
    s.updateDraftExercise(id, { targetSets: 2 });
    expect(useStrengthStore.getState().draft!.exercises[0].setTargets).toHaveLength(2);
  });
});

describe('run progression', () => {
  it('logs sets, enters rest between them, and reports finish on the last set', () => {
    const plan = [entry({ id: 'a', targetSets: 2, targetWeightKg: 20, targetReps: 10 })];
    useStrengthStore.getState().startSession(buildSession('wk1', 'Push', plan, 0));

    // First set → not finished, enters rest, cursor at set 2.
    let r = useStrengthStore.getState().logCurrentSet();
    expect(r.finished).toBe(false);
    let session = useStrengthStore.getState().session!;
    expect(session.resting).toBe(true);
    expect(session.setIndex).toBe(1);
    expect(session.completed).toHaveLength(1);

    useStrengthStore.getState().endRest();
    expect(useStrengthStore.getState().session!.resting).toBe(false);

    // Second (final) set → finished.
    r = useStrengthStore.getState().logCurrentSet();
    expect(r.finished).toBe(true);
    session = useStrengthStore.getState().session!;
    expect(session.completed).toHaveLength(2);
    expect(session.resting).toBe(false);
  });

  it('carries weight within an exercise but reseeds on a new exercise', () => {
    const plan = [
      entry({ id: 'a', targetSets: 2, targetWeightKg: 20, targetReps: 10 }),
      entry({ id: 'b', targetSets: 1, targetWeightKg: 40, targetReps: 8 }),
    ];
    const store = useStrengthStore.getState();
    store.startSession(buildSession('wk1', 'Push', plan, 0));
    store.adjustWeight(5); // 20 → 25 on set 1
    store.logCurrentSet(); // → set 2 of same exercise
    expect(useStrengthStore.getState().session!.weightKg).toBe(25); // carried
    store.logCurrentSet(); // → exercise b
    expect(useStrengthStore.getState().session!.weightKg).toBe(40); // reseeded
    expect(useStrengthStore.getState().session!.reps).toBe(8);
  });

  it('seeds each set from its per-set target (weight and reps)', () => {
    const plan = [
      {
        ...entry({ id: 'a', targetSets: 3, targetWeightKg: 20, targetReps: 10 }),
        setTargets: [
          { weightKg: 20, reps: 12 },
          { weightKg: 25, reps: 10 },
          { weightKg: 30, reps: 8 },
        ],
      },
    ];
    const store = useStrengthStore.getState();
    store.startSession(buildSession('wk1', 'Pyramid', plan, 0));
    // Set 1 seeded from setTargets[0].
    expect(useStrengthStore.getState().session!.weightKg).toBe(20);
    expect(useStrengthStore.getState().session!.reps).toBe(12);
    store.logCurrentSet();
    // Set 2 seeded from setTargets[1] (per-set wins over weight-carry).
    expect(useStrengthStore.getState().session!.weightKg).toBe(25);
    expect(useStrengthStore.getState().session!.reps).toBe(10);
    store.logCurrentSet();
    expect(useStrengthStore.getState().session!.weightKg).toBe(30);
    expect(useStrengthStore.getState().session!.reps).toBe(8);
  });

  it('logs null weight for bodyweight movements regardless of the weight field', () => {
    const plan = [entry({ id: 'a', targetSets: 1, targetWeightKg: null, targetReps: 15 })];
    const store = useStrengthStore.getState();
    store.startSession(buildSession(null, 'Core', plan, 0));
    store.logCurrentSet();
    expect(useStrengthStore.getState().session!.completed[0].weightKg).toBeNull();
  });
});
