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
  | 'FoodsLibrary'
  | 'Strength'
  | 'WorkoutBuilder'
  | 'ExercisePicker'
  | 'WorkoutRun'
  | 'WorkoutSummary'
  | 'WorkoutsLibrary'
  | 'HabitDefine';

/**
 * Minimal navigation surface the screens depend on. React Navigation's own
 * `navigation` object is structurally compatible, and tests can pass a tiny
 * mock — screens never need the full typed param list.
 */
export interface AppNav {
  navigate: (screen: ScreenName, params?: ScreenParams) => void;
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

/** Route params a screen may be pushed with. Deliberately narrow — the two
 * screens that take any are the coach (pre-armed action, from the FAB's
 * long-press menu) and the habit sheet (the habit being edited). */
export interface ScreenParams {
  /** Coach: pre-select an action chip, so the FAB menu's "LOG FOOD" / "NEW
   * WORKOUT" lands in the chat with that action already armed. */
  intent?: string;
  /** HabitDefine: the habit to edit; omitted when creating a new one. */
  habitId?: string;
}

export interface ScreenProps {
  navigation: AppNav;
  /** Present when the navigator pushed the screen with params; absent in tests
   * that render a screen bare. */
  route?: { params?: ScreenParams };
}

/**
 * Adapt a screen written against the minimal {@link ScreenProps} to the
 * component type React Navigation expects. At runtime the navigator injects a
 * full `navigation` object (a structural superset of {@link AppNav}) plus
 * `route`, both of which {@link ScreenProps} types minimally. This keeps screens
 * testable with a tiny navigation mock while satisfying the navigator's
 * generics.
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
  WorkoutsLibrary: undefined;
  /** Native modal screens. */
  Coach: ScreenParams | undefined;
  DefineGoal: undefined;
  FoodsLibrary: undefined;
  HabitDefine: ScreenParams | undefined;
};

/** The five numbered tabs of the v3 brief (Coach moved to a global FAB). */
export type RootTabParamList = {
  Today: undefined;
  Nutrition: undefined;
  Strength: undefined;
  Trends: undefined;
  Settings: undefined;
};
