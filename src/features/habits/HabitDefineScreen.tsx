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
import { BRIEF_GUTTER, BRIEF_MAX_WIDTH, M, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { FOOD_TAGS, FoodTagKey } from '../../state/foodTags';
import {
  ALLOWANCES,
  allowanceWord,
  BEDTIMES,
  HABIT_TYPES,
  HabitAllowance,
  HabitType,
} from '../../state/habits';
import { createHabit, editHabit, removeHabit } from '../../state/habitsService';
import { useHabitsStore } from '../../state/useHabitsStore';
import { useTheme } from '../../theme/theme';

/** The explainer under the "how it's checked" row, which depends on both the
 * kind of habit and (for food) whether the user let the log decide. */
function checkNote(type: HabitType, auto: boolean): string {
  if (type === 'sleep') return HABIT_TYPES[1].note;
  if (type === 'other') return HABIT_TYPES[2].note;
  return auto
    ? HABIT_TYPES[0].note
    : 'YOU CHECK IT OFF — YESTERDAY STAYS EDITABLE UNTIL NOON';
}

/**
 * Create or edit a daily habit, presented as a native modal sheet.
 *
 * Pushed with `{ habitId }` to edit an existing habit — editing keeps the id, so
 * the habit's streak and 12-week history survive a rename or a change of
 * allowance.
 */
export function HabitDefineScreen({ navigation, route }: ScreenProps) {
  const c = useTheme().colors;
  const editingId = route?.params?.habitId ?? null;
  const existing = useHabitsStore(s =>
    editingId ? (s.habits.find(h => h.id === editingId) ?? null) : null,
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<HabitType>(existing?.type ?? 'food');
  const [auto, setAuto] = useState(existing?.auto ?? true);
  const [allowance, setAllowance] = useState<HabitAllowance>(
    existing?.allowance ?? 'week',
  );
  const [tag, setTag] = useState<FoodTagKey>(existing?.tag ?? 'junk');
  const [before, setBefore] = useState<string>(existing?.before ?? '23:00');
  const [busy, setBusy] = useState(false);

  function pickType(next: HabitType) {
    setType(next);
    // Sleep is always read from the night's data; "other" is always by hand.
    if (next === 'sleep') setAuto(true);
    if (next === 'other') setAuto(false);
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
      name.trim() || (type === 'sleep' ? `Asleep before ${before}` : '');
    if (!finalName) {
      Alert.alert(
        'Name your habit',
        'Give the habit a name, e.g. “No junk food”.',
      );
      return;
    }
    setBusy(true);
    const input = { name: finalName, type, auto, allowance, tag, before };
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

  const seg = (on: boolean) => [
    styles.seg,
    {
      borderColor: on ? c.accSolid : c.hair,
      backgroundColor: on ? c.accSolid : 'transparent',
    },
  ];
  const pill = (on: boolean) => [
    styles.pill,
    {
      borderColor: on ? c.accSolid : c.hair,
      backgroundColor: on ? c.accSolid : 'transparent',
    },
  ];
  const onLabel = (on: boolean) => (on ? c.onAccent : c.mut);
  const label = (text: string) => (
    <Text style={[M(700, 10, { ls: 1.6, color: c.fnt }), styles.label]}>
      {text}
    </Text>
  );

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
          {label('NAME')}
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. No junk food"
            placeholderTextColor={c.fnt}
            accessibilityLabel="Habit name"
            style={[
              S(600, 14, { color: c.ink }),
              styles.input,
              { borderColor: c.hair, backgroundColor: c.bg },
            ]}
          />

          {label('TYPE')}
          <View style={styles.row}>
            {HABIT_TYPES.map(t => {
              const on = type === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => pickType(t.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={seg(on)}
                >
                  <Text style={M(700, 10, { ls: 0.8, color: onLabel(on) })}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {type === 'food' ? (
            <>
              {label("HOW IT'S CHECKED")}
              <View style={styles.row}>
                <Pressable
                  onPress={() => setAuto(true)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: auto }}
                  style={seg(auto)}
                >
                  <Text style={M(700, 10, { ls: 0.8, color: onLabel(auto) })}>
                    AUTO FROM MY LOG
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setAuto(false)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: !auto }}
                  style={seg(!auto)}
                >
                  <Text style={M(700, 10, { ls: 0.8, color: onLabel(!auto) })}>
                    BY HAND
                  </Text>
                </Pressable>
              </View>

              {auto ? (
                <>
                  {label('BREAKS THE DAY WHEN I LOG')}
                  <View style={styles.wrapRow}>
                    {FOOD_TAGS.map(t => {
                      const on = tag === t.key;
                      return (
                        <Pressable
                          key={t.key}
                          onPress={() => setTag(t.key)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={pill(on)}
                        >
                          <Text
                            style={M(700, 10, { ls: 0.8, color: onLabel(on) })}
                          >
                            {t.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          {type === 'sleep' ? (
            <>
              {label('ASLEEP BEFORE')}
              <View style={styles.wrapRow}>
                {BEDTIMES.map(b => {
                  const on = before === b;
                  return (
                    <Pressable
                      key={b}
                      onPress={() => pickBedtime(b)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={pill(on)}
                    >
                      <Text style={M(700, 11, { ls: 0.8, color: onLabel(on) })}>
                        {b}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={[M(600, 9.5, { ls: 0.6, color: c.fnt }), styles.note]}>
            {checkNote(type, auto)}
          </Text>

          {label('ALLOWED MISSES')}
          <View style={styles.wrapRow}>
            {ALLOWANCES.map(a => {
              const on = allowance === a.key;
              return (
                <Pressable
                  key={a.key}
                  onPress={() => setAllowance(a.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={pill(on)}
                >
                  <Text style={M(700, 10, { ls: 0.8, color: onLabel(on) })}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View
            style={[
              styles.explainer,
              { backgroundColor: c.pillBg, borderColor: c.hair },
            ]}
          >
            <Icon name="check" size={16} color={c.grn} strokeWidth={2.2} />
            <Text
              style={[
                S(600, 12, { lh: 17, color: c.ink }),
                styles.explainerText,
              ]}
            >
              {allowanceWord(allowance)}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={save}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={editingId ? 'Save changes' : 'Save habit'}
              style={[
                styles.saveBtn,
                { backgroundColor: c.ink, opacity: busy ? 0.5 : 1 },
              ]}
            >
              <Text style={M(700, 11, { ls: 1, color: c.inv })}>
                {editingId ? 'SAVE CHANGES' : 'SAVE HABIT'}
              </Text>
            </Pressable>
            {editingId ? (
              <Pressable
                onPress={confirmDelete}
                accessibilityRole="button"
                accessibilityLabel="Delete habit"
                style={[styles.deleteBtn, { borderColor: c.hair }]}
              >
                <Text style={M(700, 11, { ls: 1, color: c.red })}>DELETE</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', paddingVertical: 20, paddingBottom: 48 },
  column: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    paddingHorizontal: BRIEF_GUTTER,
  },
  label: { marginTop: 18, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  note: { marginTop: 10, lineHeight: 15 },
  explainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  explainerText: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 15,
  },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
});
