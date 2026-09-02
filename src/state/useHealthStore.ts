import { create } from 'zustand';

import { GoalSourceKey } from '../data/goalSources';
import { loadHealthCache, saveHealthCache } from '../db/healthCacheRepository';
import {
  deriveSnapshot,
  EMPTY_SNAPSHOT,
  fetchRaw,
  FoodEntryInput,
  FoodLogResult,
  FULL_METRICS_DAYS,
  FULL_WINDOWS,
  HealthSnapshot,
  LIGHT_WINDOWS,
  logFood,
  logFoodEntry,
  mergeRaw,
  pruneRaw,
  RawHealthData,
  removeFoodEntry,
} from '../health';
import { syncDailyEnergy } from './dailyEnergyService';

/**
 * In-memory store for the current health snapshot. Seeded empty — the UI shows
 * only real data ("-" for missing metrics) — then filled by a live read on app
 * start (and on manual refresh). Keeping the derived snapshot in the store —
 * never raw multi-source records — means the UI can only ever see deduped,
 * normalized data.
 *
 * Load strategy (see the field docs below): the DEEP 12-week history is fetched
 * once, cached (in memory + SQLite), and reused; routine and foreground
 * refreshes fetch only the recent slice and splice it onto that cache, so the
 * app opens instantly and updates fast instead of re-paginating 12 weeks of
 * exercise + calories every time.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** How much of the tail the light refresh re-fetches — must match the heavy
 * spans in {@link LIGHT_WINDOWS} so the splice boundary has no gap. */
const RECENT_SPLICE_DAYS = 14;
/** The same, for the daily-metrics slice, which is read over a shorter span. */
const RECENT_METRICS_SPLICE_DAYS = LIGHT_WINDOWS.metricsDays;
/** Where a DEEP read hands back to cached history for the heavy arrays — the
 * shortest of its own heavy spans, so no window is credited beyond its reach. */
const FULL_HEAVY_SPLICE_DAYS = Math.min(
  FULL_WINDOWS.exerciseDays,
  FULL_WINDOWS.stepsDays,
  FULL_WINDOWS.caloriesDays,
);
/** Re-pull the deep history at most this often (older weeks change rarely). */
const FULL_REFRESH_MS = 12 * 60 * 60 * 1000;

type Status = 'idle' | 'loading' | 'ready';
type RefreshMode = 'auto' | 'full';

interface HealthState {
  snapshot: HealthSnapshot;
  status: Status;
  /** The last DEEP read, kept to splice recent reads onto. Null until the first
   * full fetch (or a cache load) lands. */
  cachedRaw: RawHealthData | null;
  /** When {@link cachedRaw} was fetched (epoch ms); drives staleness. */
  cacheAt: number | null;
  /** Whether we've looked in SQLite for a persisted cache yet (once per launch). */
  cacheChecked: boolean;
  /** When a snapshot derived from a LIVE read was last applied (epoch ms).
   * Stays null while the app is showing the SQLite cache, which on a morning
   * open still holds yesterday's numbers — anything that must reason about
   * today (the daily brief) waits on this rather than on `status`. */
  freshAt: number | null;
  /** Guards against overlapping background full-history pulls. */
  fullInFlight: boolean;
  /** Refresh the snapshot. 'auto' does the fast recent-slice path when a cached
   * history exists (deep pull only on first load / when stale); 'full' forces a
   * deep pull. Safe to call on app start and every foreground. */
  refresh: (mode?: RefreshMode) => Promise<void>;
  /** Log a food entry to Health Connect, then refresh. Returns false if the
   * write failed (e.g. not connected) so the UI can tell the user. */
  logFood: (input: FoodEntryInput) => Promise<boolean>;
  /** Log a food entry and return the created id (for later edits), refreshing
   * the snapshot on success. */
  logFoodEntry: (input: FoodEntryInput) => Promise<FoodLogResult>;
  /** Delete a logged entry by its resource name, then refresh on success. */
  removeFoodEntry: (name: string) => Promise<boolean>;
}

export const useHealthStore = create<HealthState>((set, get) => {
  /** Apply a freshly-derived snapshot and fan out the durable-history writes. */
  function applySnapshot(snapshot: HealthSnapshot): void {
    set({ snapshot, status: 'ready', freshAt: Date.now() });
    void syncDailyEnergy(snapshot.dailyEnergy).catch(err =>
      console.warn('Failed to persist daily energy', err),
    );
    // Lazy import breaks the module require cycle (goalHistoryService imports
    // this store and useGoalsStore, which also imports this store). Resolving it
    // at call time — after all modules have initialized — avoids reading an
    // uninitialized binding during evaluation.
    void import('./goalHistoryService')
      .then(m => m.syncGoalHistory())
      .catch(err => console.warn('Failed to persist goal history', err));
  }

  /**
   * Deep pull: fetch the full history, refresh the caches and snapshot. Runs
   * foreground on first load (nothing to show yet) and in the background as a
   * periodic backfill. `fullInFlight` prevents overlap.
   *
   * The result is MERGED onto the existing cache rather than replacing it. The
   * deep read cannot cover everything the app can display — HRV is read a month
   * back because of its sample rate, while Trends offers six months — so each
   * deep pull EXTENDS the history instead of resetting it to that read's own
   * horizon. `pruneRaw` then caps the whole thing at the display horizon so the
   * cache stays bounded.
   */
  async function fullRefresh(now: number): Promise<void> {
    if (get().fullInFlight) return;
    set({ fullInFlight: true });
    try {
      const raw = await fetchRaw(now, FULL_WINDOWS);
      if (!raw) return; // unavailable — keep whatever we already show
      const cached = get().cachedRaw;
      // Cut at the NARROWEST span this read covered, so nothing the fetch
      // reached past is dropped and nothing it did reach is duplicated.
      const merged = cached
        ? pruneRaw(
            mergeRaw(
              cached,
              raw,
              now - FULL_HEAVY_SPLICE_DAYS * DAY_MS,
              now - FULL_WINDOWS.hrvDays * DAY_MS,
            ),
            now,
            FULL_METRICS_DAYS,
          )
        : raw;
      set({ cachedRaw: merged, cacheAt: now });
      applySnapshot(deriveSnapshot(merged, now));
      void saveHealthCache(merged, now).catch(err =>
        console.warn('Failed to persist health cache', err),
      );
    } finally {
      set({ fullInFlight: false });
    }
  }

  return {
    snapshot: EMPTY_SNAPSHOT,
    status: 'idle',
    cachedRaw: null,
    cacheAt: null,
    cacheChecked: false,
    freshAt: null,
    fullInFlight: false,
    refresh: async (mode: RefreshMode = 'auto') => {
      const now = Date.now();

      // First call this launch: hydrate the cached history from SQLite and paint
      // it immediately so the app opens with data instead of a spinner.
      if (!get().cacheChecked) {
        set({ cacheChecked: true });
        try {
          const cached = await loadHealthCache();
          if (cached) {
            set({ cachedRaw: cached.raw, cacheAt: cached.updatedAt });
            set({ snapshot: deriveSnapshot(cached.raw, now), status: 'ready' });
          }
        } catch (err) {
          console.warn('Failed to load health cache', err);
        }
      }

      const { cachedRaw, cacheAt } = get();
      const stale = cacheAt == null || now - cacheAt > FULL_REFRESH_MS;

      // No cached history yet, or a forced full pull: deep-fetch in the
      // foreground (spinner only when we have nothing to show).
      if (cachedRaw == null || mode === 'full') {
        if (get().snapshot === EMPTY_SNAPSHOT) set({ status: 'loading' });
        await fullRefresh(now);
        // Leave the loading state even if the source was unavailable (not
        // signed in / offline), so the UI never spins forever.
        if (get().status === 'loading') set({ status: 'ready' });
        return;
      }

      // Fast path: fetch just the recent slice and splice it onto the cache.
      try {
        const recent = await fetchRaw(now, LIGHT_WINDOWS);
        if (recent) {
          const merged = mergeRaw(
            get().cachedRaw ?? cachedRaw,
            recent,
            now - RECENT_SPLICE_DAYS * DAY_MS,
            now - RECENT_METRICS_SPLICE_DAYS * DAY_MS,
          );
          applySnapshot(deriveSnapshot(merged, now));
        }
      } catch (err) {
        console.warn('Health refresh failed', err);
      }

      // Periodically refresh the deep history in the background.
      if (stale) void fullRefresh(now).catch(() => {});
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
  };
});

/** Load the health snapshot once on app start. */
export async function initHealth(): Promise<void> {
  await useHealthStore.getState().refresh();
}

/**
 * Resolve once a snapshot from a LIVE read has landed this session — i.e. the
 * numbers on screen are today's, not the cache's. Resolves `true` when fresh
 * data arrived, `false` if `timeoutMs` elapses first (offline, no permission, no
 * source), so callers degrade instead of hanging.
 *
 * The daily brief uses this: it is written once per day and cached, so writing
 * it from a stale snapshot would pin yesterday's numbers to the whole day.
 */
export function whenHealthFresh(timeoutMs = 20_000): Promise<boolean> {
  if (useHealthStore.getState().freshAt != null) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const unsub = useHealthStore.subscribe(state => {
      if (state.freshAt != null) finish(true);
    });
  });
}

/** Auto-tracked weekly total for a goal source, from the live snapshot. */
export function trackedFor(source: GoalSourceKey): number {
  return useHealthStore.getState().snapshot.tracked[source] ?? 0;
}
