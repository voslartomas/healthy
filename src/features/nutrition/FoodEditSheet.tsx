import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BriefButton, S } from '../../components/brief';
import { Slider } from '../../components/Slider';
import { useTheme } from '../../theme/theme';
import { CloseButton } from './foodFormParts';

/** The values the editor adjusts. Macros are optional on a logged entry. */
export interface EditableFood {
  name: string;
  kcal: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface EditedValues {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

type Key = keyof EditedValues;

/** Slider ranges, scaled to the food: up to 3× the logged value (so a big
 * meal can still be corrected upward), with a floor for tiny or zero values.
 * A fixed 1500 kcal range left a 56 kcal apple pinned at the far left, with
 * no room to fine-tune. Calories move in 5s, grams in 1s. */
function rangeFor(key: Key, original: number): { max: number; step: number } {
  if (key === 'kcal') {
    return {
      max: Math.max(400, Math.ceil((original * 3) / 50) * 50),
      step: 5,
    };
  }
  return { max: Math.max(40, Math.ceil((original * 3) / 10) * 10), step: 1 };
}

/** Energy the macros imply (4 kcal/g protein and carbs, 9 kcal/g fat). */
export function macroKcal(v: EditedValues): number {
  return Math.round(v.proteinG * 4 + v.carbsG * 4 + v.fatG * 9);
}

/** Scale every value by `factor` from a base, rounded to each slider's step. */
export function scaleValues(base: EditedValues, factor: number): EditedValues {
  return {
    kcal: Math.round((base.kcal * factor) / 5) * 5,
    proteinG: Math.round(base.proteinG * factor),
    carbsG: Math.round(base.carbsG * factor),
    fatG: Math.round(base.fatG * factor),
  };
}

const PORTION_MIN = 0.25;
const PORTION_MAX = 3;

/**
 * Bottom sheet to correct a logged food's calories and macros by dragging — the
 * fix for "the coach estimated it wrong" without retyping anything. Opened from
 * a "Logged: …" note in the coach chat (and from a row in "Eaten today").
 *
 * A Portion slider scales all four values together ("it was more like half");
 * each value then has its own slider for fine-tuning. Moving a single value
 * re-bases the portion so the two kinds of change compose instead of fighting.
 * Saving hands the values to `onSave` (the caller replaces the health entry);
 * the sheet shows a spinner and stays open on failure with the error. With
 * `onDelete`, a Delete link removes the entry (after a confirm) — the reliable
 * way to delete, since the small on-device model can't always tell which entry
 * "smaž ty vejce" means.
 */
export function FoodEditSheet({
  food,
  onCancel,
  onSave,
  onDelete,
}: {
  /** The entry to edit, or null when the sheet is closed. */
  food: EditableFood | null;
  onCancel: () => void;
  onSave: (values: EditedValues) => Promise<string | null>;
  /** Delete the entry; returns an error string, or null on success. */
  onDelete?: () => Promise<string | null>;
}) {
  return (
    <Modal
      visible={food != null}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      {food ? (
        <EditorBody
          key={food.name + food.kcal}
          food={food}
          onCancel={onCancel}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
    </Modal>
  );
}

function EditorBody({
  food,
  onCancel,
  onSave,
  onDelete,
}: {
  food: EditableFood;
  onCancel: () => void;
  onSave: (values: EditedValues) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
}) {
  const c = useTheme().colors;
  const original: EditedValues = {
    kcal: Math.round(food.kcal),
    proteinG: Math.round(food.proteinG ?? 0),
    carbsG: Math.round(food.carbsG ?? 0),
    fatG: Math.round(food.fatG ?? 0),
  };
  const [values, setValues] = React.useState<EditedValues>(original);
  const [portion, setPortion] = React.useState(1);
  // What the portion slider scales from; re-based when a single value moves.
  const [base, setBase] = React.useState<EditedValues>(original);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onPortion = React.useCallback(
    (p: number) => {
      setPortion(p);
      setValues(scaleValues(base, p));
    },
    [base],
  );

  const setOne = (key: Key) => (v: number) => {
    setValues(prev => ({ ...prev, [key]: v }));
    setBase(prev => ({ ...prev, [key]: portion > 0 ? v / portion : v }));
  };

  const implied = macroKcal(values);
  const mismatch =
    implied > 0 &&
    Math.abs(implied - values.kcal) > Math.max(40, values.kcal * 0.15);

  const save = async () => {
    setBusy(true);
    setError(null);
    const err = await onSave(values);
    setBusy(false);
    if (err) setError(err);
  };

  const remove = () => {
    if (!onDelete) return;
    Alert.alert('Delete entry', `Delete “${food.name}” from your food log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          const err = await onDelete();
          setBusy(false);
          if (err) setError(err);
        },
      },
    ]);
  };

  const rows: {
    key: Key;
    label: string;
    unit: string;
    fill: string;
    tint: string;
  }[] = [
    {
      key: 'kcal',
      label: 'Calories',
      unit: 'kcal',
      fill: c.food,
      tint: c.foodTint,
    },
    {
      key: 'proteinG',
      label: 'Protein',
      unit: 'g',
      fill: c.food,
      tint: c.foodTint,
    },
    {
      key: 'carbsG',
      label: 'Carbs',
      unit: 'g',
      fill: c.lift,
      tint: c.liftTint,
    },
    {
      key: 'fatG',
      label: 'Fat',
      unit: 'g',
      fill: c.streak,
      tint: c.streakTint,
    },
  ];

  return (
    <View style={styles.root}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Close editor"
      />
      <View style={[styles.sheet, { backgroundColor: c.card }]}>
        <View style={[styles.grabber, { backgroundColor: c.hair }]} />
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={S(800, 14, { color: c.fnt })}>Adjust</Text>
            <Text
              style={S(900, 22, { lh: 27, color: c.ink })}
              numberOfLines={2}
            >
              {food.name}
            </Text>
          </View>
          <CloseButton onPress={onCancel} accessibilityLabel="Cancel editing" />
        </View>

        <Text style={[S(900, 48, { lh: 54, color: c.ink }), styles.big]}>
          {values.kcal}
          <Text style={S(900, 20, { color: c.mut })}> kcal</Text>
        </Text>

        <View style={styles.row}>
          <View style={styles.rowHead}>
            <Text style={S(900, 16, { color: c.ink })}>Portion</Text>
            <Text style={S(900, 16, { color: c.foodText })}>
              {Math.round(portion * 100)}%
            </Text>
          </View>
          <Slider
            min={PORTION_MIN}
            max={PORTION_MAX}
            step={0.05}
            value={portion}
            onChange={onPortion}
            fill={c.food}
            track={c.foodTint}
            thumb={c.card}
            accessibilityLabel="Portion"
          />
        </View>

        {rows.map(r => {
          const range = rangeFor(r.key, original[r.key]);
          return (
            <View key={r.key} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={S(800, 15, { color: c.mut })}>{r.label}</Text>
                <Text style={S(900, 16, { color: c.ink })}>
                  {values[r.key]} {r.unit}
                </Text>
              </View>
              <Slider
                min={0}
                max={range.max}
                step={range.step}
                value={Math.min(values[r.key], range.max)}
                onChange={setOne(r.key)}
                fill={r.fill}
                track={r.tint}
                thumb={c.card}
                accessibilityLabel={r.label}
              />
            </View>
          );
        })}

        {implied > 0 ? (
          <View style={[styles.hint, { backgroundColor: c.soft }]}>
            <Text
              style={[S(700, 14, { lh: 19, color: c.mut }), styles.hintText]}
            >
              Macros add up to ≈ {implied} kcal
            </Text>
            {mismatch ? (
              <Pressable
                onPress={() => setOne('kcal')(Math.round(implied / 5) * 5)}
                accessibilityRole="button"
                accessibilityLabel="Match calories to macros"
                hitSlop={8}
              >
                <Text style={S(900, 14, { color: c.acc })}>Match</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <Text style={[S(700, 14, { lh: 19, color: c.red }), styles.error]}>
            {error}
          </Text>
        ) : null}

        {onDelete && !busy ? (
          <Pressable
            onPress={remove}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${food.name}`}
            hitSlop={8}
            style={styles.delete}
          >
            <Text style={S(900, 15, { color: c.red })}>Delete entry</Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <BriefButton
            label="Cancel"
            kind="outline"
            onPress={onCancel}
            style={styles.btn}
          />
          {busy ? (
            <View style={[styles.btn, styles.busy]}>
              <ActivityIndicator color={c.food} />
            </View>
          ) : (
            <BriefButton
              label="Save"
              tone="food"
              onPress={() => void save()}
              accessibilityLabel="Save food changes"
              style={styles.btn}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
    gap: 6,
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 8,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  big: { marginTop: 4, marginBottom: 4 },
  row: { marginTop: 4 },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  hintText: { flex: 1 },
  error: { marginTop: 8 },
  delete: { alignSelf: 'center', marginTop: 12, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1 },
  busy: { alignItems: 'center', justifyContent: 'center', minHeight: 56 },
});
