import { RawHealthData } from '../health/types';
import { getDb } from './database';

/**
 * A single-row cache of the last DEEP (full-history) Health Connect read, stored
 * as JSON. It lets the app open instantly with the previous snapshot and, on a
 * routine refresh, fetch only the recent slice and splice it onto this cached
 * history instead of re-paginating 12 weeks of exercise + calories every time.
 *
 * This is a performance cache, not a source of truth — it is always safe to drop
 * (the next full read rebuilds it) and is never merged blindly: the recent read
 * is authoritative for its window (see {@link ../health/derive.mergeRaw}).
 */

/**
 * Bump when a change makes previously-cached history the wrong SHAPE or SPAN for
 * what the app now shows — not for ordinary derivation tweaks, which re-derive
 * from the same raw records anyway. A mismatch reads as a cache miss, so the
 * next launch does one foreground deep read and rebuilds.
 *
 * 2: the deep read widened to 180 days of daily metrics / 90 days of HRV for the
 *    Trends 30/90/180 ranges. A v1 blob only holds 30 days, and nothing would
 *    have refetched it until the 12-hour staleness timer happened to fire — so
 *    the longer ranges would have kept redrawing the same 30-day graph.
 */
const CACHE_VERSION = 2;

interface CacheRow {
  raw: string;
  updated_at: number;
}

/** What we actually store: the read, tagged with the version that wrote it. */
interface CacheBlob {
  v: number;
  raw: RawHealthData;
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
    const blob = JSON.parse(row.raw) as Partial<CacheBlob>;
    // A v1 blob is a bare RawHealthData with no `v` — same treatment as a
    // version we no longer understand: miss, and let the next read rebuild.
    if (blob?.v !== CACHE_VERSION || !blob.raw) return null;
    return { raw: blob.raw, updatedAt: row.updated_at };
  } catch (err) {
    // Corrupt blob — treat as a cache miss so the next read rebuilds it.
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
    JSON.stringify({ v: CACHE_VERSION, raw } satisfies CacheBlob),
    updatedAt,
  );
}
