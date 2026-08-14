import {
  deleteSession as dbDeleteSession,
  deleteWorkout as dbDeleteWorkout,
  insertSession,
  insertWorkout,
  loadRecentSessions,
  loadWorkouts,
  updateWorkout,
} from '../db/strengthRepository';
import {
  ActiveSession,
  LoggedSet,
  newStrengthId,
  PlannedExercise,
  SavedWorkout,
  SessionSummary,
  setTargetFor,
  useStrengthStore,
} from './useStrengthStore';

/**
 * Orchestration between the strength store (in-memory, for the UI) and the
 * SQLite repository (durable). Screens call these thunks instead of touching
 * either layer directly, so every mutation is persisted and reflected in the UI
 * immediately. Pure helpers (volume/summary) are exported for unit testing.
 */

/** Load persisted workouts + recent session history into the store. Call once
 * on app start. */
export async function initStrength(): Promise<void> {
  const [workouts, sessions] = await Promise.all([
    loadWorkouts(),
    loadRecentSessions(),
  ]);
  const store = useStrengthStore.getState();
  store.setWorkouts(workouts);
  store.setSessions(sessions);
}

/**
 * Persist the current builder draft. Creates a new saved workout when the draft
 * is new, or updates the existing one when editing. Write-through to SQLite,
 * then the store; the draft is cleared. Returns the saved workout, or null when
 * there is no draft or it has no exercises.
 */
export async function saveDraft(): Promise<SavedWorkout | null> {
  const store = useStrengthStore.getState();
  const draft = store.draft;
  if (!draft || draft.exercises.length === 0) return null;

  const name = draft.name.trim() || 'Untitled workout';
  if (draft.editingId) {
    const workout: SavedWorkout = {
      id: draft.editingId,
      name,
      exercises: draft.exercises,
    };
    await updateWorkout(workout);
    store.updateWorkoutLocal(workout);
    store.clearDraft();
    return workout;
  }

  const workout: SavedWorkout = {
    id: newStrengthId('wk'),
    name,
    exercises: draft.exercises,
  };
  await insertWorkout(workout);
  store.addWorkoutLocal(workout);
  store.clearDraft();
  return workout;
}

/**
 * Create and persist a brand-new saved workout from a ready-made plan (used by
 * the AI coach's `create_workout` tool). Write-through to SQLite then the store,
 * so it shows up in the Strength tab immediately. Returns the saved workout.
 */
export async function addWorkout(
  name: string,
  exercises: PlannedExercise[],
): Promise<SavedWorkout> {
  const workout: SavedWorkout = {
    id: newStrengthId('wk'),
    name: name.trim() || 'Untitled workout',
    exercises,
  };
  await insertWorkout(workout);
  useStrengthStore.getState().addWorkoutLocal(workout);
  return workout;
}

/** Delete a saved workout: remove from SQLite, then the store. */
export async function removeWorkout(id: string): Promise<void> {
  await dbDeleteWorkout(id);
  useStrengthStore.getState().removeWorkoutLocal(id);
}

/** Delete a logged session from history: remove from SQLite, then the store. */
export async function removeSession(id: string): Promise<void> {
  await dbDeleteSession(id);
  useStrengthStore.getState().removeSessionLocal(id);
}

/** Build a run session from a plan (a saved workout or an ad-hoc draft plan),
 * seeding the editable actuals from the first exercise's target. Pure. */
export function buildSession(
  workoutId: string | null,
  name: string,
  plan: PlannedExercise[],
  startedAt: number,
): ActiveSession {
  const first = plan[0];
  const seed = first ? setTargetFor(first, 0) : null;
  return {
    id: newStrengthId('ss'),
    workoutId,
    name,
    startedAt,
    plan,
    exerciseIndex: 0,
    setIndex: 0,
    resting: false,
    restEndsAt: null,
    completed: [],
    weightKg: seed ? seed.weightKg : null,
    reps: seed ? seed.reps : 0,
  };
}

/** Start running a saved workout. */
export function startWorkoutSession(workout: SavedWorkout): void {
  const session = buildSession(
    workout.id,
    workout.name,
    workout.exercises,
    Date.now(),
  );
  useStrengthStore.getState().startSession(session);
}

/** Start running the current builder draft ad-hoc (without saving it). Returns
 * false when there is no usable draft. */
export function startDraftSession(): boolean {
  const draft = useStrengthStore.getState().draft;
  if (!draft || draft.exercises.length === 0) return false;
  const session = buildSession(
    null,
    draft.name.trim() || 'Ad-hoc workout',
    draft.exercises,
    Date.now(),
  );
  useStrengthStore.getState().startSession(session);
  return true;
}

/** Total training volume (kg): the sum over logged sets of weight × reps.
 * Bodyweight sets (null weight) contribute 0 to load but still count as sets. */
export function totalVolume(sets: LoggedSet[]): number {
  return sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0);
}

/**
 * Chronological weighted-volume points (oldest → newest) for the trend chart.
 * Sessions arrive newest-first and may include bodyweight-only runs (0 kg); the
 * trend only plots sessions that actually moved load, capped to the last
 * `limit`. Pure, so it is unit-tested directly.
 */
export function volumeTrendPoints(
  sessions: SessionSummary[],
  limit = 8,
): { volume: number; startedAt: number }[] {
  return sessions
    .filter(s => s.totalVolumeKg > 0)
    .slice(0, limit)
    .map(s => ({ volume: s.totalVolumeKg, startedAt: s.startedAt }))
    .reverse();
}

/** Build the recap for a finished session. Pure — no store/DB access. */
export function buildSummary(
  session: ActiveSession,
  endedAt: number,
): SessionSummary {
  const sets = session.completed;
  return {
    id: session.id,
    workoutId: session.workoutId,
    name: session.name,
    startedAt: session.startedAt,
    endedAt,
    durationSec: Math.max(0, Math.round((endedAt - session.startedAt) / 1000)),
    totalVolumeKg: Math.round(totalVolume(sets)),
    setsCompleted: sets.length,
    totalReps: sets.reduce((sum, s) => sum + s.reps, 0),
    sets,
  };
}

/**
 * Finish the active run: build the recap, persist it (session + set rows), stash
 * it as `lastSummary` for the summary screen, and clear the session. Returns the
 * summary, or null when no session is active. When no sets were logged, nothing
 * is persisted (an abandoned run leaves no empty record).
 */
export async function finishSession(): Promise<SessionSummary | null> {
  const store = useStrengthStore.getState();
  const session = store.session;
  if (!session) return null;
  const summary = buildSummary(session, Date.now());
  if (summary.setsCompleted > 0) {
    await insertSession(summary);
    // Reflect it in the in-memory history immediately so the trend updates
    // without a reload (only real, persisted sessions enter the history).
    store.addSessionLocal(summary);
  }
  store.setLastSummary(summary);
  store.clearSession();
  return summary;
}

/** Abandon the active run without persisting anything. */
export function cancelSession(): void {
  useStrengthStore.getState().cancelSession();
}
