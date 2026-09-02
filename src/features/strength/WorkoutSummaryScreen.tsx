import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BigStat,
  BriefButton,
  BriefScreen,
  Card,
  M,
  S,
} from '../../components/brief';
import { exerciseOrUnknown } from '../../data/exerciseCatalog';
import { LoggedSet, useStrengthStore } from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { ExerciseMedia } from './components/ExerciseMedia';
import { formatKg } from './components/SetRow';

/** Group the flat logged-set list back into per-exercise blocks, in order. */
function groupByExercise(
  sets: LoggedSet[],
): { position: number; exerciseId: string; sets: LoggedSet[] }[] {
  const groups: {
    position: number;
    exerciseId: string;
    sets: LoggedSet[];
  }[] = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.position === s.position) last.sets.push(s);
    else
      groups.push({
        position: s.position,
        exerciseId: s.exerciseId,
        sets: [s],
      });
  }
  return groups;
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Post-run recap. Shows total volume, sets, reps and duration, plus a
 * per-exercise breakdown of the sets actually performed. The session is already
 * persisted (by finishSession) before this screen renders; "Done" just returns
 * to the Strength list.
 */
export function WorkoutSummaryScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const summary = useStrengthStore(s => s.lastSummary);

  const groups = useMemo(
    () => (summary ? groupByExercise(summary.sets) : []),
    [summary],
  );

  function done() {
    // The runner replaced itself with this screen, so under it is the Tabs host
    // (Strength tab active) — goBack returns there without leaving a stale run.
    navigation.goBack();
  }

  if (!summary) {
    return (
      <BriefScreen>
        <Card first title="No session">
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
            Nothing to show.
          </Text>
          <BriefButton label="DONE" onPress={done} style={styles.doneEmpty} />
        </Card>
      </BriefScreen>
    );
  }

  return (
    <BriefScreen>
      <BigStat
        value={String(summary.totalVolumeKg)}
        suffix=" kg"
        suffixSize={26}
        pill={{ text: summary.name.toUpperCase() }}
        caption="TOTAL VOLUME"
      />

      <Card title="Session" style={styles.sessionCard}>
        <View style={styles.metaRow}>
          <Meta label="SETS" value={String(summary.setsCompleted)} />
          <Meta label="REPS" value={String(summary.totalReps)} />
          <Meta label="TIME" value={mmss(summary.durationSec)} />
        </View>
      </Card>

      <Card title="Breakdown">
        {groups.length === 0 ? (
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
            No sets were logged.
          </Text>
        ) : (
          groups.map(g => (
            <View
              key={`${g.position}-${g.exerciseId}`}
              style={[styles.exBlock, { borderBottomColor: c.hair }]}
            >
              <ExerciseMedia
                exerciseId={g.exerciseId}
                variant="thumb"
                height={56}
                playing={false}
              />
              <View style={styles.exMain}>
                <Text
                  style={S(700, 14, { lh: 17, color: c.ink })}
                  numberOfLines={1}
                >
                  {exerciseOrUnknown(g.exerciseId).name}
                </Text>
                <View style={styles.setList}>
                  {g.sets.map((s, i) => (
                    <Text key={i} style={M(600, 11, { ls: 0.3, color: c.mut })}>
                      {s.weightKg != null
                        ? `${formatKg(s.weightKg)}KG × ${s.reps}`
                        : `${s.reps} REPS`}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          ))
        )}
      </Card>

      <BriefButton
        label="DONE"
        onPress={done}
        style={styles.done}
        accessibilityLabel="Done"
      />
    </BriefScreen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  const c = useTheme().colors;
  return (
    <View style={styles.meta}>
      <Text style={M(700, 22, { ls: -0.2, color: c.ink })}>{value}</Text>
      <Text style={[M(600, 9, { ls: 1, color: c.fnt }), styles.metaLabel]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 12 },
  sessionCard: { marginTop: 16 },
  metaRow: { flexDirection: 'row', marginTop: 14 },
  meta: { flex: 1 },
  metaLabel: { marginTop: 5 },
  exBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  exMain: { flex: 1, minWidth: 0 },
  setList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
  },
  done: { marginTop: 24 },
  doneEmpty: { marginTop: 16 },
});
