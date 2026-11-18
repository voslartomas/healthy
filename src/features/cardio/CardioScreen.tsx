import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  chunky,
  GroupLabel,
  InkBand,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import { useHealthStore } from '../../state/useHealthStore';
import { Palette } from '../../theme/colors';
import { useTheme } from '../../theme/theme';

/**
 * Cardio-load detail (ADR-007 "friendly" layout): today's HR-zone-weighted
 * load on a soft red hero with the week's total, the 7-day time in each
 * heart-rate zone, and this week's activities — each a door into its
 * WorkoutDetail.
 */

/** HR-zone rows, hardest first (Google's four zones), warmest colour first.
 * Shared with WorkoutDetail so a zone is the same colour on both screens. */
export const ZONE_ROWS = [
  { name: 'Peak', zone: 'zone 4', key: 'peakMin', edge: 'peak' },
  { name: 'Vigorous', zone: 'zone 3', key: 'vigorousMin', edge: 'vigorous' },
  { name: 'Moderate', zone: 'zone 2', key: 'moderateMin', edge: 'moderate' },
  { name: 'Light', zone: 'zone 1', key: 'lightMin', edge: 'light' },
] as const;

export type ZoneEdge = (typeof ZONE_ROWS)[number]['edge'];

/** A zone's fill colour, hottest = deepest red down to amber. */
export function zoneColor(c: Palette, edge: ZoneEdge): string {
  switch (edge) {
    case 'peak':
      return c.red;
    case 'vigorous':
      return c.redSolid;
    case 'moderate':
      return c.food;
    default:
      return c.streak;
  }
}

function frac(n: number, max: number): number {
  return max > 0 ? Math.min(n / max, 1) : 0;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today" / "Yesterday" / "Mon" for an activity's start. */
function dayWord(t: number, now: number = Date.now()): string {
  const start = new Date(t);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return DAYS[start.getDay()];
}

/** One zone: name + zone number and minutes over a chunky bar. */
export function ZoneBar({
  name,
  zone,
  sub,
  right,
  fill,
  color,
}: {
  name: string;
  zone: string;
  /** Optional second line under the name (e.g. "≥150 bpm"). */
  sub?: string;
  right: string;
  fill: number;
  color: string;
}) {
  const c = useTheme().colors;
  return (
    <View style={styles.zone}>
      <View style={styles.zoneHead}>
        <View style={styles.zoneName}>
          <Text style={S(900, 16, { color: c.ink })}>{name}</Text>
          <Text style={S(900, 13, { color: c.fnt })}>{zone}</Text>
          {sub ? (
            <Text style={S(800, 13, { color: c.fnt })}>· {sub}</Text>
          ) : null}
        </View>
        <Text style={S(900, 16, { color: c.ink })}>{right}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: c.soft }]}>
        <View
          style={{
            width: `${Math.max(0, Math.min(1, fill)) * 100}%`,
            height: '100%',
            borderRadius: 7,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

/** Cardio-load detail: HR-zone-weighted load, zone breakdown and activities. */
export function CardioScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const activities = useHealthStore(s => s.snapshot.activities);
  const cardio = useHealthStore(s => s.snapshot.cardio);
  // Two distinct signals: `hasLoad` is true when any activity contributed
  // training load (HR zones OR the duration fallback for HR-less cardio like
  // Fitbit); `hasZones` is true only when a real HR-zone breakdown exists.
  const hasLoad = cardio.hasLoadData;
  const hasZones = cardio.hasZoneData;

  const maxZone = Math.max(1, ...ZONE_ROWS.map(z => cardio.zones7d[z.key]));
  const avgDaily = cardio.daily.length
    ? Math.round(cardio.weekLoad / cardio.daily.length)
    : 0;

  return (
    <BriefScreen>
      {/* ── Hero: today's load, the week's total ─────────────────────── */}
      <InkBand tone="red" paddingTop={22} paddingBottom={22}>
        <View style={styles.hero}>
          <View>
            <Text style={S(900, 14, { color: c.red })}>TODAY</Text>
            <Text style={S(900, 56, { lh: 60, color: c.ink })}>
              {hasLoad ? String(cardio.todayLoad) : '—'}
            </Text>
          </View>
          <View style={styles.heroRight}>
            <View style={[styles.heroPill, { backgroundColor: c.card }]}>
              <Text style={S(900, 14, { color: c.red })}>
                {hasLoad ? `Week ${cardio.weekLoad}` : 'No cardio data'}
              </Text>
            </View>
            <Text style={S(700, 15, { lh: 20, color: c.mut })}>
              Cardio load counts heart-rate minutes — harder zones count more.
            </Text>
          </View>
        </View>
      </InkBand>

      {/* ── HR zones · 7 days ────────────────────────────────────────── */}
      <GroupLabel>Heart-rate zones · 7 days</GroupLabel>
      <View style={[chunky(c), styles.card]}>
        {!hasZones ? (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            {hasLoad
              ? 'No per-zone heart-rate data for these workouts — load is estimated from duration.'
              : 'No heart-rate zone data yet.'}
          </Text>
        ) : null}
        {ZONE_ROWS.map(z => {
          const min = cardio.zones7d[z.key];
          return (
            <ZoneBar
              key={z.key}
              name={z.name}
              zone={z.zone}
              right={hasZones ? `${min} min` : '—'}
              fill={hasZones ? frac(min, maxZone) : 0}
              color={zoneColor(c, z.edge)}
            />
          );
        })}
      </View>

      {/* ── This week's activities ───────────────────────────────────── */}
      <View style={styles.groupRow}>
        <GroupLabel style={styles.groupLabel}>This week</GroupLabel>
        {hasLoad ? (
          <Text style={S(800, 14, { color: c.fnt })}>{avgDaily} avg / day</Text>
        ) : null}
      </View>
      <View style={[chunky(c), styles.list]}>
        {activities.length === 0 ? (
          <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.emptyAct]}>
            No activities recorded this week.
          </Text>
        ) : (
          activities.map((a, i) => (
            <Pressable
              key={`${a.key}-${i}`}
              onPress={() =>
                navigation.navigate('WorkoutDetail', { workoutKey: a.key })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open ${a.name} workout`}
              style={[
                styles.act,
                i > 0 ? { borderTopWidth: 2, borderTopColor: c.hair } : null,
              ]}
            >
              <View style={styles.actText}>
                <Text style={S(900, 16, { color: c.ink })} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={S(700, 14, { color: c.mut })} numberOfLines={1}>
                  {dayWord(a.start)} · {a.durationMin} min
                </Text>
              </View>
              {a.energyKcal != null ? (
                <Text style={S(900, 16, { color: c.ink })}>
                  {a.energyKcal} kcal
                </Text>
              ) : null}
              <Icon name="chevronRight" size={20} color={c.fnt} />
            </Pressable>
          ))
        )}
      </View>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroRight: { flex: 1, minWidth: 0, gap: 6 },
  heroPill: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  groupLabel: { marginTop: 0, marginBottom: 0, flexShrink: 1 },
  card: { marginTop: 12, padding: 16, gap: 14 },
  zone: { gap: 6 },
  zoneHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  zoneName: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  track: { height: 14, borderRadius: 7, overflow: 'hidden' },
  list: { marginTop: 12, overflow: 'hidden' },
  emptyAct: { padding: 16 },
  act: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
  },
  actText: { flex: 1, minWidth: 0 },
});
