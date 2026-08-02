import { CalorieGoal } from '../state/useCalorieGoalsStore';
import { getDb } from './database';

/**
 * Persistence for the dated calorie-goal history (the `calorie_goals` table).
 * The single place that knows this schema; callers work with plain
 * {@link CalorieGoal} objects.
 */

interface CalorieGoalRow {
  id: string;
  effective_from: number;
  target_net: number;
}

function rowToGoal(row: CalorieGoalRow): CalorieGoal {
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    targetNet: row.target_net,
  };
}

/** Load all calorie goals, oldest effective date first. */
export async function loadCalorieGoals(): Promise<CalorieGoal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CalorieGoalRow>(
    'SELECT id, effective_from, target_net FROM calorie_goals ORDER BY effective_from ASC;',
  );
  return rows.map(rowToGoal);
}

/** Insert a calorie goal. */
export async function insertCalorieGoal(goal: CalorieGoal): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO calorie_goals (id, effective_from, target_net, created_at)
     VALUES (?, ?, ?, ?);`,
    goal.id,
    goal.effectiveFrom,
    goal.targetNet,
    Date.now(),
  );
}

/** Remove a calorie goal by id. */
export async function deleteCalorieGoal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM calorie_goals WHERE id = ?;', id);
}
