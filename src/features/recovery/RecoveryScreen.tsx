import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BigStat,
  BriefScreen,
  M,
  PillSpec,
  Quad,
  Section,
} from '../../components/brief';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

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

function Delta({ delta, goodUp = true }: { delta: number; goodUp?: boolean }) {
  const t = useTheme();
  const r = Math.round(delta);
  if (r === 0) return null;
  const up = r > 0;
  const good = goodUp ? up : !up;
  return (
    <Text style={{ color: good ? t.colors.grn : t.colors.red }}>
      {' '}
      {up ? '▲' : '▼'}
      {Math.abs(r)}
    </Text>
  );
}

/** Recovery detail: readiness score, contributors and a 14-day HRV line. */
export function RecoveryScreen(_props: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const readiness = snap.readiness;
  const hrvSeries = snap.trends.hrv.slice(-14).map(p => p.value);
  const baseline = snap.hrv?.baseline ?? null;

  const pill: PillSpec = readiness
    ? {
        text: readiness.state.toUpperCase(),
        dot: c.acc,
        bg: c.ink,
        textColor: c.inv,
      }
    : { text: 'NOT CONNECTED', dot: c.fnt };

  const W = 354,
    H = 130,
    PAD = 14;
  const xy = hrvSeries.length > 1 ? project(hrvSeries, W, H, PAD) : [];
  const line = xy.length
    ? 'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
    : '';

  return (
    <BriefScreen>
      <BigStat
        value={readiness ? String(readiness.pct) : '—'}
        suffix={readiness ? '%' : undefined}
        pill={pill}
        caption={
          snap.live ? 'LIVE · GOOGLE HEALTH' : 'CONNECT A SOURCE TO START'
        }
      />

      <Section n="01" title="Contributors" first>
        <Quad
          items={[
            {
              value: snap.hrv ? String(Math.round(snap.hrv.value)) : '——',
              label: (
                <Text>
                  HRV MS{snap.hrv ? <Delta delta={snap.hrv.delta} /> : null}
                </Text>
              ),
            },
            {
              value: snap.restingHr
                ? String(Math.round(snap.restingHr.value))
                : '——',
              label: (
                <Text>
                  RHR
                  {snap.restingHr ? (
                    <Delta delta={snap.restingHr.delta} goodUp={false} />
                  ) : null}
                </Text>
              ),
            },
            {
              value: snap.sleep ? `${snap.sleep.performancePct}%` : '——',
              label: snap.sleep
                ? `SLEEP ${hoursToHm(snap.sleep.hours)}`
                : 'SLEEP',
            },
            { value: '——', label: 'RESP RPM' },
          ]}
        />
      </Section>

      <Section
        n="02"
        title="HRV · 14 days"
        titleRight={
          baseline != null ? (
            <Text style={M(700, 10.5, { color: c.fnt })}>
              BASELINE {Math.round(baseline)}
            </Text>
          ) : undefined
        }
      >
        {xy.length ? (
          <>
            <Svg
              width="100%"
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              style={styles.chart}
            >
              <Line
                x1={0}
                y1={72}
                x2={W}
                y2={72}
                stroke={c.fnt}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <Path
                d={line}
                fill="none"
                stroke={c.acc}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <View style={styles.axis}>
              <Text style={M(600, 9.5, { color: c.fnt })}>2 WKS AGO</Text>
              <Text style={M(600, 9.5, { color: c.fnt })}>TODAY</Text>
            </View>
          </>
        ) : (
          <Text
            style={[
              M(600, 12, { color: c.fnt, align: 'center' }),
              styles.empty,
            ]}
          >
            NO HRV HISTORY YET
          </Text>
        )}
      </Section>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  chart: { marginTop: 10 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  empty: { paddingVertical: 40 },
});
