import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BAND,
  BriefScreen,
  cardTitleStyle,
  GridBox,
  GridCell,
  GridRow,
  HeroRow,
  InkBand,
  M,
  MacroBar,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  HealthSnapshot,
  healthSourceName,
  ReadinessContribution,
} from '../../health';
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

/** Recovery status: pill text + whether to show the green dot. */
function recoveryPill(snap: HealthSnapshot): {
  text: string;
  dot: boolean;
} {
  if (!snap.readiness) return { text: 'NOT CONNECTED', dot: false };
  return { text: snap.readiness.state.toUpperCase(), dot: true };
}

/** The fallback hint under the hero number when there is nothing to explain. */
const READINESS_CAPTION: Record<string, string> = {
  Recovered: 'READY TO ADD LOAD',
  Balanced: 'HOLD YOUR USUAL LOAD',
  Strained: 'KEEP IT EASY TODAY',
};

/** Short label for each readiness input in the hero's "counted from" line. */
const CONTRIBUTOR_SHORT: Record<ReadinessContribution['key'], string> = {
  hrv: 'HRV',
  rhr: 'RHR',
  sleep: 'SLEEP',
};

/** What the score was counted from, e.g. "HRV 62 · RHR 54 · SLEEP 96% →". */
function readinessCaption(snap: HealthSnapshot): string {
  const parts = snap.readiness?.contributors ?? [];
  if (parts.length === 0) {
    return snap.readiness
      ? (READINESS_CAPTION[snap.readiness.state] ?? 'TAP FOR DETAIL')
      : 'CONNECT A SOURCE TO START';
  }
  return (
    parts
      .map(cont => {
        const label = CONTRIBUTOR_SHORT[cont.key];
        const value =
          cont.key === 'sleep'
            ? `${Math.round(cont.score)}%`
            : String(Math.round(cont.value));
        return `${label} ${value}`;
      })
      .join(' · ') + ' →'
  );
}

/** A signed delta sub-label for a grid cell ("▲ 7 MS"), coloured good/bad. */
function deltaSub(
  delta: number | null | undefined,
  goodUp: boolean,
  unit: string,
  decimals = 0,
): { text: string; good: boolean } | null {
  if (delta == null) return null;
  const rounded = Number(delta.toFixed(decimals));
  if (rounded === 0) return null;
  const up = rounded > 0;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(rounded).toFixed(decimals)} ${unit}`.trim(),
    good: goodUp ? up : !up,
  };
}

/**
 * The "Today" data brief (v4 "ink band" layout): the recovery hero and the
 * daily brief share a full-bleed dark band that continues the native header;
 * below it a four-up metric grid (sleep, HRV, RHR, load) with the overnight
 * stage bar, then the "Body & fuel" card and the week's goals.
 */
export function DashboardScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const snap = useHealthStore(s => s.snapshot);
  const briefText = useDailyBriefStore(s => s.text);
  const briefStatus = useDailyBriefStore(s => s.status);
  const briefError = useDailyBriefStore(s => s.error);
  const ensureBrief = useDailyBriefStore(s => s.ensure);
  const regenerateBrief = useDailyBriefStore(s => s.regenerate);

  React.useEffect(() => {
    void ensureBrief();
  }, [ensureBrief]);

  const recoveryPct = snap.readiness?.pct ?? null;
  const pill = recoveryPill(snap);
  const caption = readinessCaption(snap);

  const briefSyncing = briefStatus === 'syncing';
  const briefWorking = briefSyncing || briefStatus === 'loading';
  const briefBody = briefWorking
    ? briefSyncing
      ? 'Waiting for today’s health data…'
      : 'Writing today’s brief…'
    : briefText ||
      (briefError ?? 'No brief yet — set up the coach in Setup, then refresh.');

  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const hasNet = eaten != null || burned > 0;
  const net = (eaten ?? 0) - burned;

  const protein = snap.nutrition?.proteinG ?? null;
  const fat = snap.nutrition?.fatG ?? null;
  const PROTEIN_MIN = 165;
  const FAT_MAX = 62;

  const sleep = snap.sleep;
  const stages = sleep?.stages ?? null;
  const stageTotal = stages
    ? stages.deepMin + stages.remMin + stages.lightMin + stages.awakeMin
    : 0;

  const hrvSub = deltaSub(snap.hrv?.delta, true, 'MS');
  const rhrSub = deltaSub(snap.restingHr?.delta, false, 'BPM');

  const wPts = snap.trends.weight;
  const latestWeight = wPts.length ? wPts[wPts.length - 1].value : null;
  const prevWeight = wPts.length > 1 ? wPts[wPts.length - 2].value : null;
  const wSub = deltaSub(
    latestWeight != null && prevWeight != null
      ? latestWeight - prevWeight
      : null,
    false,
    '',
    1,
  );
  const fPts = snap.trends.bodyFat;
  const latestFat = fPts.length ? fPts[fPts.length - 1].value : null;
  const prevFat = fPts.length > 1 ? fPts[fPts.length - 2].value : null;
  const fSub = deltaSub(
    latestFat != null && prevFat != null ? latestFat - prevFat : null,
    false,
    '',
    1,
  );

  const syncNote = snap.live
    ? `SYNCED · ${healthSourceName().toUpperCase()} · ${snap.sources.length} SOURCE${snap.sources.length === 1 ? '' : 'S'}`
    : 'NO HEALTH DATA YET — CONNECT IN SETUP';

  return (
    <BriefScreen>
      {/* ── Recovery hero + daily brief, in the ink band ─────────────── */}
      <InkBand paddingBottom={20}>
        <HeroRow
          value={recoveryPct != null ? String(recoveryPct) : '—'}
          suffix={recoveryPct != null ? '%' : undefined}
          pillText={pill.text}
          pillDot={pill.dot}
          caption={caption}
          onPress={() => navigation.navigate('Recovery')}
          accessibilityLabel={
            recoveryPct != null
              ? `Open recovery detail, ${recoveryPct} percent recovered`
              : 'Open recovery detail, no recovery data'
          }
        />

        <View style={styles.brief}>
          <View style={styles.briefBar}>
            <View
              style={{
                width: `${recoveryPct ?? 0}%`,
                height: '100%',
                backgroundColor: BAND.grn,
              }}
            />
          </View>
          <View style={styles.briefHead}>
            <Icon name="gemini" size={13} color={BAND.acc} />
            <Text style={M(700, 9, { ls: 1.4, color: BAND.fnt })}>
              DAILY BRIEF
            </Text>
            <View style={styles.spacer} />
            {briefWorking ? (
              <ActivityIndicator size="small" color={BAND.acc} />
            ) : (
              <Pressable
                onPress={() => void regenerateBrief()}
                accessibilityRole="button"
                accessibilityLabel="Regenerate today's brief"
                hitSlop={8}
              >
                <Text style={M(700, 9, { ls: 1, color: BAND.acc })}>
                  REFRESH
                </Text>
              </Pressable>
            )}
          </View>
          <Text
            style={S(500, 12.5, {
              lh: 17,
              color: briefWorking || !briefText ? BAND.mut : BAND.ink,
            })}
          >
            {briefBody}
          </Text>
        </View>
      </InkBand>

      {/* ── Overnight metrics grid ───────────────────────────────────── */}
      <GridBox style={styles.gridGap}>
        <GridRow>
          <GridCell
            first
            label="SLEEP"
            onPress={() => navigation.navigate('Sleep')}
            accessibilityLabel="Open sleep detail"
          >
            <Text style={M(700, 19, { ls: -0.3, color: c.ink })}>
              {sleep ? hoursToHm(sleep.hours) : '——'}
            </Text>
            {sleep ? (
              <Text style={M(700, 9, { color: c.grn })}>
                {sleep.performancePct} % NEED
              </Text>
            ) : null}
          </GridCell>
          <GridCell
            label="HRV"
            onPress={() => navigation.navigate('Recovery')}
            accessibilityLabel="Open recovery detail"
          >
            <Text style={M(700, 19, { ls: -0.3, color: c.ink })}>
              {snap.hrv ? String(Math.round(snap.hrv.value)) : '——'}
            </Text>
            {hrvSub ? (
              <Text style={M(700, 9, { color: hrvSub.good ? c.grn : c.red })}>
                {hrvSub.text}
              </Text>
            ) : null}
          </GridCell>
          <GridCell
            label="RHR"
            onPress={() => navigation.navigate('Recovery')}
            accessibilityLabel="Open recovery detail"
          >
            <Text style={M(700, 19, { ls: -0.3, color: c.ink })}>
              {snap.restingHr ? String(Math.round(snap.restingHr.value)) : '——'}
            </Text>
            {rhrSub ? (
              <Text style={M(700, 9, { color: rhrSub.good ? c.grn : c.red })}>
                {rhrSub.text}
              </Text>
            ) : null}
          </GridCell>
          <GridCell
            label="LOAD"
            onPress={() => navigation.navigate('Cardio')}
            accessibilityLabel="Open cardio load detail"
          >
            <Text style={M(700, 19, { ls: -0.3, color: c.ink })}>
              {snap.cardio.hasLoadData ? String(snap.cardio.todayLoad) : '——'}
            </Text>
            {snap.cardio.hasLoadData ? (
              <Text style={M(700, 9, { color: c.grn })}>
                WK {snap.cardio.weekLoad}
              </Text>
            ) : null}
          </GridCell>
        </GridRow>

        {stages && stageTotal > 0 ? (
          <Pressable
            onPress={() => navigation.navigate('Sleep')}
            accessibilityRole="button"
            accessibilityLabel="Open sleep detail"
            style={[styles.stagesRow, { borderTopColor: c.hair }]}
          >
            <Text
              style={[
                M(700, 8.5, { ls: 1.2, color: c.fnt }),
                styles.stagesLabel,
              ]}
            >
              STAGES
            </Text>
            <View style={styles.stageBar}>
              <View
                style={{ flex: stages.deepMin, backgroundColor: c.accSolid }}
              />
              <View style={{ flex: stages.remMin, backgroundColor: c.acc }} />
              <View
                style={{ flex: stages.lightMin, backgroundColor: c.sand }}
              />
              <View
                style={{ flex: stages.awakeMin, backgroundColor: c.track }}
              />
            </View>
            <Text style={M(600, 8.5, { color: c.fnt })}>
              DEEP {minToHm(stages.deepMin)} · REM {minToHm(stages.remMin)} ·
              LGT {minToHm(stages.lightMin)}
            </Text>
          </Pressable>
        ) : null}
      </GridBox>

      {/* ── Body & fuel ──────────────────────────────────────────────── */}
      <View
        style={[
          styles.bfCard,
          { backgroundColor: c.card, borderColor: c.hair },
        ]}
      >
        <Pressable
          onPress={() => navigation.navigate('Nutrition')}
          accessibilityRole="button"
          accessibilityLabel="Open fuel detail"
          style={styles.bfTop}
        >
          <View style={styles.bfTitleRow}>
            <Text style={cardTitleStyle(c.ink)}>Body &amp; fuel →</Text>
            <View style={styles.spacer} />
            <Text style={M(700, 13, { color: net < 0 ? c.grn : c.ink })}>
              {hasNet ? signed(net) : '——'}
              <Text style={M(700, 9.5, { color: c.fnt })}> NET KCAL</Text>
            </Text>
          </View>
          <View style={styles.macroCols}>
            <MacroBar
              compact
              style={styles.macroCol}
              label="PROTEIN"
              right={
                <>
                  {protein != null ? Math.round(protein) : '—'}
                  {protein != null && protein < PROTEIN_MIN ? (
                    <Text style={{ color: c.acc }}>
                      {' '}
                      · {Math.round(PROTEIN_MIN - protein)}▲
                    </Text>
                  ) : null}
                </>
              }
              fill={protein != null ? protein / PROTEIN_MIN : 0}
              fillColor={c.ink}
              marker={c.ink}
            />
            <MacroBar
              compact
              style={styles.macroCol}
              label="FAT"
              right={
                <>
                  {fat != null ? Math.round(fat) : '—'}
                  {fat != null && fat < FAT_MAX ? (
                    <Text style={{ color: c.acc }}>
                      {' '}
                      · {Math.round(FAT_MAX - fat)}▽
                    </Text>
                  ) : null}
                </>
              }
              fill={fat != null ? fat / FAT_MAX : 0}
              fillColor={c.acc}
              marker={fat != null && fat > FAT_MAX ? c.red : c.ink}
            />
          </View>
        </Pressable>
        <GridRow borderTop>
          <GridCell first label="WEIGHT">
            <Text style={M(700, 16, { color: c.ink })}>
              {latestWeight != null ? latestWeight.toFixed(1) : '——'}
              <Text style={M(700, 9.5, { color: c.fnt })}> KG</Text>
              {wSub ? (
                <Text style={M(700, 9.5, { color: wSub.good ? c.grn : c.red })}>
                  {'  '}
                  {wSub.text}
                </Text>
              ) : null}
            </Text>
          </GridCell>
          <GridCell label="BODY FAT">
            <Text style={M(700, 16, { color: c.ink })}>
              {latestFat != null ? latestFat.toFixed(1) : '——'}
              <Text style={M(700, 9.5, { color: c.fnt })}> %</Text>
              {fSub ? (
                <Text style={M(700, 9.5, { color: fSub.good ? c.grn : c.red })}>
                  {'  '}
                  {fSub.text}
                </Text>
              ) : null}
            </Text>
          </GridCell>
          <GridCell label="IN / OUT">
            <Text style={M(700, 16, { color: c.ink })}>
              {eaten != null ? grp(eaten) : '——'}
              <Text style={M(700, 9.5, { color: c.fnt })}>
                {' '}
                / {grp(burned)}
              </Text>
            </Text>
          </GridCell>
        </GridRow>
      </View>

      {/* ── Week ─────────────────────────────────────────────────────── */}
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
  spacer: { flex: 1 },
  brief: { marginTop: 14, gap: 10 },
  briefBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: BAND.track,
    marginBottom: 4,
  },
  briefHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  gridGap: { marginTop: 14 },
  stagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
  },
  stagesLabel: { width: 44 },
  stageBar: {
    flex: 1,
    flexDirection: 'row',
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bfCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
  },
  bfTop: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 14 },
  bfTitleRow: { flexDirection: 'row', alignItems: 'center' },
  macroCols: { flexDirection: 'row', gap: 16, marginTop: 12 },
  macroCol: { flex: 1 },
  sync: { marginTop: 16, lineHeight: 15, textAlign: 'center' },
});
