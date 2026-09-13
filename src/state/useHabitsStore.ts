import { create } from 'zustand';

import { HabitDayRow } from '../db/habitsRepository';
import { FoodTagRow } from '../db/foodTagsRepository';
import { HealthSnapshot } from '../health/types';
import {
  dayRange,
  dayRangeThrough,
  endOfWeek,
  evaluateHabit,
  Habit,
  HabitDayContext,
  HabitDayStatus,
  habitStreak,
  HabitWeek,
  habitWeeks,
  isHeld,
  prevDay,
  startOfDayMs,
} from './habits';
import { daysWithTag } from './useFoodTagsStore';

interface HabitsState {
  habits: Habit[];
  /** Explicitly resolved days, keyed `${habitId}:${dayStart}`. */
  days: Record<string, HabitDayStatus>;
  hydrated: boolean;
  setHabits: (habits: Habit[]) => void;
  setDays: (rows: HabitDayRow[]) => void;
  addHabitLocal: (habit: Habit) => void;
  updateHabitLocal: (habit: Habit) => void;
  removeHabitLocal: (id: string) => void;
  setDayLocal: (
    habitId: string,
    dayStart: number,
    status: HabitDayStatus,
  ) => void;
  clearDayLocal: (habitId: string, dayStart: number) => void;
}

export function dayKey(habitId: string, dayStart: number): string {
  return `${habitId}:${dayStart}`;
}

/**
 * In-memory source of truth for habits. `habitsService` keeps it in sync with
 * SQLite; every derived figure (today's status, the streak, the 12-week grid)
 * is computed from here by the pure helpers in `./habits`, so nothing derived is
 * ever stored and the surfaces can't drift apart.
 */
export const useHabitsStore = create<HabitsState>(set => ({
  habits: [],
  days: {},
  hydrated: false,
  setHabits: habits => set({ habits, hydrated: true }),
  setDays: rows =>
    set(() => {
      const days: Record<string, HabitDayStatus> = {};
      for (const r of rows) days[dayKey(r.habitId, r.dayStart)] = r.status;
      return { days };
    }),
  addHabitLocal: habit => set(state => ({ habits: [...state.habits, habit] })),
  updateHabitLocal: habit =>
    set(state => ({
      habits: state.habits.map(h => (h.id === habit.id ? habit : h)),
    })),
  removeHabitLocal: id =>
    set(state => {
      const days = { ...state.days };
      for (const key of Object.keys(days)) {
        if (key.startsWith(`${id}:`)) delete days[key];
      }
      return { habits: state.habits.filter(h => h.id !== id), days };
    }),
  setDayLocal: (habitId, dayStart, status) =>
    set(state => ({
      days: { ...state.days, [dayKey(habitId, dayStart)]: status },
    })),
  clearDayLocal: (habitId, dayStart) =>
    set(state => {
      const days = { ...state.days };
      delete days[dayKey(habitId, dayStart)];
      return { days };
    }),
}));

/** How many days of habit history the app evaluates and shows (12 weeks). */
export const HABIT_WINDOW_DAYS = 12 * 7;

/**
 * Sleep onsets keyed by the local day the night belongs to.
 *
 * `snapshot.sleepNights` reaches as far back as the read does, so a sleep habit
 * scores its real history from the moment it is created rather than starting
 * blank. Nights older than the read window come from the `habit_days` rows the
 * app froze at the time (see `habitsService.recordSleepOutcomes`), which is what
 * keeps the 12-week grid honest once the platform stops handing those nights
 * back.
 */
export function sleepOnsetsFromSnapshot(
  snapshot: HealthSnapshot,
): Map<number, number> {
  const onsets = new Map<number, number>();
  for (const night of snapshot.sleepNights ?? []) {
    onsets.set(startOfDayMs(night.day), night.onset);
  }
  // A snapshot cached by an earlier build has no `sleepNights`; last night's
  // session is still there, so at least that one night keeps working. It is
  // keyed to the day the night BEGAN on — the evening before the morning it
  // ended — to match `sleepNights`.
  const sleep = snapshot.sleep;
  if (onsets.size === 0 && sleep && sleep.lastSessionStart != null) {
    onsets.set(
      prevDay(startOfDayMs(sleep.lastSessionEnd)),
      sleep.lastSessionStart,
    );
  }
  return onsets;
}

/** Everything one habit's evaluation reads, assembled from the live stores. */
export function habitContext(
  habit: Habit,
  opts: {
    days: Record<string, HabitDayStatus>;
    tagRows: FoodTagRow[];
    sleepOnset: Map<number, number>;
    now: number;
  },
): HabitDayContext {
  const recorded = new Map<number, HabitDayStatus>();
  const prefix = `${habit.id}:`;
  for (const [key, status] of Object.entries(opts.days)) {
    if (key.startsWith(prefix)) {
      recorded.set(Number(key.slice(prefix.length)), status);
    }
  }
  return {
    today: startOfDayMs(opts.now),
    now: opts.now,
    recorded,
    tagDays: habit.tag
      ? daysWithTag(opts.tagRows, habit.tag)
      : new Set<number>(),
    sleepOnset: opts.sleepOnset,
  };
}

/** One cell of the Today card's Mon→Sun strip. */
export interface HabitDay {
  dayStart: number;
  status: HabitDayStatus;
  /** True for a day later this week — not tappable, nothing to say yet. */
  future: boolean;
  /** True for today, which the strip outlines. */
  isToday: boolean;
}

export interface HabitView {
  habit: Habit;
  /** Day starts for the evaluated window, oldest first. Runs from the start of
   * the 12-week window through the END of the current week, so the Today strip
   * can show every day Mon→Sun the way the weekly goals do. */
  days: number[];
  statuses: HabitDayStatus[];
  /** Where today sits in `days` / `statuses`. */
  todayIndex: number;
  /** Today's status. */
  today: HabitDayStatus;
  streak: number;
  weeks: HabitWeek[];
  /** The current week, Monday → Sunday. */
  week: HabitDay[];
}

/**
 * Evaluate every habit over the 12-week window in one pass. Returns the same
 * shape the Today strip, the catch-up card and the Trends grid all read, so a
 * change to the rules lands everywhere at once.
 */
export function buildHabitViews(opts: {
  habits: Habit[];
  days: Record<string, HabitDayStatus>;
  tagRows: FoodTagRow[];
  sleepOnset: Map<number, number>;
  now: number;
}): HabitView[] {
  const today = startOfDayMs(opts.now);
  const windowStart = dayRange(today, HABIT_WINDOW_DAYS)[0];
  // Run the window past today to Sunday so the Today strip has a cell for every
  // day of the week; days after today evaluate to 'future' on their own.
  const range = dayRangeThrough(windowStart, endOfWeek(today));
  const todayIndex = range.indexOf(today);
  return opts.habits.map(habit => {
    const ctx = habitContext(habit, opts);
    const statuses = evaluateHabit(habit, range, ctx);
    const week: HabitDay[] = range.slice(-7).map((dayStart, i) => ({
      dayStart,
      status: statuses[statuses.length - 7 + i],
      future: dayStart > today,
      isToday: dayStart === today,
    }));
    return {
      habit,
      days: range,
      statuses,
      todayIndex,
      today: statuses[todayIndex],
      streak: habitStreak(range, statuses, todayIndex),
      weeks: habitWeeks(range, statuses, today),
      week,
    };
  });
}

/** How many of today's habits are already held — the card's "THU · 2 OF 3". */
export function heldTodayCount(views: HabitView[]): number {
  return views.filter(v => isHeld(v.today)).length;
}

/**
 * The first habit whose YESTERDAY is still open, for the catch-up card. Only
 * manual habits can be in that state, and only before the noon cut-off.
 */
export function openYesterday(views: HabitView[]): HabitView | null {
  return views.find(v => v.statuses[v.todayIndex - 1] === 'open') ?? null;
}
