import { loadCalorieGoals } from '../db/calorieGoalsRepository';
import { loadHabits } from '../db/habitsRepository';
import { loadHealthCache } from '../db/healthCacheRepository';
import { loadJournal } from '../db/journalRepository';
import { saveWidgetDataRaw } from '../db/widgetRepository';
import {
  canReadHealthInBackground,
  deriveSnapshot,
  fetchRaw,
  LIGHT_WINDOWS,
} from '../health';
import { spliceRecent, zoneReuse } from '../state/useHealthStore';
import { buildWidgetData } from './widgetData';

/**
 * The widget's own LIVE read (ADR-010), run from its headless task with the
 * app closed: the same light read + splice + derive the app does on
 * foreground, so the widget and the app show the same numbers.
 *
 * Only with Health Connect's background-read grant. Without it a read from the
 * background is refused per record type and comes back EMPTY — which would
 * look exactly like "nothing logged today" — so we don't read at all and the
 * widget keeps what the app last wrote.
 *
 * Reads only SQLite and Health Connect: in a headless task the zustand stores
 * may never have been hydrated.
 */

/** Don't re-read more often than this (taps, resizes, the 30-min tick). */
export const WIDGET_REFRESH_MIN_MS = 5 * 60 * 1000;

/** The headless task gets 30 s from Android; leave room to draw. */
const READ_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

/** Read today's numbers and save them for the widget. True when it did. */
export async function refreshWidgetFromHealth(
  now: number = Date.now(),
): Promise<boolean> {
  if (!(await canReadHealthInBackground())) return false;
  // The deep history comes from the app's cache; without one (never opened
  // since install) there are no baselines to derive recovery against.
  const cached = await loadHealthCache();
  if (!cached) return false;
  const recent = await withTimeout(
    fetchRaw(now, LIGHT_WINDOWS, zoneReuse(cached.raw)),
    READ_TIMEOUT_MS,
  );
  if (!recent) return false;
  const snapshot = deriveSnapshot(spliceRecent(cached.raw, recent, now), now);
  const [habits, calorieGoals, journal] = await Promise.all([
    loadHabits(),
    loadCalorieGoals(),
    loadJournal(),
  ]);
  await saveWidgetDataRaw(
    JSON.stringify(
      buildWidgetData({ snapshot, habits, calorieGoals, journal, asOf: now }),
    ),
  );
  return true;
}
