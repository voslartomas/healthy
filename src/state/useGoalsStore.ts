import { create } from 'zustand';

import { GoalSourceKey } from '../data/goalSources';
import { ActivitySummary, GoalWeekData } from '../health/types';
import { useHealthStore } from './useHealthStore';

/** Live auto-tracked weekly totals per source, from the real health read. */
type TrackedMap = Partial<Record<GoalSourceKey, number>>;

/** How an activity goal is matched against recorded workout sessions. */
export interface GoalMatch {
  /** Match on the raw exercise type string, or the localized displayName. */
  field: 'type' | 'displayName';
  /** The value to match (compared case-insensitively), e.g. "STRENGTH_TRAINING"
   * or "Trénink středu těla". */
  value: string;
}

/**
 * A weekly goal is a *definition* of something to track. Progress is not stored
 * on the goal — it is derived from the health snapshot, matching the design
 * where goals "fill in automatically from your steps and logged activities".
 *
 * A goal is one of two kinds:
 *   • aggregate-metric — `source` set (steps / zone2 / calories); progress read
 *     from the precomputed `tracked` totals; or
 *   • activity-session — `match` set; progress = count of this week's sessions
 *     whose type/displayName matches and that run at least `minDurationMin`.
 * Exactly one of `source` / `match` is set.
 */
export interface WeeklyGoal {
  id: string;
  name: string;
  target: number;
  source?: GoalSourceKey;
  match?: GoalMatch;
  /** Minimum session length (minutes) to count; activity goals only. */
  minDurationMin?: number;
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

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Count this week's sessions that satisfy an activity goal: the field (type or
 * displayName) matches case-insensitively AND the session runs at least
 * `minDurationMin`. Pure — takes the week's activities so it is trivially
 * testable and reused by both the store default and component subscriptions.
 */
export function countMatchingSessions(
  activities: ActivitySummary[],
  match: GoalMatch,
  minDurationMin = 0,
): number {
  const target = norm(match.value);
  return activities.reduce((n, a) => {
    const field = match.field === 'type' ? a.type : a.displayName;
    if (field == null || norm(field) !== target) return n;
    if (a.durationMin < minDurationMin) return n;
    return n + 1;
  }, 0);
}

/**
 * Current weekly amount toward a goal. Aggregate-metric goals read the
 * precomputed `tracked` totals; activity goals count matching sessions from the
 * week's `activities`. Both default to the live health snapshot; components pass
 * the reactively-subscribed values so rows re-render when a fresh read lands.
 */
export function goalCurrent(
  goal: WeeklyGoal,
  tracked: TrackedMap = useHealthStore.getState().snapshot.tracked,
  activities: ActivitySummary[] = useHealthStore.getState().snapshot.activities,
): number {
  if (goal.match) {
    return countMatchingSessions(activities, goal.match, goal.minDurationMin);
  }
  if (goal.source) return tracked[goal.source] ?? 0;
  return 0;
}

/** Fractional progress toward the goal's target, clamped to [0, 1]. */
export function goalProgress(
  goal: WeeklyGoal,
  tracked?: TrackedMap,
  activities?: ActivitySummary[],
): number {
  if (goal.target <= 0) return 0;
  return Math.min(goalCurrent(goal, tracked, activities) / goal.target, 1);
}

export function isGoalComplete(
  goal: WeeklyGoal,
  tracked?: TrackedMap,
  activities?: ActivitySummary[],
): boolean {
  return goalCurrent(goal, tracked, activities) >= goal.target;
}

/** One week's attainment for a goal. `covered` is false when no data source
 * reached this week for this goal's kind — render as "no data", never a miss. */
export interface GoalWeek {
  weekStart: number;
  current: number;
  target: number;
  complete: boolean;
  hit: boolean;
  covered: boolean;
}

/** Whether the data behind this goal's kind actually reaches the given week. */
function weekCovered(goal: WeeklyGoal, w: GoalWeekData): boolean {
  if (goal.source === 'steps') return w.coverage.steps;
  if (goal.source === 'calories') return w.coverage.calories;
  // Activity matches and zone2/strength/core all derive from exercise sessions.
  return w.coverage.activity;
}

/**
 * Per-week attainment for a goal across the snapshot's recent weeks. Reuses the
 * exact same current-week logic ({@link countMatchingSessions} / tracked totals)
 * per week, so history and the live tile can never disagree.
 */
export function goalWeekly(goal: WeeklyGoal, history: GoalWeekData[]): GoalWeek[] {
  return history.map(w => {
    const current = goal.match
      ? countMatchingSessions(w.activities, goal.match, goal.minDurationMin)
      : goal.source
        ? w.tracked[goal.source] ?? 0
        : 0;
    return {
      weekStart: w.weekStart,
      current,
      target: goal.target,
      complete: w.complete,
      hit: current >= goal.target,
      covered: weekCovered(goal, w),
    };
  });
}
