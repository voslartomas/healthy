import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  chunky,
  GroupLabel,
  InkBand,
  S,
  Tone,
  toneColors,
} from '../../components/brief';
import {
  healthSourceName,
  HealthSnapshot,
  ReadinessContribution,
} from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/**
 * Recovery detail (ADR-007 "friendly" layout): the readiness score as a big
 * ring on a soft hero tinted by its state, the three overnight inputs as chips,
 * how the score was reached ("How it's scored"), and a 14-day HRV line.
 *
 * Readiness is a disclosed, non-clinical heuristic over the user's own 30-day
 * baselines (ADR-004) — the breakdown and its note exist so a low number is
 * explained rather than asserted, and must never read as a medical claim.
 */

/** Decimal hours → "7h 42m". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${(total % 60).toString().padStart(2, '0')}m`;
}

/** A signed, rounded delta ("▲ 5"), coloured by whether that direction is
 * good; null when it rounds to zero (no arrow beats a "▲ 0"). */
function deltaSub(
  delta: number,
  goodUp: boolean,
  unit = '',
): { text: string; good: boolean } | null {
  const r = Math.round(delta);
  if (r === 0) return null;
  const up = r > 0;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(r)}${unit}`,
    good: goodUp ? up : !up,
  };
}

/**
 * The hero's headline. With a score: the state and what it means for today, in
 * the state's colour. Without one, WHY there is none — connected-but-empty is
 * the usual early-morning state (the wearable hasn't pushed last night yet, see
 * derive.currentNight), not a setup problem, so it must never say "Not
 * connected".
 */
function heroCopy(snap: HealthSnapshot): {
  title: string;
  sub: string;
  tone: Tone;
} {
  const r = snap.readiness;
  if (r) {
    if (r.state === 'Recovered')
      return {
        title: 'Recovered',
        sub: 'Your body is ready for a harder session today.',
        tone: 'green',
      };
    if (r.state === 'Balanced')
      return {
        title: 'Balanced',
        sub: 'Hold your usual load today.',
        tone: 'accent',
      };
    return {
      title: 'Strained',
      sub: 'Keep it easy today and let your body catch up.',
      tone: 'red',
    };
  }
  if (snap.live)
    return {
      title: 'Not synced yet',
      sub: 'Last night hasn’t synced yet — check back soon.',
      tone: 'accent',
    };
  return {
    title: 'Not connected',
    sub: 'Connect a source in Me to start.',
    tone: 'accent',
  };
}

/** The big readiness ring: the score as a filled arc on a card-coloured track,
 * so it reads on the tinted hero in both schemes. */
function ScoreRing({ pct, tone }: { pct: number | null; tone: Tone }) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
  const size = 180;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = pct != null ? Math.max(0, Math.min(1, pct / 100)) : 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={c.card}
          strokeWidth={stroke}
          fill="none"
        />
        {frac > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tc.solid}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * frac} ${circ}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
        <Text style={S(900, 52, { lh: 58, color: c.ink })}>
          {pct != null ? `${pct}%` : '—'}
        </Text>
      </View>
    </View>
  );
}

/** One chunky stat chip under the hero: label, value, coloured delta. */
function StatChip({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: { text: string; good?: boolean } | null;
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
          style={S(900, 13, {
            color: sub.good == null ? c.mut : sub.good ? c.grn : c.red,
          })}
          numberOfLines={1}
        >
          {sub.text}
        </Text>
      ) : null}
    </View>
  );
}

/** How each input is named, and how its reading is compared with its
 * reference, for the score breakdown. */
const CONTRIBUTOR_COPY: Record<
  ReadinessContribution['key'],
  { label: string; compare: (value: string, ref: string) => string }
> = {
  hrv: {
    label: 'HRV',
    compare: (v, ref) =>
      `${v} ms vs your ${ref} ms baseline · higher is better`,
  },
  rhr: {
    label: 'Resting HR',
    compare: (v, ref) =>
      `${v} bpm vs your ${ref} bpm baseline · lower is better`,
  },
  sleep: {
    label: 'Sleep',
    compare: (v, ref) => `${v} vs your ${ref} need · longer is better`,
  },
};

/** Format a contributor's reading and its reference in that metric's own units. */
function contributorText(cont: ReadinessContribution): {
  value: string;
  reference: string;
} {
  if (cont.key === 'sleep') {
    return {
      value: hoursToHm(cont.value),
      reference: hoursToHm(cont.reference),
    };
  }
  return {
    value: String(Math.round(cont.value)),
    reference: String(Math.round(cont.reference)),
  };
}

/**
 * One row of the score breakdown: the input's name and its share of the blend,
 * its 0–100 sub-score as a bar, and the reading against its reference.
 * Together the rows show exactly how the headline number was reached — the
 * point is that a low score is explainable, not asserted.
 */
function ContributorRow({ cont }: { cont: ReadinessContribution }) {
  const c = useTheme().colors;
  const copy = CONTRIBUTOR_COPY[cont.key];
  const { value, reference } = contributorText(cont);
  const score = Math.round(cont.score);
  // Same thresholds as the headline state, so a green row always means the same
  // thing as a "Recovered" headline.
  const tone: Tone = score >= 66 ? 'green' : score >= 34 ? 'accent' : 'red';
  const tc = toneColors(c, tone);
  return (
    <View style={styles.contRow}>
      <View style={styles.contHead}>
        <View style={styles.contName}>
          <Text style={S(900, 16, { color: c.ink })}>{copy.label}</Text>
          <Text style={S(900, 13, { color: c.fnt })}>
            · {Math.round(cont.weight * 100)}% of score
          </Text>
        </View>
        <Text
          style={S(900, 16, { color: tone === 'accent' ? c.ink : tc.text })}
        >
          {score} / 100
        </Text>
      </View>
      <View style={[styles.contTrack, { backgroundColor: tc.tint }]}>
        <View
          style={{
            width: `${score}%`,
            height: '100%',
            borderRadius: 6,
            backgroundColor: tc.solid,
          }}
        />
      </View>
      <Text style={S(700, 13, { lh: 18, color: c.mut })}>
        {copy.compare(value, reference)}
      </Text>
    </View>
  );
}

/** HRV chart geometry, in viewBox units (scaled to the card width). */
const W = 320;
const H = 120;
const PAD = 8;

/** Recovery detail: readiness score, how it was scored, and a 14-day HRV line. */
export function RecoveryScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const snap = useHealthStore(s => s.snapshot);
  const readiness = snap.readiness;
  const hrvSeries = snap.trends.hrv.slice(-14).map(p => p.value);
  const baseline = snap.hrv?.baseline ?? null;
  const hero = heroCopy(snap);
  const heroTone = toneColors(c, hero.tone);

  // The y-domain spans the series AND the baseline, so the dashed baseline is
  // drawn where it really sits instead of at a fixed height.
  let lo = Math.min(...hrvSeries, baseline ?? Infinity);
  let hi = Math.max(...hrvSeries, baseline ?? -Infinity);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (hrvSeries.length - 1);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const hasChart = hrvSeries.length > 1;
  const line = hasChart
    ? 'M' +
      hrvSeries
        .map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .join(' L')
    : '';
  const lastIdx = hrvSeries.length - 1;

  const hrvSub = snap.hrv ? deltaSub(snap.hrv.delta, true) : null;
  const rhrSub = snap.restingHr
    ? deltaSub(snap.restingHr.delta, false, ' bpm')
    : null;

  return (
    <BriefScreen>
      {/* ── Hero: the ring, the state, what it means ─────────────────── */}
      <InkBand tone={hero.tone} paddingTop={24} paddingBottom={24}>
        <View style={styles.hero}>
          <ScoreRing pct={readiness?.pct ?? null} tone={hero.tone} />
          <Text style={S(900, 28, { lh: 34, color: heroTone.text })}>
            {hero.title}
          </Text>
          <Text style={S(700, 16, { lh: 22, color: c.mut, align: 'center' })}>
            {hero.sub}
          </Text>
          {readiness ? (
            <Text style={S(800, 13, { color: c.fnt, align: 'center' })}>
              Live from {healthSourceName()}
            </Text>
          ) : null}
        </View>
      </InkBand>

      {/* ── The three overnight inputs ───────────────────────────────── */}
      <View style={styles.chips}>
        <StatChip
          label="HRV"
          value={snap.hrv ? `${Math.round(snap.hrv.value)} ms` : '—'}
          sub={hrvSub}
        />
        <StatChip
          label="RESTING HR"
          value={
            snap.restingHr ? String(Math.round(snap.restingHr.value)) : '—'
          }
          sub={rhrSub}
        />
        <StatChip
          label="SLEEP"
          value={snap.sleep ? hoursToHm(snap.sleep.hours) : '—'}
          sub={snap.sleep ? { text: `${snap.sleep.performancePct}%` } : null}
        />
      </View>

      {/* ── How it's scored ──────────────────────────────────────────── */}
      <View style={styles.groupRow}>
        <GroupLabel style={styles.groupLabel}>How it’s scored</GroupLabel>
        {readiness ? (
          <Text style={S(800, 14, { color: c.fnt })}>
            {readiness.pct} / 100
          </Text>
        ) : null}
      </View>
      <Card style={styles.groupCard}>
        {readiness && readiness.contributors.length > 0 ? (
          <View style={styles.contList}>
            {readiness.contributors.map(cont => (
              <ContributorRow key={cont.key} cont={cont} />
            ))}
            <Text
              style={[
                S(700, 13, { lh: 18, color: c.mut }),
                styles.formulaNote,
                { backgroundColor: c.soft },
              ]}
            >
              Each input is scored against your own 30-day baseline, then
              blended by the shares above. This is a simple guide, not a medical
              measurement or diagnosis.
            </Text>
          </View>
        ) : (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            {snap.live
              ? 'Last night hasn’t synced yet. Once your overnight HRV or resting heart rate arrives, you’ll see how your readiness is scored.'
              : 'Connect a source with overnight HRV or resting heart rate to see how your readiness is scored.'}
          </Text>
        )}
      </Card>

      {/* ── HRV · 14 days ────────────────────────────────────────────── */}
      <View style={styles.groupRow}>
        <GroupLabel style={styles.groupLabel}>HRV · 14 days</GroupLabel>
        {baseline != null ? (
          <Text style={S(800, 14, { color: c.fnt })}>
            Baseline {Math.round(baseline)}
          </Text>
        ) : null}
      </View>
      <Card style={styles.groupCard}>
        {hasChart ? (
          <>
            <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
              {baseline != null ? (
                <Line
                  x1={0}
                  y1={y(baseline)}
                  x2={W}
                  y2={y(baseline)}
                  stroke={c.fnt}
                  strokeWidth={2}
                  strokeDasharray="6 6"
                />
              ) : null}
              <Path
                d={line}
                fill="none"
                stroke={c.grnSolid}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Circle
                cx={x(lastIdx)}
                cy={y(hrvSeries[lastIdx])}
                r={6}
                fill={c.grnSolid}
                stroke={c.card}
                strokeWidth={3}
              />
            </Svg>
            <View style={styles.axis}>
              <Text style={S(800, 13, { color: c.fnt })}>2 weeks ago</Text>
              <Text style={S(800, 13, { color: c.fnt })}>Today</Text>
            </View>
          </>
        ) : (
          <Text
            style={[
              S(800, 15, { color: c.fnt, align: 'center' }),
              styles.empty,
            ]}
          >
            No HRV history yet
          </Text>
        )}
      </Card>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8 },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16 },
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
  contList: { gap: 16 },
  contRow: { gap: 6 },
  contHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  contName: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    flexShrink: 1,
  },
  contTrack: { height: 12, borderRadius: 6, overflow: 'hidden' },
  formulaNote: { padding: 12, borderRadius: 14, overflow: 'hidden' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  empty: { paddingVertical: 40 },
});
