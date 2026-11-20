import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefButton, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { FoodEntryInput, healthSourceName } from '../../health';
import { FOOD_TAGS, FoodTagKey } from '../../state/foodTags';
import { tagLoggedFood } from '../../state/foodTagsService';
import { useHabitsStore } from '../../state/useHabitsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import {
  ChoiceTile,
  FieldLabel,
  fieldStyle,
  formStyles,
  MacroFields,
} from './foodFormParts';
import { PinnedFooterLayout } from './PinnedFooterLayout';

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Parse an optional non-negative grams field; undefined when blank/invalid. */
function parseMacro(s: string): number | undefined {
  const n = parseInt(s, 10);
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * The habits a set of tags is about to break, by name — the note under the
 * tag tiles names them, which turns an abstract label into a consequence.
 */
export function habitsBrokenBy(
  habits: { type: string; auto: boolean; tag?: FoodTagKey; name: string }[],
  tags: FoodTagKey[],
): string[] {
  if (tags.length === 0) return [];
  return habits
    .filter(h => h.type === 'food' && h.auto && h.tag && tags.includes(h.tag))
    .map(h => h.name);
}

/**
 * Log one food (LogFood artboard, ADR-007): a full screen opened from the Food
 * tab's "+ Log food", replacing the inline form that used to unfold under the
 * button. Name, calories, optional macros and the treat tags the food habits
 * read; the "Log N kcal" slab is pinned at the bottom ({@link
 * PinnedFooterLayout}). The coach shortcut hands off to the chat with the Log
 * food action armed. Closes itself after a successful log.
 */
export function LogFoodScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const logFoodEntry = useHealthStore(s => s.logFoodEntry);
  const habits = useHabitsStore(s => s.habits);

  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const [protein, setProtein] = React.useState('');
  const [carbs, setCarbs] = React.useState('');
  const [fat, setFat] = React.useState('');
  /** Tags on the entry — junk / alcohol / sweets. The food habits read these,
   * so tagging is how "no junk food" ever breaks. */
  const [tags, setTags] = React.useState<FoodTagKey[]>([]);
  const [busy, setBusy] = React.useState(false);

  const breaks = React.useMemo(
    () => habitsBrokenBy(habits, tags),
    [habits, tags],
  );
  const tagNote = breaks.length
    ? `Heads up: this breaks today for “${breaks.join('”, “')}”.`
    : tags.length
      ? 'Tagged — none of your habits watch this one.'
      : 'Tag junk food, alcohol or sweets so your food habits can count them.';

  const kcalNum = parseInt(kcal, 10);
  const logLabel =
    Number.isFinite(kcalNum) && kcalNum > 0
      ? `Log ${kcalNum} kcal`
      : 'Log food';

  const openCoach = () => {
    // Swap this screen for the coach rather than stacking two modals.
    navigation.goBack();
    navigation.navigate('Coach', { intent: 'food' });
  };

  const submit = async () => {
    if (!name.trim() || !Number.isFinite(kcalNum) || kcalNum <= 0) {
      Alert.alert('Add food', 'Enter a name and a calorie amount.');
      return;
    }
    const entry: FoodEntryInput = { name: name.trim(), kcal: kcalNum };
    const p = parseMacro(protein);
    const cb = parseMacro(carbs);
    const f = parseMacro(fat);
    if (p != null) entry.proteinG = p;
    if (cb != null) entry.carbsG = cb;
    if (f != null) entry.fatG = f;
    setBusy(true);
    // Through logFoodEntry (not logFood) so the platform's record id comes
    // back and the tags can hang off that exact entry.
    const res = await logFoodEntry(entry);
    if (res.ok && tags.length > 0) {
      await tagLoggedFood({
        name: entry.name,
        tags,
        entryId: res.name ?? null,
      }).catch(err => console.warn('Failed to save food tags', err));
    }
    setBusy(false);
    if (res.ok) {
      navigation.goBack();
    } else {
      Alert.alert(
        'Not logged',
        `Connect ${healthSourceName()} in Me to save food entries.`,
      );
    }
  };

  return (
    <PinnedFooterLayout
      footer={
        <BriefButton
          label={logLabel}
          accessibilityLabel="Save food entry"
          onPress={() => void submit()}
          disabled={busy}
          tone="food"
          fontSize={18}
        />
      }
    >
      <Pressable
        onPress={openCoach}
        accessibilityRole="button"
        accessibilityLabel="Tell the coach what you ate"
        style={[styles.coach, { backgroundColor: c.accTint }]}
      >
        <View style={[styles.coachIcon, { backgroundColor: c.accSolid }]}>
          <Icon name="sparkles" size={20} color={c.onAccent} />
        </View>
        <View style={styles.coachText}>
          <Text style={S(900, 16, { color: c.ink })}>Just tell the coach</Text>
          <Text style={S(700, 14, { lh: 19, color: c.mut })}>
            “Two eggs and toast” — it fills in the numbers
          </Text>
        </View>
      </Pressable>

      <View style={formStyles.group}>
        <FieldLabel>What did you eat?</FieldLabel>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Food name"
          placeholderTextColor={c.fnt}
          accessibilityLabel="Food name"
          autoFocus
          style={fieldStyle(c, 18)}
        />
      </View>
      <View style={formStyles.group}>
        <FieldLabel>Calories</FieldLabel>
        <View style={styles.kcalRow}>
          <TextInput
            value={kcal}
            onChangeText={setKcal}
            placeholder="kcal"
            placeholderTextColor={c.fnt}
            keyboardType="number-pad"
            accessibilityLabel="Calories"
            style={[fieldStyle(c, 26), styles.kcalInput]}
          />
          <Text style={S(900, 18, { color: c.mut })}>kcal</Text>
        </View>
      </View>
      <MacroFields
        protein={protein}
        carbs={carbs}
        fat={fat}
        onProtein={setProtein}
        onCarbs={setCarbs}
        onFat={setFat}
      />

      {/* Tag it if it was junk, alcohol or sweets — the food habits read
          these, and nothing else in the app does. */}
      <View style={formStyles.group}>
        <FieldLabel>Was it a treat?</FieldLabel>
        <View style={formStyles.tileRow}>
          {FOOD_TAGS.map(tag => (
            <ChoiceTile
              key={tag.key}
              label={titleCase(tag.label)}
              on={tags.includes(tag.key)}
              onPress={() =>
                setTags(cur =>
                  cur.includes(tag.key)
                    ? cur.filter(x => x !== tag.key)
                    : [...cur, tag.key],
                )
              }
              role="checkbox"
              // The stored uppercase label, unchanged: tests and the habit
              // editor both refer to tags by it.
              accessibilityLabel={tag.label}
              tone="red"
            />
          ))}
        </View>
        <View
          style={[
            styles.note,
            { backgroundColor: breaks.length ? c.redTint : c.soft },
          ]}
        >
          <Text
            style={S(800, 14, {
              lh: 19,
              color: breaks.length ? c.red : c.mut,
            })}
          >
            {tagNote}
          </Text>
        </View>
      </View>
    </PinnedFooterLayout>
  );
}

const styles = StyleSheet.create({
  coach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
  },
  coachIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachText: { flex: 1, minWidth: 0 },
  kcalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcalInput: { flex: 1, minWidth: 0 },
  note: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
});
