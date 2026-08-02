import type { ComponentType } from 'react';

/** Every navigable destination in the app. */
export type ScreenName =
  | 'Today'
  | 'Nutrition'
  | 'Coach'
  | 'Trends'
  | 'Recovery'
  | 'Cardio'
  | 'Sleep'
  | 'Settings';

/**
 * Minimal navigation surface the screens depend on. React Navigation's own
 * `navigation` object is structurally compatible, and tests can pass a tiny
 * mock — screens never need the full typed param list.
 */
export interface AppNav {
  navigate: (screen: ScreenName) => void;
  goBack: () => void;
}

export interface ScreenProps {
  navigation: AppNav;
}

/**
 * Adapt a screen written against the minimal {@link ScreenProps} to the
 * component type React Navigation expects. At runtime the navigator injects a
 * full `navigation` object (a structural superset of {@link AppNav}) plus
 * `route`, which the screen ignores. This keeps screens testable with a tiny
 * navigation mock while satisfying the navigator's generics.
 */
export function asScreen(
  C: React.ComponentType<ScreenProps>,
): ComponentType<Record<string, unknown>> {
  return C as unknown as ComponentType<Record<string, unknown>>;
}

export type RootStackParamList = {
  Tabs: undefined;
  Recovery: undefined;
  Cardio: undefined;
  Sleep: undefined;
  Settings: undefined;
};

export type RootTabParamList = {
  Today: undefined;
  Nutrition: undefined;
  Coach: undefined;
  Trends: undefined;
};
