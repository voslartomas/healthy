import { ageFromDob, profileAge } from '../state/useProfileStore';
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
 * unchanged. Read-only except the one user-authored write (logging food as a
 * dietary correlation). Nothing leaves the device.
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
// names track kingstinct's public API (v8/v9); everything is optional and
// accessed defensively so a minor drift is a one-line fix, not a crash.
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

interface WorkoutSample {
  uuid?: string;
  workoutActivityType?: number;
  duration?: number; // seconds
  startDate?: string | number | Date;
  endDate?: string | number | Date;
  totalEnergyBurned?: { quantity?: number } | number;
  sourceRevision?: { source?: { name?: string } };
  metadata?: Record<string, unknown>;
}

interface QueryOptions {
  from?: Date;
  to?: Date;
  limit?: number;
  ascending?: boolean;
}

interface HealthKitModule {
  isHealthDataAvailable?(): Promise<boolean>;
  requestAuthorization?(
    read: readonly string[],
    write?: readonly string[],
  ): Promise<boolean>;
  getRequestStatusForAuthorization?(
    read: readonly string[],
    write?: readonly string[],
  ): Promise<number>;
  authorizationStatusFor?(identifier: string): Promise<number>;
  queryQuantitySamples?(
    identifier: string,
    options?: QueryOptions,
  ): Promise<QuantitySample[]>;
  queryCategorySamples?(
    identifier: string,
    options?: QueryOptions,
  ): Promise<CategorySample[]>;
  queryWorkoutSamples?(options?: QueryOptions): Promise<WorkoutSample[]>;
  saveCorrelationSample?(
    identifier: string,
    samples: unknown[],
    options?: { start?: Date; end?: Date; metadata?: Record<string, unknown> },
  ): Promise<string | boolean>;
  saveQuantitySample?(
    identifier: string,
    unit: string,
    value: number,
    options?: { start?: Date; end?: Date; metadata?: Record<string, unknown> },
  ): Promise<string | boolean>;
  deleteObjects?(identifier: string, uuids: string[]): Promise<boolean>;
  getDateOfBirth?(): Promise<string | Date | null>;
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
} as const;

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
// (STRENGTH 70/65, PILATES 48, YOGA 83, WALKING 79; everything else 0 = cardio),
// so an iOS workout is categorized identically to an Android one.
// ---------------------------------------------------------------------------

const HK_WORKOUT_TO_INT: Record<number, number> = {
  50: 70, // traditionalStrengthTraining → STRENGTH_TRAINING
  20: 70, // functionalStrengthTraining → STRENGTH_TRAINING
  59: 81, // Olympic/weightlifting-ish → WEIGHTLIFTING (HC int 81)
  57: 83, // yoga → YOGA
  48: 48, // pilates → PILATES
  52: 79, // walking → WALKING
};

const HK_WORKOUT_NAME: Record<number, string> = {
  50: 'STRENGTH_TRAINING',
  20: 'STRENGTH_TRAINING',
  59: 'WEIGHTLIFTING',
  57: 'YOGA',
  48: 'PILATES',
  52: 'WALKING',
  37: 'RUNNING',
  13: 'CYCLING',
  46: 'SWIMMING',
  63: 'HIIT',
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

export class HealthKitSource implements HealthSource {
  isConfigured(): boolean {
    return loadModule() != null;
  }

  async connect(): Promise<boolean> {
    const mod = loadModule();
    if (!mod?.requestAuthorization) return false;
    try {
      if (mod.isHealthDataAvailable && !(await mod.isHealthDataAvailable())) {
        return false;
      }
      await mod.requestAuthorization(READ_TYPES, WRITE_TYPES);
      // HealthKit never reveals read-authorization status (privacy), so treat a
      // completed prompt as connected; a genuinely empty store just yields an
      // empty snapshot downstream.
      return true;
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
    try {
      if (mod.isHealthDataAvailable && !(await mod.isHealthDataAvailable())) {
        return false;
      }
      // Best-effort probe: a small steps read succeeding implies we can read.
      if (mod.queryQuantitySamples) {
        await mod.queryQuantitySamples(ID.steps, {
          from: new Date(Date.now() - DAY_MS),
          to: new Date(),
          limit: 1,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private async age(now: number): Promise<number | null> {
    const mod = loadModule();
    try {
      const dob = await mod?.getDateOfBirth?.();
      const ms = dob ? toMs(dob) : null;
      const fromHk = ms != null ? ageFromDob(ms, now) : null;
      if (fromHk != null) return fromHk;
    } catch {
      // fall through to profile
    }
    return profileAge(now);
  }

  private async qs(
    mod: HealthKitModule,
    identifier: string,
    from: Date,
    to: Date,
  ): Promise<QuantitySample[]> {
    try {
      return (await mod.queryQuantitySamples?.(identifier, { from, to })) ?? [];
    } catch (err) {
      console.warn(`[HealthKit] query ${identifier} failed`, err);
      return [];
    }
  }

  private toInstant(samples: QuantitySample[]): InstantSample[] {
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
    try {
      if (mod.isHealthDataAvailable && !(await mod.isHealthDataAvailable())) {
        return null;
      }
    } catch {
      return null;
    }

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
    activeS: QuantitySample[],
    basalS: QuantitySample[],
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
    let workouts: WorkoutSample[] = [];
    try {
      workouts = (await mod.queryWorkoutSamples?.({ from, to })) ?? [];
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
        (await mod.queryQuantitySamples?.(ID.heartRate, { from, to })) ?? [];
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
      const energy =
        typeof w.totalEnergyBurned === 'number'
          ? w.totalEnergyBurned
          : (w.totalEnergyBurned?.quantity ?? null);
      const inSession = hrSamples.filter(s => s.time >= start && s.time <= end);
      const hrZones: CardioZones | null = computeHrZones(inSession, hrMax);
      out.push({
        exerciseType: workoutTypeInt(w.workoutActivityType),
        typeName: workoutTypeName(w.workoutActivityType),
        displayName: null,
        start,
        end,
        durationMin:
          w.duration != null ? w.duration / 60 : (end - start) / 60000,
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
    let samples: CategorySample[] = [];
    try {
      samples =
        (await mod.queryCategorySamples?.(ID.sleep, { from, to })) ?? [];
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
    energyS: QuantitySample[],
    proteinS: QuantitySample[],
    carbsS: QuantitySample[],
    fatS: QuantitySample[],
    sources: Set<string>,
  ): NutritionEntry[] {
    const macroAt = (arr: QuantitySample[]) => {
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
        id: s.uuid ?? null,
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
    try {
      // Preferred: one dietary correlation grouping energy + macros.
      if (mod?.saveCorrelationSample) {
        const samples: unknown[] = [
          { identifier: ID.dietaryEnergy, unit: 'kcal', quantity: input.kcal },
        ];
        if (input.proteinG != null)
          samples.push({
            identifier: ID.dietaryProtein,
            unit: 'g',
            quantity: input.proteinG,
          });
        if (input.carbsG != null)
          samples.push({
            identifier: ID.dietaryCarbs,
            unit: 'g',
            quantity: input.carbsG,
          });
        if (input.fatG != null)
          samples.push({
            identifier: ID.dietaryFat,
            unit: 'g',
            quantity: input.fatG,
          });
        const res = await mod.saveCorrelationSample(
          'HKCorrelationTypeIdentifierFood',
          samples,
          {
            start,
            end,
            metadata: { HKFoodType: input.name },
          },
        );
        return { ok: true, name: typeof res === 'string' ? res : undefined };
      }
      // Fallback: save the energy quantity alone.
      if (mod?.saveQuantitySample) {
        const res = await mod.saveQuantitySample(
          ID.dietaryEnergy,
          'kcal',
          input.kcal,
          {
            start,
            end,
            metadata: { HKFoodType: input.name },
          },
        );
        return { ok: true, name: typeof res === 'string' ? res : undefined };
      }
      return { ok: false, error: 'not-connected' };
    } catch (err) {
      console.warn('[HealthKit] food write failed', err);
      return { ok: false, error: String((err as Error)?.message ?? err) };
    }
  }

  async deleteFoodEntry(id: string): Promise<boolean> {
    const mod = loadModule();
    if (!mod?.deleteObjects) return false;
    try {
      return !!(await mod.deleteObjects(ID.dietaryEnergy, [id]));
    } catch (err) {
      console.warn('[HealthKit] food delete failed', err);
      return false;
    }
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
