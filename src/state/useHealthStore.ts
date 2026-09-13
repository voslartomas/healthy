import { create } from 'zustand';

import { GoalSourceKey } from '../data/goalSources';
import { loadHealthCache, saveHealthCache } from '../db/healthCacheRepository';
import {
  CardioZones,
  deriveSnapshot,
  EMPTY_SNAPSHOT,
  exerciseKey,
  fetchRaw,
  FoodEntryInput,
  FoodLogResult,
  FULL_METRICS_DAYS,
  FULL_WINDOWS,
  HealthSnapshot,
  LIGHT_WINDOWS,
  logFoodEntry,
  mergeRaw,
  NutritionEntry,
  pruneRaw,
  RawHealthData,
  removeFoodEntry,
  ZoneReuse,
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

/**
 * How long a successful-but-unconfirmed food write keeps being folded into the
 * snapshot. Health Connect does not promise a write is visible to the very next
 * read, so without this a just-logged meal could vanish from today's totals in
 * the gap between our write and the store indexing it — the "logging food
 * doesn't update the dashboard" report. Long enough to cover that lag, short
 * enough that a write the store silently dropped can't linger as a phantom.
 */
const PENDING_TTL_MS = 5 * 60 * 1000;

/** Marks a nutrition entry as our own optimistic copy rather than a real read. */
const PENDING_SOURCE = 'local-pending';

/**
 * The HR zones we already hold, offered to the next read so it can skip the
 * heart-rate pull for sessions it has already seen.
 *
 * This is what makes the periodic deep backfill affordable: zones are read per
 * session, so re-deriving twelve weeks of them costs one native round trip per
 * workout — for history that cannot have changed. Returns undefined when there is
 * nothing to offer, so the read behaves exactly as it did before.
 *
 * `hrMax` travels with the zones because they are only comparable against the
 * scale they were binned on; the reader checks it and recomputes everything if
 * the scale has since moved (see `ZoneReuse`).
 */
function zoneReuse(cached: RawHealthData | null): ZoneReuse | undefined {
  if (!cached || cached.exercise.length === 0) return undefined;
  const zones = new Map<string, CardioZones | null>();
  for (const e of cached.exercise) zones.set(exerciseKey(e), e.hrZones ?? null);
  return { zones, hrMax: cached.hrMax ?? null };
}

/**
 * Identity of a nutrition entry independent of who wrote it. Deliberately WITHOUT
 * `source` (unlike `mergeRaw`'s key) so our {@link PENDING_SOURCE} copy still
 * matches the same meal once the OS hands it back under the real writer's name.
 */
function naturalKey(e: NutritionEntry): string {
  return `${e.start}|${e.name}`;
}

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
  /**
   * A read is in flight RIGHT NOW, over data we are already showing. This is the
   * "stale-while-revalidating" signal the UI needs: `status` only reports
   * 'loading' when there is nothing on screen yet, so every refresh over the
   * cache — app start, foreground, post-log — used to happen invisibly, which
   * read as "it never refreshed". Covers the background deep backfill too.
   */
  refreshing: boolean;
  /** Food we wrote and the OS store hasn't echoed back yet; folded into the
   * snapshot so a logged meal counts immediately. See {@link PENDING_TTL_MS}. */
  pendingNutrition: NutritionEntry[];
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
  /**
   * Record a food entry we just wrote so it counts toward today immediately,
   * without waiting for a read to confirm it. For callers that write through
   * `../health` directly and refresh once at the end (see `mealLogService`);
   * {@link logFoodEntry} does this for its own writes.
   */
  notePendingFood: (input: FoodEntryInput, id?: string | null) => void;
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
   * Reads in flight. `refreshing` mirrors `> 0` rather than being set directly,
   * so the light refresh and the background deep backfill it kicks off can't
   * clear each other's indicator — the shorter one finishing first would
   * otherwise hide the spinner while the deep pull was still running.
   */
  let inFlight = 0;
  function trackRead(delta: number): void {
    inFlight = Math.max(0, inFlight + delta);
    set({ refreshing: inFlight > 0 });
  }

  /**
   * Fold food we wrote but haven't seen read back into a raw read, so it counts
   * toward today immediately. Each pending entry is dropped as soon as the read
   * echoes it, or once it ages past {@link PENDING_TTL_MS} — so this converges on
   * the OS store's own view and never accumulates.
   *
   * "Echoed" is matched on the record id OR the natural key, not one or the
   * other. A write does not always hand back an id, and a read of the same meal
   * does not always omit one, so keying on either alone would fail to recognise
   * the entry we just wrote and double-count it until the TTL expired.
   */
  function withPending(raw: RawHealthData, now: number): RawHealthData {
    const pending = get().pendingNutrition;
    if (pending.length === 0) return raw;
    const ids = new Set(
      raw.nutrition.map(e => e.id).filter((id): id is string => id != null),
    );
    const natural = new Set(raw.nutrition.map(naturalKey));
    const keep = pending.filter(
      p =>
        !(p.id != null && ids.has(p.id)) &&
        !natural.has(naturalKey(p)) &&
        now - p.start < PENDING_TTL_MS,
    );
    if (keep.length !== pending.length) set({ pendingNutrition: keep });
    if (keep.length === 0) return raw;
    return { ...raw, nutrition: [...raw.nutrition, ...keep] };
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
  async function fullRefresh(
    now: number,
    { background = false }: { background?: boolean } = {},
  ): Promise<void> {
    if (get().fullInFlight) return;
    set({ fullInFlight: true });
    // A BACKGROUND backfill deliberately does not raise `refreshing`. It only
    // refines OLD history (the Trends series) — today's numbers are already
    // correct from the light read that triggered it — and it is by far the
    // slowest read the app makes. Counting it would pin a spinner up for tens of
    // seconds after the visible data had stopped changing, which reads as "the
    // app is slow to refresh" rather than "the app is backfilling 12 weeks".
    if (!background) trackRead(1);
    try {
      const cached = get().cachedRaw;
      // Hand the reader the zones we already hold so it only pays for genuinely
      // new sessions — the deep window is 90 days of workouts, and their zones
      // are read one session at a time.
      const raw = await fetchRaw(now, FULL_WINDOWS, zoneReuse(cached));
      if (!raw) return; // unavailable — keep whatever we already show
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
      applySnapshot(deriveSnapshot(withPending(merged, now), now));
      void saveHealthCache(merged, now).catch(err =>
        console.warn('Failed to persist health cache', err),
      );
    } finally {
      set({ fullInFlight: false });
      if (!background) trackRead(-1);
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
    refreshing: false,
    pendingNutrition: [],
    refresh: async (mode: RefreshMode = 'auto') => {
      const now = Date.now();
      // Flagged for the whole call, including the SQLite hydrate, so the UI shows
      // a refresh is under way from the first frame it has anything to paint.
      trackRead(1);
      try {
        // First call this launch: hydrate the cached history from SQLite and
        // paint it immediately so the app opens with data instead of a spinner.
        if (!get().cacheChecked) {
          set({ cacheChecked: true });
          try {
            const cached = await loadHealthCache();
            if (cached) {
              set({ cachedRaw: cached.raw, cacheAt: cached.updatedAt });
              // NB: `deriveSnapshot` marks this snapshot `stale` when the cached
              // read predates today, and suppresses the values that would
              // otherwise be yesterday's — it does NOT set `freshAt`, so
              // `whenHealthFresh` still waits for a live read.
              set({
                snapshot: deriveSnapshot(withPending(cached.raw, now), now),
                status: 'ready',
              });
            }
          } catch (err) {
            console.warn('Failed to load health cache', err);
          }
        }

        const { cachedRaw, cacheAt } = get();
        const historyStale = cacheAt == null || now - cacheAt > FULL_REFRESH_MS;

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
          // Same saving on the light path: it re-reads a 14-day exercise slice,
          // most of which we already have zones for.
          const recent = await fetchRaw(
            now,
            LIGHT_WINDOWS,
            zoneReuse(cachedRaw),
          );
          if (recent) {
            const merged = mergeRaw(
              get().cachedRaw ?? cachedRaw,
              recent,
              now - RECENT_SPLICE_DAYS * DAY_MS,
              now - RECENT_METRICS_SPLICE_DAYS * DAY_MS,
            );
            // Keep the spliced result as the new base. Without this every light
            // refresh re-spliced onto the same up-to-12h-old cache and threw its
            // own fresh slice away, so back-to-back refreshes kept re-deriving
            // from stale history. `cacheAt` deliberately does NOT move: it dates
            // the deep history, and is what paces the 12-hourly backfill below.
            set({ cachedRaw: merged });
            applySnapshot(deriveSnapshot(withPending(merged, now), now));
          }
        } catch (err) {
          console.warn('Health refresh failed', err);
        }

        // Periodically refresh the deep history in the background.
        if (historyStale)
          void fullRefresh(now, { background: true }).catch(() => {});
      } finally {
        trackRead(-1);
      }
    },
    logFood: async input => (await get().logFoodEntry(input)).ok,
    logFoodEntry: async input => {
      const res = await logFoodEntry(input);
      if (res.ok) {
        // Count it before the read confirms it — Health Connect may not surface
        // a write to the very next read, and the user must see their meal land.
        get().notePendingFood(input, res.name ?? null);
        await get().refresh();
      }
      return res;
    },
    removeFoodEntry: async name => {
      const ok = await removeFoodEntry(name);
      if (ok) {
        // Drop the optimistic copy too, or deleting a just-logged entry would
        // leave it counted until the TTL expired.
        set({
          pendingNutrition: get().pendingNutrition.filter(p => p.id !== name),
        });
        await get().refresh();
      }
      return ok;
    },
    notePendingFood: (input, id) => {
      const at = input.at ?? Date.now();
      set({
        pendingNutrition: [
          ...get().pendingNutrition,
          {
            start: at,
            end: at,
            name: input.name,
            mealType: input.mealType ?? null,
            kcal: input.kcal,
            proteinG: input.proteinG ?? null,
            carbsG: input.carbsG ?? null,
            fatG: input.fatG ?? null,
            id: id ?? null,
            source: PENDING_SOURCE,
          },
        ],
      });
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
