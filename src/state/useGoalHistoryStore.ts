import { create } from 'zustand';

import { PersistedGoalWeek } from '../db/goalHistoryRepository';

/**
 * Merged per-goal weekly history (persisted SQLite rows, refreshed after each
 * live read and whenever goals change). The Trends goal-attainment view reads
 * this so history extends past the ~14–30-day live window. Flat rows; the view
 * groups them by goal.
 */
interface GoalHistoryState {
  weeks: PersistedGoalWeek[];
  setWeeks: (weeks: PersistedGoalWeek[]) => void;
}

export const useGoalHistoryStore = create<GoalHistoryState>(set => ({
  weeks: [],
  setWeeks: weeks => set({ weeks }),
}));
