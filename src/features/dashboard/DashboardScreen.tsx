import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BigStat,
  BriefScreen,
  M,
  MacroBar,
  PillSpec,
  Quad,
  Section,
} from '../../components/brief';
import { HealthSnapshot } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import { WeeklyGoalsCard } from '../goals/WeeklyGoalsCard';
import { useDailyBriefStore } from './useDailyBriefStore';

/** Decimal hours → "7:42". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

/** Minutes → "1:10". */
function minToHm(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, '0')}`;
}

function grp(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Signed kcal with a real minus glyph: "−800" / "+300" / "0". */
function signed(n: number): string {
  if (n < 0) return `−${grp(Math.abs(n))}`;
  if (n > 0) return `+${grp(n)}`;
  return '0';
}

/** A colored "▲7" / "▼1" delta node. `goodUp` flips which direction is green. */
function Delta({ delta, goodUp = true }: { delta: number; goodUp?: boolean }) {
  const t = useTheme();
  const rounded = Math.round(delta);
  if (rounded === 0) return null;
  const up = rounded > 0;
  const good = goodUp ? up : !up;
  return (
    <Text style={{ color: good ? t.colors.grn : t.colors.red }}>
      {' '}
      {up ? '▲' : '▼'}
      {Math.abs(rounded)}
    </Text>
  );
}

/** Recovery status pill from the readiness state. The caption beneath the hero
 * number is the AI daily brief (see {@link DashboardScreen}), not a fixed
 * per-state phrase, so this only owns the pill. */
function recoveryPill(
  snap: HealthSnapshot,
  ink: string,
  inv: string,
  acc: string,
  fnt: string,
): PillSpec {
  if (!snap.readiness) return { text: 'NOT CONNECTED', dot: fnt };
  return {
    text: snap.readiness.state.toUpperCase(),
    dot: acc,
    bg: ink,
    textColor: inv,
  };
}

/** The "Today" data brief: recovery, body, fuel and the week's goals. */
export function DashboardScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const briefText = useDailyBriefStore(s => s.text);
  const briefLoading = useDailyBriefStore(s => s.status === 'loading');
  const ensureBrief = useDailyBriefStore(s => s.ensure);

  // Generate today's short brief on mount; it's cached and reused within a day,
  // and stays idle (empty) when the coach isn't set up.
  React.useEffect(() => {
    void ensureBrief();
  }, [ensureBrief]);

  const recoveryPct = snap.readiness?.pct ?? null;
  const pill = recoveryPill(snap, c.ink, c.inv, c.acc, c.fnt);
  // Caption under the hero number is the AI daily brief. Before it lands — or
  // when the coach isn't configured — fall back to a connect/loading hint; the
  // recovery state itself still shows in the pill.
  const caption = !snap.readiness
    ? 'CONNECT A SOURCE TO START'
    : briefText || (briefLoading ? 'Writing today’s brief…' : undefined);

  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const hasNet = eaten != null || burned > 0;
  const net = (eaten ?? 0) - burned;

  const protein = snap.nutrition?.proteinG ?? null;
  const fat = snap.nutrition?.fatG ?? null;
  const PROTEIN_MIN = 165;
  const FAT_MAX = 62;

  const stages = snap.sleep?.stages ?? null;
  const stageTotal = stages
    ? stages.deepMin + stages.remMin + stages.lightMin + stages.awakeMin
    : 0;

  // Latest body-composition readings from the trend series (occasional samples).
  const wPts = snap.trends.weight;
  const latestWeight = wPts.length ? wPts[wPts.length - 1].value : null;
  const fPts = snap.trends.bodyFat;
  const latestFat = fPts.length ? fPts[fPts.length - 1].value : null;

  const syncNote = snap.live
    ? `SYNCED · GOOGLE HEALTH · ${snap.sources.length} SOURCE${snap.sources.length === 1 ? '' : 'S'}`
    : 'NO HEALTH DATA YET — CONNECT IN SETUP';

  return (
    <BriefScreen>
      <BigStat
        value={recoveryPct != null ? String(recoveryPct) : '—'}
        suffix={recoveryPct != null ? '%' : undefined}
        pill={pill}
        caption={caption}
        onPress={() => navigation.navigate('Recovery')}
        accessibilityLabel={
          recoveryPct != null
            ? `Open recovery detail, ${recoveryPct} percent recovered`
            : 'Open recovery detail, no recovery data'
        }
      />

      {/* ── 01 Body ─────────────────────────────────────────────────── */}
      <Section n="01" title="Body" first>
        <Quad
          items={[
            {
              value: snap.hrv ? String(Math.round(snap.hrv.value)) : '——',
              color: snap.hrv ? c.ink : c.sand,
              label: (
                <Text>
                  HRV MS
                  {snap.hrv ? <Delta delta={snap.hrv.delta} /> : null}
                </Text>
              ),
            },
            {
              value: snap.restingHr
                ? String(Math.round(snap.restingHr.value))
                : '——',
              color: snap.restingHr ? c.ink : c.sand,
              label: (
                <Text>
                  RHR
                  {snap.restingHr ? (
                    <Delta delta={snap.restingHr.delta} goodUp={false} />
                  ) : null}
                </Text>
              ),
            },
            {
              value: snap.cardio.hasZoneData
                ? String(snap.cardio.todayLoad)
                : '——',
              color: c.acc,
              label: 'LOAD →',
              onPress: () => navigation.navigate('Cardio'),
            },
            {
              value: latestWeight != null ? latestWeight.toFixed(1) : '——',
              color: latestWeight != null ? c.ink : c.sand,
              label: 'WEIGHT KG',
            },
            {
              value: latestFat != null ? latestFat.toFixed(1) : '——',
              color: latestFat != null ? c.ink : c.sand,
              label: 'BODYFAT %',
            },
          ]}
        />

        {snap.sleep ? (
          <View style={styles.sleepHead}>
            <Text style={M(800, 20, { ls: -1, color: c.ink })}>
              {hoursToHm(snap.sleep.hours)}
            </Text>
            <Text style={M(600, 9, { ls: 1, color: c.fnt })}>
              SLEEP · {snap.sleep.performancePct}%
            </Text>
          </View>
        ) : null}

        {stages && stageTotal > 0 ? (
          <>
            <View style={styles.stageBar}>
              <View style={{ flex: stages.deepMin, backgroundColor: c.ink }} />
              <View style={{ flex: stages.remMin, backgroundColor: c.acc }} />
              <View
                style={{ flex: stages.lightMin, backgroundColor: c.sand }}
              />
              <View
                style={{ flex: stages.awakeMin, backgroundColor: c.track }}
              />
            </View>
            <View style={styles.stageLabels}>
              <Text style={M(600, 9, { color: c.fnt })}>
                DEEP {minToHm(stages.deepMin)}
              </Text>
              <Text style={M(600, 9, { color: c.fnt })}>
                REM {minToHm(stages.remMin)}
              </Text>
              <Text style={M(600, 9, { color: c.fnt })}>
                LGT {minToHm(stages.lightMin)}
              </Text>
              <Text style={M(600, 9, { color: c.fnt })}>
                WAKE {minToHm(stages.awakeMin)}
              </Text>
            </View>
          </>
        ) : null}
      </Section>

      {/* ── 02 Fuel ─────────────────────────────────────────────────── */}
      <Section
        n="02"
        title="Fuel"
        onTitlePress={() => navigation.navigate('Nutrition')}
        titleRight={
          <Text style={M(700, 10.5, { color: c.fnt })}>
            {hasNet ? (
              <>
                NET{' '}
                <Text style={{ color: net < 0 ? c.grn : c.ink }}>
                  {signed(net)}
                </Text>
                {' →'}
              </>
            ) : (
              'NO DATA →'
            )}
          </Text>
        }
      >
        <MacroBar
          style={styles.macroGap}
          label="PROTEIN · MIN 165G"
          right={
            <>
              {protein != null ? Math.round(protein) : '—'}
              {protein != null && protein < PROTEIN_MIN ? (
                <Text style={{ color: c.acc }}>
                  {' '}
                  · {Math.round(PROTEIN_MIN - protein)} TO GO
                </Text>
              ) : null}
            </>
          }
          fill={protein != null ? protein / PROTEIN_MIN : 0}
          fillColor={c.ink}
          marker={c.ink}
        />
        <MacroBar
          style={styles.macroGap}
          label="FAT · MAX 62G"
          right={
            <>
              {fat != null ? Math.round(fat) : '—'}
              {fat != null && fat < FAT_MAX ? (
                <Text style={{ color: c.acc }}>
                  {' '}
                  · {Math.round(FAT_MAX - fat)} SPARE
                </Text>
              ) : null}
            </>
          }
          fill={fat != null ? fat / FAT_MAX : 0}
          fillColor={c.acc}
          marker={fat != null && fat > FAT_MAX ? c.red : c.ink}
        />
      </Section>

      {/* ── 03 Week ─────────────────────────────────────────────────── */}
      <WeeklyGoalsCard navigation={navigation} />

      <Text
        style={[M(600, 9.5, { ls: 1, upper: true, color: c.fnt }), styles.sync]}
      >
        {syncNote}
      </Text>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  sleepHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 16,
  },
  stageBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
  },
  stageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  macroGap: { marginTop: 14 },
  sync: { marginTop: 16, lineHeight: 15 },
});
