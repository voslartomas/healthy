import React, { useState } from 'react';
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

import { ScreenProps } from '../../app/navigation/types';
import {
  BRIEF_GUTTER,
  BRIEF_MAX_WIDTH,
  BriefButton,
  inputStyle,
  S,
} from '../../components/brief';
import { Icon, IconName } from '../../components/Icon';
import { FOOD_TAGS, FoodTagKey } from '../../state/foodTags';
import {
  ALLOWANCES,
  allowanceWord,
  BEDTIMES,
  DEFAULT_WATER_TARGET_ML,
  HABIT_TYPES,
  HabitAllowance,
  HabitType,
  litresLabel,
  WATER_TARGETS,
} from '../../state/habits';
import { createHabit, editHabit, removeHabit } from '../../state/habitsService';
import { useHabitsStore } from '../../state/useHabitsStore';
import { Palette } from '../../theme/colors';
import { useTheme } from '../../theme/theme';

/** "READS THE TAGS ON…" → "Reads the tags on…". The option catalogs in
 * `state/habits` and `state/foodTags` keep the v3 uppercase copy (other screens
 * still read them); this editor shows them in the friendly sentence case. */
function sentence(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** The explainer under the type picker, which depends on both the kind of
 * habit and (for food) whether the user let the log decide. */
function checkNote(type: HabitType, auto: boolean): string {
  // Looked up by key — indexing HABIT_TYPES broke when Water was inserted.
  const note = (key: HabitType) =>
    sentence(HABIT_TYPES.find(t => t.key === key)?.note ?? '');
  if (type === 'food' && !auto)
    return 'You check it off — yesterday stays editable until noon';
  return note(type);
}

/** A water habit's default name, kept in step with the target picker. */
function waterName(ml: number): string {
  return `Drink ${litresLabel(ml)} a day`;
}

/** The glyph on each habit-type tile. */
const TYPE_ICON: Record<HabitType, IconName> = {
  food: 'nutrition',
  sleep: 'moon',
  water: 'droplet',
  other: 'check',
};

const CHECK_MODES = [
  { key: 'auto' as const, label: 'From my food log' },
  { key: 'hand' as const, label: 'By hand' },
];

/**
 * Create or edit a daily habit, presented as a native modal sheet (the header
 * — "New habit" / "Edit habit" with its close button — comes from RootStack).
 *
 * Pushed with `{ habitId }` to edit an existing habit — editing keeps the id, so
 * the habit's streak and 12-week history survive a rename or a change of
 * allowance.
 *
 * Every choice is a grid of chunky tiles ({@link Tiles}), green when picked —
 * green is the habits colour (ADR-007).
 */
export function HabitDefineScreen({ navigation, route }: ScreenProps) {
  const c = useTheme().colors;
  const editingId = route?.params?.habitId ?? null;
  const existing = useHabitsStore(s =>
    editingId ? (s.habits.find(h => h.id === editingId) ?? null) : null,
  );

  const [name, setName] = useState(
    existing?.name ??
      (route?.params?.habitType === 'water'
        ? waterName(DEFAULT_WATER_TARGET_ML)
        : ''),
  );
  const presetType = route?.params?.habitType ?? null;
  const [type, setType] = useState<HabitType>(
    existing?.type ?? presetType ?? 'food',
  );
  const [auto, setAuto] = useState(existing?.auto ?? true);
  const [allowance, setAllowance] = useState<HabitAllowance>(
    existing?.allowance ?? 'week',
  );
  const [tag, setTag] = useState<FoodTagKey>(existing?.tag ?? 'junk');
  const [before, setBefore] = useState<string>(existing?.before ?? '23:00');
  const [targetMl, setTargetMl] = useState<number>(
    existing?.targetMl ?? DEFAULT_WATER_TARGET_ML,
  );
  const [busy, setBusy] = useState(false);

  function pickType(next: HabitType) {
    setType(next);
    // Sleep and water are always read from the data; "other" is always by hand.
    if (next === 'sleep' || next === 'water') setAuto(true);
    if (next === 'other') setAuto(false);
    if (next === 'water' && !name.trim()) setName(waterName(targetMl));
  }

  function pickTarget(ml: number) {
    setTargetMl(ml);
    // Same rule as the bedtime: follow the picker, never clobber a real name.
    if (!name.trim() || /^Drink [\d.]+ L a day$/.test(name)) {
      setName(waterName(ml));
    }
  }

  function pickBedtime(value: string) {
    setBefore(value);
    // Keep the default name in step with the picker, but never clobber a name
    // the user actually wrote.
    if (!name.trim() || /^Asleep before /.test(name)) {
      setName(`Asleep before ${value}`);
    }
  }

  async function save() {
    if (busy) return;
    const finalName =
      name.trim() ||
      (type === 'sleep'
        ? `Asleep before ${before}`
        : type === 'water'
          ? waterName(targetMl)
          : '');
    if (!finalName) {
      Alert.alert(
        'Name your habit',
        'Give the habit a name, e.g. “No junk food”.',
      );
      return;
    }
    setBusy(true);
    const input = {
      name: finalName,
      type,
      auto,
      allowance,
      tag,
      before,
      targetMl,
    };
    try {
      if (editingId) await editHabit(editingId, input);
      else await createHabit(input);
    } finally {
      setBusy(false);
    }
    navigation.goBack();
  }

  function confirmDelete() {
    if (!editingId || !existing) return;
    Alert.alert('Delete habit', `Delete “${existing.name}” and its history?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeHabit(editingId);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          <Label first>What’s the habit?</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. No junk food"
            placeholderTextColor={c.fnt}
            accessibilityLabel="Habit name"
            style={[inputStyle(c), S(800, 18, { color: c.ink }), styles.input]}
          />

          <Label>Type</Label>
          <View style={styles.row}>
            {HABIT_TYPES.map(t => {
              const on = type === t.key;
              const tc = tileColors(c, on);
              const label = sentence(t.label);
              return (
                <Pressable
                  key={t.key}
                  onPress={() => pickType(t.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  style={[styles.tile, styles.typeTile, tc.box]}
                >
                  <Icon
                    name={TYPE_ICON[t.key]}
                    size={28}
                    color={tc.text}
                    strokeWidth={2.4}
                  />
                  <Text style={S(900, 16, { color: tc.text })}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[S(700, 14, { lh: 19, color: c.mut }), styles.note]}>
            {checkNote(type, auto)}
          </Text>

          {type === 'food' ? (
            <>
              <Label>How is it checked?</Label>
              <Tiles
                options={CHECK_MODES}
                value={auto ? 'auto' : 'hand'}
                onPick={k => setAuto(k === 'auto')}
                columns={2}
              />

              {auto ? (
                <>
                  <Label>Breaks the day when I log</Label>
                  <Tiles
                    options={FOOD_TAGS.map(t => ({
                      key: t.key,
                      label: sentence(t.label),
                    }))}
                    value={tag}
                    onPick={setTag}
                    columns={3}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {type === 'sleep' ? (
            <>
              <Label>Asleep before</Label>
              <Tiles
                options={BEDTIMES.map(b => ({ key: b, label: b }))}
                value={before}
                onPick={pickBedtime}
                columns={4}
              />
            </>
          ) : null}

          {type === 'water' ? (
            <>
              <Label>Drink at least</Label>
              <Tiles
                options={WATER_TARGETS.map(ml => ({
                  key: String(ml),
                  label: litresLabel(ml),
                }))}
                value={String(targetMl)}
                onPick={k => pickTarget(Number(k))}
                columns={4}
              />
            </>
          ) : null}

          <Label>Allowed misses</Label>
          <Tiles
            options={ALLOWANCES.map(a => ({
              key: a.key,
              label: sentence(a.label),
            }))}
            value={allowance}
            onPick={setAllowance}
            columns={2}
          />
          <View style={[styles.explainer, { backgroundColor: c.warnBg }]}>
            <Text style={S(700, 14, { lh: 19, color: c.amb })}>
              {allowanceWord(allowance)}
            </Text>
          </View>

          <BriefButton
            label={editingId ? 'Save changes' : 'Save habit'}
            onPress={() => void save()}
            tone="green"
            disabled={busy}
            accessibilityLabel={editingId ? 'Save changes' : 'Save habit'}
            style={styles.save}
          />
          {editingId ? (
            <Pressable
              onPress={confirmDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete habit"
              style={[
                styles.deleteBtn,
                { borderColor: c.hair, backgroundColor: c.card },
              ]}
            >
              <Text style={S(900, 16, { color: c.red })}>Delete habit</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A tile's look: green fill + edge when picked, the plain chunky card when not. */
function tileColors(c: Palette, on: boolean) {
  return {
    box: {
      backgroundColor: on ? c.grnTint : c.card,
      borderColor: on ? c.grnSolid : c.hair,
    },
    text: on ? c.grn : c.ink,
  };
}

/** A field label above its control — Nunito Black 16, sentence case. */
function Label({
  children,
  first,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  const c = useTheme().colors;
  return (
    <Text
      style={[
        S(900, 16, { color: c.ink }),
        styles.label,
        first ? styles.labelFirst : null,
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * One "pick one" question as a grid of equal chunky tiles, `columns` per row.
 * Rows are laid out explicitly (rather than flex-wrap with percentage widths)
 * so the gaps stay exact; a short last row is padded with empty cells so its
 * tiles keep the same width as the ones above.
 */
function Tiles<K extends string>({
  options,
  value,
  onPick,
  columns,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onPick: (key: K) => void;
  columns: number;
}) {
  const c = useTheme().colors;
  const rows: { key: K; label: string }[][] = [];
  for (let i = 0; i < options.length; i += columns) {
    rows.push(options.slice(i, i + columns));
  }
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map(o => {
            const on = value === o.key;
            const tc = tileColors(c, on);
            return (
              <Pressable
                key={o.key}
                onPress={() => onPick(o.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.label}
                style={[styles.tile, tc.box]}
              >
                <Text
                  style={S(900, 15, { color: tc.text, align: 'center' })}
                  numberOfLines={2}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
          {Array.from({ length: columns - row.length }).map((_, i) => (
            <View key={`pad${i}`} style={styles.pad} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', paddingTop: 8, paddingBottom: 48 },
  column: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    paddingHorizontal: BRIEF_GUTTER,
  },
  label: { marginTop: 22, marginBottom: 8 },
  labelFirst: { marginTop: 12 },
  input: { paddingVertical: 14 },
  grid: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  typeTile: { minHeight: 92, borderRadius: 18, gap: 6 },
  pad: { flex: 1 },
  note: { marginTop: 10 },
  explainer: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  save: { marginTop: 28 },
  deleteBtn: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
});
