import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  chunky,
  GroupLabel,
  HeroRow,
  InkBand,
  S,
} from '../../components/brief';
import { CardioZones, healthSourceName } from '../../health';
import { hrMaxBasis, WorkoutHeartRate } from '../../health/workoutDetail';
import { useHealthStore } from '../../state/useHealthStore';
import { profileAge } from '../../state/useProfileStore';
import { useTheme } from '../../theme/theme';
import { ZONE_ROWS, ZoneBar, zoneColor } from './CardioScreen';
import { useWorkoutHeartRate } from './useWorkoutHeartRate';

/**
 * Workout detail: one recorded session (from the wearable, via Health Connect /
 * Apple Health) — its heart-rate graph with the zone bands behind it, time in
 * each zone, and the session's facts.
 *
 * Opened from the cardio screen's activity list with the session's
 * `exerciseKey` as `workoutKey` (the same param pattern HabitDefine uses for its
 * id); the session itself is read from the snapshot, so the screen never holds a
 * copy that can drift from it. The heart-rate stream is NOT in the snapshot — it
 * is read on demand (see useWorkoutHeartRate).
 *
 * Laid out like Cardio load (ADR-007; there is no artboard of its own): a soft
 * red hero, chunky stat chips, the chart in a chunky card, and the same zone
 * bars and colours as the cardio screen (shared from CardioScreen).
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "07:12" in local time. */
function clock(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Tue, Nov 17". */
function dayLabel(t: number): string {
  const d = new Date(t);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Minutes → "42" min / "1h 05m" for the hero, with the matching unit. */
function durationParts(min: number): { value: string; unit: string } {
  if (min < 60) return { value: String(Math.round(min)), unit: ' min' };
  const h = Math.floor(min / 60);
  return { value: `${h}h ${pad2(Math.round(min - h * 60))}`, unit: 'm' };
}

function totalMin(z: CardioZones): number {
  return z.lightMin + z.moderateMin + z.vigorousMin + z.peakMin;
}

/** One chunky stat chip: label, big value, and a small line under it. */
function StatChip({
  label,
  value,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  const c = useTheme().colors;
  return (
    <View style={[chunky(c, 16), styles.chip]}>
      <Text style={S(800, 12, { color: c.fnt })} numberOfLines={1}>
        {label}
      </Text>
      <Text style={S(900, 22, { lh: 27, color: c.ink })} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text
          style={S(900, 13, { color: subColor ?? c.mut })}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** A section heading with an optional quiet stat on the right. */
function SectionHead({ title, right }: { title: string; right?: string }) {
  const c = useTheme().colors;
  return (
    <View style={styles.groupRow}>
      <GroupLabel style={styles.groupLabel}>{title}</GroupLabel>
      {right ? <Text style={S(800, 14, { color: c.fnt })}>{right}</Text> : null}
    </View>
  );
}

/** One label/value line of the details card. */
function DetailRow({
  label,
  value,
  first,
}: {
  label: string;
  value: string;
  first?: boolean;
}) {
  const c = useTheme().colors;
  return (
    <View
      style={[
        styles.detail,
        first ? null : { borderTopWidth: 2, borderTopColor: c.hair },
      ]}
    >
      <Text style={S(800, 15, { color: c.mut })}>{label}</Text>
      <Text
        style={[S(900, 15, { color: c.ink }), styles.detailValue]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function WorkoutDetailScreen({ route }: ScreenProps) {
  const c = useTheme().colors;
  const key = route?.params?.workoutKey;
  const activity = useHealthStore(
    s => s.snapshot.activities.find(a => a.key === key) ?? null,
  );
  const { status, hr } = useWorkoutHeartRate(activity);

  if (!activity) {
    return (
      <BriefScreen>
        <InkBand tone="red">
          <HeroRow value="—" pillText="Not found" caption="Workout" />
        </InkBand>
        <Card first style={styles.groupCard}>
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            This workout is no longer in your recent activity. Workouts from the
            last 7 days can be opened from Cardio load.
          </Text>
        </Card>
      </BriefScreen>
    );
  }

  const dur = durationParts(activity.durationMin);
  // Prefer the zones recomputed from the stream just read; fall back to the
  // stored ones (same scale) when that read came back empty or unavailable.
  const zones = hr?.zones ?? activity.hrZones;
  const basis = hrMaxBasis(hr?.hrMax ?? null, profileAge());

  return (
    <BriefScreen>
      {/* ── Hero: how long, what, when ───────────────────────────────── */}
      <InkBand tone="red" paddingTop={22} paddingBottom={22}>
        <View style={styles.hero}>
          <Text style={S(900, 56, { lh: 60, color: c.ink })}>
            {dur.value}
            <Text style={S(900, 22, { color: c.mut })}>{dur.unit}</Text>
          </Text>
          <View style={styles.heroRight}>
            <View style={[styles.heroPill, { backgroundColor: c.card }]}>
              <Text style={S(900, 14, { color: c.red })} numberOfLines={1}>
                {activity.name}
              </Text>
            </View>
            <Text style={S(700, 15, { lh: 20, color: c.mut })}>
              {dayLabel(activity.start)} · {clock(activity.start)}–
              {clock(activity.end)}
            </Text>
          </View>
        </View>
      </InkBand>

      {/* ── Headline numbers ─────────────────────────────────────────── */}
      <View style={styles.chips}>
        <StatChip
          label="AVG HR"
          value={hr ? String(hr.avgBpm) : '—'}
          sub={hr ? 'bpm' : undefined}
        />
        <StatChip
          label="MAX HR"
          value={hr ? String(hr.maxBpm) : '—'}
          sub={hr ? `at ${clock(hr.maxAt)}` : undefined}
          subColor={c.red}
        />
      </View>
      <View style={[styles.chips, styles.chipsNext]}>
        <StatChip
          label="CALORIES"
          value={
            activity.energyKcal != null ? String(activity.energyKcal) : '—'
          }
          sub={activity.energyKcal != null ? 'kcal' : undefined}
        />
        <StatChip
          label="LOAD"
          value={activity.load != null ? String(activity.load) : '—'}
          sub={activity.loadEstimated ? 'estimated' : undefined}
        />
      </View>

      {/* ── Heart-rate graph ─────────────────────────────────────────── */}
      <SectionHead
        title="Heart rate"
        right={hr ? `${hr.minBpm}–${hr.maxBpm} bpm` : undefined}
      />
      <Card style={styles.groupCard}>
        {status === 'loading' ? (
          <View style={styles.chartState}>
            <ActivityIndicator color={c.acc} />
          </View>
        ) : hr ? (
          <HeartRateChart hr={hr} start={activity.start} end={activity.end} />
        ) : (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            {status === 'unavailable'
              ? `Connect ${healthSourceName()} in Me to see this workout's heart rate.`
              : `No heart rate was recorded during this workout. Some apps save the workout to ${healthSourceName()} without its heart rate.`}
          </Text>
        )}
      </Card>

      {/* ── Time in zones ────────────────────────────────────────────── */}
      <SectionHead
        title="Time in zones"
        right={
          activity.zone2PlusMin > 0
            ? `${activity.zone2PlusMin} min zone 2+`
            : undefined
        }
      />
      <Card style={styles.groupCard}>
        {zones ? (
          <View style={styles.zones}>
            {ZONE_ROWS.map(z => {
              const min = zones[z.key];
              const total = totalMin(zones);
              const share = total > 0 ? min / total : 0;
              return (
                <ZoneBar
                  key={z.key}
                  name={z.name}
                  zone={z.zone}
                  sub={hr?.zoneBpm ? `≥${hr.zoneBpm[z.edge]} bpm` : undefined}
                  right={`${Math.round(min)} min · ${Math.round(share * 100)}%`}
                  fill={share}
                  color={zoneColor(c, z.edge)}
                />
              );
            })}
            {basis && hr?.hrMax ? (
              <Text
                style={[
                  S(700, 13, { lh: 18, color: c.mut }),
                  styles.footnote,
                  { backgroundColor: c.soft },
                ]}
              >
                Zones are % of a max heart rate of {hr.hrMax} bpm,{' '}
                {basis === 'age'
                  ? 'from your age (220 − age)'
                  : 'the highest heart rate seen — add your birth date in Me for an age-based one'}
                . A simple guide, not a medical measurement.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            {hr
              ? 'Add your date of birth in Me to split this workout into heart-rate zones.'
              : 'No heart-rate zones for this workout.'}
            {activity.loadEstimated
              ? ' Its load is estimated from duration.'
              : ''}
          </Text>
        )}
      </Card>

      {/* ── Details ──────────────────────────────────────────────────── */}
      <SectionHead title="Details" />
      <View style={[chunky(c), styles.details]}>
        <DetailRow first label="Started" value={clock(activity.start)} />
        <DetailRow label="Ended" value={clock(activity.end)} />
        <DetailRow label="Duration" value={`${activity.durationMin} min`} />
        <DetailRow
          label="Type"
          value={activity.type.replace(/_/g, ' ').toLowerCase()}
        />
        <DetailRow label="Recorded by" value={activity.source} />
      </View>
    </BriefScreen>
  );
}

/** Chart geometry, in viewBox units (scaled to the card width). */
const W = 354;
const H = 170;
const PAD_Y = 8;

/**
 * The heart-rate line over the session, with each zone's bpm band shaded behind
 * it so "where was I" reads at a glance, a dashed average line and the peak
 * marked. Static — the stats above carry the exact numbers.
 */
function HeartRateChart({
  hr,
  start,
  end,
}: {
  hr: WorkoutHeartRate;
  start: number;
  end: number;
}) {
  const c = useTheme().colors;
  const lo = Math.max(0, Math.floor((hr.minBpm - 8) / 10) * 10);
  const hi = Math.ceil((hr.maxBpm + 8) / 10) * 10;
  const span = Math.max(1, end - start);
  const x = (t: number) => ((t - start) / span) * W;
  const y = (b: number) => PAD_Y + (1 - (b - lo) / (hi - lo)) * (H - 2 * PAD_Y);

  const d = hr.series
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.bpm).toFixed(1)}`,
    )
    .join(' ');

  // Zone bands, clipped to the visible bpm range. The top band runs to `hi`.
  const bands = hr.zoneBpm
    ? [
        {
          from: hr.zoneBpm.light,
          to: hr.zoneBpm.moderate,
          color: zoneColor(c, 'light'),
        },
        {
          from: hr.zoneBpm.moderate,
          to: hr.zoneBpm.vigorous,
          color: zoneColor(c, 'moderate'),
        },
        {
          from: hr.zoneBpm.vigorous,
          to: hr.zoneBpm.peak,
          color: zoneColor(c, 'vigorous'),
        },
        { from: hr.zoneBpm.peak, to: hi, color: zoneColor(c, 'peak') },
      ]
        .map(b => ({
          ...b,
          from: Math.max(b.from, lo),
          to: Math.min(b.to, hi),
        }))
        .filter(b => b.to > b.from)
    : [];

  return (
    <View
      accessible
      accessibilityLabel={`Heart rate from ${hr.minBpm} to ${hr.maxBpm} beats per minute, averaging ${hr.avgBpm}`}
    >
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {bands.map(b => (
          <Rect
            key={b.from}
            x={0}
            y={y(b.to)}
            width={W}
            height={y(b.from) - y(b.to)}
            fill={b.color}
            opacity={0.14}
          />
        ))}
        <Line
          x1={0}
          y1={y(hr.avgBpm)}
          x2={W}
          y2={y(hr.avgBpm)}
          stroke={c.fnt}
          strokeWidth={2}
          strokeDasharray="6 6"
        />
        <Path
          d={d}
          fill="none"
          stroke={c.ink}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle
          cx={x(hr.maxAt)}
          cy={y(hr.maxBpm)}
          r={6}
          fill={c.redSolid}
          stroke={c.card}
          strokeWidth={3}
        />
      </Svg>
      <View style={styles.axis}>
        <Text style={S(800, 13, { color: c.fnt })}>{clock(start)}</Text>
        <Text style={S(800, 13, { color: c.fnt })}>- - avg {hr.avgBpm}</Text>
        <Text style={S(800, 13, { color: c.fnt })}>{clock(end)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroRight: { flex: 1, minWidth: 0, gap: 6 },
  heroPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chipsNext: { marginTop: 8 },
  chip: { flex: 1, minWidth: 0, padding: 12 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  groupLabel: { marginTop: 0, marginBottom: 0, flexShrink: 1 },
  groupCard: { marginTop: 12 },
  chartState: { height: H, alignItems: 'center', justifyContent: 'center' },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  zones: { gap: 14 },
  footnote: { padding: 12, borderRadius: 14, overflow: 'hidden' },
  details: { marginTop: 12, overflow: 'hidden' },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  detailValue: { flexShrink: 1, textAlign: 'right' },
});
