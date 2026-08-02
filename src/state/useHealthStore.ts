import { create } from 'zustand';

import { GoalSourceKey } from '../data/goalSources';
import {
  EMPTY_SNAPSHOT,
  FoodEntryInput,
  FoodLogResult,
  HealthSnapshot,
  logFood,
  logFoodEntry,
  readSnapshot,
  removeFoodEntry,
} from '../health';
import { syncDailyEnergy } from './dailyEnergyService';
import { syncGoalHistory } from './goalHistoryService';

/**
 * In-memory store for the current health snapshot. Seeded empty — the UI shows
 * only real data ("-" for missing metrics) — then filled by a live read on app
 * start (and on manual refresh). Keeping the derived snapshot in the store —
 * never raw multi-source records — means the UI can only ever see deduped,
 * normalized data.
 */

type Status = 'idle' | 'loading' | 'ready';

interface HealthState {
  snapshot: HealthSnapshot;
  status: Status;
  /** Fetch a fresh snapshot (empty when the source is unavailable). */
  refresh: () => Promise<void>;
  /** Log a food entry to Google Health, then refresh. Returns false if the
   * write failed (e.g. not connected) so the UI can tell the user. */
  logFood: (input: FoodEntryInput) => Promise<boolean>;
  /** Log a food entry and return the created id (for later edits), refreshing
   * the snapshot on success. */
  logFoodEntry: (input: FoodEntryInput) => Promise<FoodLogResult>;
  /** Delete a logged entry by its resource name, then refresh on success. */
  removeFoodEntry: (name: string) => Promise<boolean>;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  snapshot: EMPTY_SNAPSHOT,
  status: 'idle',
  refresh: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const snapshot = await readSnapshot(Date.now());
      set({ snapshot, status: 'ready' });
      // Persist the day series so adherence history outlives the 14-day window.
      void syncDailyEnergy(snapshot.dailyEnergy).catch(err =>
        console.warn('Failed to persist daily energy', err),
      );
      // Persist per-goal weekly attainment so goal history outlives the window.
      void syncGoalHistory().catch(err =>
        console.warn('Failed to persist goal history', err),
      );
    } catch (err) {
      console.warn('Health read failed', err);
      set({ snapshot: EMPTY_SNAPSHOT, status: 'ready' });
    }
  },
  logFood: async input => {
    const ok = await logFood(input);
    if (ok) await get().refresh();
    return ok;
  },
  logFoodEntry: async input => {
    const res = await logFoodEntry(input);
    if (res.ok) await get().refresh();
    return res;
  },
  removeFoodEntry: async name => {
    const ok = await removeFoodEntry(name);
    if (ok) await get().refresh();
    return ok;
  },
}));

/** Load the health snapshot once on app start. */
export async function initHealth(): Promise<void> {
  await useHealthStore.getState().refresh();
}

/** Auto-tracked weekly total for a goal source, from the live snapshot. */
export function trackedFor(source: GoalSourceKey): number {
  return useHealthStore.getState().snapshot.tracked[source] ?? 0;
}
