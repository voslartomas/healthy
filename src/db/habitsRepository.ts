import { FoodTagKey, isFoodTagKey } from '../state/foodTags';
import {
  Habit,
  HabitAllowance,
  HabitDayStatus,
  HabitType,
} from '../state/habits';
import { getDb } from './database';

/**
 * Persistence for daily habits and the days that were explicitly resolved.
 *
 * Two tables, because they answer different questions:
 *   • `habits` — the definitions (name, kind, allowance).
 *   • `habit_days` — the days we cannot re-derive later. A user's manual check
 *     is one; so is a sleep outcome, because a night's onset is only readable
 *     from the health snapshot for a short window, and once it has rolled out of
 *     that window the only record of whether the habit held is the one we wrote.
 *     Food outcomes are NOT stored — they re-derive from the `food_tags` rows,
 *     which means retagging or deleting a meal corrects the history.
 */

interface HabitRow {
  id: string;
  name: string;
  type: string;
  auto: number;
  allowance: string;
  tag: string | null;
  before_time: string | null;
  sort_order: number;
  created_at: number;
}

const TYPES: HabitType[] = ['food', 'sleep', 'other'];
const ALLOWANCE_KEYS: HabitAllowance[] = ['never', 'week', 'month', 'month2'];

function rowToHabit(r: HabitRow): Habit {
  const type: HabitType = TYPES.includes(r.type as HabitType)
    ? (r.type as HabitType)
    : 'other';
  const allowance: HabitAllowance = ALLOWANCE_KEYS.includes(
    r.allowance as HabitAllowance,
  )
    ? (r.allowance as HabitAllowance)
    : 'never';
  const habit: Habit = {
    id: r.id,
    name: r.name,
    type,
    auto: r.auto !== 0,
    allowance,
    createdAt: r.created_at,
  };
  if (r.tag && isFoodTagKey(r.tag)) habit.tag = r.tag as FoodTagKey;
  if (r.before_time) habit.before = r.before_time;
  return habit;
}

/** Load all habits in their saved order. */
export async function loadHabits(): Promise<Habit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HabitRow>(
    'SELECT id, name, type, auto, allowance, tag, before_time, sort_order, created_at FROM habits ORDER BY sort_order ASC, created_at ASC;',
  );
  return rows.map(rowToHabit);
}

/** Insert a new habit, appended after existing ones. */
export async function insertHabit(habit: Habit): Promise<void> {
  const db = await getDb();
  const order = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM habits;',
  );
  await db.runAsync(
    `INSERT INTO habits
       (id, name, type, auto, allowance, tag, before_time, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    habit.id,
    habit.name,
    habit.type,
    habit.auto ? 1 : 0,
    habit.allowance,
    habit.tag ?? null,
    habit.before ?? null,
    order?.next ?? 0,
    habit.createdAt,
    Date.now(),
  );
}

/** Overwrite a habit's definition (its id, order and creation time are kept). */
export async function updateHabit(habit: Habit): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE habits
        SET name = ?, type = ?, auto = ?, allowance = ?, tag = ?, before_time = ?, updated_at = ?
      WHERE id = ?;`,
    habit.name,
    habit.type,
    habit.auto ? 1 : 0,
    habit.allowance,
    habit.tag ?? null,
    habit.before ?? null,
    Date.now(),
    habit.id,
  );
}

/** Remove a habit and every day recorded against it. */
export async function deleteHabit(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM habit_days WHERE habit_id = ?;', id);
  await db.runAsync('DELETE FROM habits WHERE id = ?;', id);
}

export interface HabitDayRow {
  habitId: string;
  dayStart: number;
  status: HabitDayStatus;
}

/** Load recorded days from `since` (a local day start) onward. */
export async function loadHabitDays(since: number): Promise<HabitDayRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    habit_id: string;
    day_start: number;
    status: string;
  }>(
    'SELECT habit_id, day_start, status FROM habit_days WHERE day_start >= ?;',
    since,
  );
  return rows.map(r => ({
    habitId: r.habit_id,
    dayStart: r.day_start,
    status: r.status as HabitDayStatus,
  }));
}

/** Record (or overwrite) one day's resolved status. */
export async function setHabitDay(row: HabitDayRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO habit_days (habit_id, day_start, status, updated_at) VALUES (?, ?, ?, ?);',
    row.habitId,
    row.dayStart,
    row.status,
    Date.now(),
  );
}

/** Drop a recorded day, returning it to whatever the data says (used when the
 * user un-checks a manual habit). */
export async function clearHabitDay(
  habitId: string,
  dayStart: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM habit_days WHERE habit_id = ? AND day_start = ?;',
    habitId,
    dayStart,
  );
}

/** Drop recorded days older than `before` — the history grid only shows 12
 * weeks, so nothing older has a reader. */
export async function pruneHabitDays(before: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM habit_days WHERE day_start < ?;', before);
}
