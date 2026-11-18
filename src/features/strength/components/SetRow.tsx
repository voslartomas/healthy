import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { chunky, S } from '../../../components/brief';
import { useTheme } from '../../../theme/theme';

/**
 * A labelled +/- stepper tile for one numeric field (weight or reps) during a
 * run: the design's chunky card with a small label, the big number, and two
 * chunky −/+ keys under it (52×48, comfortably over the 44px touch floor —
 * these get hit mid-set with sweaty hands). Value formatting and step size are
 * the caller's; this only renders and fires the deltas.
 */
export function Stepper({
  label,
  value,
  unit,
  onDelta,
  step,
  accessibilityPrefix,
}: {
  label: string;
  value: string;
  unit?: string;
  onDelta: (delta: number) => void;
  step: number;
  accessibilityPrefix: string;
}) {
  const c = useTheme().colors;
  const key = [styles.key, chunky(c, 14)];
  return (
    <View style={[styles.field, chunky(c, 20)]}>
      <Text style={S(900, 13, { color: c.fnt })}>{label}</Text>
      <Text style={S(900, 34, { lh: 38, color: c.ink })}>
        {value}
        {unit ? (
          <Text style={S(900, 16, { color: c.fnt })}> {unit}</Text>
        ) : null}
      </Text>
      <View style={styles.keys}>
        <Pressable
          onPress={() => onDelta(-step)}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${accessibilityPrefix}`}
          style={key}
        >
          <Text style={S(900, 22, { color: c.ink })}>−</Text>
        </Pressable>
        <Pressable
          onPress={() => onDelta(step)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${accessibilityPrefix}`}
          style={key}
        >
          <Text style={S(900, 22, { color: c.ink })}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The two-tile row for the set in progress: weight (hidden for bodyweight
 * movements) + reps. `weightKg` null ⇒ bodyweight, so the reps tile takes the
 * whole row.
 */
export function SetRow({
  weightKg,
  reps,
  weightStep = 0.5,
  onAdjustWeight,
  onAdjustReps,
}: {
  weightKg: number | null;
  reps: number;
  weightStep?: number;
  onAdjustWeight: (delta: number) => void;
  onAdjustReps: (delta: number) => void;
}) {
  return (
    <View style={styles.row}>
      {weightKg != null ? (
        <Stepper
          label="WEIGHT"
          value={formatKg(weightKg)}
          unit="kg"
          step={weightStep}
          onDelta={onAdjustWeight}
          accessibilityPrefix="weight"
        />
      ) : null}
      <Stepper
        label="REPS"
        value={String(reps)}
        step={1}
        onDelta={onAdjustReps}
        accessibilityPrefix="reps"
      />
    </View>
  );
}

/** Trim a trailing `.0` so whole-kg loads read "20" not "20.0". */
export function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  field: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  keys: { flexDirection: 'row', gap: 10 },
  key: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
