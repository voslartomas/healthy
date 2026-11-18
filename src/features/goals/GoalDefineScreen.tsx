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
import {
  BRIEF_GUTTER,
  BRIEF_MAX_WIDTH,
  BriefButton,
  inputStyle,
  S,
} from '../../components/brief';
import {
  ENERGY_METRICS,
  GOAL_SOURCES,
  GoalSourceKey,
} from '../../data/goalSources';
import { ActivityOption } from '../../health';
import { createGoal } from '../../state/goalsService';
import { useHealthStore } from '../../state/useHealthStore';
import { Palette } from '../../theme/colors';
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
 * Define a weekly goal, presented as a native modal screen (header + close come
 * from RootStack). The picker is driven by the user's REAL recent activities
 * (last ~2 weeks, from `snapshot.activityOptions`, each with how often it was
 * done) plus a few aggregate metrics; saving writes through to SQLite via
 * {@link createGoal}.
 *
 * Layout per the friendly "GoalDefine" artboard: activities as full-width rows,
 * "or a number" as a two-column grid of tiles, then the name / target / minimum
 * length fields and one blue "Add goal" slab.
 */
export function GoalDefineScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
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

  const field = [inputStyle(c), S(800, 17, { color: c.ink }), styles.input];

  // "Or a number": the aggregate metrics plus the calorie deficit, as tiles.
  const metricTiles: { key: string; label: string; sel: Selection }[] = [
    ...METRIC_SOURCES.map(source => ({
      key: `metric:${source}`,
      label: GOAL_SOURCES[source].label,
      sel: { kind: 'metric', source } as Selection,
    })),
    {
      key: 'deficit',
      label: ENERGY_METRICS.deficit.label,
      sel: { kind: 'deficit' },
    },
  ];
  const metricRows = [metricTiles.slice(0, 2), metricTiles.slice(2, 4)];
  const selected = selectionKey(selection);

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
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            Tracked automatically from your steps and workouts.
          </Text>

          {options.length > 0 ? (
            <>
              <Label>Your activities</Label>
              <View style={styles.list}>
                {options.map(o => {
                  const key = `activity:${o.field}:${o.value}`;
                  const on = selected === key;
                  const tc = tileColors(c, on);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => pick({ kind: 'activity', option: o })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${o.label}, ${o.count} times lately`}
                      style={[styles.tile, styles.actTile, tc.box]}
                    >
                      <Text
                        style={[S(900, 16, { color: tc.text }), styles.actName]}
                        numberOfLines={1}
                      >
                        {o.label}
                      </Text>
                      <Text style={S(800, 14, { color: c.mut })}>
                        {`${o.count}× lately`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Label>{options.length > 0 ? 'Or a number' : 'Pick a number'}</Label>
          <View style={styles.list}>
            {metricRows.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map(m => {
                  const on = selected === m.key;
                  const tc = tileColors(c, on);
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => pick(m.sel)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={m.label}
                      style={[styles.tile, styles.metricTile, tc.box]}
                    >
                      <Text
                        style={S(900, 15, { color: tc.text, align: 'center' })}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {selection.kind === 'deficit' ? (
            <View style={[styles.hint, { backgroundColor: c.accTint }]}>
              <Text style={S(700, 14, { lh: 19, color: c.acc })}>
                Weekly average of your daily deficit (burned − eaten), over days
                with both food logged and energy burned. The target is kcal per
                day.
              </Text>
            </View>
          ) : null}

          <Label>Name</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={selectionLabel(selection)}
            placeholderTextColor={c.fnt}
            accessibilityLabel="Goal name"
            style={field}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Label>
                {selection.kind === 'deficit'
                  ? 'Target / day'
                  : 'Target / week'}
              </Label>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                placeholder={String(defaultTarget)}
                placeholderTextColor={c.fnt}
                accessibilityLabel="Goal target"
                style={field}
              />
            </View>
            {isActivity ? (
              <View style={styles.half}>
                <Label>Min. length (min)</Label>
                <TextInput
                  value={minMinutes}
                  onChangeText={setMinMinutes}
                  keyboardType="number-pad"
                  placeholder="Any length"
                  placeholderTextColor={c.fnt}
                  accessibilityLabel="Minimum session length in minutes"
                  style={field}
                />
              </View>
            ) : (
              <View style={styles.half} />
            )}
          </View>

          <BriefButton
            label="Add goal"
            onPress={() => void save()}
            accessibilityLabel="Add goal"
            style={styles.add}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A choice tile's look: blue tint + edge when picked, the plain card when not. */
function tileColors(c: Palette, on: boolean) {
  return {
    box: {
      backgroundColor: on ? c.accTint : c.card,
      borderColor: on ? c.accSolid : c.hair,
    },
    text: on ? c.acc : c.ink,
  };
}

/** A field label above its control — Nunito Black 16, sentence case. */
function Label({ children }: { children: React.ReactNode }) {
  const c = useTheme().colors;
  return (
    <Text style={[S(900, 16, { color: c.ink }), styles.label]}>{children}</Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { alignItems: 'center', paddingTop: 12, paddingBottom: 48 },
  column: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    paddingHorizontal: BRIEF_GUTTER,
  },
  label: { marginTop: 20, marginBottom: 8 },
  list: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  tile: {
    borderRadius: 16,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  actTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actName: { flex: 1, minWidth: 0 },
  metricTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  hint: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  input: { paddingVertical: 13 },
  add: { marginTop: 28 },
});
