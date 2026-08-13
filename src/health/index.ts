import { Platform } from 'react-native';

import { activeHealthSource } from './deviceHealth';
import { deriveSnapshot } from './derive';
import {
  FoodEntryInput,
  FoodLogResult,
  FULL_WINDOWS,
  RawFetchWindows,
} from './fetchWindows';
import { HealthSnapshot, RawHealthData } from './types';

export * from './types';
export { deriveSnapshot, mergeRaw } from './derive';
export { FULL_WINDOWS, LIGHT_WINDOWS } from './fetchWindows';
export type {
  FoodEntryInput,
  FoodLogResult,
  RawFetchWindows,
} from './fetchWindows';

/**
 * Empty snapshot — every metric null/zero. Used whenever the live native source
 * is unavailable (not connected, permission denied, failed read) so the UI only
 * ever shows real data and renders "-" for anything missing.
 */
export const EMPTY_SNAPSHOT: HealthSnapshot = {
  hrv: null,
  restingHr: null,
  sleep: null,
  stepsToday: 0,
  stepsThisWeek: 0,
  readiness: null,
  nutrition: null,
  energyBurnedToday: 0,
  activities: [],
  cardio: {
    todayLoad: 0,
    weekLoad: 0,
    zones7d: { lightMin: 0, moderateMin: 0, vigorousMin: 0, peakMin: 0 },
    daily: [],
    hasZoneData: false,
    hasLoadData: false,
  },
  activityOptions: [],
  weeklyHistory: [],
  dailyEnergy: [],
  trends: {
    hrv: [],
    hrvRange: [],
    restingHr: [],
    rhrRange: [],
    sleepHours: [],
    sleepQuality: [],
    readiness: [],
    weight: [],
    bodyFat: [],
  },
  tracked: {},
  sources: [],
  readAt: 0,
  live: false,
};

/** True when the current platform's native health module is available. */
export function isHealthSourceConfigured(): boolean {
  return activeHealthSource().isConfigured();
}

/** Prompt the OS health-permission sheet. True once the read grant is in place. */
export function connectHealthSource(): Promise<boolean> {
  return activeHealthSource().connect();
}

/** Forget the local connection intent (native grants live in system settings). */
export function disconnectHealthSource(): Promise<void> {
  return activeHealthSource().disconnect();
}

/** Whether we currently hold the read permissions needed to produce data. */
export function isHealthSourceConnected(): Promise<boolean> {
  return activeHealthSource().isConnected();
}

/** Human label for the active platform's health store, for UI copy:
 * "Apple Health" on iOS, "Health Connect" on Android. */
export function healthSourceName(): string {
  return Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
}

/**
 * Read the current health snapshot from the active native source, returning
 * {@link EMPTY_SNAPSHOT} whenever the source is unavailable (not connected,
 * permission denied, or a failed read).
 */
export async function readSnapshot(now: number): Promise<HealthSnapshot> {
  const raw = await fetchRaw(now, FULL_WINDOWS);
  if (!raw) return EMPTY_SNAPSHOT;
  return deriveSnapshot(raw, now);
}

/**
 * Read RAW multi-source records over the given {@link RawFetchWindows}, or null
 * when the source is unavailable. Returning raw — not a derived snapshot — is
 * what lets the store cache the deep-history read and splice a light recent read
 * onto it ({@link ./derive.mergeRaw}) instead of re-reading everything.
 */
export async function fetchRaw(
  now: number,
  windows: RawFetchWindows = FULL_WINDOWS,
): Promise<RawHealthData | null> {
  const source = activeHealthSource();
  if (!source.isConfigured()) {
    console.warn('[health] no native source on this platform — empty snapshot');
    return null;
  }
  try {
    const raw = await source.readRaw(now, windows);
    if (raw) {
      console.log('[health] raw counts', {
        exercise: raw.exercise.length,
        steps: raw.steps.length,
        totalEnergy: raw.totalEnergy.length,
        nutrition: raw.nutrition.length,
        windows,
      });
    }
    return raw;
  } catch (err) {
    console.warn('[health] read failed', err);
    return null;
  }
}

/**
 * Log a food entry to the OS nutrition store (Health Connect / HealthKit).
 * Returns false (a no-op) when not connected. This is the only WRITE the app
 * performs, and only for user-authored food data.
 */
export async function logFood(
  input: FoodEntryInput,
  now: number = Date.now(),
): Promise<boolean> {
  return (await logFoodEntry(input, now)).ok;
}

/**
 * Like {@link logFood} but returns the created entry's native id (when the store
 * echoes it) so the caller can later edit or delete it.
 */
export async function logFoodEntry(
  input: FoodEntryInput,
  now: number = Date.now(),
): Promise<FoodLogResult> {
  const source = activeHealthSource();
  if (!source.isConfigured()) return { ok: false, error: 'not-configured' };
  return source.createFoodEntry(input, now);
}

/**
 * Delete a previously logged food entry by its native id. Returns false when
 * not connected or the delete failed.
 */
export async function removeFoodEntry(name: string): Promise<boolean> {
  const source = activeHealthSource();
  if (!source.isConfigured()) return false;
  return source.deleteFoodEntry(name);
}
