import {
  clearHabitDay,
  deleteHabit,
  insertHabit,
  loadHabitDays,
  loadHabits,
  pruneHabitDays,
  setHabitDay,
  updateHabit,
} from '../db/habitsRepository';
import { startOfLocalDay } from '../health';
import {
  bedtimeDeadline,
  DAY_MS,
  Habit,
  HabitAllowance,
  HabitDayStatus,
  HabitType,
  isHeld,
} from './habits';
import { FoodTagKey } from './foodTags';
import { useFoodTagsStore } from './useFoodTagsStore';
import {
  buildHabitViews,
  dayKey,
  HABIT_WINDOW_DAYS,
  sleepOnsetsFromSnapshot,
  useHabitsStore,
} from './useHabitsStore';
import { useHealthStore } from './useHealthStore';

/**
 * Orchestration between the habits store (in-memory, for the UI) and SQLite.
 * UI code calls these thunks instead of touching either layer, so every
 * mutation is persisted and reflected immediately.
 */

let idCounter = 0;

function newId(): string {
  idCounter += 1;
  return `h_${Date.now().toString(36)}_${idCounter}`;
}

function windowStart(now: number = Date.now()): number {
  return startOfLocalDay(now) - (HABIT_WINDOW_DAYS - 1) * DAY_MS;
}

/** Load persisted habits and their recorded days. Call once on app start. */
export async function initHabits(): Promise<void> {
  const since = windowStart();
  await pruneHabitDays(since);
  const [habits, days] = await Promise.all([
    loadHabits(),
    loadHabitDays(since),
  ]);
  const store = useHabitsStore.getState();
  store.setHabits(habits);
  store.setDays(days);
}

export interface NewHabitInput {
  name: string;
  type: HabitType;
  auto: boolean;
  allowance: HabitAllowance;
  /** Food habits only. */
  tag?: FoodTagKey;
  /** Sleep habits only, e.g. "23:00". */
  before?: string;
}

/** Normalise a draft: only the fields that kind of habit actually uses are kept,
 * and the "who decides" flag is forced where the kind leaves no choice. */
function normalize(input: NewHabitInput): Omit<Habit, 'id' | 'createdAt'> {
  const type = input.type;
  const auto = type === 'sleep' ? true : type === 'other' ? false : input.auto;
  const habit: Omit<Habit, 'id' | 'createdAt'> = {
    name: input.name,
    type,
    auto,
    allowance: input.allowance,
  };
  if (type === 'food' && auto) habit.tag = input.tag ?? 'junk';
  if (type === 'sleep') habit.before = input.before ?? '23:00';
  return habit;
}

/** Create a habit: write-through to SQLite, then update the store. */
export async function createHabit(input: NewHabitInput): Promise<Habit> {
  const habit: Habit = {
    id: newId(),
    createdAt: Date.now(),
    ...normalize(input),
  };
  await insertHabit(habit);
  useHabitsStore.getState().addHabitLocal(habit);
  return habit;
}

/** Edit a habit in place, keeping its id and creation time (and so its history). */
export async function editHabit(
  id: string,
  input: NewHabitInput,
): Promise<void> {
  const existing = useHabitsStore.getState().habits.find(h => h.id === id);
  if (!existing) return;
  const habit: Habit = {
    id,
    createdAt: existing.createdAt,
    ...normalize(input),
  };
  await updateHabit(habit);
  useHabitsStore.getState().updateHabitLocal(habit);
}

/** Delete a habit and every day recorded against it. */
export async function removeHabit(id: string): Promise<void> {
  await deleteHabit(id);
  useHabitsStore.getState().removeHabitLocal(id);
}

/**
 * Check or un-check one day of a habit.
 *
 * Checking writes a 'held' row; un-checking deletes it, which returns the day to
 * whatever the data says (for an auto food habit that may be 'auto' again).
 */
export async function setHabitChecked(
  habitId: string,
  dayStart: number,
  checked: boolean,
): Promise<void> {
  const store = useHabitsStore.getState();
  if (checked) {
    store.setDayLocal(habitId, dayStart, 'held');
    await setHabitDay({ habitId, dayStart, status: 'held' });
  } else {
    store.clearDayLocal(habitId, dayStart);
    await clearHabitDay(habitId, dayStart);
  }
}

/**
 * Flip one day of a habit between held and broken — the week strip's tap.
 *
 * Which of the three writes it is depends on where the day's current status
 * came from, so a tap always means "this is what actually happened":
 *   • a check the user placed → clear it, handing the day back to the data;
 *   • a day the DATA called held → record an explicit miss, because the user is
 *     telling us something the log never saw;
 *   • anything else → record a check.
 */
export async function toggleHabitDay(
  habitId: string,
  dayStart: number,
  status: HabitDayStatus,
): Promise<void> {
  if (status === 'held') return setHabitChecked(habitId, dayStart, false);
  if (isHeld(status)) {
    useHabitsStore.getState().setDayLocal(habitId, dayStart, 'miss');
    await setHabitDay({ habitId, dayStart, status: 'miss' });
    return;
  }
  return setHabitChecked(habitId, dayStart, true);
}

/**
 * Freeze the outcome of every sleep habit for every night we can currently read.
 *
 * The snapshot hands back each night in the read window with its onset, so this
 * back-fills a freshly created habit's history in one pass — the user sees weeks
 * of real nights immediately instead of an empty grid that fills a day at a time.
 *
 * It also has to keep running afterwards: a night eventually falls out of the
 * platform's window, and from then on the row written here is the only record
 * that the habit held. Nothing else is persisted — food outcomes re-derive from
 * the tag rows, so editing the food log corrects them.
 *
 * Days the user resolved by hand are never overwritten: an explicit check or
 * miss outranks what the sensor thought.
 */
export async function recordSleepOutcomes(): Promise<void> {
  const { habits, days } = useHabitsStore.getState();
  const sleepHabits = habits.filter(h => h.type === 'sleep' && h.before);
  if (sleepHabits.length === 0) return;

  const onsets = sleepOnsetsFromSnapshot(useHealthStore.getState().snapshot);
  if (onsets.size === 0) return;

  // Only the window the grid can show is worth storing; `initHabits` prunes to
  // the same bound on the way in.
  const oldest = windowStart();
  const store = useHabitsStore.getState();
  for (const habit of sleepHabits) {
    for (const [dayStart, onset] of onsets) {
      if (dayStart < oldest) continue;
      // Nights from before the habit existed are frozen too — that history is
      // real, and it is why the grid isn't blank on day one. What this must not
      // do is re-open a day the user already settled by hand.
      const recorded = days[dayKey(habit.id, dayStart)];
      if (recorded === 'held' || recorded === 'miss') continue;
      const deadline = bedtimeDeadline(dayStart, habit.before as string);
      if (deadline == null) continue;
      const status = onset <= deadline ? 'auto' : 'miss';
      if (recorded === status) continue;
      store.setDayLocal(habit.id, dayStart, status);
      await setHabitDay({ habitId: habit.id, dayStart, status });
    }
  }
}

/** The evaluated habits for right now, from the live stores. Used by the screens
 * and by the coach's data context. */
export function currentHabitViews(now: number = Date.now()) {
  const { habits, days } = useHabitsStore.getState();
  return buildHabitViews({
    habits,
    days,
    tagRows: useFoodTagsStore.getState().rows,
    sleepOnset: sleepOnsetsFromSnapshot(useHealthStore.getState().snapshot),
    now,
  });
}
