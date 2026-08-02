import { CommonFood } from '../state/useCommonFoodsStore';
import { getDb } from './database';

/**
 * Persistence for the user's saved "common foods". This is the single place
 * that knows the SQLite schema; the rest of the app works with plain
 * {@link CommonFood} objects.
 */

interface CommonFoodRow {
  id: string;
  name: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  meal_type: string | null;
}

function rowToFood(row: CommonFoodRow): CommonFood {
  return {
    id: row.id,
    name: row.name,
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    mealType: row.meal_type,
  };
}

/** Load all saved foods, newest first. */
export async function loadCommonFoods(): Promise<CommonFood[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CommonFoodRow>(
    'SELECT id, name, kcal, protein_g, carbs_g, fat_g, meal_type FROM common_foods ORDER BY sort_order DESC, created_at DESC;',
  );
  return rows.map(rowToFood);
}

/** Insert a new saved food, ordered ahead of existing ones. */
export async function insertCommonFood(food: CommonFood): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const order = await db.getFirstAsync<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM common_foods;',
  );
  await db.runAsync(
    `INSERT INTO common_foods
       (id, name, kcal, protein_g, carbs_g, fat_g, meal_type, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    food.id,
    food.name,
    food.kcal,
    food.proteinG ?? null,
    food.carbsG ?? null,
    food.fatG ?? null,
    food.mealType ?? null,
    order?.next ?? 0,
    now,
    now,
  );
}

/** Remove a saved food by id. */
export async function deleteCommonFood(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM common_foods WHERE id = ?;', id);
}
