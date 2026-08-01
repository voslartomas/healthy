# ADR 002: Local database for goals (SQLite via expo-sqlite)

Date: 2026-08-01
Status: Accepted

## Context

HEA-14 introduces user-defined weekly goals that must survive app restarts.
The founder asked for "some local database — sqlite or similar — which can in
future releases be migrated to cloud, or used when a user migrates to a new
phone as part of the system's data migration."

Goals are structured, queryable records (source, name, target, ordering) that
will grow to relate to logged activities and progress history. That rules out a
flat key-value store (AsyncStorage/SecureStore) as the primary home.

## Decision

1. **`expo-sqlite`** is the local store. It ships with the Expo SDK, needs no
   custom native code, and works under Continuous Native Generation via its
   config plugin (added to `app.json`).
2. **A thin repository layer** (`src/db/goalsRepository.ts`) is the only module
   that knows SQL. The rest of the app works with plain `WeeklyGoal` objects.
   Swapping the repository for a cloud-backed implementation is therefore a
   one-file change.
3. **Migration-friendly schema.** Every row carries `created_at` / `updated_at`
   timestamps and a nullable `remote_id`. Schema evolution is gated on
   `PRAGMA user_version` with numbered, additive migration steps in
   `src/db/database.ts` — no destructive rebuilds.
4. **Store/DB split for testability.** `useGoalsStore` holds pure, synchronous
   reducers (the UI's source of truth). `goalsService` is the write-through glue
   that persists mutations and hydrates the store on startup. This keeps unit
   tests native-free (the repository is mocked).

## Consequences

- Auto-tracked _progress_ is derived from health data, not stored on the goal
  row, so the schema stays small and the eventual Health Connect / HealthKit
  integration (HEA-5) owns activity data separately.
- Cloud sync / device migration becomes an additive change: add a `remote_id`
  reconciliation pass and a sync implementation of the repository interface. No
  data model rewrite is required.
- SQLite is unavailable under Jest; tests mock `expo-sqlite` and the repository.
