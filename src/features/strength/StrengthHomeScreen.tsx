import React from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  Card,
  cardTitleStyle,
  chunky,
  pageTitleStyle,
  Pill,
  S,
} from '../../components/brief';
import {
  removeSession,
  removeWorkout,
  startWorkoutSession,
  syncSession,
  unsyncSession,
  volumeTrendPoints,
} from '../../state/strengthService';
import {
  SavedWorkout,
  SessionSummary,
  useStrengthStore,
} from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { WorkoutCard } from './components/WorkoutCard';

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

/** "Aug 13" for a session's start timestamp. */
function sessionDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon, Aug 13" — the visible date on a recent-session row. */
function sessionDay(ms: number): string {
  return `${DAYS[new Date(ms).getDay()]}, ${sessionDate(ms)}`;
}

/** 6240 → "6,240". */
function grp(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** How many saved workouts the Lift tab shows inline before the rest move
 * behind "Search all" (the full searchable workouts library modal). */
const WORKOUT_LIMIT = 5;

/**
 * The volume card: the latest weighted session's total with a green/red pill
 * for the change vs the one before, over a dependency-free bar chart of the
 * weighted sessions (newest bar in full lift violet, the rest faded).
 */
function VolumeTrend({ sessions }: { sessions: SessionSummary[] }) {
  const c = useTheme().colors;
  const points = volumeTrendPoints(sessions);
  if (points.length < 2) {
    return (
      <Card title="Volume">
        <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.hint]}>
          {points.length === 0
            ? 'Your training-volume trend will show up here once you finish a couple of weighted workouts.'
            : 'One weighted session so far — finish another to see whether your total volume is trending up.'}
        </Text>
      </Card>
    );
  }
  const max = Math.max(...points.map(p => p.volume));
  const latest = points[points.length - 1].volume;
  const prev = points[points.length - 2].volume;
  const delta = latest - prev;
  const up = delta >= 0;

  return (
    <View style={[chunky(c), styles.volCard]}>
      <View style={styles.volHead}>
        <View style={styles.flexText}>
          <Text style={cardTitleStyle(c.ink)}>Volume</Text>
          <Text style={S(900, 28, { lh: 34, color: c.ink })}>
            {grp(latest)} kg
          </Text>
        </View>
        <Pill
          spec={{
            text: `${up ? '▲' : '▼'} ${grp(Math.abs(delta))} kg vs last`,
            bg: up ? c.grnTint : c.redTint,
            textColor: up ? c.grn : c.red,
          }}
        />
      </View>
      <View
        style={styles.bars}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Volume of the last ${points.length} weighted sessions, ${up ? 'up' : 'down'} ${Math.abs(delta)} kilograms on the one before`}
      >
        {points.map((p, i) => (
          <View key={`${p.startedAt}-${i}`} style={styles.barCol}>
            <View
              style={{
                height: `${max > 0 ? (p.volume / max) * 100 : 0}%`,
                backgroundColor: c.lift,
                // Older sessions fade back so the newest bar is the one that
                // reads first; opacity keeps it to one token in both schemes.
                opacity: i === points.length - 1 ? 1 : 0.3,
                borderRadius: 8,
                width: '100%',
              }}
            />
          </View>
        ))}
      </View>
      <Text style={S(700, 14, { color: c.fnt })}>
        Last {points.length} weighted sessions · oldest → newest
      </Text>
    </View>
  );
}

/**
 * Strength home (the Lift tab, ADR-007): a page title with the saved count, the
 * "New workout" slab, the saved workouts as chunky cards (first five, each with
 * Start / Edit / Delete, and "Search all" into the full library), the volume
 * trend and the recent sessions (hold to delete; on Android a pill syncs each
 * one to — or removes it from — Health Connect). Ad-hoc workouts are built the
 * same way (New workout → build → Start) and just aren't saved.
 */
export function StrengthHomeScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const workouts = useStrengthStore(s => s.workouts);
  const sessions = useStrengthStore(s => s.sessions);
  const startDraft = useStrengthStore(s => s.startDraft);
  // Health Connect write is Android-only, so the sync affordance shows there.
  const canSync = Platform.OS === 'android';
  const [syncingId, setSyncingId] = React.useState<string | null>(null);

  function onSyncPress(s: SessionSummary) {
    if (syncingId) return;
    if (s.healthId) {
      Alert.alert(
        'Remove from Health Connect',
        `Remove the “${s.name}” session from Health Connect? Your local record stays.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setSyncingId(s.id);
              await unsyncSession(s);
              setSyncingId(null);
            },
          },
        ],
      );
      return;
    }
    void (async () => {
      setSyncingId(s.id);
      const ok = await syncSession(s);
      setSyncingId(null);
      if (!ok) {
        Alert.alert(
          'Not synced',
          'Could not write to Health Connect. Make sure it’s connected in Me.',
        );
      }
    })();
  }

  function newWorkout() {
    startDraft();
    navigation.navigate('WorkoutBuilder');
  }

  function run(w: SavedWorkout) {
    startWorkoutSession(w);
    navigation.navigate('WorkoutRun');
  }

  function edit(w: SavedWorkout) {
    startDraft(w);
    navigation.navigate('WorkoutBuilder');
  }

  function confirmDelete(w: SavedWorkout) {
    Alert.alert('Delete workout', `Delete "${w.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeWorkout(w.id);
        },
      },
    ]);
  }

  function confirmDeleteSession(s: SessionSummary) {
    Alert.alert(
      'Delete session',
      `Delete the ${sessionDate(s.startedAt)} "${s.name}" session?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void removeSession(s.id);
          },
        },
      ],
    );
  }

  const browse = () => navigation.navigate('WorkoutsLibrary');

  return (
    <BriefScreen>
      {/* ── Title + count ─────────────────────────────────────────────── */}
      <View style={styles.titleRow}>
        <Text style={pageTitleStyle(c.ink)}>Lift</Text>
        <Pill
          spec={{
            text:
              workouts.length === 0
                ? 'No workouts yet'
                : `${workouts.length} ${workouts.length === 1 ? 'workout' : 'workouts'} saved`,
            bg: c.liftTint,
            textColor: c.liftText,
          }}
        />
      </View>

      <BriefButton
        label="+  New workout"
        accessibilityLabel="New workout"
        tone="lift"
        onPress={newWorkout}
        style={styles.newBtn}
      />

      {/* ── Saved workouts ──────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={S(900, 22, { lh: 28, color: c.ink })}>Your workouts</Text>
        {workouts.length > 0 ? (
          <Pressable
            onPress={browse}
            accessibilityRole="button"
            accessibilityLabel="Browse all workouts"
            hitSlop={10}
          >
            <Text style={S(900, 15, { color: c.acc })}>Search all</Text>
          </Pressable>
        ) : null}
      </View>

      {workouts.length === 0 ? (
        <View style={[chunky(c), styles.emptyCard]}>
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            No saved workouts yet. Tap New workout to build one from dumbbell,
            bench, bodyweight and pull-up-bar exercises.
          </Text>
        </View>
      ) : (
        workouts
          .slice(0, WORKOUT_LIMIT)
          .map(w => (
            <WorkoutCard
              key={w.id}
              workout={w}
              onStart={() => run(w)}
              onEdit={() => edit(w)}
              onDelete={() => confirmDelete(w)}
              style={styles.listGap}
            />
          ))
      )}

      {workouts.length > WORKOUT_LIMIT ? (
        <BriefButton
          label={`+${workouts.length - WORKOUT_LIMIT} more · Search all`}
          accessibilityLabel="Browse all workouts"
          kind="outline"
          size={13}
          onPress={browse}
          style={styles.listGap}
        />
      ) : null}

      {/* ── Volume trend ────────────────────────────────────────────── */}
      <View style={styles.sectionGap}>
        <VolumeTrend sessions={sessions} />
      </View>

      {/* ── Recent sessions ─────────────────────────────────────────── */}
      {sessions.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={S(900, 22, { lh: 28, color: c.ink })}>
              Recent sessions
            </Text>
            <Text style={S(800, 14, { color: c.fnt })}>Hold to delete</Text>
          </View>
          <View style={[chunky(c), styles.sessionCard]}>
            {sessions.slice(0, 6).map((s: SessionSummary, i) => (
              <Pressable
                key={s.id}
                onLongPress={() => confirmDeleteSession(s)}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityLabel={`${s.name} session, ${sessionDate(s.startedAt)}. Long press to delete.`}
                style={[
                  styles.session,
                  i > 0 ? { borderTopWidth: 2, borderTopColor: c.hair } : null,
                ]}
              >
                <View style={styles.flexText}>
                  <Text style={S(900, 16, { color: c.ink })} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text style={S(700, 14, { color: c.mut })}>
                    {sessionDay(s.startedAt)} · {s.setsCompleted}{' '}
                    {s.setsCompleted === 1 ? 'set' : 'sets'}
                    {s.kind === 'core' ? ' · core' : ''}
                    {' · '}
                    {s.totalVolumeKg > 0 ? `${grp(s.totalVolumeKg)} kg` : '—'}
                  </Text>
                </View>
                {canSync ? (
                  <Pressable
                    onPress={() => onSyncPress(s)}
                    disabled={syncingId === s.id}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={
                      s.healthId
                        ? `Remove ${s.name} from Health Connect`
                        : `Sync ${s.name} to Health Connect`
                    }
                    style={[
                      styles.syncPill,
                      s.healthId
                        ? { backgroundColor: c.grnTint, borderColor: c.grnTint }
                        : { backgroundColor: c.card, borderColor: c.hair },
                      { opacity: syncingId === s.id ? 0.5 : 1 },
                    ]}
                  >
                    <Text
                      style={S(900, 13, {
                        color: s.healthId ? c.grn : c.acc,
                      })}
                    >
                      {s.healthId ? '✓ In Health' : '+ Health'}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  newBtn: { marginTop: 16 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  listGap: { marginTop: 14 },
  sectionGap: { marginTop: 12 },
  emptyCard: { padding: 18, marginTop: 14 },
  hint: { marginTop: 10 },
  flexText: { flex: 1, minWidth: 0 },
  volCard: { padding: 18, gap: 14, marginTop: 14 },
  volHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 110,
  },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  sessionCard: { marginTop: 14, overflow: 'hidden' },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  syncPill: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 2,
  },
});
