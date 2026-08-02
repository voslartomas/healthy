import { create } from 'zustand';

import { DailyEnergy } from '../health';

/**
 * Dated calorie-goal history. A goal is a net daily kcal target that takes
 * effect from a date and stays in force until a newer goal supersedes it, so
 * the user can change targets over time and review past goals. Negative target
 * = deficit, positive = surplus.
 */

export interface CalorieGoal {
  id: string;
  /** Epoch ms (local midnight) of the date this goal takes effect. */
  effectiveFrom: number;
  /** Net daily kcal target. Negative = deficit, positive = surplus. */
  targetNet: number;
}

interface CalorieGoalsState {
  goals: CalorieGoal[];
  hydrated: boolean;
  /** Replace the whole list (used on hydration from SQLite). */
  setGoals: (goals: CalorieGoal[]) => void;
  addGoalLocal: (goal: CalorieGoal) => void;
  removeGoalLocal: (id: string) => void;
}

export const useCalorieGoalsStore = create<CalorieGoalsState>(set => ({
  goals: [],
  hydrated: false,
  setGoals: goals => set({ goals, hydrated: true }),
  addGoalLocal: goal =>
    set(state => ({ goals: [...state.goals, goal] })),
  removeGoalLocal: id =>
    set(state => ({ goals: state.goals.filter(g => g.id !== id) })),
}));

/** The goal in force at `now`: the most recent one effective on or before it. */
export function currentCalorieGoal(
  goals: CalorieGoal[],
  now: number,
): CalorieGoal | null {
  let best: CalorieGoal | null = null;
  for (const g of goals) {
    if (g.effectiveFrom <= now && (!best || g.effectiveFrom > best.effectiveFrom)) {
      best = g;
    }
  }
  return best;
}

/** The goal in force right now. Wraps the clock read so callers (render code)
 * don't invoke `Date.now()` directly. */
export function activeCalorieGoal(goals: CalorieGoal[]): CalorieGoal | null {
  return currentCalorieGoal(goals, Date.now());
}

/**
 * Did `net` meet `target`? A deficit target (negative) is hit when net is at or
 * below it (as much deficit or more); a surplus target (positive) is hit when
 * net is at or above it. A zero target is hit at exactly maintenance.
 */
export function isCalorieGoalHit(target: number, net: number): boolean {
  return target <= 0 ? net <= target : net >= target;
}

/** One day joined with the goal in force that day and whether it was hit. */
export interface DayAdherence {
  dayStart: number;
  net: number | null;
  target: number | null;
  hit: boolean | null;
}

/** Join each day's net with the calorie goal in force that day. */
export function adherenceSeries(
  goals: CalorieGoal[],
  daily: DailyEnergy[],
): DayAdherence[] {
  return daily.map(d => {
    const target = currentCalorieGoal(goals, d.dayStart)?.targetNet ?? null;
    const hit =
      d.net != null && target != null ? isCalorieGoalHit(target, d.net) : null;
    return { dayStart: d.dayStart, net: d.net, target, hit };
  });
}

export interface AdherenceSummary {
  /** Days with both a net and a target (i.e. judgeable). */
  daysWithData: number;
  daysHit: number;
  /** % of judgeable days that hit the goal, or null when none are judgeable. */
  adherencePct: number | null;
  /** Mean net over judgeable days, or null. */
  avgNet: number | null;
}

/** Aggregate an adherence series into headline numbers. */
export function adherenceSummary(series: DayAdherence[]): AdherenceSummary {
  const judged = series.filter(d => d.hit != null && d.net != null);
  const daysWithData = judged.length;
  const daysHit = judged.filter(d => d.hit).length;
  return {
    daysWithData,
    daysHit,
    adherencePct:
      daysWithData > 0 ? Math.round((daysHit / daysWithData) * 100) : null,
    avgNet:
      daysWithData > 0
        ? Math.round(
            judged.reduce((s, d) => s + (d.net ?? 0), 0) / daysWithData,
          )
        : null,
  };
}

export interface WeekAdherence {
  weekStart: number;
  summary: AdherenceSummary;
}

/** Group an (oldest-first) adherence series into 7-day weeks. */
export function weeklyAdherence(series: DayAdherence[]): WeekAdherence[] {
  const weeks: WeekAdherence[] = [];
  for (let i = 0; i < series.length; i += 7) {
    const chunk = series.slice(i, i + 7);
    if (chunk.length > 0) {
      weeks.push({
        weekStart: chunk[0].dayStart,
        summary: adherenceSummary(chunk),
      });
    }
  }
  return weeks;
}
