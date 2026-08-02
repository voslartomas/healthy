import { create } from 'zustand';

import { DailyEnergy } from '../health';

/**
 * Merged per-day energy history (persisted SQLite rows, refreshed after each
 * live read). The Trends adherence view reads this so history can extend past
 * the ~14-day live window.
 */
interface DailyEnergyState {
  days: DailyEnergy[];
  setDays: (days: DailyEnergy[]) => void;
}

export const useDailyEnergyStore = create<DailyEnergyState>(set => ({
  days: [],
  setDays: days => set({ days }),
}));
