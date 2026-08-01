import { TRACKED } from '../data/goalSources';
import { deriveSnapshot } from './derive';
import { fetchGoogleHealthRaw } from './GoogleHealthApi';
import { getHealthConnect } from './HealthConnect';
import { HealthSnapshot } from './types';

export * from './types';
export { isHealthConnectSupported } from './HealthConnect';
export { GOOGLE_HEALTH_SCOPES } from './GoogleHealthApi';

const DAY_MS = 24 * 60 * 60 * 1000;
const READ_WINDOW_MS = 30 * DAY_MS; // Health Connect default history (HEA-4 §3).

/**
 * Sample fallback snapshot — the numbers transcribed from the design prototype.
 * Used verbatim when live Health Connect data is unavailable (non-Android, no
 * permissions, SDK missing, or an empty read) so the UI is never blank and looks
 * exactly like the design on a device without a connected wearable.
 */
export const SAMPLE_SNAPSHOT: HealthSnapshot = {
  hrv: { value: 62, baseline: 55, delta: 7, algorithm: 'RMSSD' },
  restingHr: { value: 54, baseline: 55, delta: -1 },
  sleep: { hours: 462 / 60, performancePct: 84, lastSessionEnd: 0 },
  stepsToday: 8400,
  stepsThisWeek: TRACKED.steps,
  readiness: { pct: 68, state: 'Recovered' },
  tracked: { ...TRACKED },
  sources: ['Apple Watch', 'Oura Ring', 'Withings scale'],
  readAt: 0,
  live: false,
};

function hasAnyMetric(s: HealthSnapshot): boolean {
  return (
    s.hrv != null ||
    s.restingHr != null ||
    s.sleep != null ||
    s.stepsThisWeek > 0
  );
}

/**
 * OAuth access-token provider for the Google Health cloud source. The OAuth /
 * PKCE flow lives outside this module (it needs a Google client ID and the
 * platform keychain — see ADR-005 §"Remaining wiring"); when that flow is in
 * place it registers a getter here. Until then this stays null and
 * {@link readSnapshot} falls through to on-device Health Connect exactly as
 * before, so the cloud path is additive and cannot regress existing behaviour.
 */
type TokenProvider = () => Promise<string | null>;
let googleTokenProvider: TokenProvider | null = null;

export function setGoogleHealthTokenProvider(fn: TokenProvider | null): void {
  googleTokenProvider = fn;
}

/** True once a Google Health token provider has been registered. */
export function isGoogleHealthConfigured(): boolean {
  return googleTokenProvider != null;
}

/** Try the Google Health cloud source; null if unconfigured, unauthenticated,
 * or the read surfaced no usable metric (so callers fall back cleanly). */
async function readGoogleHealthSnapshot(
  now: number,
): Promise<HealthSnapshot | null> {
  if (!googleTokenProvider) return null;
  const token = await googleTokenProvider();
  if (!token) return null;
  const raw = await fetchGoogleHealthRaw(token, now, fetch as never);
  const snapshot = deriveSnapshot(raw, now);
  return hasAnyMetric(snapshot) ? snapshot : null;
}

/**
 * Read the current health snapshot, preferring real Health Connect data and
 * falling back to {@link SAMPLE_SNAPSHOT} at every gate: no native module, SDK
 * not available, no permissions granted, or a read that surfaced no usable
 * metric. The permission grant itself is re-checked on every call (HEA-4 §4).
 */
export async function readSnapshot(now: number): Promise<HealthSnapshot> {
  // Cloud Google Health source first when configured (cross-platform; ADR-005).
  // Any failure here degrades to the on-device path rather than throwing.
  try {
    const cloud = await readGoogleHealthSnapshot(now);
    if (cloud) return cloud;
  } catch (err) {
    console.warn('Google Health read failed; trying Health Connect', err);
  }

  const hc = getHealthConnect();
  if (!hc) return SAMPLE_SNAPSHOT;

  const status = await hc.getSdkStatus();
  if (status !== 'available') return SAMPLE_SNAPSHOT;

  const granted = await hc.getGrantedPermissions();
  if (granted.length === 0) return SAMPLE_SNAPSHOT;

  const raw = await hc.readAll(now - READ_WINDOW_MS, now);
  const snapshot = deriveSnapshot(raw, now);
  return hasAnyMetric(snapshot) ? snapshot : SAMPLE_SNAPSHOT;
}

/**
 * Prompt for Health Connect read permissions (Settings "Connect" action).
 * Returns true if any read permission is granted afterwards. No-op → false on
 * platforms without the native module.
 */
export async function connectHealthConnect(): Promise<boolean> {
  const hc = getHealthConnect();
  if (!hc) return false;
  if ((await hc.getSdkStatus()) !== 'available') return false;
  const granted = await hc.requestPermissions();
  return granted.length > 0;
}
