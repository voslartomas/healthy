import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BigStat,
  BriefScreen,
  M,
  PillSpec,
  S,
  Section,
} from '../../components/brief';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** HR-zone rows, hardest first (Google's four zones). */
const ZONE_ROWS = [
  { label: 'Z4 PEAK', key: 'peakMin', colorKey: 'red' },
  { label: 'Z3 VIGOROUS', key: 'vigorousMin', colorKey: 'acc' },
  { label: 'Z2 MODERATE', key: 'moderateMin', colorKey: 'sand' },
  { label: 'Z1 LIGHT', key: 'lightMin', colorKey: 'grn' },
] as const;

function frac(n: number, max: number): number {
  return max > 0 ? Math.min(n / max, 1) : 0;
}

/** Cardio-load detail: HR-zone-weighted load, zone breakdown and activities. */
export function CardioScreen(_props: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const activities = useHealthStore(s => s.snapshot.activities);
  const cardio = useHealthStore(s => s.snapshot.cardio);
  const has = cardio.hasZoneData;

  const maxZone = Math.max(1, ...ZONE_ROWS.map(z => cardio.zones7d[z.key]));
  const avgDaily = cardio.daily.length
    ? Math.round(cardio.weekLoad / cardio.daily.length)
    : 0;

  const pill: PillSpec = has
    ? { text: `WEEK LOAD ${cardio.weekLoad}`, bg: c.ink, textColor: c.inv }
    : { text: 'NO HR DATA', dot: c.fnt };

  return (
    <BriefScreen>
      <BigStat
        value={has ? String(cardio.todayLoad) : '—'}
        pill={pill}
        caption="CARDIO LOAD · TODAY"
      />

      <Section n="01" title="HR zones · 7 days" first>
        {ZONE_ROWS.map(z => {
          const min = cardio.zones7d[z.key];
          return (
            <View key={z.label} style={styles.zone}>
              <Text style={[M(700, 10, { ls: 0.6, color: c.mut }), styles.zl]}>
                {z.label}
              </Text>
              <View style={[styles.track, { backgroundColor: c.track }]}>
                <View
                  style={{
                    width: `${(has ? frac(min, maxZone) : 0) * 100}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: c[z.colorKey],
                  }}
                />
              </View>
              <Text style={[M(700, 10, { color: c.ink }), styles.zm]}>
                {has ? `${min}M` : '—'}
              </Text>
            </View>
          );
        })}
      </Section>

      <Section
        n="02"
        title="Activities"
        titleRight={
          has ? (
            <Text style={M(700, 10.5, { color: c.fnt })}>
              {avgDaily} AVG/DAY
            </Text>
          ) : undefined
        }
      >
        {activities.length === 0 ? (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            No activities recorded this week.
          </Text>
        ) : (
          activities.map((a, i) => (
            <View
              key={`${a.type}-${a.start}-${i}`}
              style={[styles.act, { borderBottomColor: c.hair }]}
            >
              <Text
                style={[S(600, 13.5, { color: c.ink }), styles.actName]}
                numberOfLines={1}
              >
                {a.name}
                <Text style={M(600, 10, { ls: 1, color: c.fnt })}>
                  {' · '}
                  {a.durationMin}M
                  {a.energyKcal != null ? ` · ${a.energyKcal}KCAL` : ''}
                </Text>
              </Text>
            </View>
          ))
        )}
      </Section>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  zone: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  zl: { width: 82, flexShrink: 0 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  zm: { width: 40, textAlign: 'right', flexShrink: 0 },
  empty: { marginTop: 12 },
  act: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  actName: { flex: 1, minWidth: 0 },
});
