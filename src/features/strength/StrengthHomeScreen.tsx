import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefButton, BriefScreen, Card, M, S } from '../../components/brief';
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
import { ExerciseMedia } from './components/ExerciseMedia';

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

/** "3 EXERCISES · 9 SETS · ~28 MIN" — the mono meta line under a workout name.
 * The estimate assumes ~40s of work per set on top of its rest. */
function summarize(w: SavedWorkout): string {
  const sets = w.exercises.reduce((n, e) => n + e.targetSets, 0);
  const ex = w.exercises.length;
  const mins = Math.round(
    w.exercises.reduce((t, e) => t + e.targetSets * (e.restSec + 40), 0) / 60,
  );
  return `${ex} ${ex === 1 ? 'EXERCISE' : 'EXERCISES'} · ${sets} SETS · ~${mins} MIN`;
}

/** A dependency-free vertical-bar trend of session volume, newest bar accented,
 * with a headline delta vs the previous weighted session. */
function VolumeTrend({ sessions }: { sessions: SessionSummary[] }) {
  const c = useTheme().colors;
  const points = volumeTrendPoints(sessions);
  if (points.length < 2) {
    return (
      <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.hint]}>
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
    <>
      <View style={styles.trendHead}>
        <Text style={M(700, 24, { ls: -0.2, color: c.ink })}>
          {latest}
          <Text style={M(700, 12, { color: c.fnt })}> KG</Text>
        </Text>
        <Text style={M(700, 11, { ls: 0.4, color: up ? c.grn : c.red })}>
          {up ? '▲' : '▼'} {up ? '+' : '−'}
          {Math.abs(delta)} KG VS PREV
        </Text>
      </View>
      <View style={styles.bars}>
        {points.map((p, i) => (
          <View key={`${p.startedAt}-${i}`} style={styles.barCol}>
            <View
              style={{
                height: `${max > 0 ? (p.volume / max) * 100 : 0}%`,
                backgroundColor: i === points.length - 1 ? c.acc : c.sand,
                borderRadius: 3,
                width: '100%',
              }}
            />
          </View>
        ))}
      </View>
      <Text style={[M(600, 9, { ls: 1, color: c.fnt }), styles.trendAxis]}>
        {points.length} WEIGHTED SESSIONS · OLDEST → NEWEST
      </Text>
    </>
  );
}

/**
 * Strength home (tab 03 · LIFT): a media hero for the workout you'd start now,
 * the list of saved workouts with run / edit / delete, the volume trend and the
 * recent sessions. Ad-hoc workouts are built the same way (New workout → build →
 * Start) and just aren't saved.
 */
export function StrengthHomeScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const workouts = useStrengthStore(s => s.workouts);
  const sessions = useStrengthStore(s => s.sessions);
  const startDraft = useStrengthStore(s => s.startDraft);

  const hero = workouts[0] ?? null;

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
      {/* ── Hero: start the workout at the top of the list ───────────── */}
      {hero ? (
        <Card first flush>
          <ExerciseMedia
            exerciseId={hero.exercises[0].exerciseId}
            variant="hero"
            height={186}
            sub="FIRST MOVE · LOOP"
          />
          <View style={styles.heroBody}>
            <Text style={S(800, 22, { lh: 24, ls: -0.44, color: c.ink })}>
              {hero.name}
            </Text>
            <Text
              style={[M(700, 9.5, { ls: 1.2, color: c.fnt }), styles.heroMeta]}
            >
              {summarize(hero)}
            </Text>
            <BriefButton
              label="START WORKOUT"
              onPress={() => run(hero)}
              fontSize={12.5}
              style={styles.heroBtn}
              accessibilityLabel={`Start ${hero.name}`}
            />
          </View>
        </Card>
      ) : null}

      {/* ── Saved workouts ──────────────────────────────────────────── */}
      <Card
        first={!hero}
        title="Workouts"
        right={
          <Text style={M(700, 9.5, { ls: 1, color: c.fnt })}>
            {workouts.length} SAVED
          </Text>
        }
      >
        {workouts.length === 0 ? (
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.hint]}>
            No saved workouts yet. Tap NEW WORKOUT to build one from dumbbell,
            bench, bodyweight and pull-up-bar exercises.
          </Text>
        ) : (
          workouts.map(w => (
            <View key={w.id} style={[styles.wRow, { borderTopColor: c.hair }]}>
              <ExerciseMedia
                exerciseId={w.exercises[0].exerciseId}
                variant="thumb"
                height={62}
              />
              <View style={styles.wMain}>
                <Pressable
                  onPress={() => run(w)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${w.name}`}
                >
                  <Text
                    style={S(700, 14.5, { lh: 17, color: c.ink })}
                    numberOfLines={1}
                  >
                    {w.name}
                  </Text>
                  <Text
                    style={[M(700, 9, { ls: 1, color: c.acc }), styles.wMeta]}
                  >
                    {summarize(w)}
                  </Text>
                </Pressable>
                <View style={styles.wActions}>
                  <Pressable
                    onPress={() => edit(w)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${w.name}`}
                    hitSlop={8}
                  >
                    <Text style={M(700, 9.5, { ls: 1, color: c.mut })}>
                      EDIT
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(w)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${w.name}`}
                    hitSlop={8}
                  >
                    <Text style={M(700, 9.5, { ls: 1, color: c.red })}>
                      DELETE
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}

        <BriefButton
          label="＋ NEW WORKOUT"
          kind="dashed"
          size={12}
          fontSize={11}
          onPress={newWorkout}
          style={styles.newBtn}
        />
      </Card>

      {/* ── Volume trend ────────────────────────────────────────────── */}
      {sessions.length > 0 ? (
        <Card title="Volume trend">
          <VolumeTrend sessions={sessions} />
        </Card>
      ) : null}

      {/* ── Recent sessions ─────────────────────────────────────────── */}
      {sessions.length > 0 ? (
        <Card
          title="Recent sessions"
          right={
            <Text style={M(700, 9.5, { ls: 1, color: c.fnt })}>
              HOLD TO DELETE
            </Text>
          }
        >
          <View style={styles.sessionList}>
            {sessions.slice(0, 6).map((s: SessionSummary) => (
              <Pressable
                key={s.id}
                onLongPress={() => confirmDeleteSession(s)}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityLabel={`${s.name} session, ${sessionDate(s.startedAt)}. Long press to delete.`}
                style={[styles.session, { borderTopColor: c.hair }]}
              >
                <View style={styles.sessionMain}>
                  <Text
                    style={S(600, 13.5, { color: c.ink })}
                    numberOfLines={1}
                  >
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
          </View>
        </Card>
      ) : null}
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  hint: { marginTop: 12 },
  heroBody: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  heroMeta: { marginTop: 8 },
  heroBtn: { marginTop: 16 },
  wRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    marginTop: 12,
    borderTopWidth: 1,
  },
  wMain: { flex: 1, minWidth: 0 },
  wMeta: { marginTop: 6 },
  wActions: { flexDirection: 'row', gap: 16, marginTop: 9 },
  newBtn: { marginTop: 14 },
  trendHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 80,
    marginTop: 14,
  },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  trendAxis: { marginTop: 8 },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
  },
  sessionList: { marginTop: 8 },
  sessionMain: { flex: 1, minWidth: 0, gap: 4 },
});
