import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { DetailHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { SleepStages } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { monoFont, useTheme } from '../../theme/theme';

/** Fixed hypnogram colors (stage semantics, not themed). */
const STAGE_COLORS: Record<string, string> = {
  Deep: '#1e40af',
  REM: '#06b6d4',
  Light: '#7dd3fc',
  Awake: '#ef4444',
};

/** Decimal hours → "7:42". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/** Minutes → "1h 24m" / "24m". */
function minLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function stageRows(s: SleepStages) {
  return [
    { key: 'Deep', min: s.deepMin },
    { key: 'REM', min: s.remMin },
    { key: 'Light', min: s.lightMin },
    { key: 'Awake', min: s.awakeMin },
  ];
}

/** Sleep detail: total duration, performance, and the stage breakdown. */
export function SleepScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const sleep = useHealthStore(s => s.snapshot.sleep);

  const stages = sleep?.stages ?? null;
  const rows = stages ? stageRows(stages) : [];
  const stageTotal = rows.reduce((sum, r) => sum + r.min, 0);

  return (
    <Screen>
      <DetailHeader
        title="Sleep"
        subtitle={
          sleep ? `Last night · ${hoursToHm(sleep.hours)}` : 'No sleep data'
        }
        onBack={() => navigation.goBack()}
      />

      <Card style={styles.hero}>
        <Text style={[styles.big, { color: t.colors.sleep }]}>
          {sleep ? hoursToHm(sleep.hours) : '-'}
        </Text>
        <Text style={[styles.heroSub, { color: t.colors.muted }]}>
          {sleep
            ? `${sleep.performancePct}% of your 8h sleep need`
            : 'Connect Google Health in Settings to see your sleep.'}
        </Text>
      </Card>

      <SectionLabel>Stages</SectionLabel>
      <Card>
        {stages && stageTotal > 0 ? (
          <>
            <View style={styles.stackBar}>
              {rows.map(r =>
                r.min > 0 ? (
                  <View
                    key={r.key}
                    style={{
                      flex: r.min,
                      backgroundColor: STAGE_COLORS[r.key],
                    }}
                  />
                ) : null,
              )}
            </View>
            {rows.map((r, i) => {
              const pct = Math.round((r.min / stageTotal) * 100);
              return (
                <View
                  key={r.key}
                  style={[
                    styles.row,
                    i > 0 && {
                      borderTopColor: t.colors.border,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: STAGE_COLORS[r.key] },
                    ]}
                  />
                  <Text style={[styles.stageName, { color: t.colors.fg }]}>
                    {r.key}
                  </Text>
                  <Text style={[styles.stagePct, { color: t.colors.muted }]}>
                    {pct}%
                  </Text>
                  <Text style={[styles.stageMin, { color: t.colors.fg }]}>
                    {minLabel(r.min)}
                  </Text>
                </View>
              );
            })}
          </>
        ) : (
          <Text style={[styles.empty, { color: t.colors.muted }]}>
            {sleep
              ? 'This sleep session has no stage breakdown.'
              : 'No sleep recorded.'}
          </Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 26 },
  big: {
    fontFamily: monoFont,
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
  },
  heroSub: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    maxWidth: 260,
  },
  stackBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stageName: { flex: 1, fontSize: 14, fontWeight: '700' },
  stagePct: {
    fontFamily: monoFont,
    fontSize: 12,
    fontWeight: '700',
    width: 44,
    textAlign: 'right',
  },
  stageMin: {
    fontFamily: monoFont,
    fontSize: 13,
    fontWeight: '800',
    width: 68,
    textAlign: 'right',
  },
  empty: { fontSize: 12.5, paddingVertical: 8 },
});
