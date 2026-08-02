import { getDb } from './database';

/**
 * Persistence for per-goal weekly attainment (the `goal_weeks` table). The live
 * health read only reaches ~14–30 days; persisting each completed week as we see
 * it lets goal history grow indefinitely past that window. One row per
 * (goal, week); `current`/`target` are frozen as of the last sync that saw the
 * week. Only *covered* weeks are ever written (see goalHistoryService), so a row
 * always represents real data, never a fabricated miss.
 */

export interface PersistedGoalWeek {
  goalId: string;
  /** UTC Monday 00:00 of the week. */
  weekStart: number;
  current: number;
  target: number;
}

interface GoalWeekRow {
  goal_id: string;
  week_start: number;
  current: number;
  target: number;
}

/** All persisted goal-weeks, oldest first. */
export async function loadGoalWeeks(): Promise<PersistedGoalWeek[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalWeekRow>(
    'SELECT goal_id, week_start, current, target FROM goal_weeks ORDER BY week_start ASC;',
  );
  return rows.map(r => ({
    goalId: r.goal_id,
    weekStart: r.week_start,
    current: r.current,
    target: r.target,
  }));
}

/** Upsert each (goal, week) by its composite key — idempotent, so a week is
 * rewritten as more of its data lands. */
export async function upsertGoalWeeks(
  weeks: PersistedGoalWeek[],
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  for (const w of weeks) {
    await db.runAsync(
      `INSERT INTO goal_weeks (goal_id, week_start, current, target, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(goal_id, week_start) DO UPDATE SET
         current = excluded.current,
         target = excluded.target,
         updated_at = excluded.updated_at;`,
      w.goalId,
      w.weekStart,
      w.current,
      w.target,
      now,
    );
  }
}

/** Drop all history for a goal (called when the goal is deleted). */
export async function deleteGoalWeeks(goalId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM goal_weeks WHERE goal_id = ?;', goalId);
}
