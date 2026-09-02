import { create } from 'zustand';

/** Spans the Trends screen can show, in days. The deep health read covers the
 * longest of these (FULL_METRICS_DAYS), so every option has data behind it. */
export const TREND_RANGES = [30, 90, 180] as const;

export type TrendRange = (typeof TREND_RANGES)[number];

/** The Trends metric and span currently selected. Lifted to a tiny store so the
 * native header can show the selected metric's delta (top-right, as in the
 * design) while the screen owns the pickers. */
interface TrendsState {
  activeKey: string;
  setActiveKey: (key: string) => void;
  /** How far back the chart and its stats look. */
  rangeDays: TrendRange;
  setRangeDays: (days: TrendRange) => void;
}

export const useTrendsStore = create<TrendsState>(set => ({
  // HRV opens the screen — it is the metric the brief leads on, and the first
  // segment in METRIC_CONFIG, so the picker's selection starts where the eye does.
  activeKey: 'hrv',
  setActiveKey: activeKey => set({ activeKey }),
  rangeDays: 30,
  setRangeDays: rangeDays => set({ rangeDays }),
}));
