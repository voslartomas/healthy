import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  Card,
  chunky,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  ExerciseDef,
  exerciseOrUnknown,
  MUSCLE_LABELS,
} from '../../data/exerciseCatalog';
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
 * The runner (ADR-007 "Workout run" + "Rest" artboards). Walks the active
 * session set-by-set: a progress row (end · sets-done bar · total time), the
 * exercise's form loop, where you are and the target, two big stepper tiles for
 * the actual weight/reps, then the green "Complete set" slab. That logs the set
 * and either drops into rest (a sky-tinted countdown dial, what's up next with
 * its weight tweak, "Start next set") or — on the final set — finishes into the
 * summary. The plan overview sits under the set so it never crowds the controls.
 * All progression lives in the strength store; this screen is the view.
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
          <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.empty]}>
            This workout has no exercises.
          </Text>
          <BriefButton
            label="Go back"
            tone="lift"
            onPress={() => navigation.goBack()}
            style={styles.emptyBtn}
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
  const setsLeft = remainingSets(
    session.plan,
    session.exerciseIndex,
    session.setIndex,
  );
  const totalSets = totalSetsDone + setsLeft;
  const weighted = entry.targetWeightKg != null;
  const position = `Exercise ${session.exerciseIndex + 1} of ${session.plan.length} · set ${session.setIndex + 1} of ${entry.targetSets}`;

  const targetText = `Target ${target.reps} reps · ${
    target.weightKg != null ? `${formatKg(target.weightKg)} kg` : 'bodyweight'
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
      {/* ── Progress: end · sets-done bar · total time ─────────────────── */}
      <View style={styles.top}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="End workout"
          style={[styles.endBtn, { backgroundColor: c.soft }]}
        >
          <Icon name="close" size={20} color={c.mut} strokeWidth={2.6} />
        </Pressable>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${totalSetsDone} of ${totalSets} sets done`}
          style={[styles.progress, { backgroundColor: c.liftTint }]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${totalSets > 0 ? (totalSetsDone / totalSets) * 100 : 0}%`,
                backgroundColor: c.lift,
              },
            ]}
          />
        </View>
        <Text
          accessibilityLabel={`Total time ${formatDuration(elapsed)}`}
          style={S(900, 16, { color: c.mut })}
        >
          {formatDuration(elapsed)}
        </Text>
      </View>

      {session.resting ? (
        <>
          {/* ── Resting: the dial on a sky panel ──────────────────────── */}
          <View style={[styles.restPanel, { backgroundColor: c.waterTint }]}>
            <Text style={S(900, 22, { lh: 28, color: c.waterText })}>
              Nice set! Breathe.
            </Text>
            <RestTimer
              key={`${session.exerciseIndex}-${session.setIndex}`}
              seconds={entry.restSec}
              onDone={endRest}
            />
          </View>

          {/* ── What's up next, with the next set's weight tweak ──────── */}
          <View style={[chunky(c), styles.upNext]}>
            <View style={styles.upNextHead}>
              <ExerciseMedia
                exerciseId={entry.exerciseId}
                variant="thumb"
                height={56}
                playing={false}
              />
              <View style={styles.flexText}>
                <Text style={S(900, 14, { color: c.fnt })}>
                  UP NEXT · SET {session.setIndex + 1} OF {entry.targetSets}
                </Text>
                <Text style={S(900, 20, { lh: 25, color: c.ink })}>
                  {def.name}
                </Text>
              </View>
            </View>
            <View style={styles.nextRow}>
              <Text style={[S(800, 16, { color: c.mut }), styles.flexText]}>
                {session.reps} reps
                {weighted ? (
                  <>
                    {' at '}
                    <Text style={S(900, 20, { color: c.ink })}>
                      {formatKg(session.weightKg ?? 0)} kg
                    </Text>
                  </>
                ) : null}
              </Text>
              {weighted ? (
                <View style={styles.nextKeys}>
                  <Pressable
                    onPress={() => adjustWeight(-0.5)}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease next set weight"
                    style={[chunky(c, 14), styles.nextKey]}
                  >
                    <Text style={S(900, 20, { color: c.ink })}>−</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustWeight(0.5)}
                    accessibilityRole="button"
                    accessibilityLabel="Increase next set weight"
                    style={[chunky(c, 14), styles.nextKey]}
                  >
                    <Text style={S(900, 20, { color: c.ink })}>+</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>

          <BriefButton
            label="Start next set"
            tone="lift"
            size={18}
            fontSize={19}
            onPress={endRest}
            style={styles.primary}
          />
        </>
      ) : (
        <>
          {/* ── The set in progress ───────────────────────────────────── */}
          <ExerciseMedia
            exerciseId={entry.exerciseId}
            variant="hero"
            height={230}
            sub={`Form loop · ${MUSCLE_LABELS[def.muscleGroup].toLowerCase()}`}
            style={styles.hero}
          />
          <View style={styles.titleBlock}>
            <Text style={S(900, 15, { color: c.liftText })}>{position}</Text>
            <Text style={S(900, 28, { lh: 32, color: c.ink })}>{def.name}</Text>
            <Text style={S(700, 16, { color: c.mut })}>{targetText}</Text>
          </View>

          <SetRow
            weightKg={weighted ? session.weightKg : null}
            reps={session.reps}
            onAdjustWeight={adjustWeight}
            onAdjustReps={adjustReps}
          />

          {/* Completing a set is the "win" moment, so it's the green slab;
              the final set's button finishes the whole workout instead. */}
          <BriefButton
            label={isLast ? 'Finish workout' : 'Complete set'}
            tone="green"
            size={18}
            fontSize={19}
            onPress={completeSet}
            style={styles.primary}
          />

          {/* ── Plan overview ─────────────────────────────────────────── */}
          <Card
            title="Plan"
            right={
              <Text style={S(800, 14, { color: c.fnt })}>
                {totalSetsDone} done · {setsLeft} left
              </Text>
            }
          >
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
 * One line of the plan overview: a round status marker (done ✓ in green /
 * current ▶ in lift violet / upcoming number), the exercise name, and its
 * target so the user can see what's next and ready the right weight/accessory.
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
      ? ` · ${formatKg(planned.targetWeightKg)} kg`
      : '';
  const mark =
    status === 'done' ? '✓' : status === 'now' ? '▶' : String(index + 1);
  const markBg =
    status === 'done' ? c.grnTint : status === 'now' ? c.lift : c.soft;
  const markFg =
    status === 'done' ? c.grn : status === 'now' ? c.onAccent : c.mut;
  return (
    <View style={styles.planRow}>
      <View style={[styles.planMark, { backgroundColor: markBg }]}>
        <Text style={S(900, 13, { color: markFg })}>{mark}</Text>
      </View>
      <Text
        style={[
          S(900, 16, { color: status === 'done' ? c.mut : c.ink }),
          styles.flexText,
        ]}
        numberOfLines={1}
      >
        {def.name}
      </Text>
      <Text style={S(800, 14, { color: c.mut })}>
        {planned.targetSets} × {planned.targetReps}
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
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  endBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: { flex: 1, height: 16, borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8 },
  empty: { marginTop: 10 },
  emptyBtn: { marginTop: 16 },
  hero: { marginTop: 16 },
  titleBlock: { marginTop: 16, gap: 2 },
  flexText: { flex: 1, minWidth: 0 },
  primary: { marginTop: 20 },
  restPanel: {
    marginTop: 16,
    borderRadius: 26,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 14,
  },
  upNext: { marginTop: 16, padding: 16, gap: 12 },
  upNextHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextKeys: { flexDirection: 'row', gap: 8 },
  nextKey: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planList: { marginTop: 8 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  planMark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
