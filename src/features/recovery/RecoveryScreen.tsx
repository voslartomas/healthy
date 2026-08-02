import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { Ring } from '../../components/Ring';
import { DetailHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { StatCard } from '../../components/StatCard';
import { MiniStat } from '../../data/health';
import { useHealthStore } from '../../state/useHealthStore';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Format decimal hours as h:mm, e.g. 7.7 → "7:42". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** "▲ 7 vs baseline" / "▼ 1 vs baseline" / "flat vs baseline". */
function baselineDetail(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded === 0) return 'flat vs baseline';
  const arrow = rounded > 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(rounded)} vs baseline`;
}

/** Recovery detail: big score ring and contributors. Real snapshot values only
 * — anything the read did not surface renders "-". */
export function RecoveryScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const snap = useHealthStore(s => s.snapshot);
  const readiness = snap.readiness;

  const contributors: MiniStat[] = [
    {
      label: 'HRV',
      colorKey: 'rec',
      value: snap.hrv ? String(Math.round(snap.hrv.value)) : '-',
      unit: 'ms',
      detail: snap.hrv ? baselineDetail(snap.hrv.delta) : 'No data',
      trend: snap.hrv ? (snap.hrv.delta > 0 ? 'up' : snap.hrv.delta < 0 ? 'down' : 'flat') : 'flat',
    },
    {
      label: 'Resting HR',
      colorKey: 'recAmber',
      value: snap.restingHr ? String(Math.round(snap.restingHr.value)) : '-',
      unit: 'bpm',
      detail: snap.restingHr ? baselineDetail(snap.restingHr.delta) : 'No data',
      trend: snap.restingHr
        ? snap.restingHr.delta < 0
          ? 'up'
          : snap.restingHr.delta > 0
            ? 'down'
            : 'flat'
        : 'flat',
    },
    {
      label: 'Sleep',
      colorKey: 'sleep',
      value: snap.sleep ? hoursToHm(snap.sleep.hours) : '-',
      detail: snap.sleep ? `${snap.sleep.performancePct}% performance` : 'No data',
      trend: 'flat',
    },
    {
      label: 'Resp. rate',
      colorKey: 'strain',
      value: '-',
      unit: 'rpm',
      detail: 'No data',
      trend: 'flat',
    },
  ];

  return (
    <Screen>
      <DetailHeader
        title="Recovery"
        subtitle={snap.live ? 'Live · Google Health' : 'No data — connect Google Health in Settings'}
        onBack={() => navigation.goBack()}
      />

      <Card style={styles.hero}>
        <Ring
          progress={(readiness?.pct ?? 0) / 100}
          color={t.colors.rec}
          size={168}
          strokeWidth={13}
          value={readiness ? String(readiness.pct) : '-'}
          valueSuffix={readiness ? '%' : undefined}
          label={readiness?.state ?? 'Recovery'}
          valueFontSize={46}
        />
        <Text style={[styles.heroBody, { color: t.colors.muted }]}>
          {readiness
            ? readiness.state === 'Recovered'
              ? 'Your body is primed — a green day to add strain.'
              : readiness.state === 'Balanced'
                ? "Keep today's training load moderate."
                : 'Favor easy movement and rest today.'
            : 'Connect Google Health in Settings to see your recovery.'}
        </Text>
      </Card>

      <SectionLabel>Contributors</SectionLabel>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          {contributors.slice(0, 2).map(c => (
            <StatCard
              key={c.label}
              label={c.label}
              dotColor={metricColor(t.colors, c.colorKey)}
              value={c.value}
              unit={c.unit}
              detail={c.detail}
              trend={c.trend}
            />
          ))}
        </View>
        <View style={styles.gridRow}>
          {contributors.slice(2, 4).map(c => (
            <StatCard
              key={c.label}
              label={c.label}
              dotColor={metricColor(t.colors, c.colorKey)}
              value={c.value}
              unit={c.unit}
              detail={c.detail}
              trend={c.trend}
            />
          ))}
        </View>
      </View>

      <SectionLabel>HRV · 14 days</SectionLabel>
      <Card>
        <Text style={[styles.emptyChart, { color: t.colors.muted }]}>
          No HRV history yet.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 26 },
  heroBody: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19.5,
    marginTop: 16,
    maxWidth: 280,
  },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  emptyChart: {
    fontFamily: monoFont,
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
