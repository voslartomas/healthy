import { EnergyMetricKey, GoalSourceKey } from '../data/goalSources';
import { deleteGoalWeeks } from '../db/goalHistoryRepository';
import { deleteGoal, insertGoal, loadGoals } from '../db/goalsRepository';
import { syncGoalHistory } from './goalHistoryService';
import { GoalMatch, useGoalsStore, WeeklyGoal } from './useGoalsStore';

/**
 * Orchestration between the goals store (in-memory, for the UI) and the SQLite
 * repository (durable). UI code calls these thunks instead of touching either
 * layer directly, so every mutation is persisted and reflected immediately.
 */

let idCounter = 0;

/** Collision-resistant id without pulling in a uuid dependency. */
function newId(): string {
  idCounter += 1;
  return `g_${Date.now().toString(36)}_${idCounter}`;
}

/** Load persisted goals into the store. Call once on app start. */
export async function initGoals(): Promise<void> {
  const goals = await loadGoals();
  useGoalsStore.getState().setGoals(goals);
}

export interface NewGoalInput {
  name: string;
  target: number;
  /** Aggregate-metric goal (steps/zone2/calories). Set this OR `match`. */
  source?: GoalSourceKey;
  /** Activity-session goal, matched by type/displayName. Set this OR `source`. */
  match?: GoalMatch;
  /** Minimum session length (minutes) to count; activity goals only. */
  minDurationMin?: number;
  /** Energy-balance goal ('deficit'). Set this instead of `source`/`match`. */
  metric?: EnergyMetricKey;
}

/** Create a goal: write-through to SQLite, then update the store. */
export async function createGoal(input: NewGoalInput): Promise<WeeklyGoal> {
  const goal: WeeklyGoal = { id: newId(), ...input };
  await insertGoal(goal);
  useGoalsStore.getState().addGoalLocal(goal);
  // Seed retrospective weekly history for the new goal from the current snapshot.
  void syncGoalHistory().catch(err =>
    console.warn('Failed to sync goal history', err),
  );
  return goal;
}

/** Delete a goal: remove it and its weekly history from SQLite, then the store. */
export async function removeGoal(id: string): Promise<void> {
  await deleteGoal(id);
  await deleteGoalWeeks(id);
  useGoalsStore.getState().removeGoalLocal(id);
  void syncGoalHistory().catch(err =>
    console.warn('Failed to sync goal history', err),
  );
}
