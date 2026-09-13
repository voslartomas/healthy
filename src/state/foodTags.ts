/**
 * Tags a user can put on a food they log — "this was junk", "this was booze".
 *
 * These are the app's own metadata, NOT health-platform data: Health Connect
 * and HealthKit have no free-form field on a nutrition record, so tags live in
 * our SQLite next to the entry's native id (see `db/foodTagsRepository`).
 *
 * They exist for the food habits ("No junk food", "No sweets"): a food habit
 * names one tag and is broken for the day the moment a food carrying it is
 * logged. Keep the list short — every tag is a promise the habit layer has to
 * be able to read back.
 */

export type FoodTagKey = 'junk' | 'alcohol' | 'sweets';

export interface FoodTagDef {
  key: FoodTagKey;
  /** Uppercase chip label, as in the design. */
  label: string;
}

export const FOOD_TAGS: readonly FoodTagDef[] = [
  { key: 'junk', label: 'JUNK FOOD' },
  { key: 'alcohol', label: 'ALCOHOL' },
  { key: 'sweets', label: 'SWEETS' },
] as const;

const BY_KEY = new Map(FOOD_TAGS.map(t => [t.key, t]));

export function foodTagLabel(key: FoodTagKey): string {
  return BY_KEY.get(key)?.label ?? key.toUpperCase();
}

/** Whether a string is one of our tag keys — used when reading back rows that
 * an older (or newer) build may have written. */
export function isFoodTagKey(value: string): value is FoodTagKey {
  return BY_KEY.has(value as FoodTagKey);
}

/** Parse the stored comma-separated column into known keys, dropping anything
 * unrecognised so one bad row can't break a habit evaluation. */
export function parseFoodTags(raw: string): FoodTagKey[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(isFoodTagKey);
}

/** "JUNK FOOD · ALCOHOL" — the suffix shown after a logged entry's name. */
export function foodTagsLabel(tags: readonly FoodTagKey[]): string {
  return tags.map(foodTagLabel).join(' · ');
}
