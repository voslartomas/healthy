import { profileAge } from '../state/useProfileStore';
import {
  FoodEntryInput,
  FoodLogResult,
  RawFetchWindows,
} from './fetchWindows';
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
  }): Promise<{ ENERGY_TOTAL?: { inKilocalories?: number } }>;
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
    moduleHandle = require('react-native-health-connect') as HealthConnectModule;
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
  ...READ_TYPES.map(recordType => ({ accessType: 'read' as const, recordType })),
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

/** Health Connect `SleepStageType` ints → our four buckets. 5=DEEP, 6=REM,
 * 4=LIGHT, 3=OUT_OF_BED-ish/AWAKE, 1=AWAKE, 2=SLEEPING(generic). */
function accumulateStages(
  stages: { startTime: string; endTime: string; stage: number }[] | undefined,
): SleepStages | null {
  if (!stages || stages.length === 0) return null;
  const acc: SleepStages = { deepMin: 0, remMin: 0, lightMin: 0, awakeMin: 0 };
  let sawStage = false;
  for (const s of stages) {
    const start = toMs(s.startTime);
    const end = toMs(s.endTime);
    if (start == null || end == null || end <= start) continue;
    const min = (end - start) / 60000;
    switch (s.stage) {
      case 5: // DEEP
        acc.deepMin += min;
        sawStage = true;
        break;
      case 6: // REM
        acc.remMin += min;
        sawStage = true;
        break;
      case 4: // LIGHT
      case 2: // SLEEPING (generic asleep) → count as light
        acc.lightMin += min;
        sawStage = true;
        break;
      case 1: // AWAKE
      case 7: // AWAKE_IN_BED
        acc.awakeMin += min;
        sawStage = true;
        break;
      default:
        break;
    }
  }
  return sawStage ? acc : null;
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

    const sinceMetrics = new Date(now - windows.metricsDays * DAY_MS).toISOString();
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
      read('HeartRateVariabilityRmssd', sinceMetrics, 3),
      read('RestingHeartRate', sinceMetrics, 2),
      read('SleepSession', sinceMetrics, 2),
      read('Steps', sinceSteps, 12),
      read('ExerciseSession', sinceExercise, 4),
      read('ActiveCaloriesBurned', sinceCalories, 12),
      read('TotalCaloriesBurned', sinceCalories, 12),
      read('Nutrition', sinceMetrics, 4),
      read('Weight', sinceMetrics, 2),
      read('BodyFat', sinceMetrics, 2),
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
      hrvRmssd.push({ value: r.heartRateVariabilityMillis, time, source: tag(r) });
    }
    // DIAGNOSTIC (HRV parity): per-day mean vs median (last 6 days) so we can
    // compare against the Google Health / Fitbit nightly figure and confirm the
    // median tracks it. Tag: HEA-HRV. Remove once dialed in.
    {
      const med = (a: number[]): number => {
        const s = [...a].sort((x, y) => x - y);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
      };
      const r1 = (x: number) => Math.round(x * 10) / 10;
      const byDay = new Map<number, number[]>();
      for (const s of hrvRmssd) {
        const d = Math.floor(s.time / 86_400_000);
        const arr = byDay.get(d);
        if (arr) arr.push(s.value);
        else byDay.set(d, [s.value]);
      }
      const rows = [...byDay.entries()]
        .sort((a, b) => b[0] - a[0])
        .slice(0, 6)
        .map(([d, v]) => ({
          day: new Date(d * 86_400_000).toISOString().slice(0, 10),
          n: v.length,
          mean: r1(v.reduce((s, x) => s + x, 0) / v.length),
          median: r1(med(v)),
          min: r1(Math.min(...v)),
          max: r1(Math.max(...v)),
        }));
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
      const stages = accumulateStages(r.stages);
      // Total sleep time is time actually ASLEEP (deep+REM+light), NOT the whole
      // in-bed session: awake minutes must LOWER sleep length/score, not pad it.
      // Falls back to the full span only when no stages were reported (can't
      // separate awake). Mirrors HealthKitSource's asleepMin semantics.
      const asleepMin = stages
        ? stages.deepMin + stages.remMin + stages.lightMin
        : 0;
      sleep.push({
        start,
        end,
        durationMin: asleepMin > 0 ? asleepMin : (end - start) / 60000,
        source: tag(r),
        stages,
      });
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
      console.log('[HEA-CAL] today ACTIVE ' + JSON.stringify(summarize(activeEnergy)));
      console.log('[HEA-CAL] today TOTAL ' + JSON.stringify(summarize(totalEnergy)));
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
        hrZones: null, // filled below for recent sessions only
        source: tag(r),
      });
    }

    // HR zones only for RECENT sessions (the cardio-load screen shows the last 7
    // days). Read heart-rate PER SESSION (small, bounded) rather than a huge
    // multi-week bulk HeartRate pull — that bulk read was the main load-time
    // cost. Older sessions keep hrZones=null (the screen never shows them).
    const ZONE_WINDOW_MS = 8 * DAY_MS;
    const zoneSessions = exercise.filter(e => e.end >= now - ZONE_WINDOW_MS);
    const sessionHr = new Map<ExerciseRecord, HeartRateSample[]>();
    const recentHr: HeartRateSample[] = [];
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
      recentHr.push(...samples);
    }
    const hrMax = resolveMaxHr(profileAge(now), recentHr);
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

    return {
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
