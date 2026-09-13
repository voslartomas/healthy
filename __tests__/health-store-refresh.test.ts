import { RawHealthData } from '../src/health/types';

/**
 * Store-level behaviour around a refresh that happens OVER data already on
 * screen — the "stale while revalidating" path. Three regressions live here:
 *
 *  1. Nothing reported that a refresh was in flight. `status` only says 'loading'
 *     when the screen is still empty, so every refresh over the cache (app start,
 *     foreground, post-log) happened invisibly — "I don't see an indicator".
 *  2. The light path derived a snapshot from its spliced result but never kept
 *     it, so each refresh re-spliced onto the same up-to-12h-old history.
 *  3. A just-logged meal only counted once a read echoed it back, and Health
 *     Connect does not promise the next read will — "after logging food we do not
 *     refresh".
 */

const NOW = 1_754_000_000_000;

function emptyRaw(readAt: number): RawHealthData {
  return {
    hrvRmssd: [],
    hrvAlgorithm: 'RMSSD',
    restingHr: [],
    sleep: [],
    steps: [],
    exercise: [],
    activeEnergy: [],
    totalEnergy: [],
    nutrition: [],
    weight: [],
    bodyFat: [],
    sources: ['com.huami.watch.hmwatchmanager'],
    readAt,
  };
}

/** Reads the mock source will serve, in order; `null` stands for "unavailable".
 * `mock`-prefixed so jest allows the factory below to close over them. */
let mockReads: (RawHealthData | null)[] = [];
const mockFetchRaw = jest.fn(async () => mockReads.shift() ?? null);
const mockLogFoodEntry = jest.fn(async () => ({ ok: true, name: 'entry-1' }));
const mockRemoveFoodEntry = jest.fn(async () => true);

jest.mock('../src/health', () => ({
  ...jest.requireActual('../src/health'),
  fetchRaw: mockFetchRaw,
  logFoodEntry: mockLogFoodEntry,
  removeFoodEntry: mockRemoveFoodEntry,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useHealthStore } = require('../src/state/useHealthStore');

beforeEach(() => {
  mockReads = [];
  mockFetchRaw.mockClear();
  mockLogFoodEntry.mockClear();
  mockRemoveFoodEntry.mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  useHealthStore.setState({
    cachedRaw: null,
    cacheAt: null,
    cacheChecked: true, // skip the SQLite hydrate; the cache is seeded directly
    freshAt: null,
    fullInFlight: false,
    refreshing: false,
    pendingNutrition: [],
    status: 'idle',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('refreshing flag', () => {
  it('is set while a read is in flight and cleared afterwards', async () => {
    mockReads = [emptyRaw(NOW)];
    const seen: boolean[] = [];
    const unsub = useHealthStore.subscribe((s: { refreshing: boolean }) =>
      seen.push(s.refreshing),
    );
    await useHealthStore.getState().refresh();
    unsub();
    expect(seen).toContain(true); // the UI had something to show an indicator from
    expect(useHealthStore.getState().refreshing).toBe(false);
  });

  it('is cleared even when the source is unavailable', async () => {
    mockReads = [null];
    await useHealthStore.getState().refresh();
    expect(useHealthStore.getState().refreshing).toBe(false);
  });

  it('is cleared once the fast path lands, not held by the background backfill', async () => {
    // A cache older than FULL_REFRESH_MS (12h) makes the light refresh kick off a
    // deep backfill. That backfill only refines OLD history and is the slowest
    // read the app makes, so it must NOT keep the indicator up — otherwise the
    // spinner outlives every visible change and the app just reads as slow.
    useHealthStore.setState({
      cachedRaw: emptyRaw(NOW - 20 * 60 * 60 * 1000),
      cacheAt: NOW - 20 * 60 * 60 * 1000,
    });
    let releaseDeep: (v: RawHealthData) => void = () => {};
    const deep = new Promise<RawHealthData>(res => {
      releaseDeep = res;
    });
    mockFetchRaw
      .mockImplementationOnce(async () => emptyRaw(NOW)) // light
      .mockImplementationOnce(() => deep); // deep backfill, still pending
    await useHealthStore.getState().refresh();
    expect(useHealthStore.getState().refreshing).toBe(false);
    expect(useHealthStore.getState().fullInFlight).toBe(true); // still running
    releaseDeep(emptyRaw(NOW));
    await deep;
    await Promise.resolve();
    expect(useHealthStore.getState().fullInFlight).toBe(false);
  });

  it('still shows the indicator for a FOREGROUND deep read (first load)', async () => {
    // With no cache there is nothing on screen, so the deep pull IS the visible
    // read and has to report itself.
    mockReads = [emptyRaw(NOW)];
    const seen: boolean[] = [];
    const unsub = useHealthStore.subscribe((s: { refreshing: boolean }) =>
      seen.push(s.refreshing),
    );
    await useHealthStore.getState().refresh();
    unsub();
    expect(seen).toContain(true);
    expect(useHealthStore.getState().refreshing).toBe(false);
  });
});

describe('light refresh writes its result back', () => {
  it('keeps the spliced history as the new base', async () => {
    const cached = emptyRaw(NOW - 60 * 60 * 1000);
    useHealthStore.setState({
      cachedRaw: cached,
      cacheAt: NOW - 60 * 60 * 1000,
    });
    const recent = emptyRaw(NOW);
    recent.steps = [
      { start: NOW - 3600_000, end: NOW, count: 900, source: 'z' },
    ];
    mockReads = [recent];
    await useHealthStore.getState().refresh();
    const base = useHealthStore.getState().cachedRaw as RawHealthData;
    expect(base).not.toBe(cached); // the splice was kept, not thrown away
    expect(base.steps).toHaveLength(1);
    // `cacheAt` dates the DEEP history and paces the 12-hourly backfill, so a
    // light refresh must not advance it.
    expect(useHealthStore.getState().cacheAt).toBe(NOW - 60 * 60 * 1000);
  });
});

describe('optimistic food logging', () => {
  it('counts a just-logged meal the read has not echoed yet', async () => {
    useHealthStore.setState({ cachedRaw: emptyRaw(NOW), cacheAt: NOW });
    mockReads = [emptyRaw(NOW)]; // the write is NOT visible to this read
    const res = await useHealthStore
      .getState()
      .logFoodEntry({ name: 'Oats', kcal: 400, proteinG: 14, at: NOW });
    expect(res.ok).toBe(true);
    expect(useHealthStore.getState().snapshot.nutrition?.eaten).toBe(400);
    expect(useHealthStore.getState().snapshot.nutrition?.proteinG).toBe(14);
  });

  it('does not double-count once the read does echo it', async () => {
    useHealthStore.setState({ cachedRaw: emptyRaw(NOW), cacheAt: NOW });
    mockReads = [emptyRaw(NOW)];
    await useHealthStore
      .getState()
      .logFoodEntry({ name: 'Oats', kcal: 400, at: NOW });
    expect(useHealthStore.getState().pendingNutrition).toHaveLength(1);

    // Next read now contains the entry, under the OS's own source and id.
    const echoed = emptyRaw(NOW);
    echoed.nutrition = [
      {
        start: NOW,
        end: NOW,
        name: 'Oats',
        mealType: null,
        kcal: 400,
        proteinG: null,
        carbsG: null,
        fatG: null,
        id: 'entry-1',
        source: 'com.google.android.apps.healthdata',
      },
    ];
    mockReads = [echoed];
    await useHealthStore.getState().refresh();
    expect(useHealthStore.getState().snapshot.nutrition?.eaten).toBe(400);
    // Reconciled away, so it can never linger as a phantom.
    expect(useHealthStore.getState().pendingNutrition).toHaveLength(0);
  });

  it('reconciles by natural key when the write echoed no id', async () => {
    // Health Connect does not always hand back a record id on write. Keying the
    // reconciliation on the id alone would then never match the read's copy, and
    // the meal would count twice until the TTL expired.
    mockLogFoodEntry.mockResolvedValueOnce({ ok: true } as never);
    useHealthStore.setState({ cachedRaw: emptyRaw(NOW), cacheAt: NOW });
    mockReads = [emptyRaw(NOW)];
    await useHealthStore
      .getState()
      .logFoodEntry({ name: 'Oats', kcal: 400, at: NOW });
    expect(useHealthStore.getState().pendingNutrition).toHaveLength(1);
    expect(useHealthStore.getState().snapshot.nutrition?.eaten).toBe(400);

    const echoed = emptyRaw(NOW);
    echoed.nutrition = [
      {
        start: NOW,
        end: NOW,
        name: 'Oats',
        mealType: null,
        kcal: 400,
        proteinG: null,
        carbsG: null,
        fatG: null,
        id: 'assigned-later',
        source: 'com.google.android.apps.healthdata',
      },
    ];
    mockReads = [echoed];
    await useHealthStore.getState().refresh();
    expect(useHealthStore.getState().snapshot.nutrition?.eaten).toBe(400);
    expect(useHealthStore.getState().pendingNutrition).toHaveLength(0);
  });

  it('drops the optimistic copy when the entry is deleted again', async () => {
    useHealthStore.setState({ cachedRaw: emptyRaw(NOW), cacheAt: NOW });
    mockReads = [emptyRaw(NOW), emptyRaw(NOW)];
    await useHealthStore
      .getState()
      .logFoodEntry({ name: 'Oats', kcal: 400, at: NOW });
    expect(useHealthStore.getState().snapshot.nutrition?.eaten).toBe(400);
    await useHealthStore.getState().removeFoodEntry('entry-1');
    expect(useHealthStore.getState().pendingNutrition).toHaveLength(0);
    expect(useHealthStore.getState().snapshot.nutrition).toBeNull();
  });
});
