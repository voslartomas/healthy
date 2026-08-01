import { create } from 'zustand';

import { GoalSourceKey } from '../data/goalSources';
import { useHealthStore } from './useHealthStore';

/** Live auto-tracked weekly totals per source (real Health Connect read, or
 * the sample fallback when unavailable). */
type TrackedMap = Partial<Record<GoalSourceKey, number>>;

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

/**
 * Auto-tracked amount for a goal's source this week. Reads the live health
 * snapshot by default; callers inside a component pass the reactively-subscribed
 * map so the row re-renders when a fresh read lands.
 */
export function goalCurrent(
  goal: WeeklyGoal,
  tracked: TrackedMap = useHealthStore.getState().snapshot.tracked,
): number {
  return tracked[goal.source] ?? 0;
}

/** Fractional progress toward the goal's target, clamped to [0, 1]. */
export function goalProgress(goal: WeeklyGoal, tracked?: TrackedMap): number {
  if (goal.target <= 0) return 0;
  return Math.min(goalCurrent(goal, tracked) / goal.target, 1);
}

export function isGoalComplete(goal: WeeklyGoal, tracked?: TrackedMap): boolean {
  return goalCurrent(goal, tracked) >= goal.target;
}
