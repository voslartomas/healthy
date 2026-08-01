import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { LineChart, Sparkline } from '../../components/Charts';
import { AppHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { trends, TrendMetric } from '../../data/health';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Trends screen: metric picker, main chart, and body/recovery mini-trends. */
export function TrendsScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const [active, setActive] = useState<string>('weight');
  const metric = trends.find(m => m.key === active) ?? trends[0];
  const color = metricColor(t.colors, metric.colorKey);

  const up = metric.delta.startsWith('▲') || metric.delta.startsWith('▼');

  return (
    <Screen>
      <AppHeader
        eyebrow="Last 7 weeks"
        title="Trends"
        onAvatarPress={() => navigation.navigate('Settings')}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.segment}
      >
        {trends.map(m => {
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
              <Text style={[styles.cvUnit, { color: t.colors.muted }]}>
                {' '}
                {metric.unit}
              </Text>
            </Text>
            <Text
              style={[styles.cd, { color: up ? t.colors.rec : t.colors.muted }]}
            >
              {metric.delta}
            </Text>
          </View>
          <Text style={[styles.cr, { color: t.colors.muted }]}>
            avg {metric.avg}
            {'\n'}7-wk range{'\n'}
            {metric.range}
          </Text>
        </View>
        <LineChart
          points={metric.points}
          color={color}
          gradientId="trendGrad"
        />
      </Card>

      <SectionLabel>Body composition</SectionLabel>
      <View style={styles.grid}>
        <MiniTrend metric={trends[0]} />
        <MiniTrend metric={trends[1]} />
      </View>

      <SectionLabel>Recovery drivers</SectionLabel>
      <MiniTrend metric={trends[2]} full />
      <View style={{ height: 12 }} />
      <MiniTrend metric={trends[3]} full />
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
            <Text style={[styles.miniUnit, { color: t.colors.muted }]}>
              {' '}
              {metric.unit}
            </Text>
          </Text>
        </View>
        <Sparkline points={metric.points} color={color} />
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
});
