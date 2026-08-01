import { create } from 'zustand';

import { GoalSourceKey } from '../data/goalSources';
import {
  FoodEntryInput,
  HealthSnapshot,
  logFood,
  readSnapshot,
  SAMPLE_SNAPSHOT,
} from '../health';

/**
 * In-memory store for the current health snapshot. Seeded with the sample
 * snapshot so the first paint matches the design, then replaced by a live read
 * on app start (and on manual refresh). Keeping the derived snapshot in the
 * store — never raw multi-source records — means the UI can only ever see
 * deduped, normalized data.
 */

type Status = 'idle' | 'loading' | 'ready';

interface HealthState {
  snapshot: HealthSnapshot;
  status: Status;
  /** Fetch a fresh snapshot (live if available, sample otherwise). */
  refresh: () => Promise<void>;
  /** Log a food entry to Google Health, then refresh. Returns false if the
   * write failed (e.g. not connected) so the UI can tell the user. */
  logFood: (input: FoodEntryInput) => Promise<boolean>;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  snapshot: SAMPLE_SNAPSHOT,
  status: 'idle',
  refresh: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const snapshot = await readSnapshot(Date.now());
      set({ snapshot, status: 'ready' });
    } catch (err) {
      console.warn('Health read failed; keeping sample data', err);
      set({ status: 'ready' });
    }
  },
  logFood: async input => {
    const ok = await logFood(input);
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
