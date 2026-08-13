import { getDb } from './database';

/**
 * Whole-database backup/restore for the app's LOCAL data.
 *
 * The app keeps its durable state — goals, calorie goals, per-goal weekly
 * history, common foods, per-day energy, coach conversations and the user
 * profile — in SQLite. This module serializes those tables to a plain JSON
 * document the user can save to their own cloud (Google Drive, Files, etc.) and
 * restore later or on a new device, so goals and other local data survive a
 * reinstall.
 *
 * Deliberately excluded: `health_cache`. That is a rebuildable performance cache
 * of a raw multi-week health read (large, and re-fetched from Health Connect /
 * HealthKit on next launch), not user-authored data — backing it up would bloat
 * the file for no benefit.
 */

/** Tables included in a backup, in a FK-safe restore order (none currently have
 * foreign keys, but keep parents-first as a habit). */
export const BACKUP_TABLES = [
  'profile',
  'goals',
  'calorie_goals',
  'goal_weeks',
  'common_foods',
  'daily_energy',
  'conversations',
] as const;

/** Bumped only if the backup envelope shape (not the table columns) changes. */
export const BACKUP_SCHEMA = 1;

export interface BackupData {
  /** Marker so we only ever import our own files. */
  app: 'healthy';
  schema: number;
  /** Epoch ms the backup was taken. */
  exportedAt: number;
  /** One array of row objects per {@link BACKUP_TABLES} entry. */
  tables: Record<string, Record<string, unknown>[]>;
}

/** Read every backed-up table into a serializable envelope. */
export async function exportBackup(now: number): Promise<BackupData> {
  const db = await getDb();
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) {
    // Table names come from the fixed const list above — never user input.
    tables[t] = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${t};`,
    );
  }
  return { app: 'healthy', schema: BACKUP_SCHEMA, exportedAt: now, tables };
}

/** Structural guard: a parsed JSON blob is one of our backups. */
export function isBackupData(x: unknown): x is BackupData {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.app === 'healthy' &&
    typeof o.tables === 'object' &&
    o.tables !== null &&
    typeof o.exportedAt === 'number'
  );
}

/**
 * Replace the contents of the backed-up tables with the backup's rows, in one
 * transaction (all-or-nothing — a malformed row rolls the whole restore back so
 * we never end up half-imported). Only the known {@link BACKUP_TABLES} are
 * touched; unknown keys in the file are ignored. Column names come from the
 * backup rows and are inserted into fixed, known tables, so a row with an
 * unexpected column simply fails the INSERT and aborts the transaction.
 */
export async function importBackup(data: BackupData): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of BACKUP_TABLES) {
      const rows = data.tables[t];
      if (!Array.isArray(rows)) continue; // table absent in this backup — leave it
      await db.runAsync(`DELETE FROM ${t};`);
      for (const row of rows) {
        const cols = Object.keys(row);
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map(cName => row[cName] as SqlValue);
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders});`,
          ...values,
        );
      }
    }
  });
}

type SqlValue = string | number | null;
