/**
 * Small form pieces shared by the Food screen's inline forms (log food, save /
 * edit a common food) and the meal builder, drawn to the friendly LogFood and
 * MealLogger artboards (ADR-007): bold field labels over soft input wells,
 * chunky pick-one / pick-many tiles in the area's tone, and the round soft
 * close button the artboards put in a form's title row.
 *
 * They live here rather than in `components/brief.tsx` because only the food
 * flows use them; if another area grows the same controls, promote them.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';

import { inputStyle, S, toneColors, Tone } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { Palette } from '../../theme/colors';
import { useTheme } from '../../theme/theme';

/** A text field's style: the brief's soft well + the friendly input type. */
export function fieldStyle(c: Palette, size = 17): TextStyle[] {
  return [inputStyle(c), S(800, size, { color: c.ink })];
}

/** A bold field label, with an optional softer hint after it. */
export function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  const c = useTheme().colors;
  return (
    <Text style={S(900, 16, { color: c.ink })}>
      {children}
      {hint ? <Text style={S(800, 14, { color: c.fnt })}> {hint}</Text> : null}
    </Text>
  );
}

/**
 * A chunky tile for a pick-one (`radio`) or pick-many (`checkbox`) choice:
 * white with a hair outline when off, tinted with the tone's solid outline when
 * on — the MealLogger meal-type row and the LogFood "treat" tags.
 */
export function ChoiceTile({
  label,
  on,
  onPress,
  role,
  accessibilityLabel,
  tone = 'food',
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  role: 'radio' | 'checkbox';
  accessibilityLabel: string;
  tone?: Tone;
}) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected: on } : { checked: on }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.tile,
        {
          backgroundColor: on ? tc.tint : c.card,
          borderColor: on ? tc.solid : c.hair,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={S(900, 14, { color: on ? tc.text : c.ink })}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The round soft × button in a form or sheet's title row (44px target). */
export function CloseButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const c = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.close, { backgroundColor: c.soft }]}
    >
      <Icon name="close" size={20} color={c.ink} strokeWidth={2.8} />
    </Pressable>
  );
}

/**
 * The optional protein / carbs / fat (grams) inputs, each under a small label
 * in its macro's colour — the same colours the Macros card's bars use.
 */
export function MacroFields({
  protein,
  carbs,
  fat,
  onProtein,
  onCarbs,
  onFat,
}: {
  protein: string;
  carbs: string;
  fat: string;
  onProtein: (s: string) => void;
  onCarbs: (s: string) => void;
  onFat: (s: string) => void;
}) {
  const c = useTheme().colors;
  const fields = [
    { label: 'Protein', color: c.foodText, value: protein, set: onProtein },
    { label: 'Carbs', color: c.liftText, value: carbs, set: onCarbs },
    { label: 'Fat', color: c.streakText, value: fat, set: onFat },
  ];
  return (
    <View style={styles.group}>
      <FieldLabel hint="optional, grams">Macros</FieldLabel>
      <View style={styles.macroRow}>
        {fields.map(f => (
          <View key={f.label} style={styles.macroCol}>
            <Text style={S(900, 13, { color: f.color })}>{f.label}</Text>
            <TextInput
              value={f.value}
              onChangeText={f.set}
              placeholder="0"
              placeholderTextColor={c.fnt}
              keyboardType="number-pad"
              accessibilityLabel={`${f.label} grams`}
              style={[fieldStyle(c, 18), styles.macroInput]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

export const formStyles = StyleSheet.create({
  /** A label + its control. */
  group: { gap: 8 },
  /** A row of equal-width tiles. */
  tileRow: { flexDirection: 'row', gap: 8 },
  /** A form card's title row: title left, close button right. */
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});

const styles = StyleSheet.create({
  group: formStyles.group,
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroCol: { flex: 1, minWidth: 0, gap: 4 },
  macroInput: { minWidth: 0 },
});
