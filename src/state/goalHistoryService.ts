import {
  loadGoalWeeks,
  PersistedGoalWeek,
  upsertGoalWeeks,
} from '../db/goalHistoryRepository';
import { useGoalHistoryStore } from './useGoalHistoryStore';
import { goalWeekly, useGoalsStore } from './useGoalsStore';
import { useHealthStore } from './useHealthStore';

/**
 * Orchestration for persisted goal history. On start we hydrate the store from
 * SQLite; after each live read (and whenever goals change) we recompute each
 * goal's recent weekly attainment and upsert the COVERED weeks, then reload the
 * merged history.
 *
 * Two correctness rules mirror {@link ./dailyEnergyService}:
 *   1. Only covered weeks are persisted — we never write a fabricated "miss" for
 *      a week older than the data window (see WeekCoverage / weeklyGoalHistory).
 *   2. Upsert-by-(goal, week) means older persisted weeks are never overwritten,
 *      so history accrues indefinitely even though each read only sees ~30 days.
 */

/** Load persisted goal history into the store. Call once on app start. */
export async function initGoalHistory(): Promise<void> {
  useGoalHistoryStore.getState().setWeeks(await loadGoalWeeks());
}

/**
 * Recompute recent weekly attainment for every current goal from the live
 * snapshot and persist the covered weeks, then refresh the store with the full
 * merged history. Reads goals + snapshot from their stores so callers (health
 * refresh, goal add/remove) need pass nothing.
 */
export async function syncGoalHistory(): Promise<void> {
  const goals = useGoalsStore.getState().goals;
  const history = useHealthStore.getState().snapshot.weeklyHistory;

  const rows: PersistedGoalWeek[] = [];
  for (const goal of goals) {
    for (const w of goalWeekly(goal, history)) {
      if (!w.covered) continue;
      rows.push({
        goalId: goal.id,
        weekStart: w.weekStart,
        current: w.current,
        target: w.target,
      });
    }
  }

  if (rows.length > 0) await upsertGoalWeeks(rows);
  useGoalHistoryStore.getState().setWeeks(await loadGoalWeeks());
}
