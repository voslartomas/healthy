/**
 * Shared trend-metric view-model builders, used by both the Trends screen and
 * its live native-header delta. Real daily series → the {@link TrendMetric} the
 * design's metric explorer renders (value, monthly delta, avg, range, points).
 */
import { TrendMetric } from '../../data/health';
import { TrendPoint, TrendSeries } from '../../health';

export interface MetricConfig {
  key: string;
  label: string;
  unit: string;
  decimals: number;
  /** Whether a rising value is the good direction (drives delta colour). */
  goodUp: boolean;
}

export const METRIC_CONFIG: MetricConfig[] = [
  { key: 'weight', label: 'WEIGHT', unit: 'kg', decimals: 1, goodUp: false },
  { key: 'bodyfat', label: 'BODYFAT', unit: '%', decimals: 1, goodUp: false },
  { key: 'hrv', label: 'HRV', unit: 'ms', decimals: 0, goodUp: true },
  { key: 'rhr', label: 'RHR', unit: 'bpm', decimals: 0, goodUp: false },
  { key: 'sleep', label: 'SLEEP', unit: 'h', decimals: 1, goodUp: true },
  { key: 'sleepq', label: 'SLEEP Q', unit: '%', decimals: 0, goodUp: true },
  { key: 'recovery', label: 'RECOV', unit: '%', decimals: 0, goodUp: true },
];

/** Maps each metric key to its daily series in the snapshot's TrendSeries. */
const SERIES: Record<string, (t: TrendSeries) => TrendPoint[]> = {
  weight: t => t.weight,
  bodyfat: t => t.bodyFat,
  hrv: t => t.hrv,
  rhr: t => t.restingHr,
  sleep: t => t.sleepHours,
  sleepq: t => t.sleepQuality,
  recovery: t => t.readiness,
};

export function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

/** Turn a daily series into the view-model, "—" everywhere when it is empty. */
export function toMetric(cfg: MetricConfig, series: TrendPoint[]): TrendMetric {
  if (series.length === 0) {
    return {
      key: cfg.key,
      label: cfg.label,
      value: '—',
      unit: cfg.unit,
      delta: '',
      colorKey: 'accent',
      points: [],
      avg: '—',
      range: '—',
    };
  }
  const values = series.map(p => p.value);
  const last = values[values.length - 1];
  const first = values[0];
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const d = last - first;
  const rounded = cfg.decimals > 0 ? Math.round(d * 10) / 10 : Math.round(d);
  const unitSuffix = cfg.unit === '%' ? '%' : ` ${cfg.unit}`;
  const delta =
    rounded === 0
      ? 'FLAT / MO'
      : `${rounded > 0 ? '▲' : '▼'}${Math.abs(rounded)}${unitSuffix} / MO`.toUpperCase();
  return {
    key: cfg.key,
    label: cfg.label,
    value: fmt(last, cfg.decimals),
    unit: cfg.unit,
    delta,
    colorKey: 'accent',
    points: values,
    avg: fmt(avg, cfg.decimals),
    range: `${fmt(Math.min(...values), cfg.decimals)}–${fmt(Math.max(...values), cfg.decimals)}`,
  };
}

/** Every metric, in the order they appear as segments (and the first four as
 * the body-metric quad: weight / bodyfat / HRV / RHR). */
export function buildMetrics(trends: TrendSeries): TrendMetric[] {
  return METRIC_CONFIG.map(cfg => toMetric(cfg, SERIES[cfg.key](trends)));
}
