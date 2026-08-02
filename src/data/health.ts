/**
 * Static UI structure for the health screens — labels, colors, and units only.
 * All measured values come from the live health snapshot (Google Health);
 * anything without real data renders "-". No sample numbers live here.
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

/** Dashboard mini-stat definitions. `value`/`detail` are placeholders — the
 * screen overlays real snapshot values when present. */
export const dashboard = {
  stats: {
    sleep: {
      label: 'Sleep',
      colorKey: 'sleep',
      value: '-',
      detail: 'No data',
      trend: 'flat',
    } as MiniStat,
    load: {
      label: 'Cardio load',
      colorKey: 'strain',
      value: '-',
      detail: 'No data',
      trend: 'flat',
    } as MiniStat,
    hrv: {
      label: 'HRV',
      colorKey: 'rec',
      value: '-',
      unit: 'ms',
      detail: 'No data',
      trend: 'flat',
    } as MiniStat,
    rhr: {
      label: 'Resting HR',
      colorKey: 'recAmber',
      value: '-',
      unit: 'bpm',
      detail: 'No data',
      trend: 'flat',
    } as MiniStat,
  },
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

/** `TrendMetric` is the view-model the Trends screen renders; the real series
 * are built from the live snapshot in TrendsScreen (see toMetric). */
