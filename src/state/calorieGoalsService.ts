import {
  deleteCalorieGoal,
  insertCalorieGoal,
  loadCalorieGoals,
} from '../db/calorieGoalsRepository';
import { CalorieGoal, useCalorieGoalsStore } from './useCalorieGoalsStore';

/**
 * Orchestration between the calorie-goals store (in-memory, for the UI) and the
 * SQLite repository (durable). Mirrors {@link ./goalsService}: UI calls these
 * thunks so every mutation is persisted and reflected immediately.
 */

let idCounter = 0;

/** Collision-resistant id without a uuid dependency. */
function newId(): string {
  idCounter += 1;
  return `cg_${Date.now().toString(36)}_${idCounter}`;
}

/** Load persisted calorie goals into the store. Call once on app start. */
export async function initCalorieGoals(): Promise<void> {
  const goals = await loadCalorieGoals();
  useCalorieGoalsStore.getState().setGoals(goals);
}

export interface NewCalorieGoalInput {
  effectiveFrom: number;
  targetNet: number;
}

/** Create a calorie goal: write-through to SQLite, then update the store. */
export async function createCalorieGoal(
  input: NewCalorieGoalInput,
): Promise<CalorieGoal> {
  const goal: CalorieGoal = { id: newId(), ...input };
  await insertCalorieGoal(goal);
  useCalorieGoalsStore.getState().addGoalLocal(goal);
  return goal;
}

/** Delete a calorie goal: remove from SQLite, then from the store. */
export async function removeCalorieGoal(id: string): Promise<void> {
  await deleteCalorieGoal(id);
  useCalorieGoalsStore.getState().removeGoalLocal(id);
}
