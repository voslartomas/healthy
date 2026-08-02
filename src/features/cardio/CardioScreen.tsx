import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { DetailHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { useHealthStore } from '../../state/useHealthStore';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** HR-zone rows, hardest first, mapped to Google's four zones. */
const ZONE_ROWS = [
  { label: 'Peak', key: 'peakMin', colorKey: 'strain' },
  { label: 'Vigorous', key: 'vigorousMin', colorKey: 'recRed' },
  { label: 'Moderate', key: 'moderateMin', colorKey: 'recAmber' },
  { label: 'Light', key: 'lightMin', colorKey: 'rec' },
] as const;

/** "42 min · 320 kcal" (kcal omitted when absent). */
function activityDetail(durationMin: number, energyKcal: number | null): string {
  const dur = `${durationMin} min`;
  return energyKcal != null ? `${dur} · ${energyKcal} kcal` : dur;
}

/** Weekday initial for a UTC day-bucket timestamp (pure — no clock read). */
function dayInitial(dayStart: number): string {
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(dayStart).getUTCDay()];
}

/** Fraction of `n` against `max`, clamped to [0, 1]. */
function frac(n: number, max: number): number {
  return max > 0 ? Math.min(n / max, 1) : 0;
}

/**
 * Cardio-load detail. `load` is a transparent HR-zone-weighted minute blend
 * (see cardioFromExercise) — non-clinical, ADR-style. Everything is real
 * snapshot data; if no session carried HR zones the figures render "-".
 */
export function CardioScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const activities = useHealthStore(s => s.snapshot.activities);
  const cardio = useHealthStore(s => s.snapshot.cardio);
  const has = cardio.hasZoneData;

  const maxZone = Math.max(
    1,
    ...ZONE_ROWS.map(z => cardio.zones7d[z.key]),
  );
  const maxDaily = Math.max(1, ...cardio.daily.map(d => d.load));
  const avgDaily = cardio.daily.length
    ? Math.round(cardio.weekLoad / cardio.daily.length)
    : 0;

  return (
    <Screen>
      <DetailHeader
        title="Cardio load"
        subtitle="HR-based training load"
        onBack={() => navigation.goBack()}
      />

      <Card>
        <Text style={[styles.bigLoad, { color: t.colors.strain }]}>
          {has ? cardio.todayLoad : '-'}
        </Text>
        <Text style={[styles.subtitle, { color: t.colors.muted }]}>
          {has
            ? `Today's load · ${cardio.weekLoad} over the last 7 days`
            : 'No HR-zone cardio data yet — connect Google Health in Settings.'}
        </Text>
        <View style={styles.dbarWrap}>
          <ProgressBar
            progress={has ? frac(cardio.todayLoad, maxDaily) : 0}
            color={t.colors.strain}
            height={12}
          />
        </View>
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>0</Text>
          <Text style={[styles.legendText, { color: t.colors.strain }]}>
            {has ? `7-day avg ${avgDaily}` : 'optimal zone'}
          </Text>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            {has ? maxDaily : '-'}
          </Text>
        </View>
      </Card>

      <SectionLabel>Time in HR zones · 7 days</SectionLabel>
      <Card>
        {ZONE_ROWS.map(z => {
          const min = cardio.zones7d[z.key];
          return (
            <View key={z.label} style={styles.zone}>
              <Text style={[styles.zl, { color: t.colors.muted }]}>
                {z.label}
              </Text>
              <View style={styles.zbar}>
                <ProgressBar
                  progress={has ? frac(min, maxZone) : 0}
                  color={
                    has ? metricColor(t.colors, z.colorKey) : t.colors.surface2
                  }
                  height={14}
                />
              </View>
              <Text style={[styles.zm, { color: t.colors.fg }]}>
                {has ? `${min}m` : '-'}
              </Text>
            </View>
          );
        })}
      </Card>

      <SectionLabel>Activities</SectionLabel>
      <Card>
        {activities.length === 0 ? (
          <Text style={[styles.empty, { color: t.colors.muted }]}>
            No activities recorded this week.
          </Text>
        ) : (
          activities.map((a, i) => (
            <View
              key={`${a.type}-${a.start}-${i}`}
              style={[
                styles.activity,
                i > 0 && {
                  borderTopColor: t.colors.border,
                  borderTopWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.actText}>
                <Text style={[styles.actName, { color: t.colors.fg }]}>
                  {a.name}
                </Text>
                <Text style={[styles.actDetail, { color: t.colors.muted }]}>
                  {activityDetail(a.durationMin, a.energyKcal)}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <SectionLabel>7-day load balance</SectionLabel>
      <Card>
        {cardio.daily.length === 0 ? (
          <Text style={[styles.empty, { color: t.colors.muted }]}>
            No load recorded in the last 7 days.
          </Text>
        ) : (
          <>
            <View style={styles.weekbars}>
              {cardio.daily.map(d => (
                <View key={d.dayStart} style={styles.wb}>
                  <View
                    style={[styles.col, { backgroundColor: t.colors.surface2 }]}
                  >
                    <View
                      style={{
                        height: `${frac(d.load, maxDaily) * 100}%`,
                        backgroundColor: t.colors.strain,
                        borderTopLeftRadius: 6,
                        borderTopRightRadius: 6,
                      }}
                    />
                  </View>
                  <Text style={[styles.wbLabel, { color: t.colors.muted }]}>
                    {dayInitial(d.dayStart)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[styles.legend, { marginTop: 10 }]}>
              <Text style={[styles.legendText, { color: t.colors.muted }]}>
                {cardio.weekLoad} total
              </Text>
              <Text style={[styles.legendText, { color: t.colors.rec }]}>
                {avgDaily} avg/day
              </Text>
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bigLoad: {
    fontFamily: monoFont,
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: { fontSize: 12.5, fontWeight: '600' },
  dbarWrap: { marginTop: 18, justifyContent: 'center' },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  legendText: { fontFamily: monoFont, fontSize: 11, fontWeight: '600' },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  zl: { fontFamily: monoFont, fontSize: 11, fontWeight: '700', width: 64 },
  zbar: { flex: 1 },
  zm: {
    fontFamily: monoFont,
    fontSize: 12,
    fontWeight: '700',
    width: 44,
    textAlign: 'right',
  },
  empty: { fontSize: 12.5, paddingVertical: 8 },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  actText: { flex: 1 },
  actName: { fontSize: 14, fontWeight: '700' },
  actDetail: { fontSize: 11.5, marginTop: 2 },
  weekbars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 96,
  },
  wb: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  col: {
    width: '100%',
    flex: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  wbLabel: { fontFamily: monoFont, fontSize: 10, fontWeight: '600' },
});
