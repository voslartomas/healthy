import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  GridBox,
  GridCell,
  GridRow,
  HeroRow,
  InkBand,
  M,
  S,
} from '../../components/brief';
import { ReadinessContribution } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function project(
  pts: number[],
  w: number,
  h: number,
  pad: number,
): [number, number][] {
  let min = Math.min(...pts),
    max = Math.max(...pts);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return pts.map((p, i) => [
    pad + (i * (w - 2 * pad)) / (pts.length - 1),
    h - pad - ((p - min) / (max - min)) * (h - 2 * pad),
  ]);
}

function Delta({ delta, goodUp = true }: { delta: number; goodUp?: boolean }) {
  const t = useTheme();
  const r = Math.round(delta);
  if (r === 0) return null;
  const up = r > 0;
  const good = goodUp ? up : !up;
  return (
    <Text style={{ color: good ? t.colors.grn : t.colors.red }}>
      {' '}
      {up ? '▲' : '▼'}
      {Math.abs(r)}
    </Text>
  );
}

/** How each input is named, measured and compared, for the score breakdown. */
const CONTRIBUTOR_COPY: Record<
  ReadinessContribution['key'],
  { label: string; unit: string; compare: (ref: string) => string }
> = {
  hrv: {
    label: 'HRV',
    unit: 'ms',
    compare: ref => `VS ${ref} BASELINE · HIGHER IS BETTER`,
  },
  rhr: {
    label: 'Resting HR',
    unit: 'bpm',
    compare: ref => `VS ${ref} BASELINE · LOWER IS BETTER`,
  },
  sleep: {
    label: 'Sleep',
    unit: 'h',
    compare: ref => `VS ${ref} NEED · LONGER IS BETTER`,
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
 * the reading against its reference, and a 0–100 bar of the sub-score that share
 * was applied to. Together the rows show exactly how the headline number was
 * reached — the point is that a low score is explainable, not asserted.
 */
function ContributorRow({
  cont,
  last,
}: {
  cont: ReadinessContribution;
  last?: boolean;
}) {
  const c = useTheme().colors;
  const copy = CONTRIBUTOR_COPY[cont.key];
  const { value, reference } = contributorText(cont);
  const score = Math.round(cont.score);
  // Same thresholds as the headline state, so a green row always means the same
  // thing as a "Recovered" headline.
  const tone = score >= 66 ? c.grn : score >= 34 ? c.ink : c.red;
  return (
    <View
      style={[
        styles.contRow,
        last ? null : { borderBottomWidth: 1, borderBottomColor: c.hair },
      ]}
    >
      <View style={styles.contHead}>
        <Text style={S(700, 13.5, { color: c.ink })}>{copy.label}</Text>
        <Text style={M(700, 9.5, { ls: 1, color: c.fnt })}>
          {Math.round(cont.weight * 100)}% OF SCORE
        </Text>
      </View>
      <View style={styles.contValues}>
        <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
          {value}
          <Text style={M(600, 11, { color: c.fnt })}> {copy.unit}</Text>
        </Text>
        <Text style={[M(700, 17, { color: tone }), styles.contScore]}>
          {score}
          <Text style={M(600, 10, { color: c.fnt })}>/100</Text>
        </Text>
      </View>
      <View style={[styles.contTrack, { backgroundColor: c.track }]}>
        <View
          style={{
            width: `${score}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: tone,
          }}
        />
      </View>
      <Text style={[M(600, 9, { ls: 0.6, color: c.fnt }), styles.contNote]}>
        {copy.compare(reference)}
      </Text>
    </View>
  );
}

/** Recovery detail: readiness score, how it was scored, and a 14-day HRV line. */
export function RecoveryScreen(_props: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const readiness = snap.readiness;
  const hrvSeries = snap.trends.hrv.slice(-14).map(p => p.value);
  const baseline = snap.hrv?.baseline ?? null;

  const pillText = readiness ? readiness.state.toUpperCase() : 'NOT CONNECTED';
  const pillDot = !!readiness;

  const W = 354,
    H = 130,
    PAD = 14;
  const xy = hrvSeries.length > 1 ? project(hrvSeries, W, H, PAD) : [];
  const line = xy.length
    ? 'M' + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
    : '';

  return (
    <BriefScreen>
      <InkBand>
        <HeroRow
          value={readiness ? String(readiness.pct) : '—'}
          suffix={readiness ? '%' : undefined}
          pillText={pillText}
          pillDot={pillDot}
          caption={
            snap.live ? 'LIVE · GOOGLE HEALTH' : 'CONNECT A SOURCE TO START'
          }
        />
      </InkBand>

      <GridBox style={styles.gap16}>
        <GridRow>
          <GridCell
            first
            label={
              <>
                HRV MS{snap.hrv ? <Delta delta={snap.hrv.delta} /> : null}
              </>
            }
          >
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
              {snap.hrv ? String(Math.round(snap.hrv.value)) : '——'}
            </Text>
          </GridCell>
          <GridCell
            label={
              <>
                RHR
                {snap.restingHr ? (
                  <Delta delta={snap.restingHr.delta} goodUp={false} />
                ) : null}
              </>
            }
          >
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
              {snap.restingHr ? String(Math.round(snap.restingHr.value)) : '——'}
            </Text>
          </GridCell>
          <GridCell
            label={snap.sleep ? `SLEEP ${hoursToHm(snap.sleep.hours)}` : 'SLEEP'}
          >
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
              {snap.sleep ? `${snap.sleep.performancePct}%` : '——'}
            </Text>
          </GridCell>
          <GridCell label="RESP RPM">
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>——</Text>
          </GridCell>
        </GridRow>
      </GridBox>

      <Card
        title="How this is scored"
        right={
          readiness ? (
            <Text style={M(700, 10.5, { color: c.fnt })}>
              {readiness.pct}/100
            </Text>
          ) : undefined
        }
      >
        {readiness && readiness.contributors.length > 0 ? (
          <View style={styles.contList}>
            {readiness.contributors.map((cont, i) => (
              <ContributorRow
                key={cont.key}
                cont={cont}
                last={i === readiness.contributors.length - 1}
              />
            ))}
            <Text
              style={[
                M(600, 9.5, { ls: 0.6, color: c.fnt }),
                styles.formulaNote,
              ]}
            >
              EACH INPUT IS SCORED AGAINST YOUR OWN 30-DAY BASELINE, THEN
              BLENDED BY THE SHARES ABOVE. NON-CLINICAL — YOUR NUMBERS, NOT A
              DIAGNOSIS.
            </Text>
          </View>
        ) : (
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty2]}>
            Connect a source with overnight HRV or resting heart rate to see how
            your readiness is scored.
          </Text>
        )}
      </Card>

      <Card
        title="HRV · 14 days"
        right={
          baseline != null ? (
            <Text style={M(700, 10.5, { color: c.fnt })}>
              BASELINE {Math.round(baseline)}
            </Text>
          ) : undefined
        }
      >
        {xy.length ? (
          <>
            <Svg
              width="100%"
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              style={styles.chart}
            >
              <Line
                x1={0}
                y1={72}
                x2={W}
                y2={72}
                stroke={c.fnt}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <Path
                d={line}
                fill="none"
                stroke={c.acc}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <View style={styles.axis}>
              <Text style={M(600, 9.5, { color: c.fnt })}>2 WKS AGO</Text>
              <Text style={M(600, 9.5, { color: c.fnt })}>TODAY</Text>
            </View>
          </>
        ) : (
          <Text
            style={[
              M(600, 12, { color: c.fnt, align: 'center' }),
              styles.empty,
            ]}
          >
            NO HRV HISTORY YET
          </Text>
        )}
      </Card>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  gap16: { marginTop: 16 },
  contList: { marginTop: 4 },
  contRow: { paddingVertical: 14 },
  contHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  contValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  contScore: { flexShrink: 0 },
  contTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 9 },
  contNote: { marginTop: 8 },
  formulaNote: { marginTop: 14, lineHeight: 15 },
  empty2: { marginTop: 12 },
  chart: { marginTop: 10 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  empty: { paddingVertical: 40 },
});
