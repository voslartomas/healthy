import { createNavigationContainerRef } from '@react-navigation/native';

import { RootStackParamList } from './types';

/** Container-level navigation ref, so UI mounted outside a navigator screen —
 * e.g. the global Coach FAB overlay — can still push modal screens. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name],
): void {
  if (!navigationRef.isReady()) return;
  // The ref's overloads can't be satisfied generically (the param type depends
  // on the name), so the call is widened here — the signature above is what
  // callers are actually checked against.
  (navigationRef.navigate as (n: string, p?: unknown) => void)(name, params);
}
