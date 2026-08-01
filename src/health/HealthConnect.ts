import { Platform } from 'react-native';

import { RawHealthData } from './types';

/**
 * Thin TS binding to the local Expo native module `HealthConnect`
 * (`modules/health-connect`, Kotlin, backed by androidx.health.connect). All
 * methods are Android-only; callers must gate on {@link isHealthConnectSupported}
 * first. The module is intentionally read-only — the privacy boundary says we
 * never write the user's health data.
 */

export type SdkStatus = 'available' | 'unavailable' | 'update_required';

export interface HealthConnectNative {
  /** Availability gate — MUST run before any read (HEA-4 §3). */
  getSdkStatus(): Promise<SdkStatus>;
  /** Read-permission strings currently granted (re-check every read; grants
   * can be revoked at any time and auto-revoke after ~30d idle — HEA-4 §4). */
  getGrantedPermissions(): Promise<string[]>;
  /** Open the Health Connect permission screen; resolves to granted perms. */
  requestPermissions(): Promise<string[]>;
  /** Read every supported record type over [startMs, endMs). Each type is read
   * in its own try/catch natively so one revoked permission (SecurityException)
   * degrades only that type, not the whole read (HEA-13 finding 4). */
  readAll(startMs: number, endMs: number): Promise<RawHealthData>;
}

let native: HealthConnectNative | null = null;
let loadAttempted = false;

/** Lazily resolve the native module. Returns null when unavailable (non-Android,
 * or a JS-only/dev build where the native side was not compiled in). */
function getNative(): HealthConnectNative | null {
  if (loadAttempted) return native;
  loadAttempted = true;
  if (Platform.OS !== 'android') return null;
  try {
    // Required lazily so Jest / iOS / web never touch expo-modules-core native.
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('HealthConnect') as HealthConnectNative;
  } catch {
    native = null;
  }
  return native;
}

/** True only when the native module is present (Android release/debug build). */
export function isHealthConnectSupported(): boolean {
  return getNative() != null;
}

export function getHealthConnect(): HealthConnectNative | null {
  return getNative();
}
