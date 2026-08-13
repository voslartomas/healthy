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

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (once) and ensure the schema. Safe to call repeatedly. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open();
  }
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await ensureSchema(db);
  return db;
}

/**
 * Ensure every table exists. Per the current dev workflow we skip versioned
 * migrations and just `CREATE TABLE IF NOT EXISTS` — edit these DDLs directly
 * when the schema changes. Revisit versioned migrations before ship.
 */
async function ensureSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS goals (
      id               TEXT PRIMARY KEY NOT NULL,
      source           TEXT NOT NULL,
      name             TEXT NOT NULL,
      target           REAL NOT NULL,
      match_field      TEXT,
      match_value      TEXT,
      min_duration_min REAL,
      metric           TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      remote_id        TEXT,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calorie_goals (
      id             TEXT PRIMARY KEY NOT NULL,
      effective_from INTEGER NOT NULL,
      target_net     REAL NOT NULL,
      created_at     INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_energy (
      day_start  INTEGER PRIMARY KEY NOT NULL,
      eaten      REAL,
      burned     REAL,
      net        REAL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goal_weeks (
      goal_id    TEXT NOT NULL,
      week_start INTEGER NOT NULL,
      current    REAL NOT NULL,
      target     REAL NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (goal_id, week_start)
    );
    CREATE TABLE IF NOT EXISTS health_cache (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      raw        TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS common_foods (
      id           TEXT PRIMARY KEY NOT NULL,
      name         TEXT NOT NULL,
      kcal         REAL NOT NULL,
      protein_g    REAL,
      carbs_g      REAL,
      fat_g        REAL,
      meal_type    TEXT,
      serving_size REAL,
      serving_unit TEXT,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY NOT NULL,
      title      TEXT NOT NULL,
      messages   TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      date_of_birth INTEGER,
      height_cm     REAL,
      weight_kg     REAL,
      sex           TEXT,
      updated_at    INTEGER NOT NULL
    );
  `);
  await ensureGoalColumns(db);
  await ensureCommonFoodColumns(db);
  await runMigrations(db);
}

/**
 * One-time data migrations keyed on SQLite's `PRAGMA user_version`. Each runs
 * once per device and bumps the version so it never repeats.
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const version = row?.user_version ?? 0;
  if (version < 1) {
    // v1: clear goal_weeks once. Early builds persisted fabricated "missed"
    // weeks for periods with no exercise data (coverage was assumed, not
    // data-driven). Wipe that legacy history so it rebuilds from covered weeks
    // only; real history re-accrues from the live reads.
    await db.execAsync('DELETE FROM goal_weeks;');
    await db.execAsync('PRAGMA user_version = 1;');
  }
  if (version < 2) {
    // v2: the health source switched from the Google Health cloud API to
    // on-device Health Connect / HealthKit. The cached RawHealthData from the
    // old source is stale and would paint on launch (before the first native
    // read lands), so drop it once — the native read repopulates the cache.
    await db.execAsync('DELETE FROM health_cache;');
    await db.execAsync('DELETE FROM daily_energy;');
    await db.execAsync('PRAGMA user_version = 2;');
  }
  if (version < 3) {
    // v3: finish the Google Health → Health Connect cutover. v2 dropped the raw
    // cache + daily energy, but the per-goal weekly attainment in `goal_weeks`
    // was still frozen from Google-era reads and never overwritten (syncGoalHistory
    // only upserts weeks it re-covers). That left the weekly-goals grid showing
    // stale cached numbers instead of current Health Connect data. Wipe it once;
    // it re-accrues from the live native reads (covered weeks only).
    await db.execAsync('DELETE FROM goal_weeks;');
    await db.execAsync('PRAGMA user_version = 3;');
  }
}

/**
 * Add columns introduced after the initial `goals` schema. `CREATE TABLE IF NOT
 * EXISTS` never alters an existing table, so a DB created by an earlier build is
 * missing the activity-goal columns; add them idempotently here. New installs
 * already have them from the DDL above, so each ALTER is guarded by a presence
 * check (SQLite has no `ADD COLUMN IF NOT EXISTS`).
 */
async function ensureGoalColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(goals);',
  );
  const have = new Set(cols.map(c => c.name));
  const additions: [string, string][] = [
    ['match_field', 'TEXT'],
    ['match_value', 'TEXT'],
    ['min_duration_min', 'REAL'],
    ['metric', 'TEXT'],
  ];
  for (const [name, type] of additions) {
    if (!have.has(name)) {
      await db.execAsync(`ALTER TABLE goals ADD COLUMN ${name} ${type};`);
    }
  }
}

/**
 * Add the portion columns introduced after the initial `common_foods` schema.
 * A DB created by an earlier build lacks `serving_size` / `serving_unit`; add
 * them idempotently (guarded, since SQLite has no `ADD COLUMN IF NOT EXISTS`).
 * New installs already have them from the DDL above.
 */
async function ensureCommonFoodColumns(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(
    'PRAGMA table_info(common_foods);',
  );
  const have = new Set(cols.map(c => c.name));
  const additions: [string, string][] = [
    ['serving_size', 'REAL'],
    ['serving_unit', 'TEXT'],
  ];
  for (const [name, type] of additions) {
    if (!have.has(name)) {
      await db.execAsync(
        `ALTER TABLE common_foods ADD COLUMN ${name} ${type};`,
      );
    }
  }
}

/** Test/tooling helper: drop the memoized handle so the next getDb re-opens. */
export function resetDbForTests(): void {
  dbPromise = null;
}
