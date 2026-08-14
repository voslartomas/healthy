import type { ComponentType, ReactNode } from 'react';

/** Every navigable destination in the app. */
export type ScreenName =
  | 'Today'
  | 'Nutrition'
  | 'Coach'
  | 'Trends'
  | 'Recovery'
  | 'Cardio'
  | 'Sleep'
  | 'Settings'
  | 'DefineGoal'
  | 'Strength'
  | 'WorkoutBuilder'
  | 'ExercisePicker'
  | 'WorkoutRun'
  | 'WorkoutSummary';

/**
 * Minimal navigation surface the screens depend on. React Navigation's own
 * `navigation` object is structurally compatible, and tests can pass a tiny
 * mock — screens never need the full typed param list.
 */
export interface AppNav {
  navigate: (screen: ScreenName) => void;
  goBack: () => void;
  /** Replace the current screen in the stack (used to swap the runner for the
   * summary so "Done" returns to the list, not the finished run). The real
   * navigator provides this; tests pass a jest.fn(). */
  replace: (screen: ScreenName) => void;
  /** Set screen options at runtime, e.g. a header button. Typed minimally to
   * what our screens use; the real navigator's setOptions is a superset. */
  setOptions: (options: { headerLeft?: () => ReactNode }) => void;
  /** Subscribe to navigation lifecycle events. Typed minimally to the
   * `beforeRemove` event the runner uses to block leaving an in-progress
   * workout; the real navigator's addListener is a superset. Returns an
   * unsubscribe function. */
  addListener: (
    type: 'beforeRemove',
    listener: (e: { preventDefault: () => void }) => void,
  ) => () => void;
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
  /** Strength flow: build → (pick) → run → summary. All coordinate via the
   * strength store, so no route params are needed. */
  WorkoutBuilder: undefined;
  ExercisePicker: undefined;
  WorkoutRun: undefined;
  WorkoutSummary: undefined;
  /** Native modal screens. */
  Coach: undefined;
  DefineGoal: undefined;
};

/** The five numbered tabs of the v3 brief (Coach moved to a global FAB). */
export type RootTabParamList = {
  Today: undefined;
  Nutrition: undefined;
  Strength: undefined;
  Trends: undefined;
  Settings: undefined;
};
