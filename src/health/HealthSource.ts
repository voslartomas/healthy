import { FoodEntryInput, FoodLogResult, RawFetchWindows } from './fetchWindows';
import { RawHealthData } from './types';

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
   * recent read onto it (`./derive.mergeRaw`). */
  readRaw(now: number, windows: RawFetchWindows): Promise<RawHealthData | null>;

  /** Write one user-authored food entry to the OS nutrition store, returning the
   * created record's id when available (for later edit/delete). Only nutrition
   * is ever written — derived body metrics stay read-only. */
  createFoodEntry(input: FoodEntryInput, now: number): Promise<FoodLogResult>;

  /** Delete a previously written food entry by the id from {@link createFoodEntry}. */
  deleteFoodEntry(id: string): Promise<boolean>;
}
