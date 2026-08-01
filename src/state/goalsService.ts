import { GoalSourceKey } from '../data/goalSources';
import { deleteGoal, insertGoal, loadGoals } from '../db/goalsRepository';
import { useGoalsStore, WeeklyGoal } from './useGoalsStore';

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
  source: GoalSourceKey;
  name: string;
  target: number;
}

/** Create a goal: write-through to SQLite, then update the store. */
export async function createGoal(input: NewGoalInput): Promise<WeeklyGoal> {
  const goal: WeeklyGoal = { id: newId(), ...input };
  await insertGoal(goal);
  useGoalsStore.getState().addGoalLocal(goal);
  return goal;
}

/** Delete a goal: remove from SQLite, then from the store. */
export async function removeGoal(id: string): Promise<void> {
  await deleteGoal(id);
  useGoalsStore.getState().removeGoalLocal(id);
}
