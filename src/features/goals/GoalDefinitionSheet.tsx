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

import { Icon } from '../../components/Icon';
import {
  GOAL_SOURCE_ORDER,
  GOAL_SOURCES,
  GoalSourceKey,
} from '../../data/goalSources';
import { createGoal } from '../../state/goalsService';
import { monoFont, radii, useTheme } from '../../theme/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet for defining a weekly goal (`.sheet` in the design). Picking a
 * source pre-fills the name and target placeholder; saving writes through to
 * SQLite via {@link createGoal}.
 */
export function GoalDefinitionSheet({ visible, onClose }: Props) {
  const t = useTheme();
  const [source, setSource] = useState<GoalSourceKey>('strength');
  const [name, setName] = useState(GOAL_SOURCES.strength.label);
  const [target, setTarget] = useState('');

  // Reset the form when the sheet transitions to open. This uses React's
  // "adjust state while rendering" pattern rather than an effect, so there is
  // no extra render pass. See https://react.dev/learn/you-might-not-need-an-effect
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSource('strength');
      setName(GOAL_SOURCES.strength.label);
      setTarget('');
    }
  }

  function pickSource(key: GoalSourceKey) {
    setSource(key);
    setName(GOAL_SOURCES[key].label);
  }

  async function save() {
    const src = GOAL_SOURCES[source];
    const parsed = parseInt(target, 10);
    const value =
      Number.isFinite(parsed) && parsed > 0 ? parsed : src.defaultTarget;
    await createGoal({ source, name: name.trim() || src.label, target: value });
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

          <Text style={[styles.label, { color: t.colors.muted }]}>Track</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sourceRow}
          >
            {GOAL_SOURCE_ORDER.map(key => {
              const selected = key === source;
              return (
                <Pressable
                  key={key}
                  onPress={() => pickSource(key)}
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
                placeholder={GOAL_SOURCES[source].label}
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
                Target
              </Text>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="number-pad"
                placeholder={String(GOAL_SOURCES[source].defaultTarget)}
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
