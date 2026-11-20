import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  cardTitleStyle,
  chunky,
  MacroBar,
  pageTitleStyle,
  Pill,
  S,
  toneColors,
  Tone,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  HealthSnapshot,
  healthSourceName,
  startOfLocalDay,
} from '../../health';
import { activeConditions } from '../../state/journal';
import { useHealthStore } from '../../state/useHealthStore';
import { useJournalStore } from '../../state/useJournalStore';
import { useNow } from '../../state/useNow';
import { useTheme } from '../../theme/theme';
import { WeeklyGoalsCard } from '../goals/WeeklyGoalsCard';
import { HabitsCard } from '../habits/HabitsCard';
import { JournalCard } from '../journal/JournalCard';
import { useDailyBriefStore } from './useDailyBriefStore';

/** Decimal hours → "7h 42m". */
function hoursToHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${(total % 60).toString().padStart(2, '0')}m`;
}

/** Minutes → "1h 10m". */
function minToHm(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`;
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

/** "Good morning" / "Good afternoon" / "Good evening" by the local hour. */
function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * What the recovery card says. With a score: the state and what it means for
 * today. Without one, WHY there is none — the three cases need different
 * things from the user, so they never share a message:
 *  - stale: the cache from yesterday is showing and today's read is on its way;
 *  - live: connected and reading fine, the wearable just hasn't pushed last
 *    night yet (the usual state early in the morning — not a setup problem);
 *  - neither: nothing is connected.
 */
function recoveryCopy(
  snap: HealthSnapshot,
  journal: { sick: boolean; injured: boolean } = {
    sick: false,
    injured: false,
  },
): {
  title: string;
  sub: string;
  tone: Tone;
} {
  const r = snap.readiness;
  // A journalled sickness or injury outranks the score's advice: the ring can
  // read "Recovered" on day one of a cold, and "add load" would be wrong.
  // The score itself is untouched (ADR-004) — only what we suggest doing.
  if (r && journal.sick)
    return {
      title: r.state,
      sub: 'You logged sick — rest comes first',
      tone: r.state === 'Strained' ? 'red' : 'accent',
    };
  if (r && journal.injured)
    return {
      title: r.state,
      sub: 'Injured — train around it',
      tone: r.state === 'Strained' ? 'red' : 'accent',
    };
  if (r) {
    if (r.state === 'Recovered')
      return {
        title: 'Recovered',
        sub: 'Ready to add load today',
        tone: 'green',
      };
    if (r.state === 'Balanced')
      return { title: 'Balanced', sub: 'Hold your usual load', tone: 'accent' };
    return { title: 'Strained', sub: 'Keep it easy today', tone: 'red' };
  }
  if (snap.stale)
    return {
      title: 'Updating…',
      sub: 'Waiting for today’s data',
      tone: 'accent',
    };
  if (snap.live)
    return {
      title: 'Not synced yet',
      sub: 'Last night hasn’t arrived — pull to refresh',
      tone: 'accent',
    };
  return {
    title: 'Not connected',
    sub: 'Connect a source in Me to start',
    tone: 'accent',
  };
}

/** A signed delta ("▲5"), coloured by whether that direction is good. */
function deltaSub(
  delta: number | null | undefined,
  goodUp: boolean,
  decimals = 0,
): { text: string; good: boolean } | null {
  if (delta == null) return null;
  const rounded = Number(delta.toFixed(decimals));
  if (rounded === 0) return null;
  const up = rounded > 0;
  return {
    text: `${up ? '▲' : '▼'}${Math.abs(rounded).toFixed(decimals)}`,
    good: goodUp ? up : !up,
  };
}

/** The recovery ring: the score as a filled arc on its tone's soft track. */
function RecoveryRing({
  pct,
  tone,
  size = 96,
  stroke = 12,
}: {
  pct: number | null;
  tone: Tone;
  size?: number;
  stroke?: number;
}) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
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
          stroke={tc.tint}
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
        <Text style={S(900, 26, { color: c.ink })}>
          {pct != null ? `${pct}%` : '—'}
        </Text>
      </View>
    </View>
  );
}

/** One soft stat chip in the recovery card; a button into its detail. */
function StatChip({
  label,
  value,
  sub,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  sub?: { text: string; good: boolean } | string | null;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const c = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.chip, { backgroundColor: c.soft }]}
    >
      <Text style={S(800, 12, { color: c.fnt })} numberOfLines={1}>
        {label}
      </Text>
      {/* Four chips share ~350pt, so "7h 42m" / "100% need" can outgrow a
          chip on a narrow phone — shrink to fit rather than truncate to "9h 1…". */}
      <Text
        style={S(900, 19, { lh: 23, color: c.ink })}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          style={S(900, 12, {
            color: typeof sub === 'string' ? c.mut : sub.good ? c.grn : c.red,
          })}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {typeof sub === 'string' ? sub : sub.text}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Today (ADR-007 "friendly" layout): a greeting, the recovery card (ring +
 * the four overnight numbers, each a door into its detail), the coach's daily
 * brief as a chat bubble, today's habits, the week's goals, and body & food.
 * One idea per card, big readable numbers.
 */
export function DashboardScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const snap = useHealthStore(s => s.snapshot);
  const refreshing = useHealthStore(s => s.refreshing);
  const refreshHealth = useHealthStore(s => s.refresh);
  const briefText = useDailyBriefStore(s => s.text);
  const briefStatus = useDailyBriefStore(s => s.status);
  const briefError = useDailyBriefStore(s => s.error);
  const ensureBrief = useDailyBriefStore(s => s.ensure);
  const regenerateBrief = useDailyBriefStore(s => s.regenerate);

  // Re-checked when last night lands: a brief written before the wearable
  // synced is rewritten once there is a night to talk about.
  const hasNight = snap.sleep != null || snap.hrv != null;
  React.useEffect(() => {
    void ensureBrief();
  }, [ensureBrief, hasNight]);

  const journal = useJournalStore(s => s.entries);
  const journalReady = useJournalStore(s => s.hydrated);
  const now = useNow();
  const conditions = activeConditions(journal, startOfLocalDay(now)).map(
    x => x.key,
  );
  const sick = conditions.includes('sick');
  const injured = conditions.includes('injured');

  // The brief is written once a day; logging sick (or getting better) changes
  // what it should say, so rewrite it then — not on every journal tap.
  const conditionKey = `${sick}|${injured}`;
  // Starts unset so the journal loading on launch isn't mistaken for a change.
  const lastConditionKey = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!journalReady) return;
    if (lastConditionKey.current === null) {
      lastConditionKey.current = conditionKey;
      return;
    }
    if (lastConditionKey.current === conditionKey) return;
    lastConditionKey.current = conditionKey;
    void regenerateBrief();
  }, [conditionKey, journalReady, regenerateBrief]);

  const recoveryPct = snap.readiness?.pct ?? null;
  const rec = recoveryCopy(snap, { sick, injured });
  const recTone = toneColors(c, rec.tone);

  const briefSyncing = briefStatus === 'syncing';
  const briefWorking = briefSyncing || briefStatus === 'loading';
  const briefBody = briefWorking
    ? briefSyncing
      ? 'Waiting for today’s health data…'
      : 'Writing today’s brief…'
    : briefText ||
      (briefError ?? 'No brief yet — set up the coach in Me, then refresh.');

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

  const hrvSub = deltaSub(snap.hrv?.delta, true);
  const rhrSub = deltaSub(snap.restingHr?.delta, false);

  const wPts = snap.trends.weight;
  const latestWeight = wPts.length ? wPts[wPts.length - 1].value : null;
  const prevWeight = wPts.length > 1 ? wPts[wPts.length - 2].value : null;
  const wSub = deltaSub(
    latestWeight != null && prevWeight != null
      ? latestWeight - prevWeight
      : null,
    false,
    1,
  );
  const fPts = snap.trends.bodyFat;
  const latestFat = fPts.length ? fPts[fPts.length - 1].value : null;
  const prevFat = fPts.length > 1 ? fPts[fPts.length - 2].value : null;
  const fSub = deltaSub(
    latestFat != null && prevFat != null ? latestFat - prevFat : null,
    false,
    1,
  );

  // Never claim "synced" over data we know is not current. A cache-derived
  // snapshot is flagged `stale` until the day's first live read lands, and saying
  // so is the difference between the user trusting a number and being misled by
  // it. `refreshing` takes precedence so a pull always visibly does something.
  const syncNote = refreshing
    ? 'Updating…'
    : !snap.live
      ? 'No health data yet — connect a source in Me'
      : snap.stale
        ? 'Showing saved data — pull down to refresh'
        : `Synced from ${healthSourceName()} · ${snap.sources.length} source${snap.sources.length === 1 ? '' : 's'}\nPull down to refresh`;

  const livePill = refreshing
    ? { text: 'Updating', bg: c.soft, textColor: c.mut }
    : snap.live && !snap.stale
      ? { text: 'Live', dot: c.grnSolid }
      : { text: 'No data', bg: c.soft, textColor: c.mut };

  return (
    <BriefScreen refreshing={refreshing} onRefresh={() => void refreshHealth()}>
      {/* ── Greeting ─────────────────────────────────────────────────── */}
      <View style={styles.greet}>
        <Text style={pageTitleStyle(c.ink)}>{greeting()}</Text>
        <Pill spec={livePill} />
      </View>

      {/* ── Recovery ─────────────────────────────────────────────────── */}
      <View style={[chunky(c), styles.card]}>
        <Pressable
          onPress={() => navigation.navigate('Recovery')}
          accessibilityRole="button"
          accessibilityLabel={
            recoveryPct != null
              ? `Open recovery detail, ${recoveryPct} percent recovered`
              : 'Open recovery detail, no recovery data'
          }
          style={styles.recTop}
        >
          <RecoveryRing pct={recoveryPct} tone={rec.tone} />
          <View style={styles.recText}>
            <Text style={S(900, 13, { color: c.fnt })}>RECOVERY</Text>
            <Text style={S(900, 24, { lh: 29, color: recTone.text })}>
              {rec.title}
            </Text>
            <Text style={S(700, 15, { lh: 20, color: c.mut })}>{rec.sub}</Text>
          </View>
          <Icon name="chevronRight" size={22} color={c.fnt} />
        </Pressable>

        <View style={styles.chips}>
          <StatChip
            label="SLEEP"
            value={sleep ? hoursToHm(sleep.hours) : '—'}
            sub={sleep ? `${sleep.performancePct}% need` : null}
            onPress={() => navigation.navigate('Sleep')}
            accessibilityLabel="Open sleep detail"
          />
          <StatChip
            label="HRV"
            value={snap.hrv ? String(Math.round(snap.hrv.value)) : '—'}
            sub={hrvSub}
            onPress={() => navigation.navigate('Recovery')}
            accessibilityLabel="Open recovery detail"
          />
          <StatChip
            label="REST HR"
            value={
              snap.restingHr ? String(Math.round(snap.restingHr.value)) : '—'
            }
            sub={rhrSub}
            onPress={() => navigation.navigate('Recovery')}
            accessibilityLabel="Open recovery detail"
          />
          <StatChip
            label="LOAD"
            value={
              snap.cardio.hasLoadData ? String(snap.cardio.todayLoad) : '—'
            }
            sub={snap.cardio.hasLoadData ? `wk ${snap.cardio.weekLoad}` : null}
            onPress={() => navigation.navigate('Cardio')}
            accessibilityLabel="Open cardio load detail"
          />
        </View>

        {stages && stageTotal > 0 ? (
          <Pressable
            onPress={() => navigation.navigate('Sleep')}
            accessibilityRole="button"
            accessibilityLabel="Open sleep stages"
            style={styles.stages}
          >
            <View style={styles.stageBar}>
              <View
                style={{ flex: stages.deepMin, backgroundColor: c.sleepText }}
              />
              <View
                style={{ flex: stages.remMin, backgroundColor: c.sleepSolid }}
              />
              <View
                style={{ flex: stages.lightMin, backgroundColor: c.sand }}
              />
              <View
                style={{ flex: stages.awakeMin, backgroundColor: c.streak }}
              />
            </View>
            <Text style={S(700, 13, { color: c.mut })}>
              Deep {minToHm(stages.deepMin)} · REM {minToHm(stages.remMin)} ·
              Light {minToHm(stages.lightMin)}
            </Text>
          </Pressable>
        ) : null}

        {/* The coach's daily brief, inside the recovery card: the coach's read
            of these same numbers, right under them (it used to float as a
            separate chat bubble below the card). */}
        <View style={[styles.brief, { backgroundColor: c.accTint }]}>
          <View style={[styles.avatar, { backgroundColor: c.accSolid }]}>
            <Icon name="sparkles" size={16} color={c.onAccent} />
          </View>
          <View style={styles.briefBody}>
            <View style={styles.bubbleHead}>
              <Text style={S(900, 13, { color: c.acc })}>YOUR COACH</Text>
              {briefWorking ? (
                <ActivityIndicator size="small" color={c.acc} />
              ) : (
                <Pressable
                  onPress={() => void regenerateBrief()}
                  accessibilityRole="button"
                  accessibilityLabel="Regenerate today's brief"
                  hitSlop={10}
                >
                  <Text style={S(900, 14, { color: c.acc })}>Refresh</Text>
                </Pressable>
              )}
            </View>
            <Text
              style={S(700, 15, {
                lh: 21,
                color: briefWorking || !briefText ? c.mut : c.ink,
              })}
            >
              {briefBody}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Journal: how today is going (sick, injured, alcohol…) ─────── */}
      <JournalCard navigation={navigation} />

      {/* ── Habits, then the week's goals ────────────────────────────── */}
      <HabitsCard navigation={navigation} />
      <WeeklyGoalsCard navigation={navigation} />

      {/* ── Body & food ──────────────────────────────────────────────── */}
      <View style={[chunky(c), styles.card, styles.cardGap]}>
        <Pressable
          onPress={() => navigation.navigate('Nutrition')}
          accessibilityRole="button"
          accessibilityLabel="Open fuel detail"
          style={styles.bfTop}
        >
          <View style={styles.bfTitleRow}>
            <Text style={cardTitleStyle(c.ink)}>Body & food</Text>
            <Pill
              spec={
                hasNet
                  ? {
                      text: `${signed(net)} kcal net`,
                      bg: net < 0 ? c.grnTint : c.soft,
                      textColor: net < 0 ? c.grn : c.ink,
                    }
                  : { text: 'Nothing logged', bg: c.soft, textColor: c.mut }
              }
            />
          </View>
          <View style={styles.macroCols}>
            <MacroBar
              compact
              style={styles.macroCol}
              label="Protein"
              right={
                <>
                  {protein != null ? Math.round(protein) : '—'}
                  <Text style={{ color: c.fnt }}> / {PROTEIN_MIN} g</Text>
                </>
              }
              fill={protein != null ? protein / PROTEIN_MIN : 0}
              fillColor={c.food}
            />
            <MacroBar
              compact
              style={styles.macroCol}
              label="Fat"
              right={
                <>
                  {fat != null ? Math.round(fat) : '—'}
                  <Text style={{ color: c.fnt }}> / max {FAT_MAX} g</Text>
                </>
              }
              fill={fat != null ? fat / FAT_MAX : 0}
              fillColor={fat != null && fat > FAT_MAX ? c.redSolid : c.streak}
            />
          </View>
        </Pressable>
        <View style={styles.bodyRow}>
          <View style={[styles.bodyCell, { backgroundColor: c.soft }]}>
            <Text style={S(800, 12, { color: c.fnt })}>WEIGHT</Text>
            <Text style={S(900, 18, { color: c.ink })}>
              {latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—'}
            </Text>
            {wSub ? (
              <Text style={S(900, 13, { color: wSub.good ? c.grn : c.red })}>
                {wSub.text}
              </Text>
            ) : null}
          </View>
          <View style={[styles.bodyCell, { backgroundColor: c.soft }]}>
            <Text style={S(800, 12, { color: c.fnt })}>BODY FAT</Text>
            <Text style={S(900, 18, { color: c.ink })}>
              {latestFat != null ? `${latestFat.toFixed(1)}%` : '—'}
            </Text>
            {fSub ? (
              <Text style={S(900, 13, { color: fSub.good ? c.grn : c.red })}>
                {fSub.text}
              </Text>
            ) : null}
          </View>
          <View style={[styles.bodyCell, { backgroundColor: c.soft }]}>
            <Text style={S(800, 12, { color: c.fnt })}>IN / OUT</Text>
            <Text style={S(900, 18, { color: c.ink })}>
              {eaten != null ? grp(eaten) : '—'}
            </Text>
            <Text style={S(800, 13, { color: c.mut })}>
              / {grp(burned)} kcal
            </Text>
          </View>
        </View>
      </View>

      <Text style={[S(700, 14, { lh: 20, color: c.fnt }), styles.sync]}>
        {syncNote}
      </Text>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  greet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  card: { padding: 18, marginTop: 14 },
  cardGap: { marginTop: 14 },
  recTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  recText: { flex: 1, minWidth: 0, gap: 2 },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 6, marginTop: 14 },
  chip: { flex: 1, minWidth: 0, padding: 9, borderRadius: 14, gap: 1 },
  stages: { marginTop: 12, gap: 6 },
  stageBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  brief: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefBody: { flex: 1, minWidth: 0, gap: 4 },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bfTop: { gap: 14 },
  bfTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  macroCols: { flexDirection: 'row', gap: 14 },
  macroCol: { flex: 1 },
  bodyRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  bodyCell: { flex: 1, minWidth: 0, padding: 10, borderRadius: 14 },
  sync: { marginTop: 18, textAlign: 'center' },
});
