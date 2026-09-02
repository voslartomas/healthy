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
  BigStat,
  BriefScreen,
  Card,
  GroupLabel,
  M,
  MacroBar,
  Pill,
  PillSpec,
  S,
} from '../../components/brief';
import { Icon, IconName } from '../../components/Icon';
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

/** One "▲ 7" / "▼ 1" delta pill. The tinted green fill is the design's default;
 * a move in the bad direction gets a red tint of the same shape. */
function useDeltaPill(
  delta: number | null,
  goodUp: boolean,
  decimals = 0,
): PillSpec | null {
  const c = useTheme().colors;
  if (delta == null) return null;
  const rounded = Number(delta.toFixed(decimals));
  if (rounded === 0) return null;
  const up = rounded > 0;
  const good = goodUp ? up : !up;
  return {
    text: `${up ? '▲' : '▼'} ${Math.abs(rounded).toFixed(decimals)}`,
    ...(good ? {} : { bg: c.accentSoft, textColor: c.red }),
  };
}

/** Recovery status pill from the readiness state. */
function recoveryPill(
  snap: HealthSnapshot,
  acc: string,
  fnt: string,
): PillSpec {
  if (!snap.readiness) return { text: 'NOT CONNECTED', dot: fnt, bg: null };
  return { text: snap.readiness.state.toUpperCase(), dot: acc };
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

/**
 * What the score was counted from, e.g. "HRV 62 · RHR 54 · SLEEP 96% →".
 *
 * The hero used to show a fixed phrase per state, which said what to do but not
 * why. Naming the inputs here — with the full weighting and per-input scores one
 * tap away on the Recovery screen — makes the number answerable at the place
 * it is read.
 */
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

/**
 * One row of the "Body & fuel" list: leading icon, name, mono readout with
 * a small unit, and an optional delta/status pill. Becomes a button when
 * `onPress` is set (Cardio load → detail).
 */
function VitalRow({
  icon,
  iconColor,
  name,
  value,
  unit,
  delta,
  deltaGoodUp = true,
  deltaDecimals = 0,
  pill,
  last,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  iconColor: string;
  name: string;
  value: string;
  unit?: string;
  /** Change vs the previous reading; rendered as the trailing pill. */
  delta?: number | null;
  deltaGoodUp?: boolean;
  deltaDecimals?: number;
  /** A fixed pill instead of a delta (e.g. "WEEK 34" on cardio load). */
  pill?: PillSpec | null;
  last?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = useTheme().colors;
  const computed = useDeltaPill(delta ?? null, deltaGoodUp, deltaDecimals);
  const shown = pill ?? computed;
  const body = (
    <>
      <Icon name={icon} size={18} color={iconColor} strokeWidth={2} />
      <Text style={[S(700, 13, { color: c.ink }), styles.vitalName]}>
        {name}
      </Text>
      <Text style={M(700, 17, { ls: -0.2, color: c.ink })}>
        {value}
        {unit ? (
          <Text style={M(600, 11, { color: c.fnt })}> {unit}</Text>
        ) : null}
      </Text>
      {shown ? <Pill spec={shown} small /> : null}
    </>
  );
  const rowStyle = [
    styles.vitalRow,
    last ? null : { borderBottomWidth: 1, borderBottomColor: c.hair },
  ];
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={rowStyle}
    >
      {body}
    </Pressable>
  ) : (
    <View style={rowStyle}>{body}</View>
  );
}

/** The "Today" data brief: the recovery hero, the daily brief, one "Body &
 * fuel" card gathering sleep, the overnight vitals and today's fuel, and the
 * week's goals. */
export function DashboardScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const briefText = useDailyBriefStore(s => s.text);
  const briefStatus = useDailyBriefStore(s => s.status);
  const ensureBrief = useDailyBriefStore(s => s.ensure);
  const regenerateBrief = useDailyBriefStore(s => s.regenerate);

  // Generate today's short brief on mount; it's cached and reused within a day,
  // and stays idle (empty) when the coach isn't set up.
  React.useEffect(() => {
    void ensureBrief();
  }, [ensureBrief]);

  const recoveryPct = snap.readiness?.pct ?? null;
  const caption = readinessCaption(snap);

  const briefError = useDailyBriefStore(s => s.error);
  // 'syncing' = waiting on today's health read; 'loading' = the on-device model
  // is generating (the slow half). Both spin, with different copy, so a long
  // wait is visibly attributed.
  const briefSyncing = briefStatus === 'syncing';
  const briefWorking = briefSyncing || briefStatus === 'loading';
  const showBrief = briefStatus !== 'idle' || !!briefText;
  const briefBody = briefWorking
    ? briefSyncing
      ? 'Waiting for today’s health data…'
      : 'Writing today’s brief…'
    : briefText || (briefError ?? 'No brief yet — tap refresh.');

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

  // Latest body-composition readings from the trend series (occasional samples).
  const wPts = snap.trends.weight;
  const latestWeight = wPts.length ? wPts[wPts.length - 1].value : null;
  const prevWeight = wPts.length > 1 ? wPts[wPts.length - 2].value : null;
  const fPts = snap.trends.bodyFat;
  const latestFat = fPts.length ? fPts[fPts.length - 1].value : null;
  const prevFat = fPts.length > 1 ? fPts[fPts.length - 2].value : null;

  const syncNote = snap.live
    ? `SYNCED · ${healthSourceName().toUpperCase()} · ${snap.sources.length} SOURCE${snap.sources.length === 1 ? '' : 'S'}`
    : 'NO HEALTH DATA YET — CONNECT IN SETUP';

  return (
    <BriefScreen>
      <BigStat
        value={recoveryPct != null ? String(recoveryPct) : '—'}
        suffix={recoveryPct != null ? '%' : undefined}
        pill={recoveryPill(snap, c.acc, c.fnt)}
        caption={caption}
        onPress={() => navigation.navigate('Recovery')}
        accessibilityLabel={
          recoveryPct != null
            ? `Open recovery detail, ${recoveryPct} percent recovered`
            : 'Open recovery detail, no recovery data'
        }
      />

      {/* ── Daily brief ─────────────────────────────────────────────── */}
      {showBrief ? (
        <Card style={styles.briefCard}>
          <View style={styles.briefHead}>
            <Icon name="gemini" size={13} color={c.acc} />
            <Text style={M(700, 9, { ls: 1.4, color: c.fnt })}>
              DAILY BRIEF
            </Text>
            <View style={styles.spacer} />
            {briefWorking ? (
              <ActivityIndicator size="small" color={c.acc} />
            ) : (
              <Pressable
                onPress={() => void regenerateBrief()}
                accessibilityRole="button"
                accessibilityLabel="Regenerate today's brief"
                hitSlop={8}
              >
                <Text style={M(700, 9, { ls: 1, color: c.acc })}>REFRESH</Text>
              </Pressable>
            )}
          </View>
          <Text
            style={[
              S(500, 13.5, {
                lh: 20,
                color: briefWorking || !briefText ? c.mut : c.ink,
              }),
              styles.briefText,
            ]}
          >
            {briefBody}
          </Text>
        </Card>
      ) : null}

      {/* ── Body & fuel ─────────────────────────────────────────────── */}
      {/* Sleep, the overnight vitals and today's fuel share one card now: a
       * single scannable list of the body's readouts, each row tappable through
       * to its own screen. Sleep leads with a slim stage bar; fuel closes with
       * the two macro bars. */}
      <GroupLabel>Body &amp; fuel</GroupLabel>
      <Card style={styles.vitalsCard}>
        <Pressable
          onPress={() => navigation.navigate('Sleep')}
          accessibilityRole="button"
          accessibilityLabel="Open sleep detail"
          style={[styles.leadRow, { borderBottomColor: c.hair }]}
        >
          <View style={styles.leadHead}>
            <View style={styles.leadHeadLeft}>
              <Icon name="moon" size={17} color={c.acc} strokeWidth={2} />
              <Text style={S(700, 13, { color: c.ink })}>Sleep →</Text>
            </View>
            <View style={styles.leadHeadRight}>
              <Text style={M(700, 17, { ls: -0.2, color: c.ink })}>
                {sleep ? hoursToHm(sleep.hours) : '——'}
                {sleep ? (
                  <Text style={M(600, 11, { color: c.fnt })}> h</Text>
                ) : null}
              </Text>
              {sleep ? (
                <Pill
                  spec={{ text: `${sleep.performancePct}% OF NEED` }}
                  small
                />
              ) : null}
            </View>
          </View>
          {stages && stageTotal > 0 ? (
            <>
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
        </Pressable>

        <VitalRow
          icon="pulse"
          iconColor={c.acc}
          name="HRV"
          value={snap.hrv ? String(Math.round(snap.hrv.value)) : '——'}
          unit={snap.hrv ? 'ms' : undefined}
          delta={snap.hrv?.delta ?? null}
        />
        <VitalRow
          icon="heartLine"
          iconColor={c.grn}
          name="RHR"
          value={
            snap.restingHr ? String(Math.round(snap.restingHr.value)) : '——'
          }
          unit={snap.restingHr ? 'bpm' : undefined}
          delta={snap.restingHr?.delta ?? null}
          deltaGoodUp={false}
        />
        <VitalRow
          icon="boltLine"
          iconColor={c.acc}
          name="Cardio load →"
          value={snap.cardio.hasLoadData ? String(snap.cardio.todayLoad) : '——'}
          pill={
            snap.cardio.hasLoadData
              ? { text: `WEEK ${snap.cardio.weekLoad}` }
              : null
          }
          onPress={() => navigation.navigate('Cardio')}
          accessibilityLabel="Open cardio load detail"
        />
        <VitalRow
          icon="bars"
          iconColor={c.fnt}
          name="Weight"
          value={latestWeight != null ? latestWeight.toFixed(1) : '——'}
          unit={latestWeight != null ? 'kg' : undefined}
          delta={
            latestWeight != null && prevWeight != null
              ? latestWeight - prevWeight
              : null
          }
          deltaGoodUp={false}
          deltaDecimals={1}
        />
        <VitalRow
          icon="droplet"
          iconColor={c.sand}
          name="Body fat"
          value={latestFat != null ? latestFat.toFixed(1) : '——'}
          unit={latestFat != null ? '%' : undefined}
          delta={
            latestFat != null && prevFat != null ? latestFat - prevFat : null
          }
          deltaGoodUp={false}
          deltaDecimals={1}
          last
        />

        <Pressable
          onPress={() => navigation.navigate('Nutrition')}
          accessibilityRole="button"
          accessibilityLabel="Open fuel detail"
          style={[styles.fuelRow, { borderTopColor: c.hair }]}
        >
          <View style={styles.fuelHead}>
            <Icon name="flame" size={18} color={c.acc} strokeWidth={2} />
            <Text style={[S(700, 13, { color: c.ink }), styles.fuelName]}>
              Fuel →
            </Text>
            <Text
              style={M(700, 17, { ls: -0.2, color: net < 0 ? c.grn : c.ink })}
            >
              {hasNet ? signed(net) : '——'}
              <Text style={M(600, 11, { color: c.fnt })}> net</Text>
            </Text>
          </View>
          <MacroBar
            compact
            style={styles.fuelMacro}
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
            compact
            style={styles.fuelMacro}
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
        </Pressable>
      </Card>

      {/* ── Week ────────────────────────────────────────────────────── */}
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
  briefCard: { paddingVertical: 13, paddingHorizontal: 15, marginTop: 18 },
  briefHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  briefText: { marginTop: 9 },
  vitalsCard: { paddingVertical: 2, paddingHorizontal: 16, marginTop: 10 },
  vitalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  vitalName: { flex: 1, minWidth: 0 },
  // Sleep leads the card: a metric row (icon · name · value · pill) with the
  // slim stage bar and its labels indented beneath, aligned under the name.
  leadRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  leadHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  leadHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leadHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
    marginLeft: 30,
  },
  stageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginLeft: 30,
  },
  // Fuel closes the card: the same metric row, with the two macro bars indented
  // beneath it. A top hairline separates it from body fat above.
  fuelRow: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'transparent',
  },
  fuelHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fuelName: { flex: 1, minWidth: 0 },
  fuelMacro: { marginTop: 12, marginLeft: 30 },
  sync: { marginTop: 16, lineHeight: 15 },
});
