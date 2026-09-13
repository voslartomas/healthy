import { FoodTagKey, parseFoodTags } from '../state/foodTags';
import { getDb } from './database';

/**
 * Persistence for food tags (junk / alcohol / sweets).
 *
 * The tagged food itself lives in Health Connect / HealthKit, which has no field
 * we could hang a tag on, so a tag row is our own record pointing at that entry:
 * `entry_id` is the platform's record id when the write returned one, and
 * `day_start` is the local midnight of the day it counts for — which is what the
 * food habits actually read ("was anything junk logged today?"), and which keeps
 * working even for an entry whose id we never learned.
 */

/** One tagged food log. */
export interface FoodTagRow {
  id: string;
  /** Native health-record id, when the platform returned one on write. */
  entryId: string | null;
  /** Local midnight of the day the food was logged for. */
  dayStart: number;
  name: string;
  tags: FoodTagKey[];
  loggedAt: number;
}

interface RawRow {
  id: string;
  entry_id: string | null;
  day_start: number;
  name: string;
  tags: string;
  logged_at: number;
}

function toRow(r: RawRow): FoodTagRow {
  return {
    id: r.id,
    entryId: r.entry_id,
    dayStart: r.day_start,
    name: r.name,
    tags: parseFoodTags(r.tags),
    loggedAt: r.logged_at,
  };
}

/** Load tag rows logged on or after `since` (epoch ms), oldest first. */
export async function loadFoodTags(since: number): Promise<FoodTagRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT id, entry_id, day_start, name, tags, logged_at FROM food_tags WHERE day_start >= ? ORDER BY logged_at ASC;',
    since,
  );
  return rows.map(toRow);
}

/** Record the tags on one logged food. */
export async function insertFoodTags(row: FoodTagRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO food_tags (id, entry_id, day_start, name, tags, logged_at) VALUES (?, ?, ?, ?, ?, ?);',
    row.id,
    row.entryId,
    row.dayStart,
    row.name,
    row.tags.join(','),
    row.loggedAt,
  );
}

/** Drop the tags for a health entry (the user deleted the food itself). */
export async function deleteFoodTagsForEntry(entryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_tags WHERE entry_id = ?;', entryId);
}

/** Drop tag rows older than `before`, so the table can't grow without bound.
 * The habit history only looks back 12 weeks. */
export async function pruneFoodTags(before: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM food_tags WHERE day_start < ?;', before);
}
