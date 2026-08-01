import { IconName } from '../components/Icon';

/** Auto-trackable goal sources, mirroring the design's `GOAL_SOURCES`. */
export type GoalSourceKey =
  'strength' | 'steps' | 'core' | 'zone2' | 'calories';

export interface GoalSource {
  key: GoalSourceKey;
  label: string;
  /** Unit suffix shown after the target, e.g. " min". */
  unit: string;
  /** Default weekly target used as the input placeholder. */
  defaultTarget: number;
  icon: IconName;
}

export const GOAL_SOURCES: Record<GoalSourceKey, GoalSource> = {
  strength: {
    key: 'strength',
    label: 'Strength workouts',
    unit: '',
    defaultTarget: 3,
    icon: 'strength',
  },
  steps: {
    key: 'steps',
    label: 'Steps',
    unit: '',
    defaultTarget: 56000,
    icon: 'steps',
  },
  core: {
    key: 'core',
    label: 'Core sessions',
    unit: '',
    defaultTarget: 5,
    icon: 'core',
  },
  zone2: {
    key: 'zone2',
    label: 'Zone 2 minutes',
    unit: ' min',
    defaultTarget: 90,
    icon: 'zone2',
  },
  calories: {
    key: 'calories',
    label: 'Active calories',
    unit: ' kcal',
    defaultTarget: 2500,
    icon: 'calories',
  },
};

export const GOAL_SOURCE_ORDER: GoalSourceKey[] = [
  'strength',
  'steps',
  'core',
  'zone2',
  'calories',
];

/**
 * Current week's auto-tracked totals per source. In the shipping app these come
 * from Google/Apple Health; here they are static sample values matching the
 * prototype so the dashboard renders meaningful progress.
 */
export const TRACKED: Record<GoalSourceKey, number> = {
  steps: 41200,
  strength: 2,
  core: 3,
  zone2: 64,
  calories: 2380,
};
