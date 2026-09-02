import { profileAge } from '../state/useProfileStore';
import { nightIndex, nightIndexToTime } from './derive';
import { FoodEntryInput, FoodLogResult, RawFetchWindows } from './fetchWindows';
import { HealthSource } from './HealthSource';
import { computeHrZones, HeartRateSample, resolveMaxHr } from './hrZones';
import {
  EnergyRecord,
  ExerciseRecord,
  InstantSample,
  NutritionEntry,
  RawHealthData,
  SleepRecord,
  SleepStages,
  StepsRecord,
} from './types';

/**
 * Android **Health Connect** data source (`react-native-health-connect`).
 *
 * Reads the user's on-device health records from the Health Connect store and
 * maps them into the shared {@link RawHealthData} boundary, so the entire
 * derivation layer (`./derive`) is reused unchanged. The privacy boundary is
 * structural: this adapter only ever READS, except for the one user-authored
 * write — logging food to the Nutrition record type. Nothing here leaves the
 * device.
 *
 * HRV note: Health Connect exposes **RMSSD** (`HeartRateVariabilityRmssd`), so
 * every HRV value is tagged `hrvAlgorithm: 'RMSSD'`. This is NOT comparable to
 * the iOS HealthKit SDNN value (HEA-4 landmine) — the tag travels with the data
 * and the derivation layer never mixes the two.
 *
 * HR zones: Health Connect gives no pre-bucketed zone minutes, so for each
 * workout we read the `HeartRate` samples inside the session and bin them with
 * {@link ./hrZones.computeHrZones} against an HRmax derived from the user's age
 * (profile) or the observed maximum (ADR-006).
 *
 * Robustness (HEA-13 findings): SDK availability is a hard gate; every record
 * type is read in its own try/catch so one revoked permission degrades only
 * that metric; high-frequency types are paginated (HC caps reads at 1000/page).
 */

// ---------------------------------------------------------------------------
// Lazy, crash-safe module handle. This file is imported by deviceHealth.ts on
// every platform (only *instantiated* on Android), and by Jest, so a missing or
// absent native module must never throw at import time.
// ---------------------------------------------------------------------------

type Permission = { accessType: 'read' | 'write'; recordType: string };

interface HealthConnectModule {
  initialize(): Promise<boolean>;
  getSdkStatus?(): Promise<number>;
  requestPermission(perms: Permission[]): Promise<Permission[]>;
  getGrantedPermissions(): Promise<Permission[]>;
  revokeAllPermissions?(): Promise<void>;
  readRecords(
    recordType: string,
    options: ReadOptions,
  ): Promise<{ records: RawRecord[]; pageToken?: string }>;
  insertRecords(records: Record<string, unknown>[]): Promise<string[]>;
  /** Health Connect's cross-source AGGREGATE (deduped by the user's data-source
   * priority) — used for the "burned today" total so it matches what Google
   * Health shows, rather than our own single-source record pick. */
  aggregateRecord?(request: {
    recordType: string;
    timeRangeFilter: {
      operator: 'between';
      startTime: string;
      endTime: string;
    };
  }): Promise<{
    ENERGY_TOTAL?: { inKilocalories?: number };
    /** Total sleep time for the window, in SECONDS (the native bridge sends
     * `Duration.seconds`). Health Connect defines it as the sum of the sleep
     * stages excluding awake — the same figure the Google Health UI shows. */
    SLEEP_DURATION_TOTAL?: number;
  }>;
  /** Health Connect's grouped aggregate — one bucket per fixed 24h window from
   * the start instant. Used for the per-day burned totals behind the
   * calorie-deficit goal.
   *
   * We use the DURATION slicer, not the PERIOD one: react-native-health-connect
   * builds `AggregateGroupByPeriodRequest` with an Instant-based TimeRangeFilter
   * (`getTimeRangeFilter`, not `…Local`), which Health Connect rejects with
   * "Either use TimeRangeFilter with LocalDateTime or AggregateGroupByDuration".
   * The duration request takes the Instant filter we already send, and with the
   * window starting at local midnight its 24h buckets line up with calendar days
   * (bar the rare DST-shift day — acceptable for a burned-calorie rollup). */
  aggregateGroupByDuration?(request: {
    recordType: string;
    timeRangeFilter: {
      operator: 'between';
      startTime: string;
      endTime: string;
    };
    timeRangeSlicer: { duration: 'DAYS'; length: number };
  }): Promise<
    {
      startTime: string;
      endTime: string;
      result: { ENERGY_TOTAL?: { inKilocalories?: number } };
    }[]
  >;
  deleteRecordsByUuids?(
    recordType: string,
    uuids: string[],
    clientRecordIds: string[],
  ): Promise<void>;
  SdkAvailabilityStatus?: { SDK_AVAILABLE: number };
  /** The library's ExerciseType name→int enum — used to name sessions from the
   * authoritative, version-correct table rather than a hand-maintained one. */
  ExerciseType?: Record<string, number>;
}

interface ReadOptions {
  timeRangeFilter: {
    operator: 'between';
    startTime: string;
    endTime: string;
  };
  pageSize?: number;
  pageToken?: string;
  ascendingOrder?: boolean;
}

/** The subset of Health Connect record fields we consume. Everything optional —
 * the mapping reads defensively so a minor field-name drift is a one-line fix. */
interface RawRecord {
  metadata?: { id?: string; dataOrigin?: string };
  time?: string;
  startTime?: string;
  endTime?: string;
  count?: number;
  beatsPerMinute?: number;
  heartRateVariabilityMillis?: number;
  percentage?: number;
  exerciseType?: number;
  title?: string;
  notes?: string;
  segments?: unknown[];
  laps?: unknown[];
  name?: string;
  mealType?: number;
  stages?: { startTime: string; endTime: string; stage: number }[];
  samples?: { time: string; beatsPerMinute: number }[];
  energy?: EnergyQuantity;
  weight?: MassQuantity;
  protein?: MassQuantity;
  totalCarbohydrate?: MassQuantity;
  totalFat?: MassQuantity;
}

interface EnergyQuantity {
  inKilocalories?: number;
  inCalories?: number;
}
interface MassQuantity {
  inKilograms?: number;
  inGrams?: number;
}

let moduleHandle: HealthConnectModule | null | undefined;

function loadModule(): HealthConnectModule | null {
  if (moduleHandle !== undefined) return moduleHandle;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health-connect');
    moduleHandle = mod as HealthConnectModule;
  } catch {
    moduleHandle = null;
  }
  return moduleHandle;
}

// ---------------------------------------------------------------------------
// Permission sets.
// ---------------------------------------------------------------------------

/** Read record types we request. */
const READ_TYPES = [
  'HeartRateVariabilityRmssd',
  'RestingHeartRate',
  'SleepSession',
  'Steps',
  'ExerciseSession',
  'HeartRate',
  'ActiveCaloriesBurned',
  'TotalCaloriesBurned',
  'Nutrition',
  'Weight',
  'BodyFat',
] as const;

/** The core reads whose grant means "connected" (a subset that always exists on
 * any real source; nutrition/weight/bodyfat may legitimately be ungranted). */
const CORE_READ_TYPES = ['Steps', 'ExerciseSession', 'SleepSession'];

const PERMISSIONS: Permission[] = [
  ...READ_TYPES.map(recordType => ({
    accessType: 'read' as const,
    recordType,
  })),
  { accessType: 'write', recordType: 'Nutrition' },
];

// ---------------------------------------------------------------------------
// Small mapping helpers.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function originOf(r: RawRecord): string {
  return r.metadata?.dataOrigin ?? 'Health Connect';
}

function kcal(e: EnergyQuantity | undefined): number | null {
  if (!e) return null;
  if (typeof e.inKilocalories === 'number') return e.inKilocalories;
  if (typeof e.inCalories === 'number') return e.inCalories / 1000;
  return null;
}

function grams(m: MassQuantity | undefined): number | null {
  if (!m) return null;
  if (typeof m.inGrams === 'number') return m.inGrams;
  if (typeof m.inKilograms === 'number') return m.inKilograms * 1000;
  return null;
}

/** Stage ints that mean "not asleep": AWAKE and AWAKE_IN_BED. */
const AWAKE_STAGES = new Set([1, 7]);

/**
 * Health Connect `SleepStageType` ints → our four buckets. 5=DEEP, 6=REM,
 * 4=LIGHT, 2=SLEEPING(generic), 0=UNKNOWN, 1=AWAKE, 7=AWAKE_IN_BED,
 * 3=OUT_OF_BED.
 *
 * Two rules here exist to match the figure the user's own app shows, both
 * derived from real logged data (tag HEA-SLEEP):
 *
 * 1. EDGE vs INTERIOR wake. Awake segments at the very START or END of the
 *    session — falling asleep, and lying awake before getting up — are not part
 *    of the night and stay in `awakeMin`. Awake segments BETWEEN sleep stages
 *    are brief arousals within the sleep period, and count as light sleep.
 *    Counting all wake as awake is what made a night read ~33 minutes short of
 *    Google Health, with light short by the same amount: on a real night, 8 of
 *    41 wake minutes were at the edges and 33 were arousals.
 *
 *    Note this deliberately differs from Health Connect's own
 *    SLEEP_DURATION_TOTAL aggregate, which subtracts ALL wake and therefore
 *    reports the short number — it is the app's display that we are matching.
 *
 * 2. UNLABELLED time. Stage segments do not have to tile the session; anything
 *    no segment claims is sleep the device could not classify, so it goes to
 *    light. (On the logged nights the segments tile exactly and this is a no-op,
 *    but sources vary.)
 *
 * OUT_OF_BED is neither: it is excluded from the session before the remainder is
 * computed, so a trip to the kitchen is never counted as sleep. It is returned
 * alongside the buckets because the reported duration has to exclude it too.
 *
 * Exported for unit tests — not part of the HealthSource surface.
 */
export function accumulateStages(
  stages: { startTime: string; endTime: string; stage: number }[] | undefined,
  sessionStart: number,
  sessionEnd: number,
): { stages: SleepStages; outOfBedMin: number } | null {
  if (!stages || stages.length === 0) return null;
  const segs = stages
    .map(x => ({
      start: toMs(x.startTime),
      end: toMs(x.endTime),
      stage: x.stage,
    }))
    .filter(
      (x): x is { start: number; end: number; stage: number } =>
        x.start != null && x.end != null && x.end > x.start,
    )
    .sort((a, b) => a.start - b.start);
  if (segs.length === 0) return null;

  // The span of real sleep stages: everything outside it is edge wake.
  const isAsleep = (stage: number) => !AWAKE_STAGES.has(stage) && stage !== 3;
  const firstAsleep = segs.findIndex(x => isAsleep(x.stage));
  const lastAsleep = segs.map(x => isAsleep(x.stage)).lastIndexOf(true);

  const acc: SleepStages = { deepMin: 0, remMin: 0, lightMin: 0, awakeMin: 0 };
  // Every minute a segment claims, whichever bucket it lands in — what's left
  // of the session after this is the unclassified remainder.
  let claimedMin = 0;
  let outOfBedMin = 0;
  segs.forEach((x, i) => {
    const min = (x.end - x.start) / 60000;
    claimedMin += min;
    switch (x.stage) {
      case 5: // DEEP
        acc.deepMin += min;
        break;
      case 6: // REM
        acc.remMin += min;
        break;
      case 4: // LIGHT
      case 2: // SLEEPING (generic asleep)
      case 0: // UNKNOWN — inside the session, so asleep but unclassified
        acc.lightMin += min;
        break;
      case 1: // AWAKE
      case 7: // AWAKE_IN_BED
        // Interior arousal → light; at the edges of the night → awake.
        if (firstAsleep >= 0 && i > firstAsleep && i < lastAsleep) {
          acc.lightMin += min;
        } else {
          acc.awakeMin += min;
        }
        break;
      case 3: // OUT_OF_BED — claimed, but bucketed nowhere
        outOfBedMin += min;
        break;
      default:
        claimedMin -= min; // unknown int: leave it to the remainder rule
        break;
    }
  });

  // Whatever the segments left unclaimed is unclassified sleep (see above).
  // A minute of slack absorbs rounding on segment boundaries.
  const sessionMin = (sessionEnd - sessionStart) / 60000;
  const remainder = sessionMin - claimedMin;
  if (remainder > 1) acc.lightMin += remainder;
  return { stages: acc, outOfBedMin };
}

/** Health Connect MealType int → a stable string label (or null). */
function mealTypeLabel(t: number | undefined): string | null {
  switch (t) {
    case 1:
      return 'breakfast';
    case 2:
      return 'lunch';
    case 3:
      return 'dinner';
    case 4:
      return 'snack';
    default:
      return null;
  }
}

/**
 * String meal-type label → Health Connect MealType int. Inverse of
 * {@link mealTypeLabel}. Health Connect's Nutrition.mealType is a numeric enum,
 * so the coach's string label ("BREAKFAST") MUST be mapped before insert or the
 * native layer throws ("cannot be cast from String to double"). Case-insensitive;
 * returns undefined for anything unmapped so the field is simply omitted. */
function mealTypeInt(label: string | undefined): number | undefined {
  switch (label?.toUpperCase()) {
    case 'BREAKFAST':
      return 1;
    case 'LUNCH':
      return 2;
    case 'DINNER':
      return 3;
    case 'SNACK':
      return 4;
    default:
      return undefined;
  }
}

/**
 * Health Connect `ExerciseSessionRecord.exerciseType` (a numeric AndroidX enum)
 * → a canonical UPPER_SNAKE activity name. Sessions almost never carry a `title`,
 * and the enum is an int, so without this the activity list showed a bare number
 * and type/displayName goal-matching had nothing meaningful to match on.
 *
 * The five ints the derivation layer categorizes on stay authoritative and MUST
 * agree with derive.ts (STRENGTH_TRAINING=70, WEIGHTLIFTING=65, PILATES=48,
 * YOGA=83, WALKING=79 → strength/core/non-cardio); the rest name the common
 * cardio types so the list and goal picker read naturally. Unknown ints fall
 * back to WORKOUT (still counted as generic zone-2 cardio).
 */
const HC_EXERCISE_NAME_FALLBACK: Record<number, string> = {
  0: 'WORKOUT',
  8: 'BIKING',
  9: 'BIKING_STATIONARY',
  25: 'ELLIPTICAL',
  26: 'EXERCISE_CLASS',
  36: 'HIIT',
  37: 'HIKING',
  38: 'ICE_HOCKEY',
  48: 'PILATES',
  53: 'ROWING',
  54: 'ROWING_MACHINE',
  56: 'RUNNING',
  57: 'RUNNING_TREADMILL',
  65: 'SOFTBALL',
  70: 'STRENGTH_TRAINING',
  74: 'SWIMMING',
  76: 'TENNIS',
  79: 'WALKING',
  81: 'WEIGHTLIFTING',
  83: 'YOGA',
};

/**
 * exerciseType-int → NAME table. Prefer the library's OWN authoritative
 * `ExerciseType` enum (inverted) so every type is correct + complete for the
 * installed version (e.g. 38=ICE_HOCKEY, 65=SOFTBALL, 81=WEIGHTLIFTING — values
 * the old hand-map got wrong), falling back to the curated subset when the
 * native module isn't loaded (iOS / Jest).
 */
function buildExerciseNames(mod: HealthConnectModule): Record<number, string> {
  const out: Record<number, string> = { ...HC_EXERCISE_NAME_FALLBACK };
  const enumMap = mod.ExerciseType;
  if (enumMap) {
    for (const [name, val] of Object.entries(enumMap)) {
      if (typeof val === 'number') out[val] = name;
    }
  }
  return out;
}

export class HealthConnectSource implements HealthSource {
  private initialized = false;

  isConfigured(): boolean {
    return loadModule() != null;
  }

  private async ensureInitialized(): Promise<HealthConnectModule | null> {
    const mod = loadModule();
    if (!mod) return null;
    try {
      if (mod.getSdkStatus) {
        const status = await mod.getSdkStatus();
        const available = mod.SdkAvailabilityStatus?.SDK_AVAILABLE ?? 3;
        if (status !== available) return null;
      }
      if (!this.initialized) {
        this.initialized = await mod.initialize();
      }
      return this.initialized ? mod : null;
    } catch (err) {
      console.warn('[HealthConnect] initialize failed', err);
      return null;
    }
  }

  async connect(): Promise<boolean> {
    const mod = await this.ensureInitialized();
    if (!mod) return false;
    try {
      await mod.requestPermission(PERMISSIONS);
      return this.isConnected();
    } catch (err) {
      console.warn('[HealthConnect] requestPermission failed', err);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const mod = loadModule();
    try {
      await mod?.revokeAllPermissions?.();
    } catch {
      // Grants are managed in system settings; nothing else to do locally.
    }
  }

  async isConnected(): Promise<boolean> {
    const mod = await this.ensureInitialized();
    if (!mod) return false;
    try {
      const granted = await mod.getGrantedPermissions();
      const readGranted = new Set(
        granted.filter(p => p.accessType === 'read').map(p => p.recordType),
      );
      return CORE_READ_TYPES.some(t => readGranted.has(t));
    } catch {
      return false;
    }
  }

  async readRaw(
    now: number,
    windows: RawFetchWindows,
  ): Promise<RawHealthData | null> {
    const mod = await this.ensureInitialized();
    if (!mod) return null;

    const sinceMetrics = new Date(
      now - windows.metricsDays * DAY_MS,
    ).toISOString();
    const sinceHrv = new Date(now - windows.hrvDays * DAY_MS).toISOString();
    const sinceExercise = new Date(
      now - windows.exerciseDays * DAY_MS,
    ).toISOString();
    const sinceSteps = new Date(now - windows.stepsDays * DAY_MS).toISOString();
    const sinceCalories = new Date(
      now - windows.caloriesDays * DAY_MS,
    ).toISOString();
    const nowIso = new Date(now).toISOString();

    const read = (recordType: string, start: string, maxPages = 4) =>
      this.readAll(mod, recordType, start, nowIso, maxPages);

    // Each type in its own read; a rejected permission yields [] (safeRead).
    const [
      hrvRecs,
      rhrRecs,
      sleepRecs,
      stepsRecs,
      exerciseRecs,
      activeRecs,
      totalRecs,
      nutritionRecs,
      weightRecs,
      bodyFatRecs,
    ] = await Promise.all([
      read('HeartRateVariabilityRmssd', sinceHrv, 12),
      read('RestingHeartRate', sinceMetrics, 3),
      read('SleepSession', sinceMetrics, 3),
      read('Steps', sinceSteps, 12),
      read('ExerciseSession', sinceExercise, 4),
      read('ActiveCaloriesBurned', sinceCalories, 12),
      read('TotalCaloriesBurned', sinceCalories, 12),
      read('Nutrition', sinceMetrics, 4),
      read('Weight', sinceMetrics, 3),
      read('BodyFat', sinceMetrics, 3),
    ]);
    // NOTE: HeartRate is NOT bulk-read here. Continuous HR over the exercise
    // window is enormous (tens of thousands of samples) and was the main cause
    // of slow loads. Zones are computed from small PER-SESSION HR reads below,
    // only for the recent sessions the cardio screen actually shows.

    const sources = new Set<string>();
    const tag = (r: RawRecord): string => {
      const s = originOf(r);
      sources.add(s);
      return s;
    };

    const hrvRmssd: InstantSample[] = [];
    for (const r of hrvRecs) {
      const time = toMs(r.time);
      if (time == null || typeof r.heartRateVariabilityMillis !== 'number')
        continue;
      hrvRmssd.push({
        value: r.heartRateVariabilityMillis,
        time,
        source: tag(r),
      });
    }
    // DIAGNOSTIC (HRV parity): per-NIGHT mean vs median, next to the old
    // per-UTC-day median, for the last 6 nights. Compare `median` against the
    // nightly figure the Google Health / Fitbit app shows — that is the number
    // the app now displays. `utcMedian` is what it used to show, and the gap
    // between the two is the night-bucketing fix (see nightIndex in ./derive).
    // If `median` still reads low and `mean` matches better, the nightly
    // aggregate should move to the mean. Tag: HEA-HRV. Remove once dialed in.
    {
      const med = (a: number[]): number => {
        const s = [...a].sort((x, y) => x - y);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      };
      const r1 = (x: number) => Math.round(x * 10) / 10;
      const bucket = (key: (t: number) => number) => {
        const by = new Map<number, number[]>();
        for (const s of hrvRmssd) {
          const k = key(s.time);
          const arr = by.get(k);
          if (arr) arr.push(s.value);
          else by.set(k, [s.value]);
        }
        return by;
      };
      const byNight = bucket(nightIndex);
      const byUtcDay = bucket(t => Math.floor(t / 86_400_000));
      const rows = [...byNight.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 6)
        .map(([night, v]) => {
          const utc = byUtcDay.get(night);
          return {
            night: new Date(nightIndexToTime(night)).toISOString().slice(0, 10),
            n: v.length,
            mean: r1(v.reduce((s, x) => s + x, 0) / v.length),
            median: r1(med(v)),
            utcMedian: utc ? r1(med(utc)) : null,
            min: r1(Math.min(...v)),
            max: r1(Math.max(...v)),
          };
        });
      console.log('[HEA-HRV] ' + JSON.stringify(rows));
    }

    const restingHr: InstantSample[] = [];
    for (const r of rhrRecs) {
      const time = toMs(r.time);
      if (time == null || typeof r.beatsPerMinute !== 'number') continue;
      restingHr.push({ value: r.beatsPerMinute, time, source: tag(r) });
    }

    const sleep: SleepRecord[] = [];
    for (const r of sleepRecs) {
      const start = toMs(r.startTime);
      const end = toMs(r.endTime);
      if (start == null || end == null || end <= start) continue;
      const acc = accumulateStages(r.stages, start, end);
      const spanMin = (end - start) / 60000;
      // Sleep duration is time ASLEEP — the sum of the sleep stages, excluding
      // awake. That is how Health Connect defines SLEEP_DURATION_TOTAL and what
      // the Google Health UI shows, so it is what we report; the awake split
      // stays visible in `stages`. When no stages were reported we cannot
      // separate awake, so the session span (less out-of-bed) is the best we
      // have.
      const asleepMin = acc
        ? acc.stages.deepMin + acc.stages.remMin + acc.stages.lightMin
        : 0;
      sleep.push({
        start,
        end,
        durationMin:
          asleepMin > 0 ? asleepMin : spanMin - (acc?.outOfBedMin ?? 0),
        source: tag(r),
        stages: acc ? acc.stages : null,
      });
    }

    // Sleep parity with Google Health: ask Health Connect for its OWN total per
    // NIGHT, over the same noon→noon window the app buckets nights into.
    //
    // Per-SESSION aggregation is useless here — within one session Health
    // Connect computes exactly what we do (span minus awake/out-of-bed), so it
    // always agrees and reconciles nothing. The gap is at the NIGHT level: the
    // platform counts sessions for the night that we do not end up showing
    // (a block we drop, or one our merge does not join), which is why the total
    // AND light sleep were short by the same ~33 minutes.
    //
    // Asking per night makes the figure immune to how we happen to split, merge
    // or drop the underlying records: whatever Health Connect counts for that
    // night is what we show.
    let nightlySleepAgg: { night: number; minutes: number }[] | null = null;
    if (mod.aggregateRecord) {
      const nights: number[] = [];
      for (let i = 0; i < 7; i++) nights.push(nightIndex(now) - i);
      const results = await Promise.all(
        nights.map(async night => {
          // Night N runs from local noon of the previous day to local noon of
          // the morning it ends on — the window nightIndex() defines.
          const noon = nightIndexToTime(night) + 12 * 60 * 60 * 1000;
          const from = new Date(noon - DAY_MS);
          const to = new Date(Math.min(noon, now));
          if (to.getTime() <= from.getTime()) return null;
          try {
            const agg = await mod.aggregateRecord!({
              recordType: 'SleepSession',
              timeRangeFilter: {
                operator: 'between',
                startTime: from.toISOString(),
                endTime: to.toISOString(),
              },
            });
            const seconds = agg?.SLEEP_DURATION_TOTAL;
            if (typeof seconds !== 'number' || seconds <= 0) return null;
            return { night, minutes: seconds / 60 };
          } catch (err) {
            console.warn('[HealthConnect] aggregate SleepSession failed', err);
            return null;
          }
        }),
      );
      const rows = results.filter(
        (r): r is { night: number; minutes: number } => r != null,
      );
      if (rows.length > 0) nightlySleepAgg = rows;
    }

    // DIAGNOSTIC (sleep parity). Everything needed to settle a mismatch against
    // the Google Health figure in one line, for the last two nights:
    //   platform  — Health Connect's own total for the night (what GH shows)
    //   ourAsleep — the sum of the sessions we kept, before reconciliation
    //   sessions  — every session, with its span and per-stage-type minutes
    // If `platform` is null the aggregate is unavailable and we are showing our
    // own sum; if it disagrees with `ourAsleep`, the `sessions` rows show which
    // block or which stage type we are losing. Tag: HEA-SLEEP.
    {
      const r0 = (x: number) => Math.round(x);
      const hm = (ms: number) => {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      };
      const hhmm = (min: number) =>
        `${Math.floor(min / 60)}:${String(r0(min % 60)).padStart(2, '0')}`;
      // Per-stage-type minutes straight off the raw records, unmapped — so a
      // stage int we bucket wrongly is visible as itself.
      const rawStageMinutes = (r: RawRecord) => {
        const out: Record<string, number> = {};
        for (const st of r.stages ?? []) {
          const a = toMs(st.startTime);
          const b = toMs(st.endTime);
          if (a == null || b == null || b <= a) continue;
          const k = `stage${st.stage}`;
          out[k] = (out[k] ?? 0) + r0((b - a) / 60000);
        }
        return out;
      };
      const byNight = new Map<number, typeof sleep>();
      for (const x of sleep) {
        const n = nightIndex(x.end);
        const arr = byNight.get(n);
        if (arr) arr.push(x);
        else byNight.set(n, [x]);
      }
      const rows = [...byNight.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 2)
        .map(([night, xs]) => ({
          night: new Date(nightIndexToTime(night)).toISOString().slice(0, 10),
          platform:
            nightlySleepAgg?.find(a => a.night === night)?.minutes != null
              ? hhmm(nightlySleepAgg.find(a => a.night === night)!.minutes)
              : null,
          ourAsleep: hhmm(xs.reduce((t, x) => t + x.durationMin, 0)),
          sessions: xs
            .sort((a, b) => a.start - b.start)
            .map(x => ({
              from: hm(x.start),
              to: hm(x.end),
              span: r0((x.end - x.start) / 60000),
              asleep: r0(x.durationMin),
              src: x.source,
              mapped: x.stages
                ? {
                    deep: r0(x.stages.deepMin),
                    rem: r0(x.stages.remMin),
                    light: r0(x.stages.lightMin),
                    awake: r0(x.stages.awakeMin),
                  }
                : null,
              raw: rawStageMinutes(
                sleepRecs.find(
                  r =>
                    toMs(r.startTime) === x.start && toMs(r.endTime) === x.end,
                ) ?? ({} as RawRecord),
              ),
            })),
        }));
      console.log('[HEA-SLEEP] ' + JSON.stringify(rows));
    }

    const steps: StepsRecord[] = [];
    for (const r of stepsRecs) {
      const start = toMs(r.startTime);
      const end = toMs(r.endTime);
      if (start == null || end == null || typeof r.count !== 'number') continue;
      steps.push({ count: r.count, start, end, source: tag(r) });
    }

    // Active energy indexed for per-session kcal attribution.
    const activeEnergy: EnergyRecord[] = [];
    for (const r of activeRecs) {
      const start = toMs(r.startTime);
      const end = toMs(r.endTime);
      const value = kcal(r.energy);
      if (start == null || end == null || value == null) continue;
      activeEnergy.push({ kcal: value, start, end, source: tag(r) });
    }

    const totalEnergy: EnergyRecord[] = [];
    for (const r of totalRecs) {
      const start = toMs(r.startTime);
      const end = toMs(r.endTime);
      const value = kcal(r.energy);
      if (start == null || end == null || value == null) continue;
      totalEnergy.push({ kcal: value, start, end, source: tag(r) });
    }

    // DIAGNOSTIC (burned-calories parity): today's Active vs Total calorie
    // records, grouped by source, with per-source count / summed kcal / covered
    // interval. Lets us see exactly what the "BURNED 1800 vs ~1000" number is
    // made of — which record type, which source(s), how many buckets and whether
    // they span the whole day. Tag: HEA-CAL. Remove once dialed in.
    {
      const startOfToday = now - (now % DAY_MS);
      const summarize = (recs: EnergyRecord[]) => {
        const bySrc = new Map<
          string,
          { n: number; kcal: number; first: number; last: number }
        >();
        for (const e of recs) {
          if (e.end <= startOfToday || e.start >= now) continue;
          const cur = bySrc.get(e.source) ?? {
            n: 0,
            kcal: 0,
            first: e.start,
            last: e.end,
          };
          cur.n += 1;
          cur.kcal += e.kcal;
          cur.first = Math.min(cur.first, e.start);
          cur.last = Math.max(cur.last, e.end);
          bySrc.set(e.source, cur);
        }
        return [...bySrc.entries()].map(([src, v]) => ({
          src,
          n: v.n,
          kcal: Math.round(v.kcal),
          from: new Date(v.first).toISOString(),
          to: new Date(v.last).toISOString(),
        }));
      };
      console.log(
        '[HEA-CAL] today ACTIVE ' + JSON.stringify(summarize(activeEnergy)),
      );
      console.log(
        '[HEA-CAL] today TOTAL ' + JSON.stringify(summarize(totalEnergy)),
      );
    }

    const exerciseNames = buildExerciseNames(mod);
    const exercise: ExerciseRecord[] = [];
    for (const r of exerciseRecs) {
      const start = toMs(r.startTime);
      const end = toMs(r.endTime);
      if (start == null || end == null || end <= start) continue;
      const overlapping = activeEnergy.filter(
        e => e.start < end && e.end > start,
      );
      const energyKcal = overlapping.length
        ? overlapping.reduce((s, e) => s + e.kcal, 0)
        : null;
      const exType = typeof r.exerciseType === 'number' ? r.exerciseType : 0;
      exercise.push({
        exerciseType: exType,
        // Name the activity from the enum (e.g. 56 → RUNNING) instead of a bare
        // number; a source-provided custom title becomes displayName. Both the
        // activities list and type/displayName goal-matching rely on this.
        typeName: exerciseNames[exType] ?? 'WORKOUT',
        displayName: r.title ?? null,
        start,
        end,
        durationMin: (end - start) / 60000,
        energyKcal,
        hrZones: null, // filled below, per session, from that session's HR
        source: tag(r),
      });
    }

    // HR zones for EVERY fetched session. The "Zone 2 minutes" goal means time
    // in HR zone 2 and above, so its 12-week history needs zones on the old
    // sessions too — not just the cardio-load screen's recent ones. Read
    // heart-rate PER SESSION (small, bounded) rather than a huge multi-week bulk
    // HeartRate pull; this is more reads than the old 8-day window, the accepted
    // cost of an HR-based (rather than session-length) zone-2 figure (ADR-006).
    const zoneSessions = exercise;
    const sessionHr = new Map<ExerciseRecord, HeartRateSample[]>();
    const allHr: HeartRateSample[] = [];
    for (const s of zoneSessions) {
      const recs = await this.readAll(
        mod,
        'HeartRate',
        new Date(s.start).toISOString(),
        new Date(s.end).toISOString(),
        6,
      );
      const samples: HeartRateSample[] = [];
      for (const rec of recs) {
        for (const smp of rec.samples ?? []) {
          const t = toMs(smp.time);
          if (t != null && typeof smp.beatsPerMinute === 'number') {
            samples.push({ time: t, bpm: smp.beatsPerMinute });
          }
        }
      }
      sessionHr.set(s, samples);
      allHr.push(...samples);
    }
    const hrMax = resolveMaxHr(profileAge(now), allHr);
    for (const s of zoneSessions) {
      s.hrZones = computeHrZones(sessionHr.get(s) ?? [], hrMax);
    }

    // DIAGNOSTIC (raw activity dump): the COMPLETE Health Connect ExerciseSession
    // records for the last 14 days — full JSON, exactly as the native module
    // returns them (nothing curated), plus a per-source count so multi-source
    // duplication is explicit. Tag: HEA-ACT. Remove once dialed in.
    {
      const twoWeeksAgo = now - 14 * DAY_MS;
      const recentRaw = exerciseRecs
        .filter(r => {
          const s = toMs(r.startTime);
          return s != null && s >= twoWeeksAgo;
        })
        .sort((a, b) => (toMs(b.startTime) ?? 0) - (toMs(a.startTime) ?? 0));
      const bySource = new Map<string, number>();
      for (const r of recentRaw) {
        const src = r.metadata?.dataOrigin ?? 'unknown';
        bySource.set(src, (bySource.get(src) ?? 0) + 1);
      }
      console.log(
        `[HEA-ACT] last 14 days: ${recentRaw.length} raw session(s); by source ` +
          JSON.stringify([...bySource.entries()]),
      );
      // One line per record = the FULL raw object (all fields the SDK returned).
      // Android may truncate a very long line (big segment/route arrays); that's
      // a logcat limit, not missing data.
      for (const r of recentRaw) {
        console.log('[HEA-ACT] raw ' + JSON.stringify(r));
      }
    }

    const nutrition: NutritionEntry[] = [];
    for (const r of nutritionRecs) {
      const start = toMs(r.startTime);
      const end = toMs(r.endTime) ?? start;
      if (start == null || end == null) continue;
      nutrition.push({
        start,
        end,
        name: r.name ?? 'Food',
        mealType: mealTypeLabel(r.mealType),
        kcal: kcal(r.energy),
        proteinG: grams(r.protein),
        carbsG: grams(r.totalCarbohydrate),
        fatG: grams(r.totalFat),
        id: r.metadata?.id ?? null,
        source: tag(r),
      });
    }

    const weight: InstantSample[] = [];
    for (const r of weightRecs) {
      const time = toMs(r.time);
      const kg = r.weight?.inKilograms;
      if (time == null || typeof kg !== 'number') continue;
      weight.push({ value: kg, time, source: tag(r) });
    }

    const bodyFat: InstantSample[] = [];
    for (const r of bodyFatRecs) {
      const time = toMs(r.time);
      if (time == null || typeof r.percentage !== 'number') continue;
      bodyFat.push({ value: r.percentage, time, source: tag(r) });
    }

    // Burned-calories parity with Google Health: use Health Connect's OWN
    // cross-source aggregate (deduped by the user's data-source priority and
    // clipped to [device-local midnight, now]) for today's total, instead of
    // our single-source record pick. This is the number the Health Connect /
    // Google Health UI shows — sources like Fitbit and Google Fit disagree on
    // TDEE, and HC's aggregate resolves them exactly as the system UI does.
    let energyBurnedTodayAgg: number | null = null;
    if (mod.aggregateRecord) {
      try {
        const localMidnight = new Date(now);
        localMidnight.setHours(0, 0, 0, 0);
        const agg = await mod.aggregateRecord({
          recordType: 'TotalCaloriesBurned',
          timeRangeFilter: {
            operator: 'between',
            startTime: localMidnight.toISOString(),
            endTime: new Date(now).toISOString(),
          },
        });
        const kcalVal = agg?.ENERGY_TOTAL?.inKilocalories;
        if (typeof kcalVal === 'number' && kcalVal > 0)
          energyBurnedTodayAgg = Math.round(kcalVal);
      } catch (err) {
        console.warn(
          '[HealthConnect] aggregate TotalCaloriesBurned failed',
          err,
        );
      }
    }

    // Per-day burned calories, from Health Connect's OWN grouped aggregate.
    //
    // The calorie-deficit goal needs a burned figure PER DAY, and deriving it
    // from raw records is not equivalent to the total the platform reports —
    // which is exactly why `energyBurnedTodayAgg` exists for today. Without this
    // the deficit goal silently showed nothing: a day needs BOTH eaten and
    // burned to produce a net, and when the raw energy records are absent or
    // unreadable (common — sources disagree on TDEE and some write only
    // aggregates) every day's burned came back null.
    //
    // A 24h DURATION slicer from local midnight buckets on local calendar days,
    // the boundary the user's own app uses (see the interface note on why this
    // is the duration request, not the period one).
    let dailyBurnedAgg: { dayStart: number; kcal: number }[] | null = null;
    if (mod.aggregateGroupByDuration) {
      try {
        const from = new Date(now - windows.caloriesDays * DAY_MS);
        from.setHours(0, 0, 0, 0);
        const groups = await mod.aggregateGroupByDuration({
          recordType: 'TotalCaloriesBurned',
          timeRangeFilter: {
            operator: 'between',
            startTime: from.toISOString(),
            endTime: new Date(now).toISOString(),
          },
          timeRangeSlicer: { duration: 'DAYS', length: 1 },
        });
        const rows = (groups ?? [])
          .map(g => ({
            dayStart: toMs(g.startTime) ?? 0,
            kcal: Math.round(g.result?.ENERGY_TOTAL?.inKilocalories ?? 0),
          }))
          .filter(g => g.dayStart > 0 && g.kcal > 0);
        if (rows.length > 0) dailyBurnedAgg = rows;
      } catch (err) {
        console.warn(
          '[HealthConnect] aggregateGroupByDuration TotalCaloriesBurned failed',
          err,
        );
      }
    }

    return {
      dailyBurnedAgg,
      nightlySleepAgg,
      hrvRmssd,
      hrvAlgorithm: 'RMSSD',
      restingHr,
      sleep,
      steps,
      exercise,
      activeEnergy,
      totalEnergy,
      nutrition,
      weight,
      bodyFat,
      energyBurnedTodayAgg,
      sources: [...sources],
      readAt: now,
    };
  }

  /** Paginated, crash-safe read of one record type. Returns [] on any failure
   * (e.g. a per-type SecurityException from a denied permission). */
  private async readAll(
    mod: HealthConnectModule,
    recordType: string,
    startTime: string,
    endTime: string,
    maxPages: number,
  ): Promise<RawRecord[]> {
    const out: RawRecord[] = [];
    let pageToken: string | undefined;
    try {
      for (let page = 0; page < maxPages; page++) {
        const res = await mod.readRecords(recordType, {
          timeRangeFilter: { operator: 'between', startTime, endTime },
          pageSize: 1000,
          pageToken,
        });
        out.push(...(res.records ?? []));
        pageToken = res.pageToken;
        if (!pageToken || (res.records ?? []).length === 0) break;
      }
    } catch (err) {
      console.warn(`[HealthConnect] read ${recordType} failed`, err);
      return out;
    }
    return out;
  }

  async createFoodEntry(
    input: FoodEntryInput,
    now: number,
  ): Promise<FoodLogResult> {
    const mod = await this.ensureInitialized();
    if (!mod) return { ok: false, error: 'not-connected' };
    const at = input.at ?? now;
    const record: Record<string, unknown> = {
      recordType: 'Nutrition',
      startTime: new Date(at).toISOString(),
      endTime: new Date(at + 60_000).toISOString(),
      energy: { value: input.kcal, unit: 'kilocalories' },
      name: input.name,
    };
    const mealType = mealTypeInt(input.mealType);
    if (mealType != null) record.mealType = mealType;
    if (input.proteinG != null)
      record.protein = { value: input.proteinG, unit: 'grams' };
    if (input.carbsG != null)
      record.totalCarbohydrate = { value: input.carbsG, unit: 'grams' };
    if (input.fatG != null)
      record.totalFat = { value: input.fatG, unit: 'grams' };
    try {
      const ids = await mod.insertRecords([record]);
      return { ok: true, name: ids?.[0] };
    } catch (err) {
      console.warn('[HealthConnect] insert Nutrition failed', err);
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const mod = await this.ensureInitialized();
    if (!mod?.deleteRecordsByUuids) return false;
    try {
      // The native API requires BOTH the uuid list and a clientRecordIds list;
      // omitting the (empty) third arg makes the bridge reject the cast and the
      // delete silently fails. We delete by uuid only, so pass [] for client ids.
      await mod.deleteRecordsByUuids('Nutrition', [id], []);
      return true;
    } catch (err) {
      console.warn('[HealthConnect] delete Nutrition failed', err);
      return false;
    }
  }
}
