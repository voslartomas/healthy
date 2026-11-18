import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chunky, S } from '../../../components/brief';
import { Icon } from '../../../components/Icon';
import { SavedWorkout } from '../../../state/useStrengthStore';
import { useTheme } from '../../../theme/theme';
import { ExerciseMedia } from './ExerciseMedia';

/** "3 exercises · 9 sets · ~28 min" — the line under a workout's name.
 * The estimate assumes ~40s of work per set on top of its rest. */
export function summarizeWorkout(w: SavedWorkout): string {
  const sets = w.exercises.reduce((n, e) => n + e.targetSets, 0);
  const ex = w.exercises.length;
  const mins = Math.round(
    w.exercises.reduce((t, e) => t + e.targetSets * (e.restSec + 40), 0) / 60,
  );
  return `${ex} ${ex === 1 ? 'exercise' : 'exercises'} · ${sets} ${sets === 1 ? 'set' : 'sets'} · ~${mins} min`;
}

/**
 * One saved workout as a chunky card (ADR-007 Lift artboard): the first
 * exercise's media as its tile, the name and its size, then the actions — a
 * violet Start slab, an outlined Edit and a red-cross Delete. Shared by the Lift
 * tab and the full workouts library so both lists look and behave the same;
 * the callers own what each action does (navigate vs replace, confirm-delete).
 */
export function WorkoutCard({
  workout,
  onStart,
  onEdit,
  onDelete,
  style,
}: {
  workout: SavedWorkout;
  onStart: () => void;
  onEdit: () => void;
  onDelete: () => void;
  style?: React.ComponentProps<typeof View>['style'];
}) {
  const c = useTheme().colors;
  const first = workout.exercises[0];
  return (
    <View style={[chunky(c), styles.card, style]}>
      <View style={styles.head}>
        {first ? (
          <ExerciseMedia
            exerciseId={first.exerciseId}
            variant="thumb"
            height={64}
            playing={false}
          />
        ) : (
          <View style={[styles.tile, { backgroundColor: c.liftTint }]}>
            <Icon name="strength" size={30} color={c.lift} strokeWidth={2.4} />
          </View>
        )}
        <View style={styles.text}>
          <Text style={S(900, 18, { lh: 23, color: c.ink })} numberOfLines={1}>
            {workout.name}
          </Text>
          <Text style={S(700, 14, { color: c.mut })}>
            {summarizeWorkout(workout)}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={`Start ${workout.name}`}
          style={[
            styles.btn,
            styles.start,
            { backgroundColor: c.lift, borderBottomColor: c.liftEdge },
          ]}
        >
          <Text style={S(900, 16, { color: c.onAccent })}>Start</Text>
        </Pressable>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${workout.name}`}
          style={[chunky(c, 14), styles.btn, styles.edit]}
        >
          <Text style={S(900, 15, { color: c.ink })}>Edit</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${workout.name}`}
          style={[chunky(c, 14), styles.btn, styles.del]}
        >
          <Icon name="close" size={20} color={c.red} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  start: { flex: 1, borderBottomWidth: 4 },
  edit: { width: 76 },
  del: { width: 50 },
});
