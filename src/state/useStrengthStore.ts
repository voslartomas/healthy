import { create } from 'zustand';

import { getExercise } from '../data/exerciseCatalog';

/**
 * In-memory source of truth for the strength feature. Three concerns live here,
 * all as pure/synchronous reducers so they are trivially testable without a
 * native database:
 *
 *  1. `workouts` — the user's saved (reusable) workouts, hydrated from SQLite by
 *     strengthService.
 *  2. `draft`    — the workout currently being built or edited in the builder.
 *  3. `session`  — the run in progress (the set-by-set cursor + logged sets), and
 *     `lastSummary`, the recap of the most recently finished run.
 *
 * Navigation in this app is param-less (screens read stores, not route params),
 * so the builder/runner/summary screens all coordinate through this store.
 */

/** A per-set target (weight + reps) when an exercise uses non-uniform sets —
 * e.g. a pyramid 12@20, 10@25, 8@30. `weightKg` stays null for bodyweight. */
export interface SetTarget {
  weightKg: number | null;
  reps: number;
}

/** One exercise entry inside a workout plan. `id` is per-entry (not the catalog
 * id) so the same movement can appear twice with different targets. */
export interface PlannedExercise {
  id: string;
  exerciseId: string;
  targetSets: number;
  targetReps: number;
  /** Load in kg, or null for a bodyweight movement (no weight field shown). */
  targetWeightKg: number | null;
  restSec: number;
  /**
   * Optional per-set overrides. When present, set `i` uses `setTargets[i]`
   * instead of the uniform `targetReps`/`targetWeightKg`; its length is kept in
   * sync with `targetSets`. Absent → every set uses the uniform targets (the
   * common case, and backward-compatible with workouts saved before this).
   */
  setTargets?: SetTarget[];
}

/** The target (weight + reps) for a specific set of an entry: the per-set
 * override when defined, else the entry's uniform target. Pure. */
export function setTargetFor(entry: PlannedExercise, setIndex: number): SetTarget {
  const perSet = entry.setTargets?.[setIndex];
  if (perSet) return perSet;
  return { weightKg: entry.targetWeightKg, reps: entry.targetReps };
}

/** Grow/shrink an entry's `setTargets` to match `targetSets`, cloning the last
 * known target (or the uniform target) for any newly-added sets. Returns a new
 * entry; a no-op passthrough when the entry has no per-set targets. */
export function normalizeSetTargets(entry: PlannedExercise): PlannedExercise {
  if (!entry.setTargets) return entry;
  const next: SetTarget[] = [];
  for (let i = 0; i < entry.targetSets; i++) {
    next.push(
      entry.setTargets[i] ??
        entry.setTargets[entry.setTargets.length - 1] ?? {
          weightKg: entry.targetWeightKg,
          reps: entry.targetReps,
        },
    );
  }
  return { ...entry, setTargets: next };
}

/** A saved, reusable workout. */
export interface SavedWorkout {
  id: string;
  name: string;
  exercises: PlannedExercise[];
}

/** The workout being assembled in the builder. */
export interface WorkoutDraft {
  /** null → creating a new workout; set → editing this saved workout's id. */
  editingId: string | null;
  name: string;
  exercises: PlannedExercise[];
}

/** A single set the user actually performed during a run. */
export interface LoggedSet {
  exerciseId: string;
  /** Index of the exercise within the plan. */
  position: number;
  /** 0-based set number within that exercise. */
  setIndex: number;
  weightKg: number | null;
  reps: number;
  completedAt: number;
}

/** A workout run in progress. */
export interface ActiveSession {
  id: string;
  /** The saved workout this run came from, or null for a pure ad-hoc run. */
  workoutId: string | null;
  name: string;
  startedAt: number;
  /** Immutable snapshot of the plan being run. */
  plan: PlannedExercise[];
  /** Cursor: which exercise / set is up next. */
  exerciseIndex: number;
  setIndex: number;
  /** True while the rest timer between sets is showing. */
  resting: boolean;
  /** Epoch ms when the current rest ends (drives the notification countdown);
   * null when not resting. */
  restEndsAt: number | null;
  /** Every set logged so far. */
  completed: LoggedSet[];
  /** Editable actuals for the set currently in progress. */
  weightKg: number | null;
  reps: number;
}

/** The recap of a finished run, shown on the summary screen. */
export interface SessionSummary {
  id: string;
  workoutId: string | null;
  name: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  totalVolumeKg: number;
  setsCompleted: number;
  totalReps: number;
  sets: LoggedSet[];
}

/** The next {exercise, set} after the given cursor, or null when the plan is
 * exhausted. Pure — the core of the runner's progression. */
export function nextCursor(
  plan: PlannedExercise[],
  exerciseIndex: number,
  setIndex: number,
): { exerciseIndex: number; setIndex: number } | null {
  const current = plan[exerciseIndex];
  if (!current) return null;
  if (setIndex + 1 < current.targetSets) {
    return { exerciseIndex, setIndex: setIndex + 1 };
  }
  if (exerciseIndex + 1 < plan.length) {
    return { exerciseIndex: exerciseIndex + 1, setIndex: 0 };
  }
  return null;
}

/** Seed the editable actuals when the cursor moves. Weight carries over within
 * the same exercise (you rarely change plates mid-exercise); a new exercise
 * seeds from its plan target. Reps always seed from the plan target. */
function seedFor(
  plan: PlannedExercise[],
  next: { exerciseIndex: number; setIndex: number },
  prevWeightKg: number | null,
  prevExerciseIndex: number,
): { weightKg: number | null; reps: number } {
  const entry = plan[next.exerciseIndex];
  // An explicit per-set target always wins (that's the whole point of defining
  // it). Otherwise fall back to carrying the weight within an exercise (you
  // rarely change plates mid-exercise) and the uniform reps target.
  if (entry.setTargets?.[next.setIndex]) {
    return setTargetFor(entry, next.setIndex);
  }
  const sameExercise = next.exerciseIndex === prevExerciseIndex;
  return {
    weightKg: sameExercise ? prevWeightKg : entry.targetWeightKg,
    reps: entry.targetReps,
  };
}

let idCounter = 0;

/** Collision-resistant id without a uuid dependency (matches other services). */
export function newStrengthId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

interface StrengthState {
  workouts: SavedWorkout[];
  hydrated: boolean;
  draft: WorkoutDraft | null;
  session: ActiveSession | null;
  lastSummary: SessionSummary | null;
  /** Finished-session history, newest first — powers the volume trend. */
  sessions: SessionSummary[];

  // ── saved-workout list (kept in sync with SQLite by the service) ───────────
  setWorkouts: (workouts: SavedWorkout[]) => void;
  addWorkoutLocal: (workout: SavedWorkout) => void;
  updateWorkoutLocal: (workout: SavedWorkout) => void;
  removeWorkoutLocal: (id: string) => void;

  // ── session history ────────────────────────────────────────────────────────
  setSessions: (sessions: SessionSummary[]) => void;
  addSessionLocal: (summary: SessionSummary) => void;
  removeSessionLocal: (id: string) => void;

  // ── builder draft ──────────────────────────────────────────────────────────
  startDraft: (editing?: SavedWorkout) => void;
  setDraftName: (name: string) => void;
  addDraftExercise: (exerciseId: string) => void;
  updateDraftExercise: (
    entryId: string,
    patch: Partial<Omit<PlannedExercise, 'id' | 'exerciseId'>>,
  ) => void;
  removeDraftExercise: (entryId: string) => void;
  moveDraftExercise: (entryId: string, dir: -1 | 1) => void;
  /** Turn per-set targets on (seeded from the uniform target) or off. */
  toggleDraftPerSet: (entryId: string, enabled: boolean) => void;
  /** Edit one set's weight/reps when per-set targets are on. */
  updateDraftSetTarget: (
    entryId: string,
    setIndex: number,
    patch: Partial<SetTarget>,
  ) => void;
  clearDraft: () => void;

  // ── run session ────────────────────────────────────────────────────────────
  startSession: (session: ActiveSession) => void;
  setWeight: (kg: number | null) => void;
  setReps: (reps: number) => void;
  adjustWeight: (delta: number) => void;
  adjustReps: (delta: number) => void;
  /** Log the current set and advance. Returns whether the run is now finished
   * (no sets remain). When more remain, enters the rest state. */
  logCurrentSet: () => { finished: boolean };
  endRest: () => void;
  /** Push the current rest end-time out by `ms` (the +15s button). */
  extendRest: (ms: number) => void;
  cancelSession: () => void;
  clearSession: () => void;
  setLastSummary: (summary: SessionSummary | null) => void;
}

/** Build a fresh plan entry from a catalog exercise, using its defaults. */
export function plannedFromCatalog(exerciseId: string): PlannedExercise {
  const def = getExercise(exerciseId);
  return {
    id: newStrengthId('pe'),
    exerciseId,
    targetSets: def?.defaultSets ?? 3,
    targetReps: def?.defaultReps ?? 10,
    targetWeightKg: def?.isWeighted ? (def.defaultWeightKg ?? 10) : null,
    restSec: def?.defaultRestSec ?? 60,
  };
}

export const useStrengthStore = create<StrengthState>((set, get) => ({
  workouts: [],
  hydrated: false,
  draft: null,
  session: null,
  lastSummary: null,
  sessions: [],

  setWorkouts: workouts => set({ workouts, hydrated: true }),
  addWorkoutLocal: workout =>
    set(state => ({ workouts: [workout, ...state.workouts] })),
  updateWorkoutLocal: workout =>
    set(state => ({
      workouts: state.workouts.map(w => (w.id === workout.id ? workout : w)),
    })),
  removeWorkoutLocal: id =>
    set(state => ({ workouts: state.workouts.filter(w => w.id !== id) })),

  setSessions: sessions => set({ sessions }),
  addSessionLocal: summary =>
    set(state => ({ sessions: [summary, ...state.sessions] })),
  removeSessionLocal: id =>
    set(state => ({ sessions: state.sessions.filter(s => s.id !== id) })),

  startDraft: editing =>
    set({
      draft: editing
        ? {
            editingId: editing.id,
            name: editing.name,
            // Clone entries with fresh ids so builder edits never mutate the
            // saved workout in the list until Save writes through.
            exercises: editing.exercises.map(e => ({
              ...e,
              id: newStrengthId('pe'),
            })),
          }
        : { editingId: null, name: '', exercises: [] },
    }),
  setDraftName: name =>
    set(state => (state.draft ? { draft: { ...state.draft, name } } : {})),
  addDraftExercise: exerciseId =>
    set(state =>
      state.draft
        ? {
            draft: {
              ...state.draft,
              exercises: [
                ...state.draft.exercises,
                plannedFromCatalog(exerciseId),
              ],
            },
          }
        : {},
    ),
  updateDraftExercise: (entryId, patch) =>
    set(state =>
      state.draft
        ? {
            draft: {
              ...state.draft,
              exercises: state.draft.exercises.map(e =>
                // normalizeSetTargets keeps a per-set array in step with a
                // changed targetSets; it's a no-op when per-set is off.
                e.id === entryId
                  ? normalizeSetTargets({ ...e, ...patch })
                  : e,
              ),
            },
          }
        : {},
    ),
  removeDraftExercise: entryId =>
    set(state =>
      state.draft
        ? {
            draft: {
              ...state.draft,
              exercises: state.draft.exercises.filter(e => e.id !== entryId),
            },
          }
        : {},
    ),
  moveDraftExercise: (entryId, dir) =>
    set(state => {
      if (!state.draft) return {};
      const list = [...state.draft.exercises];
      const i = list.findIndex(e => e.id === entryId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return {};
      [list[i], list[j]] = [list[j], list[i]];
      return { draft: { ...state.draft, exercises: list } };
    }),
  toggleDraftPerSet: (entryId, enabled) =>
    set(state => {
      if (!state.draft) return {};
      return {
        draft: {
          ...state.draft,
          exercises: state.draft.exercises.map(e => {
            if (e.id !== entryId) return e;
            if (!enabled) {
              // Drop the per-set array; sets revert to the uniform target.
              const { setTargets: _drop, ...rest } = e;
              void _drop;
              return rest;
            }
            // Seed one target per set from the current uniform target.
            const setTargets: SetTarget[] = Array.from(
              { length: e.targetSets },
              () => ({ weightKg: e.targetWeightKg, reps: e.targetReps }),
            );
            return { ...e, setTargets };
          }),
        },
      };
    }),
  updateDraftSetTarget: (entryId, setIndex, patch) =>
    set(state => {
      if (!state.draft) return {};
      return {
        draft: {
          ...state.draft,
          exercises: state.draft.exercises.map(e => {
            if (e.id !== entryId || !e.setTargets) return e;
            const setTargets = e.setTargets.map((st, i) =>
              i === setIndex ? { ...st, ...patch } : st,
            );
            return { ...e, setTargets };
          }),
        },
      };
    }),
  clearDraft: () => set({ draft: null }),

  startSession: session => set({ session, lastSummary: null }),
  setWeight: kg =>
    set(state => (state.session ? { session: { ...state.session, weightKg: kg } } : {})),
  setReps: reps =>
    set(state =>
      state.session
        ? { session: { ...state.session, reps: Math.max(0, Math.round(reps)) } }
        : {},
    ),
  adjustWeight: delta =>
    set(state => {
      if (!state.session) return {};
      const base = state.session.weightKg ?? 0;
      return {
        session: { ...state.session, weightKg: Math.max(0, base + delta) },
      };
    }),
  adjustReps: delta =>
    set(state => {
      if (!state.session) return {};
      return {
        session: {
          ...state.session,
          reps: Math.max(0, state.session.reps + delta),
        },
      };
    }),
  logCurrentSet: () => {
    const state = get();
    const s = state.session;
    if (!s) return { finished: true };
    const entry = s.plan[s.exerciseIndex];
    const logged: LoggedSet = {
      exerciseId: entry.exerciseId,
      position: s.exerciseIndex,
      setIndex: s.setIndex,
      weightKg: entry.targetWeightKg == null ? null : s.weightKg,
      reps: s.reps,
      completedAt: Date.now(),
    };
    const next = nextCursor(s.plan, s.exerciseIndex, s.setIndex);
    const completed = [...s.completed, logged];
    if (!next) {
      set({ session: { ...s, completed, resting: false, restEndsAt: null } });
      return { finished: true };
    }
    const seed = seedFor(s.plan, next, s.weightKg, s.exerciseIndex);
    set({
      session: {
        ...s,
        completed,
        exerciseIndex: next.exerciseIndex,
        setIndex: next.setIndex,
        resting: true,
        restEndsAt: Date.now() + s.plan[next.exerciseIndex].restSec * 1000,
        weightKg: seed.weightKg,
        reps: seed.reps,
      },
    });
    return { finished: false };
  },
  endRest: () =>
    set(state =>
      state.session
        ? { session: { ...state.session, resting: false, restEndsAt: null } }
        : {},
    ),
  extendRest: ms =>
    set(state =>
      state.session?.restEndsAt != null
        ? {
            session: {
              ...state.session,
              restEndsAt: state.session.restEndsAt + ms,
            },
          }
        : {},
    ),
  cancelSession: () => set({ session: null }),
  clearSession: () => set({ session: null }),
  setLastSummary: summary => set({ lastSummary: summary }),
}));
