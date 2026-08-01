import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { LineChart } from '../../components/Charts';
import { Ring } from '../../components/Ring';
import { DetailHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { StatCard } from '../../components/StatCard';
import { recovery } from '../../data/health';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Recovery detail: big score ring, contributors, and a 14-day HRV chart. */
export function RecoveryScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const r = recovery;

  return (
    <Screen>
      <DetailHeader
        title="Recovery"
        subtitle={r.updated}
        onBack={() => navigation.goBack()}
      />

      <Card style={styles.hero}>
        <Ring
          progress={r.pct / 100}
          color={t.colors.rec}
          size={168}
          strokeWidth={13}
          value={String(r.pct)}
          valueSuffix="%"
          label="Recovered"
          valueFontSize={46}
        />
        <Text style={[styles.heroBody, { color: t.colors.muted }]}>
          {r.body}
        </Text>
      </Card>

      <SectionLabel>Contributors</SectionLabel>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          {r.contributors.slice(0, 2).map(c => (
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
          {r.contributors.slice(2, 4).map(c => (
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
        <LineChart
          points={r.hrvSeries}
          color={t.colors.rec}
          height={130}
          gradientId="hrvGrad"
        />
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            2 wks ago
          </Text>
          <Text style={[styles.legendText, { color: t.colors.rec }]}>
            {r.hrvBaseline}
          </Text>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            Today
          </Text>
        </View>
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
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  legendText: { fontFamily: monoFont, fontSize: 11, fontWeight: '600' },
});
