import { FoodEntryInput, logFoodEntry } from '../health';
import { useHealthStore } from './useHealthStore';

/**
 * Log a whole meal — several foods that share one meal type (breakfast, lunch,
 * …) and timestamp — in one call. Each food becomes its own nutrition entry in
 * the OS store (Health Connect / HealthKit), exactly like a single quick-log,
 * but they all carry the same `mealType` + `at` so the day view groups them as
 * one meal. The health snapshot is refreshed once at the end rather than after
 * every item, unlike calling {@link useHealthStore.logFood} in a loop.
 */

/** One food line in a meal draft — a {@link FoodEntryInput} without the shared
 * meal-level fields (mealType/at), which the meal owns. */
export type MealItem = Omit<FoodEntryInput, 'mealType' | 'at'>;

export interface MealLogResult {
  /** True if at least one item was written. */
  ok: boolean;
  logged: number;
  failed: number;
}

/**
 * Write every item in `items` as a food entry tagged with `mealType` and timed
 * at `at` (defaults to now). Entries are spaced one second apart so the store
 * keeps their order. Refreshes the snapshot once if anything was written.
 */
export async function logMeal(
  items: MealItem[],
  mealType: string,
  at: number = Date.now(),
): Promise<MealLogResult> {
  let logged = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += 1) {
    // Keep every entry at or before `at` so a meal logged "now" never lands in
    // the future, while still spacing items so their order is preserved.
    const entryAt = at - (items.length - 1 - i) * 1000;
    const res = await logFoodEntry(
      { ...items[i], mealType, at: entryAt },
      entryAt,
    );
    if (res.ok) logged += 1;
    else failed += 1;
  }
  if (logged > 0) await useHealthStore.getState().refresh();
  return { ok: logged > 0, logged, failed };
}
