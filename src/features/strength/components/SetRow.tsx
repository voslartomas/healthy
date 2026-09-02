import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { M } from '../../../components/brief';
import { useTheme } from '../../../theme/theme';

/**
 * A labelled +/- stepper for one numeric field (weight or reps) during a run.
 * Value formatting and step size are the caller's; this only renders and fires
 * the deltas. Long labels/units keep the mono, uppercase brief vocabulary.
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
  const t = useTheme();
  const c = t.colors;
  return (
    <View style={styles.field}>
      <Text style={[M(700, 10, { ls: 1.4, color: c.fnt }), styles.label]}>
        {label}
      </Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onDelta(-step)}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${accessibilityPrefix}`}
          style={[styles.pm, { borderColor: c.hair }]}
        >
          <Text style={M(700, 20, { color: c.ink })}>−</Text>
        </Pressable>
        <View style={styles.readout}>
          <Text style={M(700, 26, { ls: -0.2, color: c.ink })}>
            {value}
            {unit ? (
              <Text style={M(700, 13, { color: c.fnt })}> {unit}</Text>
            ) : null}
          </Text>
        </View>
        <Pressable
          onPress={() => onDelta(step)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${accessibilityPrefix}`}
          style={[styles.pm, { borderColor: c.hair }]}
        >
          <Text style={M(700, 20, { color: c.ink })}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The two-stepper row for the set in progress: weight (hidden for bodyweight
 * movements) + reps. `weightKg` null ⇒ bodyweight, so only reps show.
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
          unit="KG"
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
  row: { flexDirection: 'row', gap: 14, marginTop: 16 },
  field: { flex: 1, minWidth: 0 },
  label: { marginBottom: 8, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pm: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: { flex: 1, alignItems: 'center' },
});
