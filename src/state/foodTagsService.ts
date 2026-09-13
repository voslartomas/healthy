import {
  deleteFoodTagsForEntry,
  FoodTagRow,
  insertFoodTags,
  loadFoodTags,
  pruneFoodTags,
} from '../db/foodTagsRepository';
import { startOfLocalDay } from '../health';
import { FoodTagKey } from './foodTags';
import { DAY_MS } from './habits';
import { useFoodTagsStore } from './useFoodTagsStore';

/**
 * Orchestration between the food-tag store (in-memory, for the UI) and SQLite.
 *
 * The retained window matches what the Trends grid shows — 12 weeks — so the
 * table stays tiny and the habit history can still be re-derived across it.
 */

export const TAG_WINDOW_DAYS = 12 * 7;

let idCounter = 0;

function newId(): string {
  idCounter += 1;
  return `ft_${Date.now().toString(36)}_${idCounter}`;
}

function windowStart(now: number = Date.now()): number {
  return startOfLocalDay(now) - (TAG_WINDOW_DAYS - 1) * DAY_MS;
}

/** Load the recent tag rows into the store, dropping anything older than the
 * 12-week window first. Call once on app start. */
export async function initFoodTags(): Promise<void> {
  const since = windowStart();
  await pruneFoodTags(since);
  useFoodTagsStore.getState().setRows(await loadFoodTags(since));
}

/**
 * Record the tags on a food that was just logged.
 *
 * `entryId` is the platform's record id when the write returned one; it is what
 * lets the Fuel list show the tag next to that entry. Even without it the row
 * still counts toward the day, which is all the habits need.
 */
export async function tagLoggedFood(input: {
  name: string;
  tags: FoodTagKey[];
  entryId?: string | null;
  at?: number;
}): Promise<void> {
  if (input.tags.length === 0) return;
  const at = input.at ?? Date.now();
  const row: FoodTagRow = {
    id: newId(),
    entryId: input.entryId ?? null,
    dayStart: startOfLocalDay(at),
    name: input.name,
    tags: input.tags,
    loggedAt: at,
  };
  await insertFoodTags(row);
  useFoodTagsStore.getState().addRowLocal(row);
}

/** Forget the tags on a food the user deleted from the log. */
export async function untagFood(entryId: string): Promise<void> {
  await deleteFoodTagsForEntry(entryId);
  useFoodTagsStore.getState().removeByEntryLocal(entryId);
}
