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
  chunky,
  inputStyle,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
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
 * One chunky filter pill (2px outline, 4px bottom edge). Chosen pills take the
 * lift tint with a violet outline — the same "picked" look as the builder's
 * strength/core tiles — so the three filter rows read as one control family.
 */
function FilterPill({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const c = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={[
        styles.pill,
        {
          borderColor: on ? c.lift : c.hair,
          backgroundColor: on ? c.liftTint : c.card,
        },
      ]}
    >
      <Text style={S(900, 15, { color: on ? c.liftText : c.ink })}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Modal catalog picker. Filter by equipment, muscle group (with an optional
 * per-muscle refinement), and free-text search, then tap an exercise to append
 * it to the builder draft (with its default targets) and dismiss. Adding several
 * exercises means reopening — each pick is one tap and close, which keeps the
 * interaction predictable.
 *
 * There is no artboard for it (ADR-007); it follows the Lift family: a big
 * search well, rows of chunky filter pills, and each exercise as a chunky row
 * with its media tile and a violet "+" key.
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
          accessibilityLabel="Search exercises"
          style={[S(800, 17, { color: c.ink }), inputStyle(c), styles.search]}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={[styles.filterRow, styles.filterFirst]}
      >
        {EQUIPMENT_FILTERS.map(f => (
          <FilterPill
            key={f}
            label={f === 'all' ? 'All equipment' : EQUIPMENT_LABELS[f]}
            on={equip === f}
            onPress={() => setEquip(f)}
          />
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {MUSCLE_FILTERS.map(m => (
          <FilterPill
            key={m}
            label={m === 'all' ? 'All muscles' : MUSCLE_LABELS[m]}
            on={muscle === m}
            onPress={() => {
              setMuscle(m);
              setSubmuscle('all');
            }}
          />
        ))}
      </ScrollView>
      {subMuscles.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {['all', ...subMuscles].map(m => (
            <FilterPill
              key={m}
              label={
                m === 'all'
                  ? `All ${MUSCLE_LABELS[muscle as MuscleGroup].toLowerCase()}`
                  : muscleLabel(m)
              }
              on={submuscle === m}
              onPress={() => setSubmuscle(m)}
            />
          ))}
        </ScrollView>
      ) : null}

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
          <View style={[chunky(c), styles.emptyCard]}>
            <Text style={S(700, 15, { lh: 21, color: c.mut })}>
              No exercises match.
            </Text>
          </View>
        }
        renderItem={({ item: e }) => (
          <Pressable
            onPress={() => pick(e.id)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${e.name}`}
            style={[chunky(c, 20), styles.item]}
          >
            <ExerciseMedia exerciseId={e.id} variant="thumb" height={56} />
            <View style={styles.itemMain}>
              <Text
                style={S(900, 16, { lh: 21, color: c.ink })}
                numberOfLines={2}
              >
                {e.name}
              </Text>
              <Text style={S(700, 14, { color: c.mut })}>
                {e.primaryMuscles[0]
                  ? muscleLabel(e.primaryMuscles[0])
                  : MUSCLE_LABELS[e.muscleGroup]}{' '}
                · {EQUIPMENT_LABELS[e.equipment].toLowerCase()}
              </Text>
            </View>
            <View
              style={[
                styles.addKey,
                { backgroundColor: c.lift, borderBottomColor: c.liftEdge },
              ]}
            >
              <Icon name="plus" size={20} color={c.onAccent} strokeWidth={3} />
            </View>
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
  search: { marginTop: 16, borderRadius: 16 },
  // Filter rows scroll edge to edge (no column cap) so a long row can be
  // swiped from the screen edge; the gutter is content padding instead.
  filterScroll: { flexGrow: 0 },
  filterRow: { gap: 8, paddingHorizontal: BRIEF_GUTTER, paddingBottom: 8 },
  filterFirst: { paddingTop: 14 },
  pill: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  listContent: { paddingTop: 6, paddingBottom: 40 },
  emptyCard: { padding: 18, marginTop: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginTop: 10,
  },
  itemMain: { flex: 1, minWidth: 0, gap: 2 },
  addKey: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderBottomWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
