import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { M, S } from '../../components/brief';
import { healthSourceName } from '../../health';
import { logMeal, MealItem } from '../../state/mealLogService';
import {
  CommonFood,
  useCommonFoodsStore,
} from '../../state/useCommonFoodsStore';
import { useTheme } from '../../theme/theme';
import { PortionSheet } from './PortionSheet';

/** The four standard meal buckets, matching the coach + Health Connect labels. */
const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;

/** Guess the meal from the time of day so the common case needs no tap. */
function defaultMealType(): (typeof MEAL_TYPES)[number] {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'BREAKFAST';
  if (h >= 11 && h < 16) return 'LUNCH';
  if (h >= 16 && h < 21) return 'DINNER';
  return 'SNACK';
}

/** A draft food line: a loggable item plus a stable key for the list. */
interface DraftItem extends MealItem {
  key: string;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Parse an optional non-negative grams field; undefined when blank/invalid. */
function parseMacro(s: string): number | undefined {
  const n = parseInt(s, 10);
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Build a meal from several foods and log it in one go. The user picks a meal
 * type (breakfast/lunch/…), then fills a draft list by tapping their common
 * foods and/or typing items, and finally logs them all at once — each food
 * becomes its own entry sharing that meal type + timestamp (see
 * {@link logMeal}). `onDone` fires after a successful log so the host can close.
 */
export function MealLogger({ onDone }: { onDone?: () => void }) {
  const t = useTheme();
  const c = t.colors;
  const commonFoods = useCommonFoodsStore(s => s.foods);

  const [mealType, setMealType] =
    React.useState<(typeof MEAL_TYPES)[number]>(defaultMealType);
  const [items, setItems] = React.useState<DraftItem[]>([]);
  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const [protein, setProtein] = React.useState('');
  const [carbs, setCarbs] = React.useState('');
  const [fat, setFat] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const keyRef = React.useRef(0);

  const pushItem = (it: MealItem) => {
    keyRef.current += 1;
    setItems(prev => [...prev, { ...it, key: `d${keyRef.current}` }]);
  };

  // The common food whose portion is being chosen (null = picker closed).
  const [portionFood, setPortionFood] = React.useState<CommonFood | null>(null);

  const addManual = () => {
    const k = parseInt(kcal, 10);
    if (!name.trim() || !Number.isFinite(k) || k <= 0) {
      Alert.alert('Add food', 'Enter a name and a calorie amount.');
      return;
    }
    const it: MealItem = { name: name.trim(), kcal: k };
    const p = parseMacro(protein);
    const cb = parseMacro(carbs);
    const f = parseMacro(fat);
    if (p != null) it.proteinG = p;
    if (cb != null) it.carbsG = cb;
    if (f != null) it.fatG = f;
    pushItem(it);
    setName('');
    setKcal('');
    setProtein('');
    setCarbs('');
    setFat('');
  };

  const removeItem = (key: string) =>
    setItems(prev => prev.filter(i => i.key !== key));

  const totalKcal = items.reduce((sum, i) => sum + i.kcal, 0);

  const submit = async () => {
    if (items.length === 0) return;
    setBusy(true);
    // Strip the list-only `key` before writing.
    const payload: MealItem[] = items.map(({ key: _key, ...rest }) => rest);
    const res = await logMeal(payload, mealType);
    setBusy(false);
    if (res.ok) {
      setItems([]);
      onDone?.();
      if (res.failed > 0) {
        Alert.alert(
          'Partly logged',
          `${res.logged} of ${res.logged + res.failed} items were saved.`,
        );
      }
    } else {
      Alert.alert(
        'Not logged',
        `Connect ${healthSourceName()} in Setup to save food entries.`,
      );
    }
  };

  const inputStyle = {
    ...S(600, 14, { color: c.ink }),
    borderWidth: 1,
    borderColor: c.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    // The design fills fields with the page ground so they read as insets in
    // the card rather than as another raised surface.
    backgroundColor: c.bg,
  } as const;
  const numFont = { fontFamily: M(600, 14).fontFamily } as const;

  return (
    <View style={styles.wrap}>
      {/* Meal-type selector. */}
      <View style={styles.pills}>
        {MEAL_TYPES.map(mt => {
          const on = mt === mealType;
          return (
            <Pressable
              key={mt}
              onPress={() => setMealType(mt)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={titleCase(mt)}
              style={[
                styles.pill,
                {
                  backgroundColor: on ? c.ink : 'transparent',
                  borderColor: on ? c.ink : c.hair,
                },
              ]}
            >
              <Text style={M(700, 10, { ls: 0.6, color: on ? c.inv : c.mut })}>
                {mt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Portion picker for the tapped common food. */}
      {portionFood ? (
        <PortionSheet
          food={portionFood}
          actionLabel="ADD TO MEAL"
          onConfirm={entry => {
            pushItem(entry);
            setPortionFood(null);
          }}
          onCancel={() => setPortionFood(null)}
        />
      ) : null}

      {/* Quick-add from saved common foods. */}
      {commonFoods.length > 0 ? (
        <>
          <Text style={[M(700, 9.5, { ls: 1, color: c.fnt }), styles.subhead]}>
            ADD FROM COMMON
          </Text>
          <View style={styles.chips}>
            {commonFoods.map(food => (
              <Pressable
                key={food.id}
                onPress={() => setPortionFood(food)}
                accessibilityRole="button"
                accessibilityLabel={`Choose a portion of ${food.name}`}
                style={[
                  styles.chip,
                  {
                    borderColor: portionFood?.id === food.id ? c.acc : c.hair,
                  },
                ]}
              >
                <Text style={M(700, 12, { color: c.acc })}>+</Text>
                <Text
                  numberOfLines={1}
                  style={[S(600, 12.5, { color: c.ink }), styles.chipName]}
                >
                  {food.name}
                </Text>
                <Text style={M(700, 10.5, { color: c.fnt })}>{food.kcal}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {/* Type a one-off item. */}
      <View style={styles.addRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Food name"
          placeholderTextColor={c.fnt}
          style={[inputStyle, styles.addName]}
        />
        <TextInput
          value={kcal}
          onChangeText={setKcal}
          placeholder="kcal"
          placeholderTextColor={c.fnt}
          keyboardType="number-pad"
          style={[inputStyle, styles.addKcal, numFont]}
        />
        <Pressable
          onPress={addManual}
          accessibilityRole="button"
          accessibilityLabel="Add food to the meal"
          style={[styles.addBtn, { backgroundColor: c.accSolid }]}
        >
          <Text style={M(700, 16, { color: c.onAccent })}>+</Text>
        </Pressable>
      </View>
      <View style={styles.macroRow}>
        <TextInput
          value={protein}
          onChangeText={setProtein}
          placeholder="protein g"
          placeholderTextColor={c.fnt}
          keyboardType="number-pad"
          style={[inputStyle, styles.macroInput, numFont]}
        />
        <TextInput
          value={carbs}
          onChangeText={setCarbs}
          placeholder="carbs g"
          placeholderTextColor={c.fnt}
          keyboardType="number-pad"
          style={[inputStyle, styles.macroInput, numFont]}
        />
        <TextInput
          value={fat}
          onChangeText={setFat}
          placeholder="fat g"
          placeholderTextColor={c.fnt}
          keyboardType="number-pad"
          style={[inputStyle, styles.macroInput, numFont]}
        />
      </View>

      {/* Draft list of items in this meal. */}
      {items.length > 0 ? (
        <View style={styles.draft}>
          {items.map(it => (
            <View
              key={it.key}
              style={[styles.draftRow, { borderBottomColor: c.hair }]}
            >
              <Text
                numberOfLines={1}
                style={[S(600, 13.5, { color: c.ink }), styles.draftName]}
              >
                {it.name}
              </Text>
              <Text style={[M(700, 12, { color: c.ink }), styles.draftKcal]}>
                {it.kcal}
              </Text>
              <Pressable
                onPress={() => removeItem(it.key)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${it.name} from the meal`}
                hitSlop={8}
              >
                <Text style={M(700, 15, { color: c.fnt })}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[S(600, 12.5, { color: c.mut }), styles.empty]}>
          Add foods above to build this meal.
        </Text>
      )}

      {/* Log the whole meal. */}
      <Pressable
        onPress={submit}
        disabled={busy || items.length === 0}
        accessibilityRole="button"
        accessibilityLabel={`Log ${titleCase(mealType)}`}
        style={[
          styles.logBtn,
          {
            backgroundColor: c.accSolid,
            opacity: busy || items.length === 0 ? 0.4 : 1,
          },
        ]}
      >
        <Text style={M(700, 12, { ls: 0.6, color: c.onAccent })}>
          {`LOG ${mealType}`}
          {items.length > 0 ? (
            <Text style={M(700, 12, { color: c.onAccent })}>
              {`  ·  ${items.length} ITEM${items.length > 1 ? 'S' : ''}  ·  ${totalKcal} KCAL`}
            </Text>
          ) : null}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 10 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  subhead: { marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipName: { flexShrink: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addName: { flex: 1 },
  addKcal: { width: 78 },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroInput: { flex: 1, textAlign: 'center' },
  draft: { marginTop: 2 },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  draftName: { flex: 1, minWidth: 0 },
  draftKcal: { textAlign: 'right' },
  empty: { marginTop: 2 },
  logBtn: {
    marginTop: 2,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
