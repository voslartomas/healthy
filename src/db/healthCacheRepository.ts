import { RawHealthData } from '../health/types';
import { getDb } from './database';

/**
 * A single-row cache of the last DEEP (full-history) Google Health read, stored
 * as JSON. It lets the app open instantly with the previous snapshot and, on a
 * routine refresh, fetch only the recent slice and splice it onto this cached
 * history instead of re-paginating 12 weeks of exercise + calories every time.
 *
 * This is a performance cache, not a source of truth — it is always safe to drop
 * (the next full read rebuilds it) and is never merged blindly: the recent read
 * is authoritative for its window (see {@link ../health/derive.mergeRaw}).
 */

interface CacheRow {
  raw: string;
  updated_at: number;
}

export interface CachedRaw {
  raw: RawHealthData;
  updatedAt: number;
}

/** The cached deep-history read, or null when absent/unparseable. */
export async function loadHealthCache(): Promise<CachedRaw | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CacheRow>(
    'SELECT raw, updated_at FROM health_cache WHERE id = 1;',
  );
  if (!row) return null;
  try {
    return {
      raw: JSON.parse(row.raw) as RawHealthData,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    // Corrupt/legacy blob — treat as a cache miss so the next read rebuilds it.
    console.warn('Failed to parse health cache', err);
    return null;
  }
}

/** Persist the latest deep-history read as the cache (overwriting the prior). */
export async function saveHealthCache(
  raw: RawHealthData,
  updatedAt: number,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO health_cache (id, raw, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET raw = excluded.raw, updated_at = excluded.updated_at;`,
    JSON.stringify(raw),
    updatedAt,
  );
}
