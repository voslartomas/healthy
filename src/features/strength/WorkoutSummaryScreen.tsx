import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  Card,
  chunky,
  GroupLabel,
  S,
  Tone,
  toneColors,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
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

/** 6240 → "6,240". */
function grp(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One soft, tinted stat tile in the 2×2 recap grid. */
function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
  return (
    <View style={[styles.tile, { backgroundColor: tc.tint }]}>
      <Text style={S(900, 13, { color: tc.text })}>{label}</Text>
      <Text style={S(900, 26, { lh: 32, color: c.ink })}>{value}</Text>
    </View>
  );
}

/**
 * Post-run recap (ADR-007 "Summary" artboard): a trophy, "Workout complete!",
 * the workout's name (and "saved to Health Connect" once the automatic sync
 * lands), four tinted tiles — volume, time, sets, reps — and "What you did", a
 * per-exercise list of the sets actually performed as chips. The session is
 * already persisted (by finishSession) before this screen renders; "Done" just
 * returns to the Lift tab.
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
          <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.empty]}>
            Nothing to show.
          </Text>
          <BriefButton
            label="Done"
            tone="green"
            onPress={done}
            style={styles.doneEmpty}
          />
        </Card>
      </BriefScreen>
    );
  }

  return (
    <BriefScreen>
      <View style={styles.hero}>
        <View style={[styles.trophy, { backgroundColor: c.streakTint }]}>
          <Icon name="star" size={60} color={c.streak} />
        </View>
        <Text style={S(900, 32, { lh: 38, color: c.ink, align: 'center' })}>
          Workout complete!
        </Text>
        <Text style={S(700, 17, { lh: 23, color: c.mut, align: 'center' })}>
          {summary.name}
          {summary.healthId ? ' · saved to Health Connect' : ''}
        </Text>
      </View>

      <View style={styles.tiles}>
        <StatTile
          label="VOLUME"
          value={`${grp(summary.totalVolumeKg)} kg`}
          tone="streak"
        />
        <StatTile label="TIME" value={mmss(summary.durationSec)} tone="lift" />
        <StatTile
          label="SETS"
          value={String(summary.setsCompleted)}
          tone="green"
        />
        <StatTile label="REPS" value={String(summary.totalReps)} tone="water" />
      </View>

      <GroupLabel>What you did</GroupLabel>
      <View style={[chunky(c), styles.list]}>
        {groups.length === 0 ? (
          <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.noSets]}>
            No sets were logged.
          </Text>
        ) : (
          groups.map((g, gi) => (
            <View
              key={`${g.position}-${g.exerciseId}`}
              style={[
                styles.exBlock,
                gi > 0 ? { borderTopWidth: 2, borderTopColor: c.hair } : null,
              ]}
            >
              <ExerciseMedia
                exerciseId={g.exerciseId}
                variant="thumb"
                height={48}
                playing={false}
              />
              <View style={styles.exMain}>
                <Text
                  style={S(900, 16, { lh: 21, color: c.ink })}
                  numberOfLines={1}
                >
                  {exerciseOrUnknown(g.exerciseId).name}
                </Text>
                <View style={styles.chips}>
                  {g.sets.map((s, i) => (
                    <View
                      key={i}
                      style={[styles.chip, { backgroundColor: c.soft }]}
                    >
                      <Text style={S(800, 14, { color: c.ink })}>
                        {s.weightKg != null
                          ? `${formatKg(s.weightKg)} kg × ${s.reps}`
                          : `${s.reps} reps`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <BriefButton
        label="Done"
        tone="green"
        size={18}
        fontSize={19}
        onPress={done}
        style={styles.done}
      />
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 10 },
  doneEmpty: { marginTop: 16 },
  hero: { alignItems: 'center', gap: 10, marginTop: 24 },
  trophy: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  tile: {
    flexBasis: '45%',
    flexGrow: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
  },
  list: { marginTop: 14, overflow: 'hidden' },
  noSets: { padding: 16 },
  exBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  exMain: { flex: 1, minWidth: 0, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  done: { marginTop: 24 },
});
