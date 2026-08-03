import React, { useState } from 'react';
import {
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
import { BRIEF_MAX_WIDTH, M, S } from '../../components/brief';
import {
  ENERGY_METRICS,
  GOAL_SOURCES,
  GoalSourceKey,
} from '../../data/goalSources';
import { ActivityOption } from '../../health';
import { createGoal } from '../../state/goalsService';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** Aggregate-metric choices offered alongside the user's real activities. */
const METRIC_SOURCES: GoalSourceKey[] = ['steps', 'zone2', 'calories'];

/** Default weekly target for an activity goal (sessions/week). */
const ACTIVITY_DEFAULT_TARGET = 3;

type Selection =
  | { kind: 'metric'; source: GoalSourceKey }
  | { kind: 'activity'; option: ActivityOption }
  | { kind: 'deficit' };

function selectionLabel(sel: Selection): string {
  if (sel.kind === 'metric') return GOAL_SOURCES[sel.source].label;
  if (sel.kind === 'deficit') return ENERGY_METRICS.deficit.label;
  return sel.option.label;
}

function selectionKey(sel: Selection): string {
  if (sel.kind === 'metric') return `metric:${sel.source}`;
  if (sel.kind === 'deficit') return 'deficit';
  return `activity:${sel.option.field}:${sel.option.value}`;
}

function firstSelection(options: ActivityOption[]): Selection {
  return options.length > 0
    ? { kind: 'activity', option: options[0] }
    : { kind: 'metric', source: 'steps' };
}

/**
 * Define a weekly goal, presented as a native modal screen. The picker is driven
 * by the user's REAL recent activities (last ~2 weeks, from
 * `snapshot.activityOptions`) plus a few aggregate metrics; saving writes through
 * to SQLite via {@link createGoal}.
 */
export function GoalDefineScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const options = useHealthStore(s => s.snapshot.activityOptions);

  const [selection, setSelection] = useState<Selection>(() =>
    firstSelection(options),
  );
  const [name, setName] = useState(() =>
    selectionLabel(firstSelection(options)),
  );
  const [target, setTarget] = useState('');
  const [minMinutes, setMinMinutes] = useState('');

  function pick(sel: Selection) {
    setSelection(sel);
    setName(selectionLabel(sel));
  }

  const isActivity = selection.kind === 'activity';
  const defaultTarget =
    selection.kind === 'metric'
      ? GOAL_SOURCES[selection.source].defaultTarget
      : selection.kind === 'deficit'
        ? ENERGY_METRICS.deficit.defaultTarget
        : ACTIVITY_DEFAULT_TARGET;

  async function save() {
    const parsed = parseInt(target, 10);
    const value =
      Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTarget;
    const finalName = (name.trim() || selectionLabel(selection)).toUpperCase();
    if (selection.kind === 'metric') {
      await createGoal({
        source: selection.source,
        name: finalName,
        target: value,
      });
    } else if (selection.kind === 'deficit') {
      await createGoal({ metric: 'deficit', name: finalName, target: value });
    } else {
      const mins = parseInt(minMinutes, 10);
      await createGoal({
        match: { field: selection.option.field, value: selection.option.value },
        minDurationMin: Number.isFinite(mins) && mins > 0 ? mins : undefined,
        name: finalName,
        target: value,
      });
    }
    navigation.goBack();
  }

  const pillStyle = (on: boolean) => [
    styles.pill,
    {
      borderColor: on ? c.ink : c.hair,
      backgroundColor: on ? c.ink : 'transparent',
    },
  ];
  const pillText = (on: boolean) =>
    M(700, 10.5, { ls: 0.6, color: on ? c.inv : c.mut });

  const input = {
    ...S(600, 14, { color: c.ink }),
    borderWidth: 1,
    borderColor: c.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  } as const;

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
          <Text style={[M(600, 10.5, { color: c.fnt }), styles.sub]}>
            AUTO-TRACKED FROM STEPS &amp; ACTIVITIES
          </Text>

          {options.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {options.map(o => {
                const key = `activity:${o.field}:${o.value}`;
                const on = selectionKey(selection) === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => pick({ kind: 'activity', option: o })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={pillStyle(on)}
                  >
                    <Text style={pillText(on)}>
                      {o.label.toUpperCase()}
                      <Text style={{ color: on ? c.inv : c.fnt }}>
                        {' '}
                        {o.count}×
                      </Text>
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillRow}
          >
            {METRIC_SOURCES.map(key => {
              const on =
                selection.kind === 'metric' && selection.source === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => pick({ kind: 'metric', source: key })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={pillStyle(on)}
                >
                  <Text style={pillText(on)}>
                    {GOAL_SOURCES[key].label.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              key="deficit"
              onPress={() => pick({ kind: 'deficit' })}
              accessibilityRole="radio"
              accessibilityState={{ selected: selection.kind === 'deficit' }}
              style={pillStyle(selection.kind === 'deficit')}
            >
              <Text style={pillText(selection.kind === 'deficit')}>
                {ENERGY_METRICS.deficit.label.toUpperCase()}
              </Text>
            </Pressable>
          </ScrollView>

          {selection.kind === 'deficit' ? (
            <Text style={[S(600, 12, { color: c.mut }), styles.hint]}>
              Weekly average of daily deficit (burned − eaten), over days with
              both food logged and energy burned. Target is avg kcal/day.
            </Text>
          ) : null}

          <View style={styles.fieldRow}>
            <View style={styles.nameCol}>
              <Text
                style={[
                  M(700, 10, { ls: 1.6, color: c.fnt }),
                  styles.fieldLabel,
                ]}
              >
                NAME
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={selectionLabel(selection)}
                placeholderTextColor={c.fnt}
                style={input}
              />
            </View>
            <View style={styles.targetCol}>
              <Text
                style={[
                  M(700, 10, { ls: 1.6, color: c.fnt }),
                  styles.fieldLabel,
                ]}
              >
                TARGET
              </Text>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                placeholder={String(defaultTarget)}
                placeholderTextColor={c.fnt}
                style={[input, { fontFamily: M(600, 14).fontFamily }]}
              />
            </View>
          </View>

          {isActivity ? (
            <View style={styles.minRow}>
              <Text
                style={[
                  M(700, 10, { ls: 1.6, color: c.fnt }),
                  styles.fieldLabel,
                ]}
              >
                MIN SESSION LENGTH (MIN)
              </Text>
              <TextInput
                value={minMinutes}
                onChangeText={setMinMinutes}
                keyboardType="number-pad"
                placeholder="Any length"
                placeholderTextColor={c.fnt}
                style={input}
              />
            </View>
          ) : null}

          <Pressable
            onPress={save}
            accessibilityRole="button"
            accessibilityLabel="Add goal"
            style={[styles.addBtn, { backgroundColor: c.ink }]}
          >
            <Text style={M(700, 12, { ls: 1, color: c.inv })}>ADD GOAL</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', paddingVertical: 20 },
  column: { width: '100%', maxWidth: BRIEF_MAX_WIDTH, paddingHorizontal: 24 },
  sub: {},
  hint: { marginTop: 2, marginBottom: 4, lineHeight: 17 },
  pillRow: { gap: 8, paddingVertical: 16 },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  fieldRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  nameCol: { flex: 2, minWidth: 0 },
  targetCol: { flex: 1, minWidth: 0 },
  fieldLabel: { marginBottom: 8 },
  minRow: { marginTop: 14 },
  addBtn: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 22,
  },
});
