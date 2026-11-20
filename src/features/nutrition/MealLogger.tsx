import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BriefButton, chunky, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { healthSourceName } from '../../health';
import { logMeal, MealItem } from '../../state/mealLogService';
import {
  CommonFood,
  useCommonFoodsStore,
} from '../../state/useCommonFoodsStore';
import { useTheme } from '../../theme/theme';
import { PinnedFooterLayout } from './PinnedFooterLayout';
import {
  ChoiceTile,
  FieldLabel,
  fieldStyle,
  formStyles,
  MacroFields,
} from './foodFormParts';
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
 *
 * Laid out to the friendly MealLogger artboard (ADR-007): meal-type tiles, the
 * saved foods as chunky "+ name" chips, a type-it row with an orange add slab,
 * the draft in its own outlined list, and one orange slab that logs it all —
 * pinned at the bottom of the screen ({@link PinnedFooterLayout}). It is the
 * whole body of the "Log a meal" screen (the stack header renders the title +
 * close). The artboard drops the per-item macro fields; they are kept because
 * typed items carried them before.
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
        `Connect ${healthSourceName()} in Me to save food entries.`,
      );
    }
  };

  const label = mealType.toLowerCase();

  return (
    <PinnedFooterLayout
      footer={
        // The disabled state says what's missing instead of just greying out
        // the label.
        <BriefButton
          label={
            items.length > 0
              ? `Log ${label} · ${items.length} item${items.length > 1 ? 's' : ''} · ${totalKcal} kcal`
              : 'Add something first'
          }
          accessibilityLabel={`Log ${titleCase(mealType)}`}
          onPress={submit}
          disabled={busy || items.length === 0}
          tone="food"
        />
      }
    >
      {/* Meal-type selector. */}
      <View style={formStyles.tileRow}>
        {MEAL_TYPES.map(mt => (
          <ChoiceTile
            key={mt}
            label={titleCase(mt)}
            on={mt === mealType}
            onPress={() => setMealType(mt)}
            role="radio"
            accessibilityLabel={titleCase(mt)}
          />
        ))}
      </View>

      {/* Portion picker for the tapped common food. */}
      {portionFood ? (
        <PortionSheet
          food={portionFood}
          actionLabel="Add to meal"
          onConfirm={entry => {
            pushItem(entry);
            setPortionFood(null);
          }}
          onCancel={() => setPortionFood(null)}
        />
      ) : null}

      {/* Quick-add from saved common foods. */}
      {commonFoods.length > 0 ? (
        <View style={formStyles.group}>
          <FieldLabel>Add from saved</FieldLabel>
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
                    backgroundColor: c.card,
                    borderColor: portionFood?.id === food.id ? c.food : c.hair,
                  },
                ]}
              >
                <Text style={S(900, 17, { color: c.foodEdge })}>+</Text>
                <Text
                  numberOfLines={1}
                  style={[S(900, 15, { color: c.ink }), styles.chipName]}
                >
                  {food.name}
                </Text>
                <Text style={S(800, 13, { color: c.fnt })}>{food.kcal}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Type a one-off item. */}
      <View style={formStyles.group}>
        <FieldLabel>
          {commonFoods.length > 0 ? 'Or type it' : 'Type a food'}
        </FieldLabel>
        <View style={styles.addRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Food name"
            placeholderTextColor={c.fnt}
            accessibilityLabel="Food name"
            style={[fieldStyle(c, 16), styles.addName]}
          />
          <TextInput
            value={kcal}
            onChangeText={setKcal}
            placeholder="kcal"
            placeholderTextColor={c.fnt}
            keyboardType="number-pad"
            accessibilityLabel="Calories"
            style={[fieldStyle(c, 16), styles.addKcal]}
          />
          <Pressable
            onPress={addManual}
            accessibilityRole="button"
            accessibilityLabel="Add food to the meal"
            style={[
              styles.addBtn,
              { backgroundColor: c.food, borderBottomColor: c.foodEdge },
            ]}
          >
            <Icon name="plus" size={22} color={c.onAccent} strokeWidth={3} />
          </Pressable>
        </View>
      </View>
      <MacroFields
        protein={protein}
        carbs={carbs}
        fat={fat}
        onProtein={setProtein}
        onCarbs={setCarbs}
        onFat={setFat}
      />

      {/* Draft list of items in this meal. */}
      <View style={formStyles.group}>
        <FieldLabel>In this meal</FieldLabel>
        <View style={[chunky(c, 20), styles.draft]}>
          {items.length > 0 ? (
            items.map((it, i) => (
              <View
                key={it.key}
                style={[
                  styles.draftRow,
                  i > 0 ? { borderTopWidth: 2, borderTopColor: c.hair } : null,
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[S(900, 16, { color: c.ink }), styles.draftName]}
                >
                  {it.name}
                </Text>
                <Text style={S(900, 16, { color: c.ink })}>{it.kcal}</Text>
                <Pressable
                  onPress={() => removeItem(it.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${it.name} from the meal`}
                  hitSlop={4}
                  style={[styles.remove, { backgroundColor: c.soft }]}
                >
                  <Icon name="close" size={16} color={c.mut} strokeWidth={3} />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={[S(700, 15, { color: c.fnt }), styles.empty]}>
              Add foods above to build this meal.
            </Text>
          )}
        </View>
      </View>
    </PinnedFooterLayout>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 4,
    maxWidth: '100%',
  },
  chipName: { flexShrink: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addName: { flex: 1, minWidth: 0 },
  addKcal: { width: 84 },
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draft: { overflow: 'hidden' },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  draftName: { flex: 1, minWidth: 0 },
  remove: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { paddingVertical: 18, paddingHorizontal: 16 },
});
