import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import { BriefScreen, M, S } from '../../components/brief';
import { useGoalHistoryStore } from '../../state/useGoalHistoryStore';
import { goalWeekly, useGoalsStore } from '../../state/useGoalsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTrendsStore } from '../../state/useTrendsStore';
import { useTheme } from '../../theme/theme';
import { buildMetrics, fmt, METRIC_CONFIG } from './metrics';

/** Project a series into [x,y] within a padded W×H box. */
function project(
  pts: number[],
  w: number,
  h: number,
  pad: number,
): [number, number][] {
  let min = Math.min(...pts),
    max = Math.max(...pts);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return pts.map((p, i) => [
    pad + (i * (w - 2 * pad)) / (pts.length - 1),
    h - pad - ((p - min) / (max - min)) * (h - 2 * pad),
  ]);
}

/** Centered moving average — each point averaged with `half` neighbours on each
 * side (clamped at the ends), so short series degrade gracefully toward the
 * overall mean. */
function movingAverage(pts: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return pts.map((_, i) => {
    let sum = 0,
      n = 0;
    for (
      let j = Math.max(0, i - half);
      j <= Math.min(pts.length - 1, i + half);
      j++
    ) {
      sum += pts[j];
      n++;
    }
    return sum / n;
  });
}

/**
 * The v3 trend line: baselines, an accent line, and value labels only on the
 * points that matter (latest + min + max), each drawn with a paper halo so the
 * line never runs through the digits. Only labelled points get a marker.
 */
function TrendChart({
  points,
  decimals,
}: {
  points: number[];
  decimals: number;
}) {
  const c = useTheme().colors;
  const W = 386,
    H = 170,
    PAD = 16;
  const xy = project(points, W, H, PAD);
  const line =
    'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
  const lastIdx = points.length - 1;
  const minIdx = points.indexOf(Math.min(...points));
  const maxIdx = points.indexOf(Math.max(...points));
  const labelled = [...new Set([minIdx, maxIdx, lastIdx])];
  const family = M(700, 10).fontFamily;

  // Rolling-average reference curve (centered moving average), on the same
  // y-scale as the series.
  let mn = Math.min(...points),
    mx = Math.max(...points);
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }
  const toY = (v: number) => H - PAD - ((v - mn) / (mx - mn)) * (H - 2 * PAD);
  const rolling = movingAverage(points, 7);
  const rollPath =
    'M' +
    rolling
      .map((v, i) => `${xy[i][0].toFixed(1)},${toY(v).toFixed(1)}`)
      .join(' L');
  const mean = points.reduce((s, v) => s + v, 0) / points.length;
  const avgText = `AVG ${fmt(mean, decimals)}`;
  const yAvgLabel = Math.min(Math.max(toY(mean) - 5, 10), H - 4);

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={styles.chart}>
      <Line x1={0} y1={150} x2={W} y2={150} stroke={c.hair} strokeWidth={1} />
      <Line
        x1={0}
        y1={90}
        x2={W}
        y2={90}
        stroke={c.hair}
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      <Line
        x1={0}
        y1={30}
        x2={W}
        y2={30}
        stroke={c.hair}
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      {/* Rolling-average curve */}
      <Path
        d={rollPath}
        fill="none"
        stroke={c.mut}
        strokeWidth={1.5}
        strokeDasharray="2 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={line}
        fill="none"
        stroke={c.acc}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {labelled.map(i => {
        const [x, y] = xy[i];
        const last = i === lastIdx;
        return (
          <Circle key={`d${i}`} cx={x} cy={y} r={last ? 4 : 3} fill={c.ink} />
        );
      })}
      {labelled.map(i => {
        const [x, y] = xy[i];
        const last = i === lastIdx;
        const above =
          i > 0 ? points[i] <= points[i - 1] : points[i] <= points[i + 1];
        const lx = Math.min(Math.max(x, 16), W - 16);
        const ly = above ? y - 11 : y + 17;
        const label = fmt(points[i], decimals);
        const size = last ? 12 : 10;
        return (
          <React.Fragment key={`l${i}`}>
            <SvgText
              x={lx}
              y={ly}
              fontSize={size}
              fontFamily={family}
              fill={c.bg}
              stroke={c.bg}
              strokeWidth={4}
              textAnchor="middle"
            >
              {label}
            </SvgText>
            <SvgText
              x={lx}
              y={ly}
              fontSize={size}
              fontFamily={family}
              fill={last ? c.acc : c.fnt}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          </React.Fragment>
        );
      })}
      <SvgText
        x={2}
        y={yAvgLabel}
        fontSize={8.5}
        fontFamily={family}
        fill={c.bg}
        stroke={c.bg}
        strokeWidth={3}
        textAnchor="start"
      >
        {avgText}
      </SvgText>
      <SvgText
        x={2}
        y={yAvgLabel}
        fontSize={8.5}
        fontFamily={family}
        fill={c.mut}
        textAnchor="start"
      >
        {avgText}
      </SvgText>
    </Svg>
  );
}

/** One column of the 12-week grid. `noData` weeks are older than our data
 * window (nothing to show yet) — rendered as an empty outlined cell so they read
 * as "not tracked yet" rather than a missed (filled) week. */
interface HistCell {
  key: string;
  noData: boolean;
  frac: number;
  met: boolean;
  current: boolean;
}
interface HistRow {
  id: string;
  name: string;
  cells: HistCell[];
  hit: number;
  completed: number;
}

/** The grid always shows this many week columns (design frame). */
const HIST_WEEKS = 12;

/** A legend swatch: filled, dashed-outline (NOW) or hairline-outline (NO DATA). */
function Legend({
  color,
  dashed,
  empty,
  label,
}: {
  color?: string;
  dashed?: boolean;
  empty?: boolean;
  label: string;
}) {
  const c = useTheme().colors;
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendSq,
          dashed
            ? { borderWidth: 1, borderColor: c.fnt, borderStyle: 'dashed' }
            : empty
              ? { borderWidth: 1, borderColor: c.hair }
              : { backgroundColor: color },
        ]}
      />
      <Text style={M(600, 9, { ls: 1, color: c.fnt })}>{label}</Text>
    </View>
  );
}

/**
 * Weekly-goal attainment over the last 12 covered weeks: a hit/close/missed grid
 * per goal (the in-progress week dashed), an overall hit-rate and a legend.
 */
function GoalsHistorySection() {
  const c = useTheme().colors;
  const goals = useGoalsStore(s => s.goals);
  const persisted = useGoalHistoryStore(s => s.weeks);
  const liveHistory = useHealthStore(s => s.snapshot.weeklyHistory);

  const rows = useMemo<HistRow[]>(() => {
    const currentWeekStart =
      liveHistory.length > 0
        ? liveHistory[liveHistory.length - 1].weekStart
        : Infinity;
    return goals.map(goal => {
      const byWeek = new Map<number, { current: number; target: number }>();
      for (const w of persisted) {
        if (w.goalId === goal.id)
          byWeek.set(w.weekStart, { current: w.current, target: w.target });
      }
      for (const w of goalWeekly(goal, liveHistory)) {
        if (w.covered)
          byWeek.set(w.weekStart, { current: w.current, target: w.target });
      }
      // The in-progress week must always occupy the rightmost ("THIS WK")
      // column — even before any activity lands this week. Without this, an
      // uncovered current week has no cell, so last week's completed (possibly
      // hit) cell right-aligns under the "THIS WK" label and reads as a session
      // already done this week. Seed it at zero only when neither live coverage
      // nor a persisted row already supplied a real value.
      if (currentWeekStart !== Infinity && !byWeek.has(currentWeekStart))
        byWeek.set(currentWeekStart, { current: 0, target: goal.target });
      const entries = [...byWeek.entries()]
        .sort((a, b) => a[0] - b[0])
        .slice(-HIST_WEEKS);
      // Right-align the real weeks in a fixed 12-column grid; pad the front with
      // "no data" columns for weeks older than our history window.
      const cells: HistCell[] = [];
      for (let i = 0; i < HIST_WEEKS - entries.length; i++) {
        cells.push({
          key: `e${i}`,
          noData: true,
          frac: 0,
          met: false,
          current: false,
        });
      }
      for (const [weekStart, v] of entries) {
        cells.push({
          key: `w${weekStart}`,
          noData: false,
          frac: v.target > 0 ? Math.min(v.current / v.target, 1) : 0,
          met: v.current >= v.target,
          current: weekStart >= currentWeekStart,
        });
      }
      const done = cells.filter(w => !w.noData && !w.current);
      return {
        id: goal.id,
        name: goal.name,
        cells,
        hit: done.filter(w => w.met).length,
        completed: done.length,
      };
    });
  }, [goals, persisted, liveHistory]);

  const totalHit = rows.reduce((s, r) => s + r.hit, 0);
  const totalDone = rows.reduce((s, r) => s + r.completed, 0);

  if (goals.length === 0) {
    return (
      <View style={[styles.section, { borderTopColor: c.hair }]}>
        <Text style={S(800, 16, { ls: -0.16, color: c.ink })}>
          Weekly goals
        </Text>
        <Text style={[S(600, 13, { color: c.mut }), styles.emptyGoals]}>
          Define goals on Today to track weekly hit-rate here.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.section, { borderTopColor: c.hair }]}>
      <View style={styles.rowBetween}>
        <Text style={S(800, 16, { ls: -0.16, color: c.ink })}>
          Weekly goals · 12 weeks
        </Text>
        <Text style={M(700, 10.5, { color: c.grn })}>
          {totalHit} OF {totalDone} HIT
        </Text>
      </View>

      <View style={styles.histList}>
        {rows.map(r => (
          <View key={r.id}>
            <View style={styles.histHead}>
              <Text
                numberOfLines={1}
                style={[
                  M(700, 9.5, { ls: 0.6, color: c.mut }),
                  styles.histName,
                ]}
              >
                {r.name}
              </Text>
              <Text style={M(700, 9.5, { color: c.fnt })}>
                {r.hit}/{r.completed}
              </Text>
            </View>
            <View style={styles.histBars}>
              {r.cells.map(w => {
                if (w.noData) {
                  return (
                    <View
                      key={w.key}
                      style={[
                        styles.histBar,
                        styles.histBarEmpty,
                        { borderColor: c.hair },
                      ]}
                    />
                  );
                }
                const color = w.met ? c.grn : w.frac >= 0.8 ? c.acc : c.track;
                return (
                  <View
                    key={w.key}
                    style={[
                      styles.histBar,
                      { backgroundColor: color },
                      w.current && {
                        opacity: 0.45,
                        borderWidth: 1,
                        borderColor: c.fnt,
                        borderStyle: 'dashed',
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.histAxis}>
        <Text style={M(600, 9, { ls: 1, color: c.fnt })}>12 WKS AGO</Text>
        <Text style={M(600, 9, { ls: 1, color: c.fnt })}>THIS WK</Text>
      </View>
      <View style={styles.legendRow}>
        <Legend color={c.grn} label="HIT" />
        <Legend color={c.acc} label="CLOSE" />
        <Legend color={c.track} label="MISSED" />
        <Legend dashed label="NOW" />
        <Legend empty label="NO DATA" />
      </View>
    </View>
  );
}

/** Trends: the design's metric explorer — big value, segment picker, dotted line
 * chart, a 12-week weekly-goal grid and a body-metric snapshot quad. */
export function TrendsScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const series = useHealthStore(s => s.snapshot.trends);
  const metrics = buildMetrics(series);
  const activeKey = useTrendsStore(s => s.activeKey);
  const setActiveKey = useTrendsStore(s => s.setActiveKey);
  const active = metrics.find(m => m.key === activeKey) ?? metrics[0];
  const decimals = METRIC_CONFIG.find(m => m.key === active.key)?.decimals ?? 0;

  return (
    <BriefScreen>
      {/* Hero value */}
      <View style={styles.heroRow}>
        <Text style={[M(800, 70, { ls: -4, color: c.ink }), styles.hero]}>
          {active.value}
          {active.value !== '—' ? (
            <Text style={M(800, 26, { ls: -1, color: c.fnt })}>
              {' '}
              {active.unit}
            </Text>
          ) : null}
        </Text>
      </View>
      <Text
        style={[
          M(700, 10, { ls: 1, upper: true, color: c.fnt }),
          styles.avgLine,
        ]}
      >
        AVG {active.avg} · RANGE {active.range}
      </Text>

      {/* Segment picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segRow}
        style={[
          styles.segScroll,
          { borderTopColor: c.ink, borderBottomColor: c.hair },
        ]}
      >
        {metrics.map(m => {
          const on = m.key === active.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setActiveKey(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.seg,
                { borderBottomColor: on ? c.acc : 'transparent' },
              ]}
            >
              <Text style={M(700, 10.5, { ls: 1, color: on ? c.ink : c.fnt })}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Chart */}
      {active.points.length > 1 ? (
        <TrendChart points={active.points} decimals={decimals} />
      ) : (
        <Text
          style={[
            M(600, 12, { color: c.fnt, align: 'center' }),
            styles.emptyChart,
          ]}
        >
          NO DATA YET
        </Text>
      )}
      <View style={styles.axis}>
        <Text style={M(600, 9.5, { color: c.fnt })}>30 DAYS AGO</Text>
        <Text style={M(600, 9.5, { color: c.fnt })}>NOW</Text>
      </View>

      {/* Weekly-goal 12-week attainment */}
      <GoalsHistorySection />
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 },
  hero: { lineHeight: 63 },
  avgLine: { marginTop: 6, lineHeight: 16 },
  segScroll: {
    marginTop: 20,
    borderTopWidth: 2,
    borderBottomWidth: 1,
    flexGrow: 0,
  },
  segRow: { gap: 18, paddingVertical: 12 },
  seg: { borderBottomWidth: 2, paddingBottom: 8, paddingTop: 2 },
  chart: { marginTop: 10 },
  emptyChart: { paddingVertical: 50 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  section: { marginTop: 20, paddingVertical: 16, borderTopWidth: 1 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  emptyGoals: { marginTop: 12 },
  histList: { gap: 9, marginTop: 14 },
  histHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 5,
  },
  histName: { flex: 1, minWidth: 0, paddingRight: 8 },
  histBars: { flexDirection: 'row', gap: 3 },
  histBar: { flex: 1, height: 22, borderRadius: 3 },
  histBarEmpty: { backgroundColor: 'transparent', borderWidth: 1 },
  histAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSq: { width: 9, height: 9, borderRadius: 2 },
});
