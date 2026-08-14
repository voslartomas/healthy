import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BigStat, BriefScreen, M, S, Section } from '../../components/brief';
import { exerciseOrUnknown } from '../../data/exerciseCatalog';
import {
  removeSession,
  removeWorkout,
  startWorkoutSession,
  volumeTrendPoints,
} from '../../state/strengthService';
import {
  SavedWorkout,
  SessionSummary,
  useStrengthStore,
} from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Aug 13" for a session's start timestamp. */
function sessionDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Compact "3 exercises · 9 sets" summary line for a saved workout. */
function summarize(w: SavedWorkout): string {
  const sets = w.exercises.reduce((n, e) => n + e.targetSets, 0);
  const ex = w.exercises.length;
  return `${ex} ${ex === 1 ? 'exercise' : 'exercises'} · ${sets} sets`;
}

/** Comma-joined first few exercise names, for the card subtitle. */
function exerciseList(w: SavedWorkout): string {
  const names = w.exercises.map(e => exerciseOrUnknown(e.exerciseId).name);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

/** A dependency-free vertical-bar trend of session volume, newest bar accented,
 * with a headline delta vs the previous weighted session. */
function VolumeTrend({ sessions }: { sessions: SessionSummary[] }) {
  const c = useTheme().colors;
  const points = volumeTrendPoints(sessions);
  if (points.length < 2) {
    return (
      <Text style={[S(600, 13, { color: c.mut }), styles.trendHint]}>
        Log at least two weighted sessions to see whether your total volume is
        trending up.
      </Text>
    );
  }
  const max = Math.max(...points.map(p => p.volume));
  const latest = points[points.length - 1].volume;
  const prev = points[points.length - 2].volume;
  const delta = latest - prev;
  const up = delta >= 0;

  return (
    <View style={styles.trend}>
      <View style={styles.trendHead}>
        <Text style={M(800, 24, { ls: -1, color: c.ink })}>
          {latest}
          <Text style={M(700, 12, { color: c.fnt })}> KG</Text>
        </Text>
        <Text style={M(700, 11, { ls: 0.4, color: up ? c.grn : c.red })}>
          {up ? '▲' : '▼'} {up ? '+' : '−'}
          {Math.abs(delta)} KG VS PREV
        </Text>
      </View>
      <View style={styles.bars}>
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <View key={`${p.startedAt}-${i}`} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={{
                    height: `${max > 0 ? (p.volume / max) * 100 : 0}%`,
                    backgroundColor: isLast ? c.acc : c.sand,
                    borderRadius: 3,
                    width: '100%',
                  }}
                />
              </View>
            </View>
          );
        })}
      </View>
      <Text style={[M(600, 9, { ls: 1, color: c.fnt }), styles.trendAxis]}>
        {points.length} WEIGHTED SESSIONS · OLDEST → NEWEST
      </Text>
    </View>
  );
}

/**
 * Strength home (tab 03 · LIFT): the list of saved workouts with run / edit /
 * delete, plus a "New workout" entry into the builder. Ad-hoc workouts are built
 * the same way (New workout → build → Start) and just aren't saved.
 */
export function StrengthHomeScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const workouts = useStrengthStore(s => s.workouts);
  const sessions = useStrengthStore(s => s.sessions);
  const startDraft = useStrengthStore(s => s.startDraft);

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

  return (
    <BriefScreen>
      <BigStat
        value={String(workouts.length)}
        caption="SAVED WORKOUTS"
        pill={{ text: 'NEW WORKOUT', bg: c.ink, textColor: c.inv }}
        onPress={newWorkout}
        accessibilityLabel="New workout"
      />

      <Section n="01" title="Workouts" first>
        {workouts.length === 0 ? (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            No saved workouts yet. Tap NEW WORKOUT to build one from dumbbell,
            bench, bodyweight and pull-up-bar exercises.
          </Text>
        ) : (
          workouts.map(w => (
            <View
              key={w.id}
              style={[styles.card, { borderColor: c.hair }]}
            >
              <Pressable
                onPress={() => run(w)}
                accessibilityRole="button"
                accessibilityLabel={`Start ${w.name}`}
                style={styles.cardMain}
              >
                <Text style={S(700, 15, { color: c.ink })} numberOfLines={1}>
                  {w.name}
                </Text>
                <Text style={[M(600, 10, { ls: 0.4, color: c.acc }), styles.meta]}>
                  {summarize(w).toUpperCase()}
                </Text>
                <Text
                  style={[S(500, 12.5, { color: c.mut }), styles.sub]}
                  numberOfLines={1}
                >
                  {exerciseList(w)}
                </Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  onPress={() => edit(w)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${w.name}`}
                  hitSlop={8}
                >
                  <Text style={M(700, 10, { ls: 1, color: c.mut })}>EDIT</Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(w)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${w.name}`}
                  hitSlop={8}
                >
                  <Text style={M(700, 10, { ls: 1, color: c.red })}>DELETE</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </Section>

      {sessions.length > 0 ? (
        <Section n="02" title="Volume trend">
          <VolumeTrend sessions={sessions} />
        </Section>
      ) : null}

      {sessions.length > 0 ? (
        <Section n="03" title="Recent sessions">
          <Text style={[M(600, 9.5, { ls: 0.5, color: c.fnt }), styles.hint]}>
            LONG-PRESS A SESSION TO DELETE
          </Text>
          {sessions.slice(0, 6).map((s: SessionSummary) => (
            <Pressable
              key={s.id}
              onLongPress={() => confirmDeleteSession(s)}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={`${s.name} session, ${sessionDate(s.startedAt)}. Long press to delete.`}
              style={[styles.session, { borderBottomColor: c.hair }]}
            >
              <View style={styles.sessionMain}>
                <Text style={S(600, 13.5, { color: c.ink })} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={M(600, 9.5, { ls: 0.5, color: c.fnt })}>
                  {sessionDate(s.startedAt).toUpperCase()} · {s.setsCompleted}{' '}
                  SETS
                </Text>
              </View>
              <Text style={M(700, 12, { color: c.acc })}>
                {s.totalVolumeKg > 0 ? `${s.totalVolumeKg} KG` : '—'}
              </Text>
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Pressable
        onPress={newWorkout}
        accessibilityRole="button"
        accessibilityLabel="New workout"
        style={[styles.addBtn, { backgroundColor: c.ink }]}
      >
        <Text style={M(700, 12, { ls: 1, color: c.inv })}>＋ NEW WORKOUT</Text>
      </Pressable>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 12, lineHeight: 19 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    gap: 6,
  },
  cardMain: { gap: 5 },
  meta: {},
  sub: {},
  actions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  sessionMain: { flex: 1, minWidth: 0, gap: 4 },
  hint: { marginTop: 12 },
  trendHint: { marginTop: 12, lineHeight: 19 },
  trend: { marginTop: 14, gap: 12 },
  trendHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 80,
  },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', justifyContent: 'flex-end' },
  trendAxis: { marginTop: 2 },
  addBtn: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
});
