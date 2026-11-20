import React, { useMemo, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  chunky,
  GroupLabel,
  pageTitleStyle,
  Pill,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import { useFoodTagsStore } from '../../state/useFoodTagsStore';
import { useGoalHistoryStore } from '../../state/useGoalHistoryStore';
import { goalWeekly, useGoalsStore } from '../../state/useGoalsStore';
import {
  buildHabitViews,
  sleepOnsetsFromSnapshot,
  waterFromSnapshot,
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
 * The trend line: a blue value line over faint gridlines, an optional shaded
 * min–max band (HRV / RHR nightly spread), and a dotted orange rolling-average
 * curve. TAP or drag anywhere on the chart to inspect any day — a guide line +
 * marker snap to the nearest point and the readout above shows that day's
 * date, value, and (when banded) its min–max range. Static labels still mark
 * min / max / latest so the extremes read at a glance.
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
  const W = 320,
    H = 170,
    PAD = 18;
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
  const family = S(900, 12).fontFamily;

  const rolling = movingAverage(points, smoothDays);
  const rollPath =
    'M' +
    rolling.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
  const mean = points.reduce((s, v) => s + v, 0) / points.length;
  const avgText = `avg ${fmt(mean, decimals)}`;
  const yAvgLabel = Math.min(Math.max(y(mean) - 5, 12), H - 4);

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
            <Text style={S(800, 14, { color: c.fnt })}>
              {times[sel] != null ? shortDate(times[sel]) : '—'}
            </Text>
            <Text style={S(900, 16, { color: c.ink })}>
              {fmt(points[sel], decimals)}
              <Text style={S(800, 13, { color: c.fnt })}> {unit}</Text>
              {selBand ? (
                <Text style={S(800, 13, { color: c.fnt })}>
                  {`   ${fmt(selBand.lo, decimals)}–${fmt(selBand.hi, decimals)}`}
                </Text>
              ) : null}
            </Text>
          </>
        ) : (
          <Text style={S(800, 14, { color: c.fnt })}>
            Tap the chart to read any day
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
            y1={H - PAD}
            x2={W}
            y2={H - PAD}
            stroke={c.hair}
            strokeWidth={2}
          />
          <Line
            x1={0}
            y1={H / 2}
            x2={W}
            y2={H / 2}
            stroke={c.hair}
            strokeWidth={1.5}
            strokeDasharray="4 6"
          />
          <Line
            x1={0}
            y1={PAD}
            x2={W}
            y2={PAD}
            stroke={c.hair}
            strokeWidth={1.5}
            strokeDasharray="4 6"
          />
          {/* Min–max range band (HRV / RHR) */}
          {bandPath ? <Path d={bandPath} fill={c.accTint} /> : null}
          {/* Rolling-average curve */}
          <Path
            d={rollPath}
            fill="none"
            stroke={c.food}
            strokeWidth={3}
            strokeDasharray="2 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Median / value line */}
          <Path
            d={line}
            fill="none"
            stroke={c.accSolid}
            strokeWidth={3}
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
              <Circle
                cx={x(sel)}
                cy={y(points[sel])}
                r={6}
                fill={c.accSolid}
                stroke={c.card}
                strokeWidth={3}
              />
            </>
          ) : null}
          {labelled.map(i => {
            const last = i === lastIdx;
            return (
              <Circle
                key={`d${i}`}
                cx={x(i)}
                cy={y(points[i])}
                r={last ? 6 : 4}
                fill={last ? c.accSolid : c.ink}
                stroke={c.card}
                strokeWidth={last ? 3 : 2}
              />
            );
          })}
          {labelled.map(i => {
            const py = y(points[i]);
            const last = i === lastIdx;
            const above =
              i > 0 ? points[i] <= points[i - 1] : points[i] <= points[i + 1];
            const lx = Math.min(Math.max(x(i), 16), W - 16);
            const ly = above ? py - 12 : py + 20;
            const label = fmt(points[i], decimals);
            const size = last ? 14 : 12;
            return (
              <React.Fragment key={`l${i}`}>
                <SvgText
                  x={lx}
                  y={ly}
                  fontSize={size}
                  fontFamily={family}
                  fill={c.card}
                  stroke={c.card}
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
            fontSize={12}
            fontFamily={family}
            fill={c.card}
            stroke={c.card}
            strokeWidth={3}
            textAnchor="start"
          >
            {avgText}
          </SvgText>
          <SvgText
            x={2}
            y={yAvgLabel}
            fontSize={12}
            fontFamily={family}
            fill={c.foodText}
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

/** A legend swatch: filled, dashed-outline (Now) or hairline-outline (No data). */
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
            ? { borderWidth: 2, borderColor: c.fnt, borderStyle: 'dashed' }
            : empty
              ? { borderWidth: 2, borderColor: c.hair }
              : { backgroundColor: color },
        ]}
      />
      <Text style={S(800, 13, { color: c.mut })}>{label}</Text>
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
 * held: the perfect week.
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
  const waterDays = useHealthStore(s => s.snapshot.waterDays);
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
      waterMl: waterFromSnapshot(useHealthStore.getState().snapshot, now),
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
        name: v.habit.name,
        cells,
        hit: done.filter(w => w.met).length,
        completed: done.length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits, habitDays, tagRows, sleep, waterDays, now]);

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
      <>
        <GroupLabel>12 weeks of goals</GroupLabel>
        <Card style={styles.groupCard}>
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            Define goals and habits on Today to track your weekly hit-rate here.
          </Text>
        </Card>
      </>
    );
  }

  // Colours of one week cell. Close is the soft sky so a near-miss reads as
  // "almost" next to the green hit, and missed is the plain outline grey.
  const cellStyle = (w: HistCell, i: number) => {
    if (w.noData) return [styles.histEmpty, { borderColor: c.hair }];
    const fill =
      // A perfect week outranks its own row's colour — the whole column goes
      // gold so the run reads at a glance.
      perfect[i] === true
        ? c.gold
        : w.met
          ? c.grnSolid
          : w.frac >= 0.8
            ? c.sand
            : c.hair;
    return [
      { backgroundColor: fill },
      w.current && [
        styles.histNow,
        { backgroundColor: c.card, borderColor: c.fnt },
      ],
    ];
  };

  const renderRow = (r: HistRow) => (
    <View key={r.id} style={styles.histRow}>
      <View style={styles.histHead}>
        <Text
          numberOfLines={1}
          style={[S(900, 14, { color: c.ink }), styles.histName]}
        >
          {r.name}
        </Text>
        <Text style={S(900, 14, { color: c.mut })}>
          {r.hit} of {r.completed}
        </Text>
      </View>
      <View style={styles.histBars}>
        {r.cells.map((w, i) => (
          <View key={w.key} style={[styles.histBar, cellStyle(w, i)]} />
        ))}
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.groupRow}>
        <GroupLabel style={styles.groupLabel}>12 weeks of goals</GroupLabel>
        <Pill
          spec={{
            text: `${perfectHit} perfect week${perfectHit === 1 ? '' : 's'}`,
            bg: c.streakTint,
            textColor: c.streakText,
          }}
        />
      </View>
      <Card style={styles.groupCard}>
        <Text style={S(900, 15, { color: c.grn })}>
          {totalHit} of {totalDone} weeks hit
        </Text>

        {/* Stars sit above the grid, one per column, so a perfect week is
            visible before you read a single row. */}
        <View style={styles.starRow}>
          {perfect.map((p, i) => (
            <View key={i} style={styles.starCell}>
              {p === true ? (
                <Icon name="star" size={13} color={c.gold} />
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.histList}>{rows.map(renderRow)}</View>

        {habitRows.length > 0 ? (
          <View
            style={[
              styles.histList,
              styles.habitList,
              { borderTopColor: c.hair },
            ]}
          >
            {habitRows.map(renderRow)}
            <View style={styles.histRow}>
              <View style={styles.histHead}>
                <Text style={[S(900, 14, { color: c.ink }), styles.histName]}>
                  Perfect week
                </Text>
                <Text style={S(900, 14, { color: c.streakText })}>
                  {perfectHit} of {perfectDone}
                </Text>
              </View>
              <View style={styles.histBars}>
                {perfect.map((p, i) => (
                  <View
                    key={i}
                    style={[
                      styles.histBar,
                      p == null
                        ? [styles.histEmpty, { borderColor: c.hair }]
                        : { backgroundColor: p ? c.gold : c.hair },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.histAxis}>
          <Text style={S(800, 13, { color: c.fnt })}>12 wks ago</Text>
          <Text style={S(800, 13, { color: c.fnt })}>This week</Text>
        </View>
        <View style={styles.legendRow}>
          <Legend color={c.grnSolid} label="Hit" />
          <Legend color={c.sand} label="Close" />
          <Legend color={c.hair} label="Missed" />
          <Legend color={c.gold} label="Perfect week" />
          <Legend dashed label="Now" />
          <Legend empty label="No data" />
        </View>
      </Card>
    </>
  );
}

/** Rolling-average window, widened with the span so the dotted curve keeps
 * reading as a trend instead of shadowing the line. */
function smoothDaysFor(rangeDays: number): number {
  return rangeDays >= 180 ? 21 : rangeDays >= 90 ? 14 : 7;
}

/**
 * Progress (ADR-007 "friendly" layout; route name stays `Trends`): a wrapping
 * row of metric pills, one chunky card holding the chosen metric's value,
 * delta, tappable chart and average/range chips, the 30/90/180-day range
 * tiles, and the 12-week goals & habits grid with its perfect weeks.
 */
export function TrendsScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const series = useHealthStore(s => s.snapshot.trends);
  const activeKey = useTrendsStore(s => s.activeKey);
  const setActiveKey = useTrendsStore(s => s.setActiveKey);
  const rangeDays = useTrendsStore(s => s.rangeDays);
  const setRangeDays = useTrendsStore(s => s.setRangeDays);
  const metrics = buildMetrics(series, rangeDays);
  const active = metrics.find(m => m.key === activeKey) ?? metrics[0];
  const cfg = METRIC_CONFIG.find(m => m.key === active.key);
  const decimals = cfg?.decimals ?? 0;
  const smoothDays = smoothDaysFor(rangeDays);

  // The delta pill is green when the metric moved the good way for it (HRV up,
  // resting HR down), red when it moved the other way, neutral when flat.
  const pts = active.points;
  const moved = pts.length > 1 ? pts[pts.length - 1] - pts[0] : 0;
  const flat = Math.abs(moved) < (decimals > 0 ? 0.05 : 0.5);
  const good = cfg ? (cfg.goodUp ? moved > 0 : moved < 0) : true;
  const deltaPill = !active.delta
    ? null
    : flat
      ? { text: active.delta, bg: c.soft, textColor: c.mut }
      : good
        ? { text: active.delta, bg: c.grnTint, textColor: c.grn }
        : { text: active.delta, bg: c.redTint, textColor: c.red };
  const withUnit = (v: string) =>
    v === '—' ? v : active.unit === '%' ? `${v}%` : `${v} ${active.unit}`;

  return (
    <BriefScreen>
      <Text style={[pageTitleStyle(c.ink), styles.title]}>Progress</Text>

      {/* ── Metric picker ────────────────────────────────────────────── */}
      <View style={styles.metricRow}>
        {metrics.map(m => {
          const on = m.key === active.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => setActiveKey(m.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={m.label}
              style={[
                styles.metricPill,
                {
                  backgroundColor: on ? c.accTint : c.card,
                  borderColor: on ? c.accSolid : c.hair,
                },
              ]}
            >
              <Text style={S(900, 15, { color: on ? c.acc : c.ink })}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Value + chart ────────────────────────────────────────────── */}
      <View style={[chunky(c), styles.valueCard]}>
        <View style={styles.valueHead}>
          <View style={styles.valueText}>
            <Text style={S(800, 15, { color: c.mut })}>
              {cfg?.name ?? active.label}
            </Text>
            <Text style={S(900, 44, { lh: 50, color: c.ink })}>
              {active.value}
              {active.value !== '—' ? (
                <Text style={S(900, 20, { color: c.fnt })}> {active.unit}</Text>
              ) : null}
            </Text>
          </View>
          {deltaPill ? <Pill spec={deltaPill} /> : null}
        </View>

        {active.points.length > 1 ? (
          <TrendChart
            key={`${active.key}-${rangeDays}`}
            points={active.points}
            times={active.times}
            decimals={decimals}
            unit={active.unit}
            band={active.band}
            smoothDays={smoothDays}
          />
        ) : (
          <Text
            style={[
              S(800, 15, { color: c.fnt, align: 'center' }),
              styles.emptyChart,
            ]}
          >
            No data yet
          </Text>
        )}
        <View style={styles.axis}>
          {/* The oldest point actually plotted, not the nominal span: HRV
              history only reaches back as far as the cache has accumulated
              (see FULL_HRV_DAYS), so a 180-day selection can legitimately show
              less. */}
          <Text style={S(800, 13, { color: c.fnt })}>
            {active.times.length
              ? shortDate(active.times[0])
              : `${rangeDays} days ago`}
          </Text>
          <Text style={S(800, 13, { color: c.fnt })}>Now</Text>
        </View>

        <View style={styles.statRow}>
          <View style={[styles.stat, { backgroundColor: c.soft }]}>
            <Text style={S(800, 12, { color: c.fnt })}>AVERAGE</Text>
            <Text style={S(900, 18, { color: c.ink })}>
              {withUnit(active.avg)}
            </Text>
          </View>
          <View style={[styles.stat, { backgroundColor: c.soft }]}>
            <Text style={S(800, 12, { color: c.fnt })}>RANGE</Text>
            <Text style={S(900, 18, { color: c.ink })}>
              {withUnit(active.range)}
            </Text>
          </View>
        </View>
        {active.points.length > 1 ? (
          <Text style={S(700, 14, { lh: 19, color: c.fnt })}>
            Dotted line is the {smoothDays}-day average
            {active.band ? ' · shading is each day’s low–high range' : ''}
          </Text>
        ) : null}
      </View>

      {/* ── Range ────────────────────────────────────────────────────── */}
      <View style={styles.rangeRow}>
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
                  backgroundColor: on ? c.accTint : c.card,
                  borderColor: on ? c.accSolid : c.hair,
                },
              ]}
            >
              <Text style={S(900, 16, { color: on ? c.acc : c.ink })}>
                {d} days
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Goals & habits, 12 weeks ─────────────────────────────────── */}
      <GoalsHistorySection />
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 4 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  metricPill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueCard: { marginTop: 16, padding: 18, gap: 12 },
  valueHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  valueText: { flexShrink: 1 },
  readout: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    minHeight: 22,
  },
  chart: { marginTop: 6 },
  emptyChart: { paddingVertical: 50 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minWidth: 0, padding: 10, borderRadius: 14 },
  rangeRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  rangeBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  groupLabel: { marginTop: 0, marginBottom: 0, flexShrink: 1 },
  groupCard: { marginTop: 12 },
  starRow: { flexDirection: 'row', gap: 4, marginTop: 12, height: 16 },
  starCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  histList: { gap: 10, marginTop: 6 },
  habitList: { marginTop: 14, paddingTop: 14, borderTopWidth: 2 },
  histRow: { gap: 5 },
  histHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  histName: { flex: 1, minWidth: 0, paddingRight: 8 },
  histBars: { flexDirection: 'row', gap: 4 },
  histBar: { flex: 1, height: 18, borderRadius: 5 },
  histEmpty: { backgroundColor: 'transparent', borderWidth: 2 },
  histNow: { borderWidth: 2, borderStyle: 'dashed' },
  histAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 6,
    marginTop: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSq: { width: 12, height: 12, borderRadius: 4 },
});
