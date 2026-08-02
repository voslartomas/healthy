import {
  loadDailyEnergy,
  upsertDailyEnergy,
} from '../db/dailyEnergyRepository';
import { DailyEnergy } from '../health';
import { useDailyEnergyStore } from './useDailyEnergyStore';

/**
 * Orchestration for persisted daily energy. On start we hydrate the store from
 * SQLite; after each live read we upsert the days that carry data and reload,
 * so the adherence history accumulates beyond the ~14-day live window.
 */

/** Load persisted history into the store. Call once on app start. */
export async function initDailyEnergy(): Promise<void> {
  useDailyEnergyStore.getState().setDays(await loadDailyEnergy());
}

/**
 * Persist the live window's days that carry data (skip fully-empty days so we
 * never overwrite a real value with a null), then refresh the store with the
 * full merged history.
 */
export async function syncDailyEnergy(live: DailyEnergy[]): Promise<void> {
  const withData = live.filter(d => d.eaten != null || d.burned != null);
  if (withData.length > 0) await upsertDailyEnergy(withData);
  useDailyEnergyStore.getState().setDays(await loadDailyEnergy());
}
