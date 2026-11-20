import React from 'react';

import { ScreenProps } from '../../app/navigation/types';
import { MealLogger } from './MealLogger';

/**
 * "Log a meal" (MealLogger artboard, ADR-007): a full screen opened from the
 * Food tab, replacing the inline builder that used to unfold under the button.
 * The body — meal type, saved-food chips, typed items, the draft list and the
 * pinned log slab — is {@link MealLogger}; this closes the screen once the meal
 * is logged.
 */
export function MealLogScreen({ navigation }: ScreenProps) {
  return <MealLogger onDone={navigation.goBack} />;
}
