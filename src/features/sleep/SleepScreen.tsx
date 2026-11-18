import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  GroupLabel,
  InkBand,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import { SleepStages } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/**
 * Sleep detail (ADR-007 "friendly" layout): last night's duration on a soft
 * indigo hero (with % of need and bed → wake times), the stage breakdown as a
 * stacked bar over four stage tiles, and the last 30 nights as bars.
 */

/** Decimal hours → "7h 42m". */
function hoursToHm(hours: number): string {
  return minToHm(hours * 60);
}

/** Minutes → "1h 24m", or "22m" under an hour. */
function minToHm(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const rest = (m % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}h ${rest}m` : `${m % 60}m`;
}

/** "23:12" in local time. */
function clock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Stage rows, deepest first — the order the stacked bar reads in. Deep is
 * the darkest indigo, light the palest wash; awake is amber so it reads as
 * "not sleep" at a glance. */
function stageRows(s: SleepStages) {
  return [
    { key: 'Deep', min: s.deepMin, tone: 'sleepText' as const },
    { key: 'REM', min: s.remMin, tone: 'sleepSolid' as const },
    { key: 'Light', min: s.lightMin, tone: 'sand' as const },
    { key: 'Awake', min: s.awakeMin, tone: 'streak' as const },
  ];
}

/** Sleep detail: duration vs need, the stage breakdown, and 30 nights. */
export function SleepScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const sleep = useHealthStore(s => s.snapshot.sleep);
  const live = useHealthStore(s => s.snapshot.live);
  const series = useHealthStore(s => s.snapshot.trends.sleepHours);

  const stages = sleep?.stages ?? null;
  const rows = stages ? stageRows(stages) : [];
  const stageTotal = rows.reduce((sum, r) => sum + r.min, 0);

  const nights = series.slice(-30).map(p => p.value);
  const maxNight = Math.max(1, ...nights);
  const avg = nights.length
    ? (nights.reduce((a, b) => a + b, 0) / nights.length).toFixed(1)
    : null;

  // Connected but empty is the usual early-morning state (the wearable hasn't
  // pushed last night yet) — never call that "not connected".
  const pillText = sleep
    ? `${sleep.performancePct}% of your 8h need`
    : live
      ? 'Not synced yet'
      : 'No sleep data';
  const caption = sleep
    ? sleep.lastSessionStart != null
      ? `${clock(sleep.lastSessionStart)} → ${clock(sleep.lastSessionEnd)}`
      : `Woke at ${clock(sleep.lastSessionEnd)}`
    : live
      ? 'Last night hasn’t synced yet'
      : 'Connect a source in Me';

  return (
    <BriefScreen>
      {/* ── Hero: last night ─────────────────────────────────────────── */}
      <InkBand tone="sleep" paddingTop={24} paddingBottom={24}>
        <View style={styles.hero}>
          <Icon name="moon" size={44} color={c.sleepSolid} strokeWidth={2.4} />
          <Text style={S(900, 52, { lh: 58, color: c.ink })}>
            {sleep ? hoursToHm(sleep.hours) : '—'}
          </Text>
          <View style={[styles.heroPill, { backgroundColor: c.card }]}>
            <Text style={S(900, 15, { color: c.sleepText })}>{pillText}</Text>
          </View>
          <Text style={S(700, 15, { color: c.mut, align: 'center' })}>
            {caption}
          </Text>
        </View>
      </InkBand>

      {/* ── Stages ───────────────────────────────────────────────────── */}
      <GroupLabel>Stages</GroupLabel>
      <Card style={styles.groupCard}>
        {stages && stageTotal > 0 ? (
          <>
            <View
              style={styles.stackBar}
              accessible
              accessibilityLabel={rows
                .map(r => `${r.key} ${Math.round((r.min / stageTotal) * 100)}%`)
                .join(', ')}
            >
              {rows.map(r =>
                r.min > 0 ? (
                  <View
                    key={r.key}
                    style={{ flex: r.min, backgroundColor: c[r.tone] }}
                  />
                ) : null,
              )}
            </View>
            <View style={styles.tiles}>
              {rows.map(r => (
                <View
                  key={r.key}
                  style={[styles.tile, { backgroundColor: c.soft }]}
                >
                  <View style={styles.tileHead}>
                    <View
                      style={[styles.swatch, { backgroundColor: c[r.tone] }]}
                    />
                    <Text style={S(900, 14, { color: c.ink })}>{r.key}</Text>
                  </View>
                  <Text style={S(900, 20, { lh: 25, color: c.ink })}>
                    {minToHm(r.min)}
                  </Text>
                  <Text style={S(800, 13, { color: c.mut })}>
                    {Math.round((r.min / stageTotal) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            {sleep
              ? 'This sleep session has no stage breakdown.'
              : 'No sleep recorded.'}
          </Text>
        )}
      </Card>

      {/* ── Last 30 nights ───────────────────────────────────────────── */}
      <View style={styles.groupRow}>
        <GroupLabel style={styles.groupLabel}>Last 30 nights</GroupLabel>
        {avg ? (
          <Text style={S(800, 14, { color: c.fnt })}>Avg {avg} h</Text>
        ) : null}
      </View>
      <Card style={styles.groupCard}>
        {nights.length > 1 ? (
          <>
            <View
              style={styles.bars}
              accessible
              accessibilityLabel={`Sleep per night over the last ${nights.length} nights, averaging ${avg} hours`}
            >
              {nights.map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(4, (h / maxNight) * 100)}%`,
                      // The latest night in full indigo; the rest a lighter
                      // wash of it. The palette has no mid indigo, and the
                      // `sleepTint` fill all but vanishes on a card, so the
                      // solid is faded instead (works in both schemes).
                      backgroundColor: c.sleepSolid,
                      opacity: i === nights.length - 1 ? 1 : 0.4,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.axis}>
              <Text style={S(800, 13, { color: c.fnt })}>
                {nights.length} nights ago
              </Text>
              <Text style={S(800, 13, { color: c.fnt })}>Last night</Text>
            </View>
          </>
        ) : (
          <Text
            style={[
              S(800, 15, { color: c.fnt, align: 'center' }),
              styles.emptyChart,
            ]}
          >
            No sleep history yet
          </Text>
        )}
      </Card>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6 },
  heroPill: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 999 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  groupLabel: { marginTop: 0, marginBottom: 0, flexShrink: 1 },
  groupCard: { marginTop: 12 },
  stackBar: {
    flexDirection: 'row',
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: 12, borderRadius: 14 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  bars: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bar: { flex: 1, borderRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  emptyChart: { paddingVertical: 40 },
});
