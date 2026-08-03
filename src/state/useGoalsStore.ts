import { create } from 'zustand';

import { EnergyMetricKey, GoalSourceKey } from '../data/goalSources';
import { ActivitySummary, DailyEnergy, GoalWeekData } from '../health/types';
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
 * A goal is one of three kinds:
 *   • aggregate-metric — `source` set (steps / zone2 / calories); progress read
 *     from the precomputed `tracked` totals;
 *   • activity-session — `match` set; progress = count of this week's sessions
 *     whose type/displayName matches and that run at least `minDurationMin`; or
 *   • energy-balance — `metric` set ('deficit'); progress = the week's AVERAGE
 *     daily deficit (burned − eaten) over days with both figures. Unlike the
 *     other two this is an average, not a running total.
 * Exactly one of `source` / `match` / `metric` is set.
 */
export interface WeeklyGoal {
  id: string;
  name: string;
  target: number;
  source?: GoalSourceKey;
  match?: GoalMatch;
  /** Minimum session length (minutes) to count; activity goals only. */
  minDurationMin?: number;
  /** Energy-balance goal ('deficit'). Target is the avg daily kcal deficit. */
  metric?: EnergyMetricKey;
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
 * Average-metric goals (currently only 'deficit') express a weekly AVERAGE, not
 * a running total. That distinction matters for the live UI: an accumulating
 * goal that reaches its target IS done for the week, but a good average can
 * still be dragged back down by a later day — so a deficit goal is never shown
 * as "complete" during the in-progress week, only as on-going progress.
 */
export function isAverageGoal(goal: WeeklyGoal): boolean {
  return goal.metric === 'deficit';
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
 * Average daily calorie deficit (burned − eaten) across the days that have BOTH
 * figures. Days with only one side (net == null) are excluded — a half-logged
 * day can't be judged — so the average reflects the days actually tracked. A
 * surplus reads as a negative number. Pure and reused by the live tile, the
 * history grid and persistence, so they can never disagree.
 */
export function weeklyDeficitAvg(energy: DailyEnergy[]): number {
  const days = energy.filter(d => d.net != null);
  if (days.length === 0) return 0;
  const sum = days.reduce((s, d) => s - (d.net as number), 0); // deficit = −net
  return Math.round(sum / days.length);
}

/** The current calendar week's energy days from the live snapshot (default
 * source for {@link goalCurrent} on a deficit goal). */
function currentWeekEnergy(): DailyEnergy[] {
  const history = useHealthStore.getState().snapshot.weeklyHistory;
  return history.length > 0 ? history[history.length - 1].energy : [];
}

/**
 * Current weekly amount toward a goal. Aggregate-metric goals read the
 * precomputed `tracked` totals; activity goals count matching sessions from the
 * week's `activities`; deficit goals average the week's `energy` days. All
 * default to the live health snapshot; components pass the reactively-subscribed
 * values so rows re-render when a fresh read lands.
 */
export function goalCurrent(
  goal: WeeklyGoal,
  tracked: TrackedMap = useHealthStore.getState().snapshot.tracked,
  activities: ActivitySummary[] = useHealthStore.getState().snapshot.activities,
  energy: DailyEnergy[] = currentWeekEnergy(),
): number {
  if (goal.match) {
    return countMatchingSessions(activities, goal.match, goal.minDurationMin);
  }
  if (goal.metric === 'deficit') return weeklyDeficitAvg(energy);
  if (goal.source) return tracked[goal.source] ?? 0;
  return 0;
}

/** Fractional progress toward the goal's target, clamped to [0, 1]. Deficit
 * goals can run a surplus (negative current); the lower clamp keeps the bar at
 * 0 rather than a negative width. */
export function goalProgress(
  goal: WeeklyGoal,
  tracked?: TrackedMap,
  activities?: ActivitySummary[],
  energy?: DailyEnergy[],
): number {
  if (goal.target <= 0) return 0;
  const frac = goalCurrent(goal, tracked, activities, energy) / goal.target;
  return Math.max(0, Math.min(frac, 1));
}

export function isGoalComplete(
  goal: WeeklyGoal,
  tracked?: TrackedMap,
  activities?: ActivitySummary[],
  energy?: DailyEnergy[],
): boolean {
  return goalCurrent(goal, tracked, activities, energy) >= goal.target;
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
  if (goal.metric === 'deficit') return w.coverage.energy;
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
export function goalWeekly(
  goal: WeeklyGoal,
  history: GoalWeekData[],
): GoalWeek[] {
  return history.map(w => {
    const current = goal.match
      ? countMatchingSessions(w.activities, goal.match, goal.minDurationMin)
      : goal.metric === 'deficit'
        ? weeklyDeficitAvg(w.energy)
        : goal.source
          ? (w.tracked[goal.source] ?? 0)
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
