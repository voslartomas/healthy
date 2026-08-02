import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { LineChart, Sparkline } from '../../components/Charts';
import { AppHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { MetricColorKey, TrendMetric } from '../../data/health';
import { TrendPoint } from '../../health';
import {
  adherenceSeries,
  adherenceSummary,
  useCalorieGoalsStore,
  weeklyAdherence,
} from '../../state/useCalorieGoalsStore';
import { useDailyEnergyStore } from '../../state/useDailyEnergyStore';
import { useGoalHistoryStore } from '../../state/useGoalHistoryStore';
import { goalWeekly, useGoalsStore, WeeklyGoal } from '../../state/useGoalsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Format a number to a fixed precision (0 → integer). */
function fmt(n: number, decimals: number): string {
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

interface MetricConfig {
  key: string;
  label: string;
  unit: string;
  colorKey: TrendMetric['colorKey'];
  decimals: number;
}

const METRIC_CONFIG: MetricConfig[] = [
  { key: 'hrv', label: 'HRV', unit: 'ms', colorKey: 'rec', decimals: 0 },
  { key: 'rhr', label: 'RHR', unit: 'bpm', colorKey: 'recAmber', decimals: 0 },
  { key: 'sleep', label: 'Sleep', unit: 'h', colorKey: 'sleep', decimals: 1 },
  { key: 'recovery', label: 'Recovery', unit: '%', colorKey: 'strain', decimals: 0 },
];

/** Turn a daily series into the {@link TrendMetric} view-model the UI renders. */
function toMetric(cfg: MetricConfig, series: TrendPoint[]): TrendMetric {
  if (series.length === 0) {
    return {
      key: cfg.key,
      label: cfg.label,
      value: '-',
      unit: cfg.unit,
      delta: '',
      colorKey: cfg.colorKey as MetricColorKey,
      points: [],
      avg: '-',
      range: '-',
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
      ? 'flat this window'
      : `${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded)}${unitSuffix} this window`;
  return {
    key: cfg.key,
    label: cfg.label,
    value: fmt(last, cfg.decimals),
    unit: cfg.unit,
    delta,
    colorKey: cfg.colorKey as MetricColorKey,
    points: values,
    avg: fmt(avg, cfg.decimals),
    range: `${fmt(Math.min(...values), cfg.decimals)}–${fmt(Math.max(...values), cfg.decimals)}`,
  };
}

/** Signed kcal: "−420" / "+180" / "0". */
function signed(n: number): string {
  if (n < 0) return `\u2212${Math.abs(n)}`;
  if (n > 0) return `+${n}`;
  return '0';
}

/**
 * Calorie-goal adherence over the available window (~14 days): headline hit-rate
 * and average net, a per-day bar (green = hit, red = missed, grey = no data),
 * and a week-over-week breakdown.
 */
function CalorieAdherenceSection() {
  const t = useTheme();
  // Prefer the persisted history (grows past 14 days); fall back to the live
  // window before the first sync has populated the store.
  const persisted = useDailyEnergyStore(s => s.days);
  const live = useHealthStore(s => s.snapshot.dailyEnergy);
  const daily = persisted.length > 0 ? persisted : live;
  const goals = useCalorieGoalsStore(s => s.goals);
  const series = adherenceSeries(goals, daily);
  const overall = adherenceSummary(series);
  const weeks = [...weeklyAdherence(series)].reverse(); // newest week first
  const nets = series
    .filter(d => d.net != null)
    .map(d => Math.abs(d.net as number));
  const maxAbs = nets.length ? Math.max(...nets) : 1;
  const hasGoal = goals.length > 0;
  const hasData = daily.some(d => d.net != null);

  return (
    <>
      <SectionLabel>{`Calorie adherence · ${series.length} days`}</SectionLabel>
      <Card style={styles.adhCard}>
        {!hasGoal ? (
          <Text style={[styles.empty, { color: t.colors.muted }]}>
            Set a calorie goal on the Nutrition tab to track adherence.
          </Text>
        ) : !hasData ? (
          <Text style={[styles.empty, { color: t.colors.muted }]}>
            No net-calorie history yet — log food and connect Google Health.
          </Text>
        ) : (
          <>
            <View style={styles.adhHead}>
              <View>
                <Text style={[styles.adhBig, { color: t.colors.fg }]}>
                  {overall.adherencePct != null
                    ? `${overall.adherencePct}%`
                    : '—'}
                </Text>
                <Text style={[styles.adhSub, { color: t.colors.muted }]}>
                  hit {overall.daysHit}/{overall.daysWithData} days
                </Text>
              </View>
              <View style={styles.adhRight}>
                <Text style={[styles.adhBig, { color: t.colors.rec }]}>
                  {overall.avgNet != null ? signed(overall.avgNet) : '—'}
                </Text>
                <Text style={[styles.adhSub, { color: t.colors.muted }]}>
                  avg net kcal
                </Text>
              </View>
            </View>

            <View style={styles.bars}>
              {series.map(d => {
                const h =
                  d.net != null ? Math.max(0.06, Math.abs(d.net) / maxAbs) : 0;
                const color =
                  d.hit == null
                    ? t.colors.surface2
                    : d.hit
                      ? t.colors.rec
                      : t.colors.strain;
                return (
                  <View key={d.dayStart} style={styles.barTrack}>
                    <View
                      style={{
                        height: `${h * 100}%`,
                        backgroundColor: color,
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                      }}
                    />
                  </View>
                );
              })}
            </View>

            <View style={styles.weekWrap}>
              {weeks.map((w, i) => (
                <View
                  key={w.weekStart}
                  style={[
                    styles.weekRow,
                    i > 0 && {
                      borderTopColor: t.colors.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={[styles.weekLabel, { color: t.colors.muted }]}>
                    {i === 0 ? 'This week' : i === 1 ? 'Last week' : 'Earlier'}
                  </Text>
                  <Text style={[styles.weekVal, { color: t.colors.fg }]}>
                    {w.summary.adherencePct != null
                      ? `${w.summary.adherencePct}%`
                      : 'no data'}
                  </Text>
                  <Text style={[styles.weekAvg, { color: t.colors.muted }]}>
                    {w.summary.avgNet != null
                      ? `${signed(w.summary.avgNet)} avg`
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Card>
    </>
  );
}

interface HistWeek {
  weekStart: number;
  current: number;
  target: number;
  hit: boolean;
  complete: boolean;
}

/**
 * Weekly goal attainment — one compact card per goal, a bar per covered week
 * (green = hit, red = missed, amber = week in progress) plus a hit-rate. Durable
 * persisted history is overlaid with the freshly-computed recent weeks so the
 * current week stays live. Uncovered weeks (older than the data window) are
 * simply absent — never shown as a miss.
 */
function GoalAttainmentSection() {
  const t = useTheme();
  const goals = useGoalsStore(s => s.goals);

  if (goals.length === 0) {
    return (
      <>
        <SectionLabel>Goal history</SectionLabel>
        <Card style={styles.adhCard}>
          <Text style={[styles.empty, { color: t.colors.muted }]}>
            Define goals on the dashboard to track weekly hit-rate here.
          </Text>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionLabel>Goal history · weekly</SectionLabel>
      {goals.map(g => (
        <GoalHistoryRow key={g.id} goal={g} />
      ))}
    </>
  );
}

function GoalHistoryRow({ goal }: { goal: WeeklyGoal }) {
  const t = useTheme();
  const persisted = useGoalHistoryStore(s => s.weeks);
  const liveHistory = useHealthStore(s => s.snapshot.weeklyHistory);

  const weeks = useMemo<HistWeek[]>(() => {
    const byWeek = new Map<number, { current: number; target: number }>();
    for (const w of persisted) {
      if (w.goalId === goal.id) {
        byWeek.set(w.weekStart, { current: w.current, target: w.target });
      }
    }
    // Overlay freshly-computed covered weeks so the current week stays live.
    for (const w of goalWeekly(goal, liveHistory)) {
      if (w.covered) {
        byWeek.set(w.weekStart, { current: w.current, target: w.target });
      }
    }
    const entries = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
    // "Now" comes from the snapshot's latest bucket (pure) rather than the clock:
    // the most recent week is the one in progress, everything before it is done.
    const currentWeekStart =
      liveHistory.length > 0
        ? liveHistory[liveHistory.length - 1].weekStart
        : entries.length > 0
          ? entries[entries.length - 1][0]
          : 0;
    return entries
      .map(([weekStart, v]) => ({
        weekStart,
        current: v.current,
        target: v.target,
        hit: v.current >= v.target,
        complete: weekStart < currentWeekStart,
      }))
      .slice(-8);
  }, [goal, persisted, liveHistory]);

  const completed = weeks.filter(w => w.complete);
  const hits = completed.filter(w => w.hit).length;
  const unit = goal.minDurationMin ? ` · ≥${goal.minDurationMin}m` : '';

  return (
    <Card style={styles.ghCard}>
      <View style={styles.ghHead}>
        <Text style={[styles.ghName, { color: t.colors.fg }]} numberOfLines={1}>
          {goal.name}
          <Text style={[styles.ghUnit, { color: t.colors.faint }]}>{unit}</Text>
        </Text>
        <Text style={[styles.ghRate, { color: t.colors.muted }]}>
          {completed.length > 0 ? `hit ${hits}/${completed.length} wks` : 'new'}
        </Text>
      </View>
      {weeks.length === 0 ? (
        <Text style={[styles.empty, { color: t.colors.muted }]}>
          No history yet — check back after a week of tracking.
        </Text>
      ) : (
        <View style={styles.ghBars}>
          {weeks.map(w => {
            const frac = w.target > 0 ? Math.min(w.current / w.target, 1) : 0;
            const color = !w.complete
              ? t.colors.accent
              : w.hit
                ? t.colors.rec
                : t.colors.strain;
            return (
              <View key={w.weekStart} style={styles.ghBarTrack}>
                <View
                  style={{
                    height: `${Math.max(0.08, frac) * 100}%`,
                    backgroundColor: color,
                    borderTopLeftRadius: 3,
                    borderTopRightRadius: 3,
                  }}
                />
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** Trends screen: metric picker, main chart, and body/recovery mini-trends. */
export function TrendsScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const series = useHealthStore(s => s.snapshot.trends);
  const metrics: TrendMetric[] = [
    toMetric(METRIC_CONFIG[0], series.hrv),
    toMetric(METRIC_CONFIG[1], series.restingHr),
    toMetric(METRIC_CONFIG[2], series.sleepHours),
    toMetric(METRIC_CONFIG[3], series.readiness),
  ];
  const [active, setActive] = useState<string>('hrv');
  const metric = metrics.find(m => m.key === active) ?? metrics[0];
  const color = metricColor(t.colors, metric.colorKey);

  const up = metric.delta.startsWith('▲') || metric.delta.startsWith('▼');

  return (
    <Screen>
      <AppHeader
        eyebrow="Last 30 days"
        title="Trends"
        onAvatarPress={() => navigation.navigate('Settings')}
      />

      <CalorieAdherenceSection />

      <GoalAttainmentSection />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segment}
      >
        {metrics.map(m => {
          const on = m.key === active;
          return (
            <Pressable
              key={m.key}
              onPress={() => setActive(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.seg,
                on
                  ? { backgroundColor: t.colors.fg, borderColor: t.colors.fg }
                  : {
                      backgroundColor: t.colors.surface,
                      borderColor: t.colors.border,
                    },
              ]}
            >
              <Text
                style={[
                  styles.segText,
                  { color: on ? t.colors.bg : t.colors.muted },
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Card>
        <View style={styles.chartHead}>
          <View>
            <Text style={[styles.cv, { color: t.colors.fg }]}>
              {metric.value}
              {metric.value !== '-' && (
                <Text style={[styles.cvUnit, { color: t.colors.muted }]}>
                  {' '}
                  {metric.unit}
                </Text>
              )}
            </Text>
            {metric.delta !== '' && (
              <Text
                style={[styles.cd, { color: up ? t.colors.rec : t.colors.muted }]}
              >
                {metric.delta}
              </Text>
            )}
          </View>
          <Text style={[styles.cr, { color: t.colors.muted }]}>
            avg {metric.avg}
            {'\n'}range{'\n'}
            {metric.range}
          </Text>
        </View>
        {metric.points.length > 0 ? (
          <LineChart
            points={metric.points}
            color={color}
            gradientId="trendGrad"
          />
        ) : (
          <Text style={[styles.emptyChart, { color: t.colors.muted }]}>
            No data yet.
          </Text>
        )}
      </Card>

      <SectionLabel>All metrics</SectionLabel>
      <View style={styles.grid}>
        <MiniTrend metric={metrics[0]} />
        <MiniTrend metric={metrics[1]} />
      </View>
      <View style={{ height: 12 }} />
      <View style={styles.grid}>
        <MiniTrend metric={metrics[2]} />
        <MiniTrend metric={metrics[3]} />
      </View>
    </Screen>
  );
}

function MiniTrend({ metric, full }: { metric: TrendMetric; full?: boolean }) {
  const t = useTheme();
  const color = metricColor(t.colors, metric.colorKey);
  return (
    <Card style={full ? undefined : styles.gridItem}>
      <View style={styles.miniRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniK, { color: t.colors.muted }]}>
            {metric.label}
          </Text>
          <Text style={[styles.miniV, { color: t.colors.fg }]}>
            {metric.value}
            {metric.value !== '-' && (
              <Text style={[styles.miniUnit, { color: t.colors.muted }]}>
                {' '}
                {metric.unit}
              </Text>
            )}
          </Text>
        </View>
        {metric.points.length > 0 && (
          <Sparkline points={metric.points} color={color} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  segment: { gap: 6, paddingBottom: 14 },
  seg: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segText: { fontSize: 12.5, fontWeight: '700' },
  chartHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cv: {
    fontFamily: monoFont,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  cvUnit: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  cd: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  cr: {
    fontFamily: monoFont,
    fontSize: 11,
    lineHeight: 16.5,
    textAlign: 'right',
  },
  grid: { flexDirection: 'row', gap: 12 },
  gridItem: { flex: 1 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniK: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  miniV: {
    fontFamily: monoFont,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  miniUnit: { fontSize: 12, fontWeight: '700' },
  emptyChart: {
    fontFamily: monoFont,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 40,
  },
  adhCard: { marginBottom: 14 },
  empty: { fontSize: 12.5, paddingVertical: 8 },
  adhHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  adhRight: { alignItems: 'flex-end' },
  adhBig: {
    fontFamily: monoFont,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
  },
  adhSub: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 64,
    marginTop: 16,
    marginBottom: 4,
  },
  barTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  weekWrap: { marginTop: 12 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  weekLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  weekVal: {
    fontFamily: monoFont,
    fontSize: 13,
    fontWeight: '800',
    width: 64,
    textAlign: 'right',
  },
  weekAvg: {
    fontFamily: monoFont,
    fontSize: 12,
    fontWeight: '600',
    width: 96,
    textAlign: 'right',
  },
  ghCard: { marginBottom: 10 },
  ghHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
  },
  ghName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  ghUnit: { fontSize: 11, fontWeight: '700' },
  ghRate: {
    fontFamily: monoFont,
    fontSize: 11.5,
    fontWeight: '700',
  },
  ghBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 44,
    marginTop: 12,
  },
  ghBarTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
});
