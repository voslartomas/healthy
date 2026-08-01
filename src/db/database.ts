import * as SQLite from 'expo-sqlite';

/**
 * Local SQLite database for the Healthy app.
 *
 * Goals are stored here so they survive app restarts. The schema is kept
 * deliberately migration-friendly: every row carries `created_at` / `updated_at`
 * timestamps and a nullable `remote_id`, so a future release can add cloud sync
 * (or device-to-device migration) without a destructive schema change. See
 * docs/adr/002-local-database.md.
 */

const DB_NAME = 'healthy.db';

/** Bump this when adding a migration step below. */
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (once) and migrate the database. Safe to call repeatedly. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open();
  }
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  let version = row?.user_version ?? 0;

  // Migration 1: initial goals table.
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS goals (
        id         TEXT PRIMARY KEY NOT NULL,
        source     TEXT NOT NULL,
        name       TEXT NOT NULL,
        target     REAL NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        remote_id  TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    version = 1;
  }

  // Future migrations go here, each guarded by `if (version < N)`.

  if (version !== SCHEMA_VERSION) {
    version = SCHEMA_VERSION;
  }
  await db.execAsync(`PRAGMA user_version = ${version};`);
}

/** Test/tooling helper: drop the memoized handle so the next getDb re-opens. */
export function resetDbForTests(): void {
  dbPromise = null;
}
