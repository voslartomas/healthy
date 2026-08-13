import {
  deleteCommonFood,
  insertCommonFood,
  loadCommonFoods,
  updateCommonFood,
} from '../db/commonFoodsRepository';
import { CommonFood, useCommonFoodsStore } from './useCommonFoodsStore';

/**
 * Orchestration between the common-foods store (in-memory, for the UI) and the
 * SQLite repository (durable). UI/tool code calls these thunks instead of
 * touching either layer directly, so every mutation is persisted and reflected
 * immediately.
 */

let idCounter = 0;

/** Collision-resistant id without pulling in a uuid dependency. */
function newId(): string {
  idCounter += 1;
  return `cf_${Date.now().toString(36)}_${idCounter}`;
}

/** Load persisted common foods into the store. Call once on app start. */
export async function initCommonFoods(): Promise<void> {
  const foods = await loadCommonFoods();
  useCommonFoodsStore.getState().setFoods(foods);
}

export interface NewCommonFood {
  name: string;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  mealType?: string | null;
  servingSize?: number | null;
  servingUnit?: string | null;
}

/**
 * Save (or overwrite) a common food. If one with the same name already exists
 * (case-insensitive), it is replaced so saving the same food twice never
 * duplicates it. Write-through to SQLite, then update the store.
 */
export async function addCommonFood(input: NewCommonFood): Promise<CommonFood> {
  const name = input.name.trim();
  const existing = useCommonFoodsStore
    .getState()
    .foods.find(f => f.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) await removeCommonFood(existing.id);

  const food: CommonFood = {
    id: newId(),
    name,
    kcal: input.kcal,
    proteinG: input.proteinG ?? null,
    carbsG: input.carbsG ?? null,
    fatG: input.fatG ?? null,
    mealType: input.mealType ?? null,
    servingSize: input.servingSize ?? null,
    servingUnit: input.servingUnit ?? null,
  };
  await insertCommonFood(food);
  useCommonFoodsStore.getState().addFoodLocal(food);
  return food;
}

/**
 * Update a saved food in place by id. Preserves sort order and its position in
 * the list. Write-through to SQLite, then the store.
 */
export async function editCommonFood(
  id: string,
  input: NewCommonFood,
): Promise<CommonFood> {
  const food: CommonFood = {
    id,
    name: input.name.trim(),
    kcal: input.kcal,
    proteinG: input.proteinG ?? null,
    carbsG: input.carbsG ?? null,
    fatG: input.fatG ?? null,
    mealType: input.mealType ?? null,
    servingSize: input.servingSize ?? null,
    servingUnit: input.servingUnit ?? null,
  };
  await updateCommonFood(food);
  useCommonFoodsStore.getState().updateFoodLocal(food);
  return food;
}

/** Delete a saved food: remove from SQLite, then the store. */
export async function removeCommonFood(id: string): Promise<void> {
  await deleteCommonFood(id);
  useCommonFoodsStore.getState().removeFoodLocal(id);
}
