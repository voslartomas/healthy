import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { Ring } from '../../components/Ring';
import { AppHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { StatCard } from '../../components/StatCard';
import { dashboard, MiniStat } from '../../data/health';
import { HealthSnapshot } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';
import { WeeklyGoalsCard } from '../goals/WeeklyGoalsCard';

/** Group a number with thousands separators without relying on Intl. */
function grp(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format decimal hours as h:mm, e.g. 7.7 → "7:42". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

/** "▲ 7 vs 30-day" / "▼ 1 vs 30-day" / "flat vs 30-day" from a baseline delta. */
function baselineDetail(delta: number, unit = ''): string {
  const rounded = Math.round(delta);
  if (rounded === 0) return 'flat vs 30-day';
  const arrow = rounded > 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(rounded)}${unit} vs 30-day`;
}

function trendOf(delta: number): MiniStat['trend'] {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

/**
 * Build the four dashboard mini-stats from a live snapshot, falling back to the
 * sample stat for any metric the read did not surface. Cardio load stays on
 * sample data — a real load figure needs the derivation formula tracked in a
 * follow-up (ADR pending).
 */
function liveStats(snap: HealthSnapshot): typeof dashboard.stats {
  const s = dashboard.stats;
  return {
    sleep: snap.sleep
      ? {
          ...s.sleep,
          value: hoursToHm(snap.sleep.hours),
          detail: `${snap.sleep.performancePct}% performance`,
        }
      : s.sleep,
    load: s.load,
    hrv: snap.hrv
      ? {
          ...s.hrv,
          value: String(Math.round(snap.hrv.value)),
          detail: baselineDetail(snap.hrv.delta),
          trend: trendOf(snap.hrv.delta),
        }
      : s.hrv,
    rhr: snap.restingHr
      ? {
          ...s.rhr,
          value: String(Math.round(snap.restingHr.value)),
          detail: baselineDetail(snap.restingHr.delta),
          // For RHR, a drop vs baseline is the good direction.
          trend: trendOf(-snap.restingHr.delta),
        }
      : s.rhr,
  };
}

/** The "Today" dashboard: goals, recovery, key metrics, energy balance. */
export function DashboardScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const snap = useHealthStore(s => s.snapshot);
  const d = dashboard;
  const stats = liveStats(snap);
  const recoveryPct = snap.readiness?.pct ?? d.recovery.pct;
  const recoveryState = snap.readiness?.state ?? d.recovery.state;
  const syncedNote = snap.live
    ? `Live · Health Connect · ${snap.sources.length} source${snap.sources.length === 1 ? '' : 's'}`
    : d.syncedNote;

  const stat = (s: MiniStat, onPress?: () => void, a11y?: string) => (
    <StatCard
      label={s.label}
      dotColor={metricColor(t.colors, s.colorKey)}
      value={s.value}
      unit={s.unit}
      detail={s.detail}
      trend={s.trend}
      onPress={onPress}
      accessibilityLabel={a11y}
    />
  );

  return (
    <Screen>
      <AppHeader
        eyebrow={d.date}
        title={d.greeting}
        onAvatarPress={() => navigation.navigate('Settings')}
      />

      <WeeklyGoalsCard />

      <Card
        onPress={() => navigation.navigate('Recovery')}
        accessibilityLabel={`Open recovery detail, ${recoveryPct} percent recovered`}
        style={styles.spaced}
      >
        <View style={styles.heroRing}>
          <Ring
            progress={recoveryPct / 100}
            color={t.colors.rec}
            size={118}
            strokeWidth={10}
            value={String(recoveryPct)}
            valueSuffix="%"
            label="Recovery"
          />
          <View style={styles.heroMeta}>
            <View
              style={[
                styles.statePill,
                { backgroundColor: t.colors.recStateBg },
              ]}
            >
              <View
                style={[styles.stateDot, { backgroundColor: t.colors.rec }]}
              />
              <Text style={[styles.stateText, { color: t.colors.recStateFg }]}>
                {recoveryState}
              </Text>
            </View>
            <Text style={[styles.heroTitle, { color: t.colors.fg }]}>
              {d.recovery.headline}
            </Text>
            <Text style={[styles.heroBody, { color: t.colors.muted }]}>
              {d.recovery.body}
            </Text>
          </View>
        </View>
      </Card>

      <View style={[styles.grid, styles.spaced]}>
        <View style={styles.gridRow}>
          {stat(stats.sleep)}
          {stat(
            stats.load,
            () => navigation.navigate('Cardio'),
            `Open cardio load detail, ${stats.load.value}`,
          )}
        </View>
        <View style={styles.gridRow}>
          {stat(stats.hrv)}
          {stat(stats.rhr)}
        </View>
      </View>

      <SectionLabel>Energy balance</SectionLabel>
      <Card
        onPress={() => navigation.navigate('Nutrition')}
        accessibilityLabel="Open nutrition, net minus 800 kilocalories today"
      >
        <View style={styles.row}>
          <View>
            <Text style={[styles.smallMuted, { color: t.colors.muted }]}>
              Net today
            </Text>
            <Text style={[styles.bigNum, { color: t.colors.rec }]}>
              {d.energy.net}
            </Text>
            <Text style={[styles.smallMuted, { color: t.colors.muted }]}>
              kcal · target {d.energy.targetNet}
            </Text>
          </View>
          <Ring
            progress={d.energy.eatenPct}
            color={t.colors.rec}
            size={80}
            strokeWidth={9}
            value={String(d.energy.eaten)}
            label="eaten"
            valueFontSize={18}
          />
        </View>
        <View style={styles.dbarWrap}>
          <ProgressBar
            progress={d.energy.barFill}
            color={t.colors.rec}
            height={12}
          />
          <View
            style={[
              styles.targetMark,
              {
                left: `${d.energy.targetMark * 100}%`,
                backgroundColor: t.colors.fg,
              },
            ]}
          />
        </View>
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            In {grp(d.energy.eaten)}
          </Text>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            Deficit goal ↑
          </Text>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            Out {grp(d.energy.burned)}
          </Text>
        </View>
      </Card>

      <Text style={[styles.dinfo, { color: t.colors.muted }]}>
        {syncedNote}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: 14,
  },
  heroRing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  heroMeta: {
    flex: 1,
  },
  statePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  stateDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '800',
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  heroBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  grid: {
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smallMuted: {
    fontSize: 12,
    fontWeight: '600',
  },
  bigNum: {
    fontFamily: monoFont,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.5,
    marginVertical: 2,
  },
  dbarWrap: {
    marginTop: 16,
    marginBottom: 8,
    justifyContent: 'center',
  },
  targetMark: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 3,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendText: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '600',
  },
  dinfo: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 14,
    paddingHorizontal: 2,
  },
});
