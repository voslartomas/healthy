import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  HeroRow,
  InkBand,
  M,
  S,
} from '../../components/brief';
import { SleepStages } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** Decimal hours → "7:42". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/** Minutes → "1:24". */
function minToHm(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, '0')}`;
}

/** Stage rows, deepest first — the order the design's stacked bar reads in. */
function stageRows(s: SleepStages) {
  return [
    { key: 'Deep', min: s.deepMin, tone: 'accSolid' as const },
    { key: 'REM', min: s.remMin, tone: 'acc' as const },
    { key: 'Light', min: s.lightMin, tone: 'sand' as const },
    { key: 'Awake', min: s.awakeMin, tone: 'track' as const },
  ];
}

/** Map a series onto an SVG polyline path inside `w`×`h` with `pad` inset. */
function linePath(pts: number[], w: number, h: number, pad: number): string {
  if (pts.length < 2) return '';
  let min = Math.min(...pts);
  let max = Math.max(...pts);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return pts
    .map((p, i) => {
      const x = pad + (i * (w - 2 * pad)) / (pts.length - 1);
      const y = h - pad - ((p - min) / (max - min)) * (h - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Sleep detail: duration vs need, the stage breakdown, and a 30-day line. */
export function SleepScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const sleep = useHealthStore(s => s.snapshot.sleep);
  const series = useHealthStore(s => s.snapshot.trends.sleepHours);

  const stages = sleep?.stages ?? null;
  const rows = stages ? stageRows(stages) : [];
  const stageTotal = rows.reduce((sum, r) => sum + r.min, 0);

  const pts = series.slice(-30).map(p => p.value);
  const W = 354;
  const H = 120;
  const path = linePath(pts, W, H, 14);
  const avg = pts.length
    ? (pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1)
    : null;

  return (
    <BriefScreen>
      <InkBand>
        <HeroRow
          value={sleep ? hoursToHm(sleep.hours) : '—'}
          pillText={sleep ? `${sleep.performancePct}% OF NEED` : 'NO SLEEP DATA'}
          caption={
            sleep ? 'OF YOUR 8H SLEEP NEED' : 'CONNECT A SOURCE IN SETUP'
          }
        />
      </InkBand>

      <Card title="Stages" style={styles.gap16}>
        {stages && stageTotal > 0 ? (
          <>
            <View style={styles.stackBar}>
              {rows.map(r =>
                r.min > 0 ? (
                  <View
                    key={r.key}
                    style={{ flex: r.min, backgroundColor: c[r.tone] }}
                  />
                ) : null,
              )}
            </View>
            <View style={styles.rows}>
              {rows.map(r => (
                <View
                  key={r.key}
                  style={[styles.row, { borderTopColor: c.hair }]}
                >
                  <View style={[styles.dot, { backgroundColor: c[r.tone] }]} />
                  <Text
                    style={[S(700, 14, { lh: 17, color: c.ink }), styles.name]}
                  >
                    {r.key}
                  </Text>
                  <Text style={[M(700, 12, { color: c.mut }), styles.pct]}>
                    {Math.round((r.min / stageTotal) * 100)}%
                  </Text>
                  <Text style={[M(700, 13, { color: c.ink }), styles.dur]}>
                    {minToHm(r.min)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
            {sleep
              ? 'This sleep session has no stage breakdown.'
              : 'No sleep recorded.'}
          </Text>
        )}
      </Card>

      <Card
        title="Sleep · 30 days"
        right={
          avg ? (
            <Text style={M(700, 10.5, { color: c.fnt })}>AVG {avg} H</Text>
          ) : undefined
        }
      >
        {path ? (
          <>
            <Svg
              width="100%"
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              style={styles.chart}
            >
              <Line
                x1={0}
                y1={104}
                x2={W}
                y2={104}
                stroke={c.hair}
                strokeWidth={1}
              />
              <Line
                x1={0}
                y1={56}
                x2={W}
                y2={56}
                stroke={c.fnt}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <Path
                d={path}
                fill="none"
                stroke={c.acc}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <View style={styles.axis}>
              <Text style={M(600, 9.5, { color: c.fnt })}>30 DAYS AGO</Text>
              <Text style={M(600, 9.5, { color: c.fnt })}>LAST NIGHT</Text>
            </View>
          </>
        ) : (
          <Text
            style={[
              M(600, 12, { color: c.fnt, align: 'center' }),
              styles.emptyChart,
            ]}
          >
            NO SLEEP HISTORY YET
          </Text>
        )}
      </Card>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  gap16: { marginTop: 16 },
  stackBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 14,
  },
  rows: { marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderTopWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { flex: 1, minWidth: 0 },
  pct: { width: 44, textAlign: 'right' },
  dur: { width: 68, textAlign: 'right' },
  empty: { marginTop: 12 },
  chart: { marginTop: 10 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  emptyChart: { paddingVertical: 40 },
});
