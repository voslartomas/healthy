import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefButton, BriefScreen, Card, M, S } from '../../components/brief';
import { ExerciseDef, exerciseOrUnknown } from '../../data/exerciseCatalog';
import { finishSession } from '../../state/strengthService';
import {
  nextCursor,
  PlannedExercise,
  setTargetFor,
  useStrengthStore,
} from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { ExerciseMedia } from './components/ExerciseMedia';
import { RestTimer } from './components/RestTimer';
import { formatKg, SetRow } from './components/SetRow';

/**
 * The runner. Walks the active session set-by-set: a media card shows the
 * exercise and its target, the user tweaks the actual weight/reps, then COMPLETE
 * SET logs it and either drops into the rest card (media of what's up next, the
 * countdown, and the next set's target) or — on the final set — finishes into the
 * summary. All progression lives in the strength store; this screen is the view.
 */
export function WorkoutRunScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const session = useStrengthStore(s => s.session);
  const logCurrentSet = useStrengthStore(s => s.logCurrentSet);
  const endRest = useStrengthStore(s => s.endRest);
  const adjustWeight = useStrengthStore(s => s.adjustWeight);
  const adjustReps = useStrengthStore(s => s.adjustReps);
  const elapsed = useElapsedSeconds(session?.startedAt ?? 0);

  // Guard the back button / swipe / header-back: you can't silently abandon an
  // in-progress run. Block the navigation and confirm ending (which saves what
  // was done) first. `finishingRef` lets our own finish/summary flow through.
  const finishingRef = useRef(false);
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', e => {
      if (finishingRef.current || !useStrengthStore.getState().session) return;
      e.preventDefault();
      Alert.alert(
        'End workout?',
        'Going back ends this workout. Finish and save what you have done?',
        [
          { text: 'Keep going', style: 'cancel' },
          {
            text: 'End workout',
            style: 'destructive',
            onPress: () => {
              finishingRef.current = true;
              void finishSession().then(() =>
                navigation.replace('WorkoutSummary'),
              );
            },
          },
        ],
      );
    });
    return unsub;
  }, [navigation]);

  if (!session || session.plan.length === 0) {
    return (
      <BriefScreen>
        <Card first title="No active workout">
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
            This workout has no exercises.
          </Text>
          <BriefButton
            label="GO BACK"
            accessibilityLabel="Go back"
            onPress={() => navigation.goBack()}
            style={styles.primary}
          />
        </Card>
      </BriefScreen>
    );
  }

  const entry = session.plan[session.exerciseIndex];
  const def = exerciseOrUnknown(entry.exerciseId);
  const target = setTargetFor(entry, session.setIndex);
  const isLast =
    nextCursor(session.plan, session.exerciseIndex, session.setIndex) === null;
  const totalSetsDone = session.completed.length;
  const weighted = entry.targetWeightKg != null;

  const targetText = `TARGET · ${target.reps} REPS${
    target.weightKg != null
      ? ` · ${formatKg(target.weightKg)} KG`
      : ' · BODYWEIGHT'
  }`;

  async function finishAndSummarize() {
    finishingRef.current = true;
    await finishSession();
    navigation.replace('WorkoutSummary');
  }

  async function completeSet() {
    const { finished } = logCurrentSet();
    if (finished) await finishAndSummarize();
  }

  return (
    <BriefScreen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={M(700, 9, { ls: 1, color: c.fnt })}>TOTAL TIME</Text>
            <Text style={[M(700, 22, { color: c.ink }), styles.headerClock]}>
              {formatDuration(elapsed)}
            </Text>
          </View>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="End workout"
            style={[styles.endIcon, { borderColor: c.hair }]}
          >
            <Text style={M(700, 15, { color: c.mut })}>✕</Text>
          </Pressable>
        </View>
        <Text style={M(700, 10.5, { ls: 0.6, color: c.fnt })}>
          {session.exerciseIndex + 1}/{session.plan.length} · {totalSetsDone}{' '}
          DONE ·{' '}
          {remainingSets(session.plan, session.exerciseIndex, session.setIndex)}{' '}
          LEFT
        </Text>
      </View>

      {session.resting ? (
        /* ── Resting: what's up next ───────────────────────────────── */
        <Card flush style={styles.runCard}>
          <View>
            <ExerciseMedia
              exerciseId={entry.exerciseId}
              variant="hero"
              height={250}
              playing={false}
              sub="UP NEXT · LOOP"
            />
            <View style={[styles.upNext, { backgroundColor: c.accSolid }]}>
              <Text style={M(700, 9, { ls: 1.4, color: c.onAccent })}>
                UP NEXT
              </Text>
            </View>
          </View>
          <View style={styles.runBody}>
            <Text style={S(800, 22, { lh: 24, ls: -0.44, color: c.ink })}>
              {def.name}
            </Text>
            <Text style={[M(700, 9.5, { ls: 1.2, color: c.acc }), styles.gap8]}>
              SET {session.setIndex + 1}/{entry.targetSets}
            </Text>

            <RestTimer
              key={`${session.exerciseIndex}-${session.setIndex}`}
              seconds={entry.restSec}
              onDone={endRest}
            />

            <View style={[styles.targetBox, { borderColor: c.hair }]}>
              <View>
                <Text style={M(700, 8.5, { ls: 1.4, color: c.fnt })}>
                  NEXT SET TARGET
                </Text>
                <Text style={[M(700, 18, { color: c.ink }), styles.gap8]}>
                  {session.reps} REPS
                  {weighted ? ` · ${formatKg(session.weightKg ?? 0)} KG` : ''}
                </Text>
              </View>
              {weighted ? (
                <View style={styles.targetSteppers}>
                  <Pressable
                    onPress={() => adjustWeight(-0.5)}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease next set weight"
                    style={[styles.smallPm, { borderColor: c.hair }]}
                  >
                    <Text style={M(700, 14, { color: c.ink })}>−</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustWeight(0.5)}
                    accessibilityRole="button"
                    accessibilityLabel="Increase next set weight"
                    style={[styles.smallPm, { borderColor: c.hair }]}
                  >
                    <Text style={M(700, 14, { color: c.ink })}>＋</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <BriefButton
              label="START NEXT SET"
              accessibilityLabel="Start next set"
              onPress={endRest}
              fontSize={12}
              style={styles.gap14}
            />
          </View>
        </Card>
      ) : (
        <>
          {/* ── The set in progress ─────────────────────────────────── */}
          <Card flush style={styles.runCard}>
            <ExerciseMedia
              exerciseId={entry.exerciseId}
              variant="hero"
              height={236}
              sub="LOOP · FORM"
            />
            <View style={styles.runBody}>
              <View style={styles.runTitleRow}>
                <Text
                  style={[
                    S(800, 22, { lh: 24, ls: -0.44, color: c.ink }),
                    styles.runTitle,
                  ]}
                  numberOfLines={1}
                >
                  {def.name}
                </Text>
                <Text style={M(700, 10.5, { color: c.acc })}>
                  SET {session.setIndex + 1}/{entry.targetSets}
                </Text>
              </View>
              <Text
                style={[M(700, 9.5, { ls: 1.2, color: c.fnt }), styles.gap8]}
              >
                {targetText}
              </Text>

              <SetRow
                weightKg={weighted ? session.weightKg : null}
                reps={session.reps}
                onAdjustWeight={adjustWeight}
                onAdjustReps={adjustReps}
              />

              <BriefButton
                label={isLast ? 'FINISH WORKOUT' : 'COMPLETE SET'}
                accessibilityLabel={isLast ? 'Finish workout' : 'Complete set'}
                onPress={completeSet}
                style={styles.primary}
              />
            </View>
          </Card>

          {/* ── Plan overview ───────────────────────────────────────── */}
          <Card title="Plan">
            <View style={styles.planList}>
              {session.plan.map((p, i) => (
                <PlanRow
                  key={p.id}
                  index={i}
                  def={exerciseOrUnknown(p.exerciseId)}
                  planned={p}
                  status={
                    i < session.exerciseIndex
                      ? 'done'
                      : i === session.exerciseIndex
                        ? 'now'
                        : 'next'
                  }
                />
              ))}
            </View>
          </Card>
        </>
      )}
    </BriefScreen>
  );
}

/**
 * One line of the plan overview: a status marker (done ✓ / current ▶ / upcoming
 * number), the exercise name, and its target so the user can see what's next and
 * ready the right weight/accessory.
 */
function PlanRow({
  index,
  def,
  planned,
  status,
}: {
  index: number;
  def: ExerciseDef;
  planned: PlannedExercise;
  status: 'done' | 'now' | 'next';
}) {
  const c = useTheme().colors;
  const weight =
    planned.targetWeightKg != null
      ? ` · ${formatKg(planned.targetWeightKg)} KG`
      : '';
  const tint = status === 'now' ? c.acc : c.mut;
  const mark =
    status === 'done'
      ? '✓'
      : status === 'now'
        ? '▶'
        : String(index + 1).padStart(2, '0');
  return (
    <View style={styles.planRow}>
      <Text style={[M(700, 11, { ls: 0.5, color: tint }), styles.planMark]}>
        {mark}
      </Text>
      <Text
        style={[
          S(600, 13.5, { color: status === 'done' ? c.mut : c.ink }),
          styles.planName,
        ]}
        numberOfLines={1}
      >
        {def.name}
      </Text>
      <Text style={M(600, 10, { ls: 0.4, color: c.fnt })}>
        {planned.targetSets}×{planned.targetReps}
        {weight}
      </Text>
    </View>
  );
}

/** Count sets still to do from the cursor (inclusive of the current set). */
function remainingSets(
  plan: { targetSets: number }[],
  exerciseIndex: number,
  setIndex: number,
): number {
  let n = 0;
  for (let i = exerciseIndex; i < plan.length; i++) {
    n +=
      i === exerciseIndex ? plan[i].targetSets - setIndex : plan[i].targetSets;
  }
  return n;
}

/**
 * Live seconds elapsed since `startedAt`, re-rendering once a second. Counts
 * wall-clock time (through rests included), matching the summary's durationSec.
 */
function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** m:ss, or h:mm:ss once past an hour. */
function formatDuration(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const styles = StyleSheet.create({
  header: { marginTop: 6, gap: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerClock: { marginTop: 5 },
  endIcon: {
    borderWidth: 1,
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { marginTop: 12 },
  runCard: { marginTop: 16 },
  runBody: { padding: 18 },
  runTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  runTitle: { flex: 1, minWidth: 0 },
  gap8: { marginTop: 8 },
  gap14: { marginTop: 14 },
  upNext: {
    position: 'absolute',
    top: 14,
    left: 14,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  targetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginTop: 18,
  },
  targetSteppers: { flexDirection: 'row', gap: 8 },
  smallPm: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { marginTop: 22 },
  planList: { marginTop: 6 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  planMark: { width: 20 },
  planName: { flex: 1, minWidth: 0 },
});
