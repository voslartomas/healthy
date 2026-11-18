import React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenProps } from '../../app/navigation/types';
import {
  BRIEF_GUTTER,
  BRIEF_MAX_WIDTH,
  chunky,
  inputStyle,
  S,
} from '../../components/brief';
import {
  removeWorkout,
  startWorkoutSession,
} from '../../state/strengthService';
import { SavedWorkout, useStrengthStore } from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { WorkoutCard } from './components/WorkoutCard';

/**
 * The full saved-workouts library, presented as a native modal from the Lift
 * tab's "Search all". There is no artboard for it; it reuses the Lift tab's
 * chunky {@link WorkoutCard} under a search well, so the two lists match.
 * Search across every saved workout and start, edit or delete one — the same
 * actions the inline Lift list offers, over the whole set instead of the five
 * shown there. Start/edit replace this modal so the
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
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search workouts"
          placeholderTextColor={c.fnt}
          autoCorrect={false}
          accessibilityLabel="Search workouts"
          style={[S(800, 17, { color: c.ink }), inputStyle(c), styles.search]}
        />
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{
          width: '100%',
          maxWidth: BRIEF_MAX_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: BRIEF_GUTTER,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {results.length === 0 ? (
          <View style={[chunky(c), styles.emptyCard]}>
            <Text style={S(700, 15, { lh: 21, color: c.mut })}>
              {workouts.length === 0
                ? 'No saved workouts yet. Build one on the Lift tab.'
                : 'No workouts match.'}
            </Text>
          </View>
        ) : (
          results.map(w => (
            <WorkoutCard
              key={w.id}
              workout={w}
              onStart={() => run(w)}
              onEdit={() => edit(w)}
              onDelete={() => confirmDelete(w)}
              style={styles.cardGap}
            />
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: BRIEF_GUTTER,
    paddingTop: 12,
    paddingBottom: 4,
  },
  search: { borderRadius: 16 },
  list: { flex: 1 },
  emptyCard: { padding: 18, marginTop: 14 },
  cardGap: { marginTop: 14 },
});
