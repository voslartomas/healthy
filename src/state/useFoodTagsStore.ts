import { create } from 'zustand';

import { FoodTagRow } from '../db/foodTagsRepository';
import { FoodTagKey } from './foodTags';

interface FoodTagsState {
  /** Recent tag rows (the last ~12 weeks), oldest first. */
  rows: FoodTagRow[];
  hydrated: boolean;
  setRows: (rows: FoodTagRow[]) => void;
  addRowLocal: (row: FoodTagRow) => void;
  removeByEntryLocal: (entryId: string) => void;
}

/**
 * In-memory mirror of the `food_tags` table. Small by construction (only foods
 * the user actually tagged, pruned to 12 weeks), so the whole window lives here
 * and both readers — the Fuel log list and the food habits — work off one copy.
 */
export const useFoodTagsStore = create<FoodTagsState>(set => ({
  rows: [],
  hydrated: false,
  setRows: rows => set({ rows, hydrated: true }),
  addRowLocal: row => set(state => ({ rows: [...state.rows, row] })),
  removeByEntryLocal: entryId =>
    set(state => ({ rows: state.rows.filter(r => r.entryId !== entryId) })),
}));

/** Tags on one health entry, by its native record id. */
export function tagsForEntry(
  rows: FoodTagRow[],
  entryId: string | null | undefined,
): FoodTagKey[] {
  if (!entryId) return [];
  const row = rows.find(r => r.entryId === entryId);
  return row ? row.tags : [];
}

/** The local day starts on which `tag` was logged at least once. */
export function daysWithTag(rows: FoodTagRow[], tag: FoodTagKey): Set<number> {
  const days = new Set<number>();
  for (const row of rows) {
    if (row.tags.includes(tag)) days.add(row.dayStart);
  }
  return days;
}
