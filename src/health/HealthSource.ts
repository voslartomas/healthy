import {
  ExerciseLogResult,
  ExerciseSessionInput,
  FoodEntryInput,
  FoodLogResult,
  RawFetchWindows,
} from './fetchWindows';
import { CardioZones, RawHealthData } from './types';

/**
 * HR zones the caller already computed on an earlier read, offered back so a read
 * can skip the heart-rate pull for sessions it has already seen.
 *
 * This is what makes the periodic deep backfill cheap. Zones are read PER SESSION
 * (see ADR-006), so re-deriving twelve weeks of them costs one native round trip
 * per workout — for history that, being in the past, cannot have changed. With
 * this the deep read only pays for genuinely new sessions.
 *
 * {@link hrMax} is load-bearing, not informational: zones are minutes binned by
 * %HRmax, so two sets of zones are only comparable if they were binned against
 * the SAME HRmax. The reader compares the scale it is about to use against this
 * one and, if they differ (the user filled in their age, or a harder session
 * raised the observed maximum), discards the offer and recomputes everything so
 * the history can never end up a mix of two scales.
 */
export interface ZoneReuse {
  /** Zones by `derive.exerciseKey`. A null value means "already read, and this
   * session honestly has no zone data" — worth reusing too, so we don't re-read
   * heart rate for a session the source never recorded any for. */
  zones: Map<string, CardioZones | null>;
  /** The HRmax {@link zones} were binned against, or null if it was unresolvable. */
  hrMax: number | null;
}

/**
 * The platform data-source contract.
 *
 * The app reads on-device health data from the OS store — Android **Health
 * Connect** (`react-native-health-connect`) and iOS **HealthKit**
 * (`@kingstinct/react-native-healthkit`). Both adapters implement this single
 * interface and map their platform's records into the shared, normalized
 * {@link RawHealthData} boundary, so the entire correctness-critical derivation
 * layer (`./derive`) — dedup, baselines, readiness, cardio load, trends, goals —
 * is reused verbatim and stays fully unit-tested. `./index` picks the active
 * source via `Platform.select` and exposes the same public API the store already
 * calls, so nothing above this layer changes.
 *
 * Availability model (mirrors the old cloud path so the UI is unchanged):
 *  - {@link isConfigured} — the native module exists on this platform/build.
 *  - {@link connect}/{@link disconnect}/{@link isConnected} — the OS permission
 *    grant. `connect` shows the native permission sheet; there is no OAuth.
 *  - A read returns `null` (→ empty snapshot) whenever the source is
 *    unavailable or unauthorized — never a throw, never fabricated data.
 */
export interface HealthSource {
  /** True when this platform's native health module is available in this build. */
  isConfigured(): boolean;

  /** Prompt the OS permission sheet for our read + nutrition-write types.
   * Resolves true once at least the read grant is in place, false on cancel. */
  connect(): Promise<boolean>;

  /** Best-effort revoke/forget. Native stores mostly manage grants in system
   * settings, so this clears any local "connected" intent; resolves always. */
  disconnect(): Promise<void>;

  /** Whether we currently hold the read permissions needed to produce data. */
  isConnected(): Promise<boolean>;

  /** Read raw multi-source records over `windows`, mapped to {@link RawHealthData},
   * or null when unavailable/unauthorized. Returning raw (not a derived
   * snapshot) is what lets the store cache deep history and splice a light
   * recent read onto it (`./derive.mergeRaw`).
   *
   * `reuse` lets the caller hand back the HR zones it already holds from an
   * earlier read, so this one can skip the per-session heart-rate reads for
   * sessions that cannot have changed — see {@link ZoneReuse}. Purely an
   * optimization: ignoring it must produce the same result, only slower. */
  readRaw(
    now: number,
    windows: RawFetchWindows,
    reuse?: ZoneReuse,
  ): Promise<RawHealthData | null>;

  /** Write one user-authored food entry to the OS nutrition store, returning the
   * created record's id when available (for later edit/delete). Only nutrition
   * is ever written — derived body metrics stay read-only. */
  createFoodEntry(input: FoodEntryInput, now: number): Promise<FoodLogResult>;

  /** Delete a previously written food entry by the id from {@link createFoodEntry}. */
  deleteFoodEntry(id: string): Promise<boolean>;

  /** Write one completed strength/lift session to the OS exercise store,
   * returning the created record's id when available. Implemented on Health
   * Connect (Android); a no-op on HealthKit until a workout-write binding
   * exists. Heart rate from a wearable is correlated by time, not written here. */
  createExerciseSession(
    input: ExerciseSessionInput,
  ): Promise<ExerciseLogResult>;

  /** Delete a previously written exercise session by the id from
   * {@link createExerciseSession}. Returns false when unsupported/not connected. */
  deleteExerciseSession(id: string): Promise<boolean>;
}
