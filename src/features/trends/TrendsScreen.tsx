import React, { useMemo, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import { BAND, BriefScreen, Card, InkBand, M, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { useFoodTagsStore } from '../../state/useFoodTagsStore';
import { useGoalHistoryStore } from '../../state/useGoalHistoryStore';
import { goalWeekly, useGoalsStore } from '../../state/useGoalsStore';
import {
  buildHabitViews,
  sleepOnsetsFromSnapshot,
  useHabitsStore,
} from '../../state/useHabitsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useNow } from '../../state/useNow';
import {
  TREND_RANGES,
  TrendRange,
  useTrendsStore,
} from '../../state/useTrendsStore';
import { useTheme } from '../../theme/theme';
import { buildMetrics, fmt, METRIC_CONFIG } from './metrics';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Aug 11" for a day timestamp. */
function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
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
 * The v3 trend line: an accent median line over baselines, an optional shaded
 * min–max band (HRV's nightly spread), and a rolling-average reference curve.
 * TAP or drag anywhere on the chart to inspect any day — a guide line + marker
 * snap to the nearest point and the readout above shows that day's date, value,
 * and (when banded) its min–max range. Static labels still mark min / max /
 * latest so the extremes read at a glance.
 */
function TrendChart({
  points,
  times,
  decimals,
  unit,
  band,
  smoothDays,
}: {
  points: number[];
  times: number[];
  decimals: number;
  unit: string;
  band?: { lo: number; hi: number }[];
  /** Window of the dashed reference curve, widened with the span so it keeps
   * reading as a trend instead of shadowing the line. */
  smoothDays: number;
}) {
  const c = useTheme().colors;
  const W = 386,
    H = 170,
    PAD = 16;
  const n = points.length;
  const hasBand = !!band && band.length === n;

  const [sel, setSel] = useState<number | null>(null);
  const [layoutW, setLayoutW] = useState(0);

  // y-domain covers the band when present, so the full nightly range is visible.
  let mn = Math.min(...points),
    mx = Math.max(...points);
  if (hasBand) {
    for (const b of band as { lo: number; hi: number }[]) {
      mn = Math.min(mn, b.lo);
      mx = Math.max(mx, b.hi);
    }
  }
  if (mn === mx) {
    mn -= 1;
    mx += 1;
  }
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (n - 1);
  const y = (v: number) => H - PAD - ((v - mn) / (mx - mn)) * (H - 2 * PAD);

  const line =
    'M' +
    points.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' L');

  // Band area: top edge (hi) left→right, then bottom edge (lo) right→left.
  let bandPath = '';
  if (hasBand) {
    const b = band as { lo: number; hi: number }[];
    const top = b.map((v, i) => `${x(i).toFixed(1)},${y(v.hi).toFixed(1)}`);
    const bot = b
      .map((v, i) => `${x(i).toFixed(1)},${y(v.lo).toFixed(1)}`)
      .reverse();
    bandPath = 'M' + top.join(' L') + ' L' + bot.join(' L') + ' Z';
  }

  const lastIdx = n - 1;
  const minIdx = points.indexOf(Math.min(...points));
  const maxIdx = points.indexOf(Math.max(...points));
  const labelled = [...new Set([minIdx, maxIdx, lastIdx])];
  const family = M(700, 10).fontFamily;

  const rolling = movingAverage(points, smoothDays);
  const rollPath =
    'M' +
    rolling.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
  const mean = points.reduce((s, v) => s + v, 0) / points.length;
  const avgText = `AVG ${fmt(mean, decimals)}`;
  const yAvgLabel = Math.min(Math.max(y(mean) - 5, 10), H - 4);

  // Map a touch x (View pixels) to the nearest data index and select it.
  const onTouch = (e: GestureResponderEvent) => {
    if (layoutW <= 0 || n < 1) return;
    const vbX = (e.nativeEvent.locationX / layoutW) * W;
    const step = (W - 2 * PAD) / (n - 1 || 1);
    const idx = Math.max(0, Math.min(n - 1, Math.round((vbX - PAD) / step)));
    setSel(idx);
  };
  const onLayout = (e: LayoutChangeEvent) =>
    setLayoutW(e.nativeEvent.layout.width);

  const selBand = sel != null && hasBand ? (band as typeof band)![sel] : null;

  return (
    <View>
      {/* Readout: selected day, or a hint before the first tap. */}
      <View style={styles.readout}>
        {sel != null ? (
          <>
            <Text style={M(700, 10, { ls: 1, color: c.fnt })}>
              {times[sel] != null ? shortDate(times[sel]).toUpperCase() : '—'}
            </Text>
            <Text style={M(700, 13, { color: c.ink })}>
              {fmt(points[sel], decimals)}
              <Text style={M(700, 10, { color: c.fnt })}> {unit}</Text>
              {selBand ? (
                <Text style={M(700, 10, { color: c.fnt })}>
                  {`   ${fmt(selBand.lo, decimals)}–${fmt(selBand.hi, decimals)}`}
                </Text>
              ) : null}
            </Text>
          </>
        ) : (
          <Text style={M(700, 9.5, { ls: 1, color: c.fnt })}>
            TAP CHART FOR DAILY VALUES
          </Text>
        )}
      </View>

      <View
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
      >
        <Svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={styles.chart}
        >
          <Line
            x1={0}
            y1={150}
            x2={W}
            y2={150}
            stroke={c.hair}
            strokeWidth={1}
          />
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
          {/* Min–max range band (HRV) */}
          {bandPath ? (
            <Path d={bandPath} fill={c.acc} fillOpacity={0.12} />
          ) : null}
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
          {/* Median / value line */}
          <Path
            d={line}
            fill="none"
            stroke={c.acc}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Selection guide + marker */}
          {sel != null ? (
            <>
              <Line
                x1={x(sel)}
                y1={PAD}
                x2={x(sel)}
                y2={H - PAD}
                stroke={c.fnt}
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              {selBand ? (
                <>
                  <Circle cx={x(sel)} cy={y(selBand.hi)} r={2.5} fill={c.fnt} />
                  <Circle cx={x(sel)} cy={y(selBand.lo)} r={2.5} fill={c.fnt} />
                </>
              ) : null}
              <Circle cx={x(sel)} cy={y(points[sel])} r={4.5} fill={c.acc} />
            </>
          ) : null}
          {labelled.map(i => {
            const last = i === lastIdx;
            return (
              <Circle
                key={`d${i}`}
                cx={x(i)}
                cy={y(points[i])}
                r={last ? 4 : 3}
                fill={c.ink}
              />
            );
          })}
          {labelled.map(i => {
            const py = y(points[i]);
            const last = i === lastIdx;
            const above =
              i > 0 ? points[i] <= points[i - 1] : points[i] <= points[i + 1];
            const lx = Math.min(Math.max(x(i), 16), W - 16);
            const ly = above ? py - 11 : py + 17;
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
      </View>
    </View>
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

/** Right-align real weeks in the fixed 12-column grid, padding the front with
 * "no data" columns for weeks older than the window. */
function padCells(cells: HistCell[], keyPrefix: string): HistCell[] {
  const out: HistCell[] = [];
  for (let i = 0; i < HIST_WEEKS - cells.length; i += 1) {
    out.push({
      key: `${keyPrefix}e${i}`,
      noData: true,
      frac: 0,
      met: false,
      current: false,
    });
  }
  return out.concat(cells.slice(-HIST_WEEKS));
}

/**
 * Attainment over the last 12 weeks for everything the user committed to — the
 * weekly goals and the daily habits — plus the row that only lights up when both
 * held: the PERFECT WEEK.
 *
 * Goals and habits are two different clocks (a weekly total vs. a daily streak),
 * but they share the frame: 12 right-aligned columns ending at the week in
 * progress. That is what lets a single gold star sit above a column and mean
 * "everything you asked of yourself, that week".
 */
function GoalsHistorySection() {
  const c = useTheme().colors;
  const goals = useGoalsStore(s => s.goals);
  const persisted = useGoalHistoryStore(s => s.weeks);
  const liveHistory = useHealthStore(s => s.snapshot.weeklyHistory);
  const habits = useHabitsStore(s => s.habits);
  const habitDays = useHabitsStore(s => s.days);
  const tagRows = useFoodTagsStore(s => s.rows);
  const sleep = useHealthStore(s => s.snapshot.sleep);
  // A grid of weeks only needs to notice the day turning over.
  const now = useNow(5 * 60_000);

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
      const cells = padCells(
        entries.map(([weekStart, v]) => ({
          key: `w${weekStart}`,
          noData: false,
          frac: v.target > 0 ? Math.min(v.current / v.target, 1) : 0,
          met: v.current >= v.target,
          current: weekStart >= currentWeekStart,
        })),
        goal.id,
      );
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

  const habitRows = useMemo<HistRow[]>(() => {
    const views = buildHabitViews({
      habits,
      days: habitDays,
      tagRows,
      sleepOnset: sleepOnsetsFromSnapshot(useHealthStore.getState().snapshot),
      now,
    });
    return views.map(v => {
      const cells = padCells(
        v.weeks.map(w => ({
          key: `w${w.weekStart}`,
          noData: !w.covered,
          // A week that held every judged day but one allowed slip is still a
          // hit; "close" is a week that mostly held.
          frac: w.judged > 0 ? w.held / w.judged : 0,
          met: w.met,
          current: w.current,
        })),
        v.habit.id,
      );
      const done = cells.filter(w => !w.noData && !w.current);
      return {
        id: v.habit.id,
        name: v.habit.name.toUpperCase(),
        cells,
        hit: done.filter(w => w.met).length,
        completed: done.length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, habitDays, tagRows, sleep, now]);

  // A week is perfect when every row that HAS data for it was met. Weeks no row
  // can speak for stay blank rather than claiming a win.
  //
  // Goal weeks are keyed to UTC Mondays and habit weeks to LOCAL ones, so the
  // two can't be joined on the key — what aligns them is that both grids
  // right-align on the week in progress. Goal rows only get that column once
  // there is live health history to seed it from, so without it they are left
  // out of the perfect-week reckoning rather than compared column-for-column
  // against a different week.
  const alignedGoalRows = liveHistory.length > 0 ? rows : [];
  const allRows = [...rows, ...habitRows];
  const perfectRows = [...alignedGoalRows, ...habitRows];
  const perfect = Array.from({ length: HIST_WEEKS }, (_, i) => {
    const judged = perfectRows
      .map(r => r.cells[i])
      .filter(cell => !cell.noData);
    if (judged.length === 0) return null;
    if (judged.some(cell => cell.current)) return null;
    return judged.every(cell => cell.met);
  });
  const perfectHit = perfect.filter(p => p === true).length;
  const perfectDone = perfect.filter(p => p != null).length;

  const totalHit = allRows.reduce((s, r) => s + r.hit, 0);
  const totalDone = allRows.reduce((s, r) => s + r.completed, 0);

  if (goals.length === 0 && habitRows.length === 0) {
    return (
      <Card title="Goals & habits" style={styles.section}>
        <Text style={[S(600, 13, { color: c.mut }), styles.emptyGoals]}>
          Define goals and habits on Today to track your weekly hit-rate here.
        </Text>
      </Card>
    );
  }

  const renderRow = (r: HistRow) => (
    <View key={r.id}>
      <View style={styles.histHead}>
        <Text
          numberOfLines={1}
          style={[M(700, 9.5, { ls: 0.6, color: c.mut }), styles.histName]}
        >
          {r.name}
        </Text>
        <Text style={M(700, 9.5, { color: c.fnt })}>
          {r.hit}/{r.completed}
        </Text>
      </View>
      <View style={styles.histBars}>
        {r.cells.map((w, i) => {
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
                // A perfect week outranks its own row's colour — the whole
                // column goes gold so the run reads at a glance.
                perfect[i] === true && {
                  backgroundColor: c.gold,
                },
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
  );

  return (
    <Card
      title="Goals & habits · 12 weeks"
      style={styles.section}
      right={
        <Text style={M(700, 10.5, { color: c.grn })}>
          {totalHit} OF {totalDone} HIT
        </Text>
      }
    >
      {/* Stars sit above the grid, one per column, so a perfect week is visible
          before you read a single row. */}
      <View style={styles.starRow}>
        {perfect.map((p, i) => (
          <View key={i} style={styles.starCell}>
            {p === true ? <Icon name="star" size={12} color={c.gold} /> : null}
          </View>
        ))}
      </View>

      <View style={styles.histList}>{rows.map(renderRow)}</View>

      {habitRows.length > 0 ? (
        <View style={[styles.habitList, { borderTopColor: c.hair }]}>
          {habitRows.map(renderRow)}
          <View>
            <View style={styles.histHead}>
              <Text
                style={[
                  M(700, 9.5, { ls: 0.6, color: c.ink }),
                  styles.histName,
                ]}
              >
                PERFECT WEEK
              </Text>
              <Text style={M(700, 9.5, { color: c.grn })}>
                {perfectHit}/{perfectDone}
              </Text>
            </View>
            <View style={styles.histBars}>
              {perfect.map((p, i) => (
                <View
                  key={i}
                  style={[
                    styles.histBar,
                    p == null
                      ? [styles.histBarEmpty, { borderColor: c.hair }]
                      : { backgroundColor: p ? c.gold : c.track },
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.histAxis}>
        <Text style={M(600, 9, { ls: 1, color: c.fnt })}>12 WKS AGO</Text>
        <Text style={M(600, 9, { ls: 1, color: c.fnt })}>THIS WK</Text>
      </View>
      <View style={styles.legendRow}>
        <Legend color={c.gold} label="PERFECT WEEK" />
        <Legend color={c.grn} label="HIT" />
        <Legend color={c.acc} label="CLOSE" />
        <Legend color={c.track} label="MISSED" />
        <Legend dashed label="NOW" />
        <Legend empty label="NO DATA" />
      </View>
    </Card>
  );
}

/** Trends: the design's metric explorer — big value, segment picker, dotted line
 * chart, a 12-week weekly-goal grid and a body-metric snapshot quad. */
export function TrendsScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const series = useHealthStore(s => s.snapshot.trends);
  const activeKey = useTrendsStore(s => s.activeKey);
  const setActiveKey = useTrendsStore(s => s.setActiveKey);
  const rangeDays = useTrendsStore(s => s.rangeDays);
  const setRangeDays = useTrendsStore(s => s.setRangeDays);
  const metrics = buildMetrics(series, rangeDays);
  const active = metrics.find(m => m.key === activeKey) ?? metrics[0];
  const decimals = METRIC_CONFIG.find(m => m.key === active.key)?.decimals ?? 0;

  return (
    <BriefScreen>
      {/* Hero value + summary line, in the ink band */}
      <InkBand paddingBottom={16}>
        <View style={styles.heroRow}>
          <Text style={[M(700, 70, { ls: -1, color: BAND.ink }), styles.hero]}>
            {active.value}
            {active.value !== '—' ? (
              <Text style={M(700, 26, { ls: -0.2, color: BAND.fnt })}>
                {' '}
                {active.unit}
              </Text>
            ) : null}
          </Text>
        </View>
        <Text
          style={[
            M(700, 10, { ls: 1, upper: true, color: BAND.fnt }),
            styles.avgLine,
          ]}
        >
          AVG {active.avg} · RANGE {active.range}
        </Text>
      </InkBand>

      <View style={styles.rangeRow}>
        <View style={styles.rangeSwitch}>
          {TREND_RANGES.map(d => {
            const on = d === rangeDays;
            return (
              <Pressable
                key={d}
                onPress={() => setRangeDays(d as TrendRange)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Show ${d} days`}
                style={[
                  styles.rangeBtn,
                  {
                    borderColor: on ? c.ink : c.hair,
                    backgroundColor: on ? c.ink : 'transparent',
                  },
                ]}
              >
                <Text
                  style={M(700, 9.5, { ls: 0.6, color: on ? c.inv : c.mut })}
                >
                  {d}D
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Segment picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segRow}
        style={[
          styles.segScroll,
          { borderTopColor: c.hair, borderBottomColor: c.hair },
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
        <TrendChart
          key={`${active.key}-${rangeDays}`}
          points={active.points}
          times={active.times}
          decimals={decimals}
          unit={active.unit}
          band={active.band}
          smoothDays={rangeDays >= 180 ? 21 : rangeDays >= 90 ? 14 : 7}
        />
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
        {/* The oldest point actually plotted, not the nominal span: HRV history
            only reaches back as far as the cache has accumulated (see
            FULL_HRV_DAYS), so a 180D selection can legitimately show less. */}
        <Text style={M(600, 9.5, { color: c.fnt })}>
          {active.times.length
            ? shortDate(active.times[0]).toUpperCase()
            : `${rangeDays} DAYS AGO`}
        </Text>
        <Text style={M(600, 9.5, { color: c.fnt })}>NOW</Text>
      </View>

      {/* Weekly-goal 12-week attainment */}
      <GoalsHistorySection />
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  hero: { lineHeight: 74 }, // >= the 70px fontSize so iOS doesn't clip digit tops
  avgLine: { lineHeight: 16, marginTop: 6 },
  rangeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  rangeSwitch: { flexDirection: 'row', gap: 6 },
  rangeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  segScroll: {
    marginTop: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    flexGrow: 0,
  },
  segRow: { gap: 18, paddingVertical: 12 },
  seg: { borderBottomWidth: 2, paddingBottom: 8, paddingTop: 2 },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 12,
    minHeight: 18,
  },
  chart: { marginTop: 6 },
  emptyChart: { paddingVertical: 50 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  section: { marginTop: 12 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  emptyGoals: { marginTop: 12 },
  histList: { gap: 9, marginTop: 10 },
  habitList: { gap: 9, marginTop: 14, paddingTop: 12, borderTopWidth: 1 },
  starRow: { flexDirection: 'row', gap: 3, marginTop: 14, height: 14 },
  starCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
