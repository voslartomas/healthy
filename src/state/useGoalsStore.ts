import { create } from 'zustand';

import { GoalSourceKey, TRACKED } from '../data/goalSources';

/**
 * A weekly goal is a *definition* of something to track. Progress is not stored
 * on the goal — it is derived from auto-tracked activity (see {@link TRACKED}),
 * matching the design where goals "fill in automatically from your steps and
 * logged activities".
 */
export interface WeeklyGoal {
  id: string;
  source: GoalSourceKey;
  name: string;
  target: number;
}

interface GoalsState {
  goals: WeeklyGoal[];
  /** True once goals have been loaded from the database. */
  hydrated: boolean;
  /** Replace the whole list (used on hydration from SQLite). */
  setGoals: (goals: WeeklyGoal[]) => void;
  /** Append a goal to the in-memory list. */
  addGoalLocal: (goal: WeeklyGoal) => void;
  /** Remove a goal from the in-memory list. */
  removeGoalLocal: (id: string) => void;
}

/**
 * In-memory source of truth for the UI. The goalsService layer keeps this in
 * sync with SQLite; keeping the reducers here pure and synchronous makes them
 * trivially testable without a native database.
 */
export const useGoalsStore = create<GoalsState>(set => ({
  goals: [],
  hydrated: false,
  setGoals: goals => set({ goals, hydrated: true }),
  addGoalLocal: goal => set(state => ({ goals: [...state.goals, goal] })),
  removeGoalLocal: id =>
    set(state => ({ goals: state.goals.filter(g => g.id !== id) })),
}));

/** Auto-tracked amount for a goal's source this week. */
export function goalCurrent(goal: WeeklyGoal): number {
  return TRACKED[goal.source] ?? 0;
}

/** Fractional progress toward the goal's target, clamped to [0, 1]. */
export function goalProgress(goal: WeeklyGoal): number {
  if (goal.target <= 0) return 0;
  return Math.min(goalCurrent(goal) / goal.target, 1);
}

export function isGoalComplete(goal: WeeklyGoal): boolean {
  return goalCurrent(goal) >= goal.target;
}
