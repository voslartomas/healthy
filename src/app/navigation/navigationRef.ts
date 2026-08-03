import { createNavigationContainerRef } from '@react-navigation/native';

import { RootStackParamList } from './types';

/** Container-level navigation ref, so UI mounted outside a navigator screen —
 * e.g. the global Coach FAB overlay — can still push modal screens. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate(name: keyof RootStackParamList): void {
  if (navigationRef.isReady()) navigationRef.navigate(name as never);
}
