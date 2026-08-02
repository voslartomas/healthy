import { GoalSourceKey } from '../data/goalSources';
import { WeeklyGoal } from '../state/useGoalsStore';
import { getDb } from './database';

/**
 * Persistence for weekly goals. This is the single place that knows about the
 * SQLite schema; the rest of the app works with plain {@link WeeklyGoal}
 * objects. Swapping this file for a cloud-backed implementation is all it would
 * take to move goals off-device.
 */

interface GoalRow {
  id: string;
  source: string;
  name: string;
  target: number;
  match_field: string | null;
  match_value: string | null;
  min_duration_min: number | null;
  sort_order: number;
}

function rowToGoal(row: GoalRow): WeeklyGoal {
  const goal: WeeklyGoal = { id: row.id, name: row.name, target: row.target };
  if (row.match_field && row.match_value) {
    goal.match = {
      field: row.match_field === 'displayName' ? 'displayName' : 'type',
      value: row.match_value,
    };
    if (row.min_duration_min != null) goal.minDurationMin = row.min_duration_min;
  } else if (row.source) {
    goal.source = row.source as GoalSourceKey;
  }
  return goal;
}

/** Load all goals ordered by their saved position. */
export async function loadGoals(): Promise<WeeklyGoal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalRow>(
    'SELECT id, source, name, target, match_field, match_value, min_duration_min, sort_order FROM goals ORDER BY sort_order ASC, created_at ASC;',
  );
  return rows.map(rowToGoal);
}

/** Insert a new goal, appended after existing ones. */
export async function insertGoal(goal: WeeklyGoal): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const order = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM goals;',
  );
  await db.runAsync(
    `INSERT INTO goals
       (id, source, name, target, match_field, match_value, min_duration_min, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    goal.id,
    goal.source ?? '',
    goal.name,
    goal.target,
    goal.match?.field ?? null,
    goal.match?.value ?? null,
    goal.minDurationMin ?? null,
    order?.next ?? 0,
    now,
    now,
  );
}

/** Remove a goal by id. */
export async function deleteGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM goals WHERE id = ?;', id);
}
