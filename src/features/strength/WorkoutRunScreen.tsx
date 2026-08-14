import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefScreen, M, S, Section } from '../../components/brief';
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
 * The runner. Walks the active session set-by-set: show the exercise animation
 * and target, let the user tweak the actual weight/reps, then COMPLETE SET logs
 * it and either starts the rest timer or (on the final set) finishes into the
 * summary. All progression lives in the strength store; this screen is the view.
 */
export function WorkoutRunScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
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
        <Section n="01" title="No active workout" first>
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            This workout has no exercises.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: c.ink }]}
          >
            <Text style={M(700, 12, { ls: 1, color: c.inv })}>GO BACK</Text>
          </Pressable>
        </Section>
      </BriefScreen>
    );
  }

  const entry = session.plan[session.exerciseIndex];
  const def = exerciseOrUnknown(entry.exerciseId);
  const target = setTargetFor(entry, session.setIndex);
  const isLast =
    nextCursor(session.plan, session.exerciseIndex, session.setIndex) === null;
  const totalSetsDone = session.completed.length;

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
            <Text style={M(800, 22, { ls: -0.5, color: c.ink })}>
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
          {session.exerciseIndex + 1}/{session.plan.length} · {totalSetsDone} DONE ·{' '}
          {remainingSets(session.plan, session.exerciseIndex, session.setIndex)} LEFT
        </Text>
      </View>
      {session.resting ? (
        <Section n="··" title="Rest" first>
          <Text style={[M(700, 10.5, { ls: 0.6, color: c.fnt }), styles.next]}>
            NEXT · {def.name.toUpperCase()} · SET {session.setIndex + 1}/
            {entry.targetSets}
          </Text>
          <RestTimer
            key={`${session.exerciseIndex}-${session.setIndex}`}
            seconds={entry.restSec}
            onDone={endRest}
          />
        </Section>
      ) : (
        <>
          <Section
            n={String(session.exerciseIndex + 1).padStart(2, '0')}
            title={def.name}
            first
            titleRight={
              <Text style={M(700, 10.5, { color: c.acc })}>
                SET {session.setIndex + 1}/{entry.targetSets}
              </Text>
            }
          >
            <ExerciseMedia exerciseId={entry.exerciseId} playing={!session.resting} />
            <Text style={[M(600, 11, { ls: 0.4, color: c.mut }), styles.target]}>
              TARGET · {target.reps} REPS
              {target.weightKg != null
                ? ` · ${formatKg(target.weightKg)} KG`
                : ' · BODYWEIGHT'}
            </Text>

            <SetRow
              weightKg={entry.targetWeightKg != null ? session.weightKg : null}
              reps={session.reps}
              onAdjustWeight={adjustWeight}
              onAdjustReps={adjustReps}
            />

            <Pressable
              onPress={completeSet}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'Finish workout' : 'Complete set'}
              style={[styles.primary, { backgroundColor: c.ink }]}
            >
              <Text style={M(700, 13, { ls: 1, color: c.inv })}>
                {isLast ? 'FINISH WORKOUT' : 'COMPLETE SET'}
              </Text>
            </Pressable>
          </Section>

          <Section n="··" title="Plan">
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
          </Section>
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
        style={[S(600, 13.5, { color: status === 'done' ? c.mut : c.ink }), styles.planName]}
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
    n += i === exerciseIndex ? plan[i].targetSets - setIndex : plan[i].targetSets;
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
  header: { marginBottom: 14, gap: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  endIcon: {
    borderWidth: 1,
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { marginTop: 12, lineHeight: 19 },
  next: { marginTop: 12, textAlign: 'center' },
  target: { marginTop: 14 },
  primary: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 22,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  planMark: { width: 20 },
  planName: { flex: 1, minWidth: 0 },
});
