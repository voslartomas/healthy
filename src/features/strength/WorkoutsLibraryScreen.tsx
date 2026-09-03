import React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenProps } from '../../app/navigation/types';
import { inputStyle, M, S } from '../../components/brief';
import { removeWorkout, startWorkoutSession } from '../../state/strengthService';
import { SavedWorkout, useStrengthStore } from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { ExerciseMedia } from './components/ExerciseMedia';

/** "3 EXERCISES · 9 SETS · ~28 MIN" — the mono meta line under a workout name. */
function summarize(w: SavedWorkout): string {
  const sets = w.exercises.reduce((n, e) => n + e.targetSets, 0);
  const ex = w.exercises.length;
  const mins = Math.round(
    w.exercises.reduce((t, e) => t + e.targetSets * (e.restSec + 40), 0) / 60,
  );
  return `${ex} ${ex === 1 ? 'EXERCISE' : 'EXERCISES'} · ${sets} SETS · ~${mins} MIN`;
}

/**
 * The full saved-workouts library, presented as a native modal from the Lift
 * screen's "MORE" affordance. Search across every saved workout and start, edit
 * or delete one — the same actions the inline Lift list offers, over the whole
 * set instead of the five shown there. Start/edit replace this modal so the
 * runner or builder returns straight to the Lift tab when finished.
 */
export function WorkoutsLibraryScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const workouts = useStrengthStore(s => s.workouts);
  const startDraft = useStrengthStore(s => s.startDraft);

  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const results = q
    ? workouts.filter(w => w.name.toLowerCase().includes(q))
    : workouts;

  function run(w: SavedWorkout) {
    startWorkoutSession(w);
    navigation.replace('WorkoutRun');
  }

  function edit(w: SavedWorkout) {
    startDraft(w);
    navigation.replace('WorkoutBuilder');
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg }]}
    >
      <View style={[styles.searchWrap, { borderBottomColor: c.hair }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search workouts"
          placeholderTextColor={c.fnt}
          autoCorrect={false}
          style={[S(600, 15, { color: c.ink }), inputStyle(c)]}
        />
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {results.length === 0 ? (
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
            {workouts.length === 0
              ? 'No saved workouts yet. Build one on the Lift screen.'
              : 'No workouts match.'}
          </Text>
        ) : (
          results.map(w => (
            <View
              key={w.id}
              style={[styles.row, { borderBottomColor: c.hair }]}
            >
              <ExerciseMedia
                exerciseId={w.exercises[0].exerciseId}
                variant="thumb"
                height={56}
                playing={false}
              />
              <View style={styles.main}>
                <Pressable
                  onPress={() => run(w)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start ${w.name}`}
                >
                  <Text style={S(700, 14.5, { lh: 17, color: c.ink })} numberOfLines={1}>
                    {w.name}
                  </Text>
                  <Text style={[M(700, 9, { ls: 1, color: c.acc }), styles.meta]}>
                    {summarize(w)}
                  </Text>
                </Pressable>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => edit(w)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${w.name}`}
                    style={[styles.actBtn, { borderColor: c.hair, backgroundColor: c.card }]}
                  >
                    <Text style={M(700, 10.5, { ls: 1, color: c.ink })}>EDIT</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(w)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${w.name}`}
                    style={[styles.actBtn, { borderColor: c.red, backgroundColor: c.card }]}
                  >
                    <Text style={M(700, 10.5, { ls: 1, color: c.red })}>DELETE</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  list: { flex: 1 },
  empty: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  main: { flex: 1, minWidth: 0 },
  meta: { marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 11 },
  actBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
});
