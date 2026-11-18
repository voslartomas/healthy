/**
 * Editing a food entry that is already in the health store.
 *
 * Health Connect / HealthKit have no in-place update we rely on, so an edit is
 * delete-the-old + write-the-new. Done naively that loses three things, each a
 * real bug before this module:
 *  - the TIME: a re-created entry defaulted to "now", so correcting breakfast at
 *    8 pm moved it into the evening (and into the wrong meal slot);
 *  - the MEAL TYPE, when the caller didn't pass one back;
 *  - the junk/alcohol/sweets TAGS, which are keyed by the entry's native id: the
 *    new record has a new id, so the food habits silently stopped seeing it.
 *
 * {@link replaceFoodEntry} keeps all three, and is the one path every editor
 * uses — the coach's `update_food_log` tool and the food editor sheet alike.
 * {@link deleteFoodEntry} is the matching delete: it drops the tags with the
 * entry (the coach's delete used to leave them, so a deleted junk meal kept
 * breaking the day's food habits).
 */

import { FoodEntryInput } from '../health';
import { tagLoggedFood, untagFood } from './foodTagsService';
import { tagsForEntry, useFoodTagsStore } from './useFoodTagsStore';
import { useHealthStore } from './useHealthStore';

export interface ReplaceResult {
  ok: boolean;
  /** The new record's id (the old one no longer exists). */
  id: string | null;
  error?: string;
}

/**
 * Replace entry `oldId` with `input`. The original time and meal type are kept
 * unless `input` sets them; tags move to the new id.
 */
export async function replaceFoodEntry(
  oldId: string,
  input: FoodEntryInput,
): Promise<ReplaceResult> {
  const store = useHealthStore.getState();
  const original = store.snapshot.nutrition?.meals.find(m => m.id === oldId);
  const tags = tagsForEntry(useFoodTagsStore.getState().rows, oldId);

  const next: FoodEntryInput = {
    ...input,
    at: input.at ?? original?.time,
    mealType: input.mealType ?? original?.mealType ?? undefined,
  };

  const removed = await store.removeFoodEntry(oldId);
  if (!removed) {
    return {
      ok: false,
      id: null,
      error:
        'Could not remove the old entry — it may no longer exist, or Health Connect is not connected.',
    };
  }
  const res = await store.logFoodEntry(next);
  if (!res.ok) {
    return {
      ok: false,
      id: null,
      error: `Removed the old entry but failed to write the corrected one${res.error ? ` (${res.error})` : ''}.`,
    };
  }
  const newId = res.name ?? null;
  if (tags.length > 0) {
    await tagLoggedFood({
      name: next.name,
      tags,
      entryId: newId,
      at: next.at,
    }).catch(err => console.warn('Failed to move food tags', err));
    await untagFood(oldId).catch(err =>
      console.warn('Failed to clear old food tags', err),
    );
  }
  return { ok: true, id: newId };
}

/** Delete entry `id` and its habit tags. True when the entry was removed. */
export async function deleteFoodEntry(id: string): Promise<boolean> {
  const ok = await useHealthStore.getState().removeFoodEntry(id);
  if (ok) {
    await untagFood(id).catch(err =>
      console.warn('Failed to clear food tags', err),
    );
  }
  return ok;
}
