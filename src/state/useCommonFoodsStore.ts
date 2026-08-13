import { create } from 'zustand';

/**
 * A food the user saved for quick re-logging ("common foods"). Macros are
 * optional — a calorie-only favourite is valid. Progress/logging is not stored
 * here; tapping one creates a fresh nutrition entry via the health store.
 */
export interface CommonFood {
  id: string;
  name: string;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  mealType?: string | null;
  /**
   * The reference portion the kcal/macros above describe — e.g. 100 (g) or 1
   * (piece). Logging scales every value by chosenAmount / servingSize. Null
   * means "1 serving" (an unscaled favourite).
   */
  servingSize?: number | null;
  /** Unit for {@link servingSize}: 'g', 'ml', 'piece', 'serving', … */
  servingUnit?: string | null;
}

interface CommonFoodsState {
  foods: CommonFood[];
  /** True once foods have been loaded from the database. */
  hydrated: boolean;
  /** Replace the whole list (used on hydration from SQLite). */
  setFoods: (foods: CommonFood[]) => void;
  /** Append a food to the in-memory list. */
  addFoodLocal: (food: CommonFood) => void;
  /** Replace a food in the in-memory list, matched by id. */
  updateFoodLocal: (food: CommonFood) => void;
  /** Remove a food from the in-memory list. */
  removeFoodLocal: (id: string) => void;
}

/**
 * In-memory source of truth for the UI. The commonFoodsService layer keeps this
 * in sync with SQLite; reducers stay pure/synchronous so they are trivially
 * testable without a native database.
 */
export const useCommonFoodsStore = create<CommonFoodsState>(set => ({
  foods: [],
  hydrated: false,
  setFoods: foods => set({ foods, hydrated: true }),
  addFoodLocal: food => set(state => ({ foods: [...state.foods, food] })),
  updateFoodLocal: food =>
    set(state => ({
      foods: state.foods.map(f => (f.id === food.id ? food : f)),
    })),
  removeFoodLocal: id =>
    set(state => ({ foods: state.foods.filter(f => f.id !== id) })),
}));
