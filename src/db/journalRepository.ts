import { JournalDay, JournalTagKey, parseJournalTags } from '../state/journal';
import { getDb } from './database';

/**
 * Persistence for the journal (ADR-009): one row per local day, keyed by its
 * local midnight. The journal is the user's own writing, so unlike food tags
 * or habit days it is never pruned — and it is part of the backup.
 */

interface RawRow {
  day_start: number;
  tags: string;
  ended: string;
  note: string;
  updated_at: number;
}

function toDay(r: RawRow): JournalDay {
  return {
    day: r.day_start,
    tags: parseJournalTags(r.tags),
    ended: parseJournalTags(r.ended),
    note: r.note ?? '',
    updatedAt: r.updated_at,
  };
}

function join(keys: JournalTagKey[]): string {
  return keys.join(',');
}

/** Every entry, oldest first. Small by construction (one row per day). */
export async function loadJournal(): Promise<JournalDay[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<RawRow>(
    'SELECT day_start, tags, ended, note, updated_at FROM journal_days ORDER BY day_start ASC;',
  );
  return rows.map(toDay);
}

/** Insert or overwrite one day's entry (its creation time is kept). */
export async function upsertJournalDay(entry: JournalDay): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO journal_days (day_start, tags, ended, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(day_start) DO UPDATE SET
       tags = excluded.tags, ended = excluded.ended, note = excluded.note,
       updated_at = excluded.updated_at;`,
    entry.day,
    join(entry.tags),
    join(entry.ended),
    entry.note,
    entry.updatedAt,
    entry.updatedAt,
  );
}

/** Remove a day's entry (the user cleared everything on it). */
export async function deleteJournalDay(day: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM journal_days WHERE day_start = ?;', day);
}
