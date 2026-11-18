import { deriveSnapshot, startOfLocalDay } from '../src/health/derive';
import { RawHealthData } from '../src/health/types';

/**
 * The first open of the morning paints the SQLite cache before any live read has
 * landed. That cache was written the previous day, and these are the values that
 * used to be presented as today's from it — the "my data are stale in the
 * morning, it shows yesterday's" report.
 *
 * Everything derived through a window from `now` (steps, nutrition) was already
 * correct — it reads as empty from an old cache and fills in when the live read
 * arrives. What went wrong was the values with no date of their own: the
 * platform's pre-computed "today" energy aggregate, and "the most recent reading
 * we have" for sleep / HRV / resting HR.
 */

const HOUR = 60 * 60 * 1000;
const NOW = 1_754_000_000_000; // fixed epoch ms so all derivations are deterministic
const ZEPP = 'com.huami.watch.hmwatchmanager';

/** 22:00 local yesterday — when a cache written "last evening" was stamped. */
const YESTERDAY_EVENING = startOfLocalDay(NOW) - 2 * HOUR;
/** Local midnight that starts `NOW`'s day; last night is anchored on it. */
const TODAY = startOfLocalDay(NOW);

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
    sources: [ZEPP],
    readAt,
  };
}

describe('deriveSnapshot — staleness of a previous-day read', () => {
  it('flags a read taken on an earlier local day as stale', () => {
    expect(deriveSnapshot(emptyRaw(YESTERDAY_EVENING), NOW).stale).toBe(true);
    expect(deriveSnapshot(emptyRaw(NOW), NOW).stale).toBe(false);
  });

  it("does not credit a previous day's burned-energy aggregate to today", () => {
    // `energyBurnedTodayAgg` is a bare number meaning "today's burn as of this
    // read". Trusted unconditionally, a cache written last night reported
    // yesterday's whole-day burn as today's — a large bogus deficit against
    // today's (correctly empty) intake.
    const raw = { ...emptyRaw(YESTERDAY_EVENING), energyBurnedTodayAgg: 2400 };
    expect(deriveSnapshot(raw, NOW).energyBurnedToday).toBe(0);
  });

  it('still uses the platform aggregate for a read taken today', () => {
    const raw = { ...emptyRaw(NOW), energyBurnedTodayAgg: 2400 };
    expect(deriveSnapshot(raw, NOW).energyBurnedToday).toBe(2400);
  });

  it('does not present the night before last as "last night"', () => {
    // The newest sleep a cache written yesterday evening can hold: last night
    // had not happened yet when it was written.
    const raw = emptyRaw(YESTERDAY_EVENING);
    raw.sleep = [
      {
        start: NOW - 50 * HOUR,
        end: NOW - 42 * HOUR,
        durationMin: 480,
        source: ZEPP,
        stages: null,
      },
    ];
    expect(deriveSnapshot(raw, NOW).sleep).toBeNull();
  });

  it('still reports last night, all day long', () => {
    // 23:00 → 07:00. `NOW` is 22:13 local, so this also pins that a late-evening
    // open still shows the night that ended this morning.
    const raw = emptyRaw(NOW);
    raw.sleep = [
      {
        start: TODAY - 1 * HOUR,
        end: TODAY + 7 * HOUR,
        durationMin: 480,
        source: ZEPP,
        stages: null,
      },
    ];
    expect(deriveSnapshot(raw, NOW).sleep?.hours).toBeCloseTo(8);
  });

  it("does not present an older night's HRV — or a readiness built on it", () => {
    const raw = emptyRaw(YESTERDAY_EVENING);
    raw.hrvRmssd = [
      { time: NOW - 50 * HOUR, value: 60, source: ZEPP },
      { time: NOW - 49 * HOUR, value: 64, source: ZEPP },
    ];
    raw.restingHr = [{ time: NOW - 49 * HOUR, value: 54, source: ZEPP }];
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.hrv).toBeNull();
    expect(snap.restingHr).toBeNull();
    // Readiness is a blend of exactly those inputs, so it must go too rather
    // than be shown as this morning's recovery score.
    expect(snap.readiness).toBeNull();
  });

  it("still reports this morning's HRV and resting HR", () => {
    const raw = emptyRaw(NOW);
    raw.hrvRmssd = [
      { time: TODAY + 2 * HOUR, value: 60, source: ZEPP },
      { time: TODAY + 4 * HOUR, value: 64, source: ZEPP },
    ];
    raw.restingHr = [{ time: TODAY + 4 * HOUR, value: 54, source: ZEPP }];
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.hrv?.value).toBeCloseTo(62);
    expect(snap.restingHr?.value).toBe(54);
    expect(snap.readiness).not.toBeNull();
  });
});

describe('deriveSnapshot — morning before the wearable has synced', () => {
  // The reported bug, with a LIVE read (not the cache): at 07:30 the store only
  // holds the night that ended YESTERDAY morning, ~24.5 h ago. The old 36-hour
  // freshness window let that night through as "last night" — sleep, HRV,
  // resting HR and the readiness built from them — until the new night synced.
  const MORNING = TODAY + 7.5 * HOUR;
  const prevNight = (): RawHealthData => {
    const raw = emptyRaw(MORNING);
    raw.sleep = [
      {
        start: TODAY - 25 * HOUR,
        end: TODAY - 17 * HOUR,
        durationMin: 480,
        source: ZEPP,
        stages: null,
      },
    ];
    raw.hrvRmssd = [
      { time: TODAY - 22 * HOUR, value: 60, source: ZEPP },
      { time: TODAY - 20 * HOUR, value: 64, source: ZEPP },
    ];
    raw.restingHr = [{ time: TODAY - 20 * HOUR, value: 54, source: ZEPP }];
    return raw;
  };

  it("shows nothing for last night rather than yesterday's numbers", () => {
    const snap = deriveSnapshot(prevNight(), MORNING);
    expect(snap.stale).toBe(false); // a live read — not the cache path
    expect(snap.sleep).toBeNull();
    expect(snap.hrv).toBeNull();
    expect(snap.restingHr).toBeNull();
    expect(snap.readiness).toBeNull();
  });

  it('picks last night up as soon as it syncs', () => {
    const raw = prevNight();
    raw.sleep.push({
      start: TODAY - 1 * HOUR,
      end: TODAY + 7 * HOUR,
      durationMin: 450,
      source: ZEPP,
      stages: null,
    });
    raw.hrvRmssd.push({ time: TODAY + 3 * HOUR, value: 70, source: ZEPP });
    raw.restingHr.push({ time: TODAY + 6 * HOUR, value: 52, source: ZEPP });
    const snap = deriveSnapshot(raw, MORNING);
    expect(snap.sleep?.hours).toBeCloseTo(7.5);
    expect(snap.hrv?.value).toBe(70);
    expect(snap.restingHr?.value).toBe(52);
    expect(snap.readiness).not.toBeNull();
  });

  it('does not let an afternoon nap stand in for last night', () => {
    const raw = prevNight();
    raw.sleep.push({
      start: TODAY + 14 * HOUR,
      end: TODAY + 14.5 * HOUR,
      durationMin: 30,
      source: ZEPP,
      stages: null,
    });
    expect(deriveSnapshot(raw, TODAY + 16 * HOUR).sleep).toBeNull();
  });
});
