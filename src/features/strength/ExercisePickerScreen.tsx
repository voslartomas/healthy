import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BRIEF_GUTTER,
  BRIEF_MAX_WIDTH,
  inputStyle,
  M,
  S,
} from '../../components/brief';
import {
  EQUIPMENT_LABELS,
  EXERCISE_CATALOG,
  Equipment,
  MUSCLE_LABELS,
  MuscleGroup,
} from '../../data/exerciseCatalog';
import { useStrengthStore } from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { ExerciseMedia } from './components/ExerciseMedia';

const EQUIPMENT_FILTERS: (Equipment | 'all')[] = [
  'all',
  'dumbbell',
  'bodyweight',
  'pullupBar',
  'kettlebell',
];

const MUSCLE_FILTERS: (MuscleGroup | 'all')[] = [
  'all',
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
];

/** Preferred display order for the specific-muscle sub-filter. */
const MUSCLE_ORDER = [
  'chest',
  'shoulders',
  'traps',
  'neck',
  'biceps',
  'triceps',
  'forearms',
  'lats',
  'middle back',
  'lower back',
  'abdominals',
  'glutes',
  'quadriceps',
  'hamstrings',
  'calves',
  'adductors',
  'abductors',
];

/**
 * The specific primary muscles present within each coarse group, powering the
 * progressive per-muscle sub-filter (shown only once a group is picked). Built
 * from each exercise's defining muscle so every entry maps back to its group.
 */
const MUSCLES_BY_GROUP: Record<MuscleGroup, string[]> = (() => {
  const acc = {
    chest: [],
    back: [],
    shoulders: [],
    arms: [],
    legs: [],
    core: [],
  } as Record<MuscleGroup, string[]>;
  for (const e of EXERCISE_CATALOG) {
    const m = e.primaryMuscles[0];
    if (m && !acc[e.muscleGroup].includes(m)) acc[e.muscleGroup].push(m);
  }
  (Object.keys(acc) as MuscleGroup[]).forEach(k =>
    acc[k].sort((a, b) => MUSCLE_ORDER.indexOf(a) - MUSCLE_ORDER.indexOf(b)),
  );
  return acc;
})();

/** Shorter labels for the few muscles whose db name is long/clinical. */
const MUSCLE_LABEL_OVERRIDES: Record<string, string> = {
  'middle back': 'Mid back',
  'lower back': 'Lower back',
  abdominals: 'Abs',
  quadriceps: 'Quads',
};
const muscleLabel = (m: string) =>
  MUSCLE_LABEL_OVERRIDES[m] ?? m.replace(/\b\w/g, ch => ch.toUpperCase());

/**
 * Modal catalog picker. Filter by equipment, muscle group (with an optional
 * per-muscle refinement), and free-text search, then tap an exercise to append
 * it to the builder draft (with its default targets) and dismiss. Adding several
 * exercises means reopening — each pick is one tap and close, which keeps the
 * interaction predictable.
 */
export function ExercisePickerScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const addExercise = useStrengthStore(s => s.addDraftExercise);

  const [query, setQuery] = useState('');
  const [equip, setEquip] = useState<Equipment | 'all'>('all');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [submuscle, setSubmuscle] = useState<string>('all');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXERCISE_CATALOG.filter(e => {
      if (equip !== 'all' && e.equipment !== equip) return false;
      if (muscle !== 'all' && e.muscleGroup !== muscle) return false;
      if (submuscle !== 'all' && !e.primaryMuscles.includes(submuscle))
        return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, equip, muscle, submuscle]);

  function pick(id: string) {
    addExercise(id);
    navigation.goBack();
  }

  const subMuscles = muscle === 'all' ? [] : MUSCLES_BY_GROUP[muscle];

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.column}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={c.fnt}
          autoCorrect={false}
          style={[S(600, 15, { color: c.ink }), inputStyle(c), styles.search]}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {EQUIPMENT_FILTERS.map(f => {
            const on = equip === f;
            return (
              <Pressable
                key={f}
                onPress={() => setEquip(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.pill,
                  {
                    borderColor: on ? c.ink : c.hair,
                    backgroundColor: on ? c.ink : 'transparent',
                  },
                ]}
              >
                <Text
                  style={M(700, 10.5, { ls: 0.6, color: on ? c.inv : c.mut })}
                >
                  {(f === 'all' ? 'All' : EQUIPMENT_LABELS[f]).toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.muscleRow}
        >
          {MUSCLE_FILTERS.map(m => {
            const on = muscle === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  setMuscle(m);
                  setSubmuscle('all');
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  styles.pill,
                  {
                    borderColor: on ? c.ink : c.hair,
                    backgroundColor: on ? c.ink : 'transparent',
                  },
                ]}
              >
                <Text
                  style={M(700, 10.5, { ls: 0.6, color: on ? c.inv : c.mut })}
                >
                  {(m === 'all' ? 'All' : MUSCLE_LABELS[m]).toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {subMuscles.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subRow}
          >
            {['all', ...subMuscles].map(m => {
              const on = submuscle === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setSubmuscle(m)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.pill,
                    styles.subPill,
                    {
                      borderColor: on ? c.acc : c.hair,
                      backgroundColor: on ? c.acc : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={M(700, 10.5, {
                      ls: 0.6,
                      color: on ? c.onAccent : c.mut,
                    })}
                  >
                    {(m === 'all'
                      ? `All ${MUSCLE_LABELS[muscle as MuscleGroup]}`
                      : muscleLabel(m)
                    ).toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={e => e.id}
        style={{ flex: 1 }}
        contentContainerStyle={[styles.column, styles.listContent]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={12}
        windowSize={7}
        ListEmptyComponent={
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            No exercises match.
          </Text>
        }
        renderItem={({ item: e }) => (
          <Pressable
            onPress={() => pick(e.id)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${e.name}`}
            style={[styles.item, { borderBottomColor: c.hair }]}
          >
            <ExerciseMedia exerciseId={e.id} variant="thumb" height={64} />
            <View style={styles.itemMain}>
              <Text style={S(600, 14.5, { color: c.ink })} numberOfLines={1}>
                {e.name}
              </Text>
              <Text style={M(600, 9.5, { ls: 0.6, color: c.fnt })}>
                {(e.primaryMuscles[0]
                  ? muscleLabel(e.primaryMuscles[0])
                  : MUSCLE_LABELS[e.muscleGroup]
                ).toUpperCase()}{' '}
                · {EQUIPMENT_LABELS[e.equipment].toUpperCase()}
              </Text>
            </View>
            <Text style={M(700, 20, { color: c.acc })}>＋</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: BRIEF_GUTTER,
  },
  search: { marginTop: 16 },
  filterRow: { gap: 8, paddingTop: 14, paddingBottom: 8 },
  muscleRow: { gap: 8, paddingBottom: 8 },
  subRow: { gap: 8, paddingBottom: 14 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  subPill: { paddingVertical: 8 },
  listContent: { paddingBottom: 40 },
  empty: { marginTop: 20 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  itemMain: { flex: 1, minWidth: 0, gap: 3 },
});
