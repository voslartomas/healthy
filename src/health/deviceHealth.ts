import { Platform } from 'react-native';

import { HealthConnectSource } from './HealthConnectSource';
import { HealthKitSource } from './HealthKitSource';
import { HealthSource } from './HealthSource';

/**
 * Pick the platform's native {@link HealthSource} once and memoize it: iOS →
 * HealthKit, everything else (Android) → Health Connect. This is the single
 * place the two adapters are wired; `./index` and the connect UI go through
 * {@link activeHealthSource} so nothing else needs a platform branch.
 */

let cached: HealthSource | null = null;

export function activeHealthSource(): HealthSource {
  if (!cached) {
    cached =
      Platform.OS === 'ios' ? new HealthKitSource() : new HealthConnectSource();
  }
  return cached;
}

/** Test hook: drop the memoized adapter so the next call re-selects. */
export function resetActiveHealthSourceForTests(): void {
  cached = null;
}
