import { DailyEnergy } from '../health';
import { getDb } from './database';

/**
 * Persistence for per-day energy balance (the `daily_energy` table). The live
 * health read only covers ~14 days (the total-calories rollup cap); persisting
 * each day as we see it lets the adherence history grow past that window.
 */

interface DailyEnergyRow {
  day_start: number;
  eaten: number | null;
  burned: number | null;
  net: number | null;
}

/** All persisted days, oldest first. */
export async function loadDailyEnergy(): Promise<DailyEnergy[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DailyEnergyRow>(
    'SELECT day_start, eaten, burned, net FROM daily_energy ORDER BY day_start ASC;',
  );
  return rows.map(r => ({
    dayStart: r.day_start,
    eaten: r.eaten,
    burned: r.burned,
    net: r.net,
  }));
}

/** Upsert each day by its start (idempotent — a day is rewritten as data lands). */
export async function upsertDailyEnergy(days: DailyEnergy[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  for (const d of days) {
    await db.runAsync(
      `INSERT INTO daily_energy (day_start, eaten, burned, net, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(day_start) DO UPDATE SET
         eaten = excluded.eaten,
         burned = excluded.burned,
         net = excluded.net,
         updated_at = excluded.updated_at;`,
      d.dayStart,
      d.eaten,
      d.burned,
      d.net,
      now,
    );
  }
}
