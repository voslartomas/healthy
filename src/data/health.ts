import { IconName } from '../components/Icon';

/**
 * Static sample data transcribed from the design prototype. In the shipping app
 * these come from Google Health / Apple Health; centralizing them here keeps the
 * screens declarative and makes the eventual data-source swap a one-file change.
 */

export type MetricColorKey =
  'rec' | 'recAmber' | 'recRed' | 'strain' | 'sleep' | 'accent';

export interface MiniStat {
  label: string;
  colorKey: MetricColorKey;
  value: string;
  unit?: string;
  detail: string;
  trend: 'up' | 'down' | 'flat';
}

export const dashboard = {
  greeting: 'Good morning, Tomas',
  date: 'Saturday, Aug 1',
  weekLabel: 'This week · 3 days left',
  recovery: {
    pct: 68,
    state: 'Recovered',
    headline: "You're ready to push",
    body: 'HRV is up and sleep was solid. A moderate-to-high cardio load is well within reach today.',
  },
  stats: {
    sleep: {
      label: 'Sleep',
      colorKey: 'sleep',
      value: '7:42',
      detail: '84% performance',
      trend: 'up',
    } as MiniStat,
    load: {
      label: 'Cardio load',
      colorKey: 'strain',
      value: '12.4',
      detail: 'Target 8–14',
      trend: 'flat',
    } as MiniStat,
    hrv: {
      label: 'HRV',
      colorKey: 'rec',
      value: '62',
      unit: 'ms',
      detail: '▲ 7 vs 30-day',
      trend: 'up',
    } as MiniStat,
    rhr: {
      label: 'Resting HR',
      colorKey: 'recAmber',
      value: '54',
      unit: 'bpm',
      detail: '▼ 1 vs 30-day',
      trend: 'up',
    } as MiniStat,
  },
  energy: {
    net: -800,
    targetNet: -500,
    eaten: 1840,
    burned: 2640,
    eatenPct: 0.7,
    barFill: 0.62,
    targetMark: 0.78,
  },
  syncedNote: 'Synced 6:42 AM · Apple Watch, Oura Ring, Withings scale',
};

export interface Meal {
  name: string;
  detail: string;
  kcal: string;
  planned?: boolean;
}

export const nutrition = {
  kcalLeft: 300,
  budget: 2140,
  eaten: 1840,
  burned: 2640,
  net: -800,
  deficitTarget: -500,
  headline: 'On track for −500',
  body: 'Eaten 1,840 of a 2,140 budget. Stay under budget and today lands right on your configured deficit.',
  ringPct: 83,
  macros: [
    {
      name: 'Protein',
      current: 128,
      target: 165,
      unit: 'g',
      colorKey: 'protein' as const,
      fill: 0.78,
    },
    {
      name: 'Carbs',
      current: 172,
      target: 210,
      unit: 'g',
      colorKey: 'carbs' as const,
      fill: 0.82,
    },
    {
      name: 'Fat',
      current: 48,
      target: 62,
      unit: 'g',
      colorKey: 'fat' as const,
      fill: 0.77,
    },
  ],
  meals: [
    {
      name: 'Greek yogurt & berries',
      detail: 'Breakfast · 24g protein',
      kcal: '320',
    },
    { name: 'Chicken & rice bowl', detail: 'Lunch · 46g protein', kcal: '640' },
    { name: 'Protein shake', detail: 'Snack · 30g protein', kcal: '220' },
    {
      name: 'Salmon & greens',
      detail: 'Dinner · logged via coach',
      kcal: '660',
    },
    {
      name: '300 kcal remaining',
      detail: 'Tap coach to log more',
      kcal: '—',
      planned: true,
    },
  ] as Meal[],
};

export interface ChatMessage {
  from: 'ai' | 'me';
  text: string;
  macros?: string[];
}

export const coach = {
  status: 'Tracking calories & macros',
  messages: [
    {
      from: 'ai',
      text: "Morning Tomas. You have 300 kcal left to hit your −500 deficit. Protein's your lever today — 37g to go. Want to log a meal?",
    },
    { from: 'me', text: 'Had a chicken & rice bowl for lunch' },
    {
      from: 'ai',
      text: 'Logged it.',
      macros: ['640 kcal', '46P', '78C', '14F'],
    },
    {
      from: 'ai',
      text: 'Nice — that puts you at 128g protein. A salmon & greens dinner (~660 kcal) would land you right on target with 165g protein. Want me to pencil it in?',
    },
    { from: 'me', text: 'Yes, add that' },
    {
      from: 'ai',
      text: 'Done. Today projects to a −520 kcal deficit. Right where you want to be.',
    },
  ] as ChatMessage[],
  quickChips: [
    'Log breakfast',
    'Scan a meal photo',
    'How much protein left?',
    'Adjust my deficit',
  ],
};

export interface TrendMetric {
  key: string;
  label: string;
  value: string;
  unit: string;
  delta: string;
  colorKey: MetricColorKey | 'fat' | 'carbs' | 'protein';
  points: number[];
  avg: string;
  range: string;
}

export const trends: TrendMetric[] = [
  {
    key: 'weight',
    label: 'Weight',
    value: '78.4',
    unit: 'kg',
    delta: '▼ 1.0 kg this month',
    colorKey: 'accent',
    points: [79.4, 79.1, 78.9, 79.0, 78.7, 78.5, 78.4],
    avg: '78.9',
    range: '77.9–79.4',
  },
  {
    key: 'bodyfat',
    label: 'Body fat',
    value: '17.2',
    unit: '%',
    delta: '▼ 1.4% this month',
    colorKey: 'fat',
    points: [18.6, 18.3, 18.1, 17.9, 17.6, 17.4, 17.2],
    avg: '17.9',
    range: '17.2–18.6',
  },
  {
    key: 'hrv',
    label: 'HRV',
    value: '62',
    unit: 'ms',
    delta: '▲ 8 ms this month',
    colorKey: 'rec',
    points: [54, 58, 51, 62, 60, 65, 62],
    avg: '59',
    range: '51–65',
  },
  {
    key: 'rhr',
    label: 'RHR',
    value: '54',
    unit: 'bpm',
    delta: '▼ 4 bpm this month',
    colorKey: 'recAmber',
    points: [58, 57, 56, 55, 55, 54, 54],
    avg: '55',
    range: '54–58',
  },
  {
    key: 'recovery',
    label: 'Recovery',
    value: '68',
    unit: '%',
    delta: '▲ 6% this month',
    colorKey: 'strain',
    points: [61, 72, 48, 55, 80, 68, 68],
    avg: '65',
    range: '48–80',
  },
  {
    key: 'sleep',
    label: 'Sleep',
    value: '84',
    unit: '%',
    delta: '▲ 5% this month',
    colorKey: 'sleep',
    points: [78, 82, 71, 88, 84, 90, 84],
    avg: '82',
    range: '71–90',
  },
];

export const recovery = {
  pct: 68,
  updated: 'Today · updated 6:42 AM',
  body: 'Your body is primed. HRV climbed above your baseline and resting HR settled — a green day to add strain.',
  contributors: [
    {
      label: 'HRV',
      colorKey: 'rec',
      value: '62',
      unit: 'ms',
      detail: '▲ 7 vs baseline',
      trend: 'up',
    } as MiniStat,
    {
      label: 'Resting HR',
      colorKey: 'recAmber',
      value: '54',
      unit: 'bpm',
      detail: '▼ 1 vs baseline',
      trend: 'up',
    } as MiniStat,
    {
      label: 'Sleep',
      colorKey: 'sleep',
      value: '84',
      unit: '%',
      detail: '7h 42m',
      trend: 'up',
    } as MiniStat,
    {
      label: 'Resp. rate',
      colorKey: 'strain',
      value: '14.2',
      unit: 'rpm',
      detail: 'Normal',
      trend: 'flat',
    } as MiniStat,
  ],
  hrvSeries: [30, 44, 26, 58, 50, 72, 56, 66, 46, 74, 62, 78, 68, 76],
  hrvBaseline: 'Baseline 55 ms',
};

export interface HrZone {
  label: string;
  fill: number;
  colorKey: MetricColorKey | 'z4hard';
  minutes: string;
}

export interface Activity {
  name: string;
  detail: string;
  load: string;
  icon: IconName;
  colorKey: 'strain' | 'rec';
}

export interface WeekLoadBar {
  day: string;
  height: number;
  tone: 'default' | 'opt' | 'hi';
}

export const cardio = {
  load: '12.4',
  intensity: 'Moderate',
  subtitle: 'of an optimal 8–14 for 68% recovery',
  barFill: 0.7,
  optimalStart: 0.57,
  zones: [
    { label: 'Z5 · Max', fill: 0.08, colorKey: 'recRed', minutes: '3m' },
    { label: 'Z4 · Hard', fill: 0.26, colorKey: 'z4hard', minutes: '11m' },
    { label: 'Z3 · Aero', fill: 0.58, colorKey: 'recAmber', minutes: '24m' },
    { label: 'Z2 · Base', fill: 0.82, colorKey: 'rec', minutes: '33m' },
    { label: 'Z1 · Easy', fill: 0.4, colorKey: 'strain', minutes: '16m' },
  ] as HrZone[],
  activities: [
    {
      name: 'Morning run',
      detail: '42 min · avg 152 bpm · 6.8 km',
      load: '8.1',
      icon: 'run',
      colorKey: 'strain',
    },
    {
      name: 'Zone 2 ride',
      detail: '35 min · avg 128 bpm · 14 km',
      load: '4.3',
      icon: 'bike',
      colorKey: 'rec',
    },
  ] as Activity[],
  weekBars: [
    { day: 'M', height: 0.42, tone: 'default' },
    { day: 'T', height: 0.68, tone: 'opt' },
    { day: 'W', height: 0.3, tone: 'default' },
    { day: 'T', height: 0.88, tone: 'hi' },
    { day: 'F', height: 0.22, tone: 'default' },
    { day: 'S', height: 0.6, tone: 'opt' },
    { day: 'S', height: 0.12, tone: 'default' },
  ] as WeekLoadBar[],
  balanceNote: 'Acute:chronic 1.08',
};
