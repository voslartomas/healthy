import { profileAge } from '../state/useProfileStore';
import {
  ExerciseLogResult,
  ExerciseSessionInput,
  FoodEntryInput,
  FoodLogResult,
  RawFetchWindows,
} from './fetchWindows';
import { HealthSource } from './HealthSource';
import { computeHrZones, HeartRateSample, resolveMaxHr } from './hrZones';
import {
  CardioZones,
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
 * iOS **HealthKit** data source (`@kingstinct/react-native-healthkit`).
 *
 * Reads the user's on-device HealthKit samples and maps them into the shared
 * {@link RawHealthData} boundary so the derivation layer (`./derive`) is reused
 * unchanged. Read-only except the one user-authored write (logging food as
 * dietary samples). Nothing leaves the device.
 *
 * HRV note: HealthKit exposes **SDNN** (`HeartRateVariabilitySDNN`), so HRV is
 * tagged `hrvAlgorithm: 'SDNN'` — NOT comparable to Android's RMSSD (HEA-4).
 *
 * HR zones: HealthKit gives no bucketed zone minutes, so per workout we query
 * the heart-rate samples in the session window and bin them
 * ({@link ./hrZones.computeHrZones}) against an HRmax from the user's age —
 * preferring HealthKit's own `dateOfBirth` characteristic, else the profile,
 * else the observed max (ADR-006).
 *
 * TDEE: HealthKit has no single total-energy metric, so total = active
 * (`ActiveEnergyBurned`) + basal (`BasalEnergyBurned`), summed per day bucket.
 *
 * This file is imported on every platform by deviceHealth.ts but only
 * *instantiated* on iOS; the native module is loaded lazily inside try/catch so
 * it never crashes at import on Android or under Jest.
 */

// ---------------------------------------------------------------------------
// Lazy, crash-safe module handle + minimal typed surface. The concrete method
// names and shapes track kingstinct's v14 (Nitro) API — one options object per
// query (`{ filter: { date }, limit, unit }`), a single `{ toShare, toRead }`
// argument to requestAuthorization, and positional dates on the save calls.
// Everything is optional and accessed defensively so a minor drift is a
// one-line fix, not a crash.
// ---------------------------------------------------------------------------

interface QuantitySample {
  uuid?: string;
  quantity?: number;
  value?: number;
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  sourceRevision?: { source?: { name?: string } };
  device?: { name?: string };
  metadata?: Record<string, unknown>;
}

interface CategorySample {
  uuid?: string;
  value?: number;
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  sourceRevision?: { source?: { name?: string } };
}

interface Quantity {
  quantity?: number;
  unit?: string;
}

interface WorkoutSample {
  uuid?: string;
  workoutActivityType?: number;
  duration?: Quantity | number; // Quantity in seconds
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  totalEnergyBurned?: Quantity | number; // kcal
  sourceRevision?: { source?: { name?: string } };
  metadata?: Record<string, unknown>;
}

/** v14 sample predicate — only the pieces this adapter uses. */
interface SampleFilter {
  date?: { startDate?: Date; endDate?: Date };
  uuids?: string[];
  metadata?: {
    withMetadataKey: string;
    operatorType?: number;
    value?: string | number | boolean | Date;
  };
}

/** `limit` is required by the native side; <= 0 means "every sample". */
interface QueryOptions {
  filter?: SampleFilter;
  limit: number;
  ascending?: boolean;
  /** Explicit HKUnit string — otherwise the native side falls back to the
   * user's *preferred* (locale-dependent) unit, which would let kg silently
   * become lb. */
  unit?: string;
}

interface WorkoutQueryOptions {
  filter?: SampleFilter;
  limit: number;
  ascending?: boolean;
}

interface AuthRequest {
  toShare?: readonly string[];
  toRead?: readonly string[];
}

interface HealthKitModule {
  /** Sync in v14 (`isHealthDataAvailableAsync` is the promise variant). */
  isHealthDataAvailable?(): boolean;
  isHealthDataAvailableAsync?(): Promise<boolean>;
  requestAuthorization?(toRequest: AuthRequest): Promise<boolean>;
  // NOTE: `getRequestStatusForAuthorization` is deliberately NOT declared here.
  // Asking HealthKit about types no request has been made for raises an
  // Objective-C exception, and it is raised inside the completion handler —
  // past the module's @try guard and across Swift frames, so it lands as
  // EXC_BREAKPOINT (a hard process crash) that no JS try/catch can contain.
  // Settings mounts before any grant exists, so calling it there killed the
  // app. Probe with a read instead: an unauthorized query rejects politely
  // ("Authorization not determined") rather than trapping.
  queryQuantitySamples?(
    identifier: string,
    options: QueryOptions,
  ): Promise<readonly QuantitySample[]>;
  queryCategorySamples?(
    identifier: string,
    options: QueryOptions,
  ): Promise<readonly CategorySample[]>;
  queryWorkoutSamples?(
    options: WorkoutQueryOptions,
  ): Promise<readonly WorkoutSample[]>;
  saveQuantitySample?(
    identifier: string,
    unit: string,
    value: number,
    start: Date,
    end: Date,
    metadata?: Record<string, unknown>,
  ): Promise<{ uuid?: string } | undefined>;
  // saveCorrelationSample and getDateOfBirth are intentionally absent: both
  // need authorization for a type this adapter no longer requests.
  /** Returns the number of deleted objects. */
  deleteObjects?(identifier: string, filter: SampleFilter): Promise<number>;
}

let moduleHandle: HealthKitModule | null | undefined;

function loadModule(): HealthKitModule | null {
  if (moduleHandle !== undefined) return moduleHandle;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@kingstinct/react-native-healthkit');
    moduleHandle = (mod?.default ?? mod) as HealthKitModule;
  } catch {
    moduleHandle = null;
  }
  return moduleHandle;
}

// ---------------------------------------------------------------------------
// HealthKit identifiers (string constants; stable across the SDK).
// ---------------------------------------------------------------------------

const ID = {
  hrvSdnn: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  restingHr: 'HKQuantityTypeIdentifierRestingHeartRate',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  steps: 'HKQuantityTypeIdentifierStepCount',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  basalEnergy: 'HKQuantityTypeIdentifierBasalEnergyBurned',
  weight: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  dietaryEnergy: 'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  dietaryProtein: 'HKQuantityTypeIdentifierDietaryProtein',
  dietaryCarbs: 'HKQuantityTypeIdentifierDietaryCarbohydrates',
  dietaryFat: 'HKQuantityTypeIdentifierDietaryFatTotal',
  sleep: 'HKCategoryTypeIdentifierSleepAnalysis',
  workout: 'HKWorkoutTypeIdentifier',
  dateOfBirth: 'HKCharacteristicTypeIdentifierDateOfBirth',
  food: 'HKCorrelationTypeIdentifierFood',
} as const;

// Explicit HKUnit per identifier. Without these the native side asks HealthKit
// for the user's *preferred* unit, which is locale-dependent (lb vs kg, kJ vs
// kcal) — the derivation layer expects kg/kcal/ms unconditionally.
const UNIT: Record<string, string> = {
  [ID.hrvSdnn]: 'ms',
  [ID.restingHr]: 'count/min',
  [ID.heartRate]: 'count/min',
  [ID.steps]: 'count',
  [ID.activeEnergy]: 'kcal',
  [ID.basalEnergy]: 'kcal',
  [ID.weight]: 'kg',
  [ID.bodyFat]: '%',
  [ID.dietaryEnergy]: 'kcal',
  [ID.dietaryProtein]: 'g',
  [ID.dietaryCarbs]: 'g',
  [ID.dietaryFat]: 'g',
};

/** Custom metadata key stamped on every sample we write for one food entry, so
 * a later delete can remove the energy sample *and* its macros as a unit —
 * HealthKit hands each sample its own uuid, and the entry has no correlation
 * object to delete through. */
const ENTRY_KEY = 'HealthyFoodEntryId';

const READ_TYPES: string[] = [
  ID.hrvSdnn,
  ID.restingHr,
  ID.heartRate,
  ID.steps,
  ID.activeEnergy,
  ID.basalEnergy,
  ID.weight,
  ID.bodyFat,
  ID.dietaryEnergy,
  ID.dietaryProtein,
  ID.dietaryCarbs,
  ID.dietaryFat,
  ID.sleep,
  ID.workout,
  // NOTE: no characteristic type (date of birth) and no correlation type here.
  // HKHealthStore.requestAuthorization raises a synchronous Objective-C
  // exception for type sets it rejects, and because the raise crosses Swift
  // frames it kills the process (EXC_BREAKPOINT) instead of rejecting the
  // promise — nothing on the JS side can catch it. Keep both sets to plain
  // quantity/category/workout sample types; anything speculative here costs a
  // crash, not an error. See age() and createFoodEntry for the fallbacks.
];

const WRITE_TYPES: string[] = [
  ID.dietaryEnergy,
  ID.dietaryProtein,
  ID.dietaryCarbs,
  ID.dietaryFat,
];

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// HKWorkoutActivityType (numeric) → the exercise-type ints derive.ts keys off
// (STRENGTH 70, WEIGHTLIFTING 81, PILATES 48, YOGA 83, WALKING 79; everything
// else 0 = cardio), so an iOS workout is categorized identically to an Android
// one. The keys are HKWorkoutActivityType raw values — traditionalStrength 50,
// functionalStrength 20, coreTraining 59, pilates 66, yoga 57, walking 52.
// ---------------------------------------------------------------------------

const HK_WORKOUT_TO_INT: Record<number, number> = {
  50: 70, // traditionalStrengthTraining → STRENGTH_TRAINING
  20: 70, // functionalStrengthTraining → STRENGTH_TRAINING
  57: 83, // yoga → YOGA
  66: 48, // pilates → PILATES
  59: 48, // coreTraining → PILATES (derive's core proxy)
  52: 79, // walking → WALKING
};

const HK_WORKOUT_NAME: Record<number, string> = {
  50: 'STRENGTH_TRAINING',
  20: 'STRENGTH_TRAINING',
  57: 'YOGA',
  66: 'PILATES',
  59: 'CORE_TRAINING',
  52: 'WALKING',
  37: 'RUNNING',
  13: 'CYCLING',
  46: 'SWIMMING',
  63: 'HIIT',
  24: 'HIKING',
  35: 'ROWING',
  16: 'ELLIPTICAL',
  11: 'CROSS_TRAINING',
};

function workoutTypeInt(t: number | undefined): number {
  return t != null ? (HK_WORKOUT_TO_INT[t] ?? 0) : 0;
}

function workoutTypeName(t: number | undefined): string {
  return t != null ? (HK_WORKOUT_NAME[t] ?? 'WORKOUT') : 'WORKOUT';
}

function toMs(d: string | number | Date | undefined): number | null {
  if (d == null) return null;
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function sourceOf(s: {
  sourceRevision?: { source?: { name?: string } };
}): string {
  return s.sourceRevision?.source?.name ?? 'Apple Health';
}

function quantityOf(s: QuantitySample): number | null {
  const v = typeof s.quantity === 'number' ? s.quantity : s.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function amountOf(q: Quantity | number | undefined): number | null {
  if (typeof q === 'number') return Number.isFinite(q) ? q : null;
  const v = q?.quantity;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** `isHealthDataAvailable` is sync in v14; tolerate either shape. */
async function healthDataAvailable(mod: HealthKitModule): Promise<boolean> {
  try {
    if (mod.isHealthDataAvailable) return !!(await mod.isHealthDataAvailable());
    if (mod.isHealthDataAvailableAsync) {
      return !!(await mod.isHealthDataAvailableAsync());
    }
  } catch (err) {
    console.warn('[HealthKit] isHealthDataAvailable failed', err);
    return false;
  }
  return true; // no probe available — let the query decide.
}

/** The v14 query options for a time-windowed read of every matching sample. */
function windowOptions(
  identifier: string,
  from: Date,
  to: Date,
  limit = 0,
): QueryOptions {
  const unit = UNIT[identifier];
  return {
    filter: { date: { startDate: from, endDate: to } },
    limit,
    ...(unit ? { unit } : {}),
  };
}

export class HealthKitSource implements HealthSource {
  isConfigured(): boolean {
    return loadModule() != null;
  }

  async connect(): Promise<boolean> {
    const mod = loadModule();
    if (!mod?.requestAuthorization) return false;
    try {
      if (!(await healthDataAvailable(mod))) return false;
      // v14 takes ONE object: { toShare, toRead }. Passing the two arrays
      // positionally (the v8/v9 shape) made the native call reject, which the
      // UI surfaced as "permission was not granted".
      const ok = await mod.requestAuthorization({
        toShare: WRITE_TYPES,
        toRead: READ_TYPES,
      });
      // HealthKit never reveals read-authorization status (privacy), so treat a
      // completed prompt as connected; a genuinely empty store just yields an
      // empty snapshot downstream.
      if (ok) return true;
      // The sheet may have already been answered in an earlier session.
      return await this.authorized(mod);
    } catch (err) {
      console.warn('[HealthKit] requestAuthorization failed', err);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    // HealthKit exposes no revoke API — the user manages access in Settings.
    // Nothing to clear locally beyond the app's own connection intent.
  }

  async isConnected(): Promise<boolean> {
    const mod = loadModule();
    if (!mod) return false;
    if (!(await healthDataAvailable(mod))) return false;
    return this.authorized(mod);
  }

  /** Probe rather than ask: HealthKit hides read grants by design, but an
   * un-granted query rejects with "Authorization not determined", so a one-row
   * steps read that resolves means the sheet has been answered. Never uses
   * getRequestStatusForAuthorization — see the note on {@link HealthKitModule}. */
  private async authorized(mod: HealthKitModule): Promise<boolean> {
    if (!mod.queryQuantitySamples) return false;
    try {
      await mod.queryQuantitySamples(
        ID.steps,
        windowOptions(ID.steps, new Date(Date.now() - DAY_MS), new Date(), 1),
      );
      return true;
    } catch {
      return false;
    }
  }

  private async age(now: number): Promise<number | null> {
    // HealthKit's own dateOfBirth would be the better HRmax input (ADR-006),
    // but reading it means requesting a characteristic type, and the
    // authorization request is the call that crashes the process when
    // HealthKit dislikes a type set (see READ_TYPES). The profile's DOB is the
    // documented fallback, so take it rather than risk the app.
    return profileAge(now);
  }

  private async qs(
    mod: HealthKitModule,
    identifier: string,
    from: Date,
    to: Date,
  ): Promise<readonly QuantitySample[]> {
    try {
      return (
        (await mod.queryQuantitySamples?.(
          identifier,
          windowOptions(identifier, from, to),
        )) ?? []
      );
    } catch (err) {
      console.warn(`[HealthKit] query ${identifier} failed`, err);
      return [];
    }
  }

  private toInstant(samples: readonly QuantitySample[]): InstantSample[] {
    const out: InstantSample[] = [];
    for (const s of samples) {
      const time = toMs(s.startDate);
      const value = quantityOf(s);
      if (time == null || value == null) continue;
      out.push({ value, time, source: sourceOf(s) });
    }
    return out;
  }

  async readRaw(
    now: number,
    windows: RawFetchWindows,
  ): Promise<RawHealthData | null> {
    const mod = loadModule();
    if (!mod) return null;
    if (!(await healthDataAvailable(mod))) return null;

    const metricsFrom = new Date(now - windows.metricsDays * DAY_MS);
    const hrvFrom = new Date(now - windows.hrvDays * DAY_MS);
    const exerciseFrom = new Date(now - windows.exerciseDays * DAY_MS);
    const stepsFrom = new Date(now - windows.stepsDays * DAY_MS);
    const caloriesFrom = new Date(now - windows.caloriesDays * DAY_MS);
    const to = new Date(now);
    const sources = new Set<string>();

    const [
      hrvS,
      rhrS,
      stepsS,
      activeS,
      basalS,
      weightS,
      bodyFatS,
      dietEnergyS,
      dietProteinS,
      dietCarbsS,
      dietFatS,
    ] = await Promise.all([
      this.qs(mod, ID.hrvSdnn, hrvFrom, to),
      this.qs(mod, ID.restingHr, metricsFrom, to),
      this.qs(mod, ID.steps, stepsFrom, to),
      this.qs(mod, ID.activeEnergy, caloriesFrom, to),
      this.qs(mod, ID.basalEnergy, caloriesFrom, to),
      this.qs(mod, ID.weight, metricsFrom, to),
      this.qs(mod, ID.bodyFat, metricsFrom, to),
      this.qs(mod, ID.dietaryEnergy, metricsFrom, to),
      this.qs(mod, ID.dietaryProtein, metricsFrom, to),
      this.qs(mod, ID.dietaryCarbs, metricsFrom, to),
      this.qs(mod, ID.dietaryFat, metricsFrom, to),
    ]);

    const track = (arr: InstantSample[]): InstantSample[] => {
      for (const s of arr) sources.add(s.source);
      return arr;
    };

    const hrvRmssd = track(this.toInstant(hrvS));
    const restingHr = track(this.toInstant(rhrS));
    const weight = track(this.toInstant(weightS));
    const bodyFat = track(this.toInstant(bodyFatS));

    const steps: StepsRecord[] = [];
    for (const s of stepsS) {
      const start = toMs(s.startDate);
      const end = toMs(s.endDate) ?? start;
      const count = quantityOf(s);
      if (start == null || end == null || count == null) continue;
      const source = sourceOf(s);
      sources.add(source);
      steps.push({ count, start, end, source });
    }

    // Active energy records (also the "calories" activity metric).
    const activeEnergy: EnergyRecord[] = [];
    for (const s of activeS) {
      const start = toMs(s.startDate);
      const end = toMs(s.endDate) ?? start;
      const value = quantityOf(s);
      if (start == null || end == null || value == null) continue;
      const source = sourceOf(s);
      sources.add(source);
      activeEnergy.push({ kcal: value, start, end, source });
    }

    // TDEE per day = Σactive + Σbasal in the same UTC day bucket.
    const totalEnergy = this.buildTotalEnergy(activeS, basalS, sources);

    // Workouts + per-session HR zones.
    const exercise = await this.buildExercise(
      mod,
      exerciseFrom,
      to,
      now,
      sources,
    );

    // Sleep sessions from category samples.
    const sleep = await this.buildSleep(mod, metricsFrom, to, sources);

    // Nutrition: dietary-energy samples are the entries; macros matched by the
    // sample's start time (HealthKit correlations share a timestamp).
    const nutrition = this.buildNutrition(
      dietEnergyS,
      dietProteinS,
      dietCarbsS,
      dietFatS,
      sources,
    );

    return {
      hrvRmssd,
      hrvAlgorithm: 'SDNN',
      restingHr,
      sleep,
      steps,
      exercise,
      activeEnergy,
      totalEnergy,
      nutrition,
      weight,
      bodyFat,
      sources: [...sources],
      readAt: now,
    };
  }

  private buildTotalEnergy(
    activeS: readonly QuantitySample[],
    basalS: readonly QuantitySample[],
    sources: Set<string>,
  ): EnergyRecord[] {
    const byDay = new Map<number, { kcal: number; source: string }>();
    const add = (s: QuantitySample) => {
      const start = toMs(s.startDate);
      const value = quantityOf(s);
      if (start == null || value == null) return;
      const day = Math.floor(start / DAY_MS);
      const source = sourceOf(s);
      sources.add(source);
      const cur = byDay.get(day);
      byDay.set(day, {
        kcal: (cur?.kcal ?? 0) + value,
        source: 'Apple Health',
      });
    };
    for (const s of activeS) add(s);
    for (const s of basalS) add(s);
    const out: EnergyRecord[] = [];
    for (const [day, v] of byDay) {
      out.push({
        kcal: v.kcal,
        start: day * DAY_MS,
        end: (day + 1) * DAY_MS,
        source: v.source,
      });
    }
    return out;
  }

  private async buildExercise(
    mod: HealthKitModule,
    from: Date,
    to: Date,
    now: number,
    sources: Set<string>,
  ): Promise<ExerciseRecord[]> {
    let workouts: readonly WorkoutSample[] = [];
    try {
      workouts =
        (await mod.queryWorkoutSamples?.({
          filter: { date: { startDate: from, endDate: to } },
          limit: 0,
        })) ?? [];
    } catch (err) {
      console.warn('[HealthKit] query workouts failed', err);
      return [];
    }
    if (workouts.length === 0) return [];

    // Pull the heart-rate samples once across the whole window, then slice per
    // workout — one query instead of N, and a shared observed HRmax.
    const hrSamples: HeartRateSample[] = [];
    try {
      const hr =
        (await mod.queryQuantitySamples?.(
          ID.heartRate,
          windowOptions(ID.heartRate, from, to),
        )) ?? [];
      for (const s of hr) {
        const time = toMs(s.startDate);
        const bpm = quantityOf(s);
        if (time != null && bpm != null) hrSamples.push({ time, bpm });
      }
    } catch (err) {
      console.warn('[HealthKit] query heart-rate failed', err);
    }
    const hrMax = resolveMaxHr(await this.age(now), hrSamples);

    const out: ExerciseRecord[] = [];
    for (const w of workouts) {
      const start = toMs(w.startDate);
      const end = toMs(w.endDate);
      if (start == null || end == null || end <= start) continue;
      const source = sourceOf(w);
      sources.add(source);
      // v14 hands both totals back as Quantity objects (kcal / seconds).
      const energy = amountOf(w.totalEnergyBurned);
      const durationS = amountOf(w.duration);
      const inSession = hrSamples.filter(s => s.time >= start && s.time <= end);
      const hrZones: CardioZones | null = computeHrZones(inSession, hrMax);
      out.push({
        exerciseType: workoutTypeInt(w.workoutActivityType),
        typeName: workoutTypeName(w.workoutActivityType),
        displayName: null,
        start,
        end,
        durationMin: durationS != null ? durationS / 60 : (end - start) / 60000,
        energyKcal: energy,
        hrZones,
        source,
      });
    }
    return out;
  }

  private async buildSleep(
    mod: HealthKitModule,
    from: Date,
    to: Date,
    sources: Set<string>,
  ): Promise<SleepRecord[]> {
    let samples: readonly CategorySample[] = [];
    try {
      samples =
        (await mod.queryCategorySamples?.(
          ID.sleep,
          windowOptions(ID.sleep, from, to),
        )) ?? [];
    } catch (err) {
      console.warn('[HealthKit] query sleep failed', err);
      return [];
    }
    if (samples.length === 0) return [];

    // HKCategoryValueSleepAnalysis: 0=inBed, 1=asleepUnspecified, 2=awake,
    // 3=asleepCore, 4=asleepDeep, 5=asleepREM. Group asleep/awake segments into
    // sessions split by gaps > 45 min; ignore standalone inBed intervals.
    const SLEEP_GAP_MS = 45 * 60 * 1000;
    const segs = samples
      .map(s => ({
        start: toMs(s.startDate),
        end: toMs(s.endDate),
        value: s.value ?? 0,
        source: sourceOf(s),
      }))
      .filter(
        (
          s,
        ): s is { start: number; end: number; value: number; source: string } =>
          s.start != null && s.end != null && s.end > s.start && s.value !== 0,
      )
      .sort((a, b) => a.start - b.start);
    if (segs.length === 0) return [];

    const sessions: SleepRecord[] = [];
    let group: typeof segs = [];
    const flush = () => {
      if (group.length === 0) return;
      const start = group[0].start;
      const end = group[group.length - 1].end;
      const stages: SleepStages = {
        deepMin: 0,
        remMin: 0,
        lightMin: 0,
        awakeMin: 0,
      };
      let staged = false;
      let asleepMin = 0;
      for (const g of group) {
        const min = (g.end - g.start) / 60000;
        switch (g.value) {
          case 4:
            stages.deepMin += min;
            asleepMin += min;
            staged = true;
            break;
          case 5:
            stages.remMin += min;
            asleepMin += min;
            staged = true;
            break;
          case 3:
            stages.lightMin += min;
            asleepMin += min;
            staged = true;
            break;
          case 1:
            stages.lightMin += min;
            asleepMin += min;
            break;
          case 2:
            stages.awakeMin += min;
            break;
          default:
            break;
        }
      }
      const source = group[0].source;
      sources.add(source);
      // Asleep + awake, i.e. the whole grouped session — matching the Health
      // Connect path, where sleep duration counts brief awakenings inside the
      // night rather than deducting them (see accumulateStages there).
      const sessionMin = asleepMin + stages.awakeMin;
      sessions.push({
        start,
        end,
        durationMin: sessionMin > 0 ? sessionMin : (end - start) / 60000,
        source,
        stages: staged ? stages : null,
      });
      group = [];
    };
    for (const s of segs) {
      if (
        group.length &&
        s.start - group[group.length - 1].end > SLEEP_GAP_MS
      ) {
        flush();
      }
      group.push(s);
    }
    flush();
    return sessions;
  }

  private buildNutrition(
    energyS: readonly QuantitySample[],
    proteinS: readonly QuantitySample[],
    carbsS: readonly QuantitySample[],
    fatS: readonly QuantitySample[],
    sources: Set<string>,
  ): NutritionEntry[] {
    const macroAt = (arr: readonly QuantitySample[]) => {
      const m = new Map<number, number>();
      for (const s of arr) {
        const t = toMs(s.startDate);
        const v = quantityOf(s);
        if (t != null && v != null) m.set(t, (m.get(t) ?? 0) + v);
      }
      return m;
    };
    const protein = macroAt(proteinS);
    const carbs = macroAt(carbsS);
    const fat = macroAt(fatS);

    const out: NutritionEntry[] = [];
    for (const s of energyS) {
      const start = toMs(s.startDate);
      const end = toMs(s.endDate) ?? start;
      const kcal = quantityOf(s);
      if (start == null || end == null) continue;
      const source = sourceOf(s);
      sources.add(source);
      const foodName =
        (s.metadata?.HKFoodType as string | undefined) ??
        (s.metadata?.foodName as string | undefined) ??
        'Food';
      out.push({
        start,
        end,
        name: foodName,
        mealType: (s.metadata?.HKMealType as string | undefined) ?? null,
        kcal: kcal ?? null,
        proteinG: protein.get(start) ?? null,
        carbsG: carbs.get(start) ?? null,
        fatG: fat.get(start) ?? null,
        // Prefer our own entry id so a delete takes the macros with it; entries
        // written by other apps fall back to the sample's own uuid.
        id: (s.metadata?.[ENTRY_KEY] as string | undefined) ?? s.uuid ?? null,
        source,
      });
    }
    return out;
  }

  async createFoodEntry(
    input: FoodEntryInput,
    now: number,
  ): Promise<FoodLogResult> {
    const mod = loadModule();
    const at = input.at ?? now;
    const start = new Date(at);
    const end = new Date(at + 60_000);
    // One id stamped on every sample of this meal, so deleteFoodEntry can
    // remove them as a unit (see ENTRY_KEY).
    const entryId = `hk-${at}-${Math.random().toString(36).slice(2, 10)}`;
    const metadata: Record<string, unknown> = {
      HKFoodType: input.name,
      [ENTRY_KEY]: entryId,
      ...(input.mealType ? { HKMealType: input.mealType } : {}),
    };
    const macros: [string, number][] = [[ID.dietaryEnergy, input.kcal]];
    if (input.proteinG != null)
      macros.push([ID.dietaryProtein, input.proteinG]);
    if (input.carbsG != null) macros.push([ID.dietaryCarbs, input.carbsG]);
    if (input.fatG != null) macros.push([ID.dietaryFat, input.fatG]);

    // Written as individual samples, NOT as one HKCorrelation: saving a
    // correlation needs share authorization for the correlation type, and
    // asking for that is what we can no longer safely do (see WRITE_TYPES).
    // buildNutrition reassembles these into one entry by their shared start
    // time, so the app's own view is unchanged — only Apple Health's grouping
    // into a single named food row is lost.
    if (!mod?.saveQuantitySample) return { ok: false, error: 'not-connected' };
    try {
      for (const [identifier, value] of macros) {
        await mod.saveQuantitySample(
          identifier,
          UNIT[identifier],
          value,
          start,
          end,
          metadata,
        );
      }
      return { ok: true, name: entryId };
    } catch (err) {
      console.warn('[HealthKit] food write failed', err);
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const mod = loadModule();
    const del = mod?.deleteObjects;
    if (!del) return false;
    // Ids we minted (see createFoodEntry) live in sample metadata and cover the
    // energy sample plus its macros; anything else is another app's sample uuid.
    const ours = id.startsWith('hk-');
    const filter: SampleFilter = ours
      ? { metadata: { withMetadataKey: ENTRY_KEY, value: id } }
      : { uuids: [id] };
    const types = ours
      ? [ID.dietaryEnergy, ID.dietaryProtein, ID.dietaryCarbs, ID.dietaryFat]
      : [ID.dietaryEnergy];
    let deleted = 0;
    for (const type of types) {
      try {
        deleted += (await del.call(mod, type, filter)) ?? 0;
      } catch (err) {
        // HealthKit refuses to delete samples this app did not write, and a
        // meal without macros has nothing to delete for those types — neither
        // is a failure of the whole entry.
        console.warn(`[HealthKit] food delete ${type} failed`, err);
      }
    }
    return deleted > 0;
  }

  async createExerciseSession(
    _input: ExerciseSessionInput,
  ): Promise<ExerciseLogResult> {
    // Writing an HKWorkout needs an HKWorkoutBuilder binding the current native
    // module does not expose, so this is a deliberate no-op on iOS. Callers must
    // treat a failure here as "not written", exactly like an unconfigured store.
    return { ok: false, error: 'unsupported' };
  }

  async deleteExerciseSession(_id: string): Promise<boolean> {
    // Nothing is written on iOS (see createExerciseSession), so there is never
    // anything to delete.
    return false;
  }
}
