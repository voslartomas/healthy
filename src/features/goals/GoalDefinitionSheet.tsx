import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon, IconName } from '../../components/Icon';
import { GOAL_SOURCES, GoalSourceKey } from '../../data/goalSources';
import { ActivityOption } from '../../health';
import { createGoal } from '../../state/goalsService';
import { useHealthStore } from '../../state/useHealthStore';
import { monoFont, radii, useTheme } from '../../theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Aggregate-metric choices offered alongside the user's real activities. */
const METRIC_SOURCES: GoalSourceKey[] = ['steps', 'zone2', 'calories'];

/** Default weekly target for an activity goal (sessions/week). */
const ACTIVITY_DEFAULT_TARGET = 3;

/** What the user has selected to track — a metric, or a real activity option. */
type Selection =
  | { kind: 'metric'; source: GoalSourceKey }
  | { kind: 'activity'; option: ActivityOption };

function selectionLabel(sel: Selection): string {
  return sel.kind === 'metric'
    ? GOAL_SOURCES[sel.source].label
    : sel.option.label;
}

function selectionKey(sel: Selection): string {
  return sel.kind === 'metric'
    ? `metric:${sel.source}`
    : `activity:${sel.option.field}:${sel.option.value}`;
}

/** Heuristic icon for an activity pill so strength / core / cardio differ. */
function activityIcon(o: ActivityOption): IconName {
  const v = `${o.value} ${o.label}`.toLowerCase();
  if (/strength|weight|posil/.test(v)) return 'strength';
  if (/core|stred|střed|abs|pilates|jádr/.test(v)) return 'core';
  return 'zone2';
}

function firstSelection(options: ActivityOption[]): Selection {
  return options.length > 0
    ? { kind: 'activity', option: options[0] }
    : { kind: 'metric', source: 'steps' };
}

/**
 * Bottom sheet for defining a weekly goal (`.sheet` in the design). The picker
 * is driven by the user's REAL recent activities (last ~2 weeks, from
 * `snapshot.activityOptions`) plus a few aggregate metrics. An activity goal can
 * match on exercise type or the localized displayName and carry a minimum
 * session length; saving writes through to SQLite via {@link createGoal}.
 */
export function GoalDefinitionSheet({ visible, onClose }: Props) {
  const t = useTheme();
  const options = useHealthStore(s => s.snapshot.activityOptions);

  const [selection, setSelection] = useState<Selection>(() =>
    firstSelection(options),
  );
  const [name, setName] = useState(() =>
    selectionLabel(firstSelection(options)),
  );
  const [target, setTarget] = useState('');
  const [minMinutes, setMinMinutes] = useState('');

  // Reset the form when the sheet transitions to open. This uses React's
  // "adjust state while rendering" pattern rather than an effect, so there is
  // no extra render pass. See https://react.dev/learn/you-might-not-need-an-effect
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const initial = firstSelection(options);
      setSelection(initial);
      setName(selectionLabel(initial));
      setTarget('');
      setMinMinutes('');
    }
  }

  function pick(sel: Selection) {
    setSelection(sel);
    setName(selectionLabel(sel));
  }

  const isActivity = selection.kind === 'activity';
  const defaultTarget = isActivity
    ? ACTIVITY_DEFAULT_TARGET
    : GOAL_SOURCES[selection.source].defaultTarget;

  async function save() {
    const parsed = parseInt(target, 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultTarget;
    const finalName = name.trim() || selectionLabel(selection);
    if (selection.kind === 'metric') {
      await createGoal({
        source: selection.source,
        name: finalName,
        target: value,
      });
    } else {
      const mins = parseInt(minMinutes, 10);
      await createGoal({
        match: {
          field: selection.option.field,
          value: selection.option.value,
        },
        minDurationMin: Number.isFinite(mins) && mins > 0 ? mins : undefined,
        name: finalName,
        target: value,
      });
    }
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: 'rgba(21,27,36,0.44)' }]}
        onPress={onClose}
        accessibilityLabel="Dismiss"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { backgroundColor: t.colors.surface }]}>
          <View
            style={[styles.grabber, { backgroundColor: t.colors.border }]}
          />
          <Text style={[styles.title, { color: t.colors.fg }]}>
            Define a weekly goal
          </Text>
          <Text style={[styles.sub, { color: t.colors.muted }]}>
            Pick what to track — progress fills in automatically from your steps
            and logged activities.
          </Text>

          <Text style={[styles.label, { color: t.colors.muted }]}>
            Your activities · last 2 weeks
          </Text>
          {options.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.sourceRow}
            >
              {options.map(o => {
                const key = `activity:${o.field}:${o.value}`;
                const selected = selectionKey(selection) === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => pick({ kind: 'activity', option: o })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[
                      styles.sourcePill,
                      {
                        backgroundColor: selected
                          ? t.colors.accentSoft
                          : t.colors.surface2,
                        borderColor: selected
                          ? t.colors.accent
                          : t.colors.border,
                      },
                    ]}
                  >
                    <Icon
                      name={activityIcon(o)}
                      size={16}
                      color={selected ? t.colors.accent : t.colors.muted}
                    />
                    <Text
                      style={[
                        styles.sourcePillText,
                        { color: selected ? t.colors.accent : t.colors.fg },
                      ]}
                    >
                      {o.label}
                    </Text>
                    <Text style={[styles.pillCount, { color: t.colors.faint }]}>
                      {o.count}×
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={[styles.hint, { color: t.colors.faint }]}>
              No recent workouts found. Connect Google Health or record an
              activity and it will show up here.
            </Text>
          )}

          <Text
            style={[styles.label, styles.labelGap, { color: t.colors.muted }]}
          >
            Or a metric
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sourceRow}
          >
            {METRIC_SOURCES.map(key => {
              const selected =
                selection.kind === 'metric' && selection.source === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => pick({ kind: 'metric', source: key })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.sourcePill,
                    {
                      backgroundColor: selected
                        ? t.colors.accentSoft
                        : t.colors.surface2,
                      borderColor: selected ? t.colors.accent : t.colors.border,
                    },
                  ]}
                >
                  <Icon
                    name={GOAL_SOURCES[key].icon}
                    size={16}
                    color={selected ? t.colors.accent : t.colors.muted}
                  />
                  <Text
                    style={[
                      styles.sourcePillText,
                      { color: selected ? t.colors.accent : t.colors.fg },
                    ]}
                  >
                    {GOAL_SOURCES[key].label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.fieldRow}>
            <View style={{ flex: 2 }}>
              <Text style={[styles.label, { color: t.colors.muted }]}>
                Goal name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={selectionLabel(selection)}
                placeholderTextColor={t.colors.faint}
                style={[
                  styles.input,
                  {
                    color: t.colors.fg,
                    backgroundColor: t.colors.surface2,
                    borderColor: t.colors.border,
                  },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: t.colors.muted }]}>
                {isActivity ? 'Per week' : 'Target'}
              </Text>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                placeholder={String(defaultTarget)}
                placeholderTextColor={t.colors.faint}
                style={[
                  styles.input,
                  {
                    color: t.colors.fg,
                    backgroundColor: t.colors.surface2,
                    borderColor: t.colors.border,
                  },
                ]}
              />
            </View>
          </View>

          {isActivity ? (
            <View style={styles.minRow}>
              <Text style={[styles.label, { color: t.colors.muted }]}>
                Minimum session length
              </Text>
              <TextInput
                value={minMinutes}
                onChangeText={setMinMinutes}
                keyboardType="number-pad"
                placeholder="Any length (minutes)"
                placeholderTextColor={t.colors.faint}
                style={[
                  styles.input,
                  {
                    color: t.colors.fg,
                    backgroundColor: t.colors.surface2,
                    borderColor: t.colors.border,
                  },
                ]}
              />
              <Text style={[styles.hint, { color: t.colors.faint }]}>
                Only sessions at least this many minutes count. Leave empty to
                count every session.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.btn, { backgroundColor: t.colors.surface2 }]}
            >
              <Text style={[styles.btnText, { color: t.colors.fg }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={save}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: t.colors.accent }]}
            >
              <Text style={[styles.btnText, { color: t.colors.onAccent }]}>
                Add goal
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },
  grabber: {
    width: 38,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sub: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 18,
  },
  label: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sourceRow: {
    gap: 8,
    paddingBottom: 4,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: radii.md,
    borderWidth: 1.5,
  },
  sourcePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pillCount: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
  },
  labelGap: {
    marginTop: 16,
  },
  hint: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 8,
  },
  minRow: {
    marginTop: 14,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
