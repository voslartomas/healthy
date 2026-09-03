import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefScreen,
  Card,
  cardTitleStyle,
  GridCell,
  GridRow,
  HeroRow,
  InkBand,
  M,
  MacroBar,
  S,
} from '../../components/brief';
import {
  FoodEntryInput,
  healthSourceName,
  NutritionSummary,
} from '../../health';
import {
  addCommonFood,
  editCommonFood,
  NewCommonFood,
  removeCommonFood,
} from '../../state/commonFoodsService';
import { ScaledEntry } from '../../state/portion';
import {
  activeCalorieGoal,
  useCalorieGoalsStore,
} from '../../state/useCalorieGoalsStore';
import {
  CommonFood,
  useCommonFoodsStore,
} from '../../state/useCommonFoodsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import { MealLogger } from './MealLogger';
import { PortionSheet } from './PortionSheet';

function grp(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function signed(n: number): string {
  if (n < 0) return `−${grp(Math.abs(n))}`;
  if (n > 0) return `+${grp(n)}`;
  return '0';
}

const MACRO_PLAN = [
  { name: 'PROTEIN', kind: 'min' as const, key: 'proteinG', target: 165 },
  { name: 'FAT', kind: 'max' as const, key: 'fatG', target: 62 },
  { name: 'CARBS', kind: 'flat' as const, key: 'carbsG', target: 210 },
] as const;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function buildMeals(live: NutritionSummary | null) {
  return live
    ? live.meals.map(m => ({
        id: m.id ?? null,
        name: m.name,
        tag: (m.mealType ? titleCase(m.mealType) : 'Logged').toUpperCase(),
        kcal: m.kcal,
      }))
    : [];
}

/** Portion units a saved food's kcal/macros can be measured per. 'serving' is
 * the unitless fallback (a plain multiplier when logging). */
const PORTION_UNITS = [
  { key: 'g', label: 'G' },
  { key: 'ml', label: 'ML' },
  { key: 'piece', label: 'PIECE' },
  { key: 'serving', label: 'SERVING' },
] as const;

/** How many saved-food chips the Fuel card shows inline before the rest move
 * behind "MORE" (the full searchable library modal). */
const CHIP_LIMIT = 8;

/** Fuel screen: energy balance, macros, quick-log foods, meals + a calorie goal. */
export function NutritionScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const logFood = useHealthStore(s => s.logFood);
  const removeFoodEntry = useHealthStore(s => s.removeFoodEntry);
  const commonFoods = useCommonFoodsStore(s => s.foods);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const hasNet = eaten != null || burned > 0;
  const net = (eaten ?? 0) - burned;
  const meals = buildMeals(snap.nutrition);

  // The active calorie goal drives the hero + target quad here; setting/editing
  // goals lives on the Setup tab (CalorieGoalSection).
  const activeGoal = activeCalorieGoal(useCalorieGoalsStore(s => s.goals));

  // Hero: kcal left toward the goal's daily allowance when possible.
  let heroValue = '—';
  let heroPillText = 'NO FOOD YET';
  let heroCaption = 'LOG A MEAL TO START';
  if (activeGoal && eaten != null) {
    const left = Math.round(burned + activeGoal.targetNet - eaten);
    heroValue = signed(left).replace('+', '');
    heroPillText = 'KCAL LEFT';
    heroCaption = `ON TRACK FOR ${signed(activeGoal.targetNet)}`;
  } else if (eaten != null) {
    heroValue = grp(eaten);
    heroPillText = 'KCAL EATEN';
    heroCaption = hasNet ? `NET ${signed(net)}` : 'NO GOAL SET';
  }

  // Add-food form.
  const [adding, setAdding] = React.useState(false);
  // Meal builder: group several foods under one meal type (see MealLogger).
  const [mealOpen, setMealOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const [protein, setProtein] = React.useState('');
  const [carbs, setCarbs] = React.useState('');
  const [fat, setFat] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [commonBusy, setCommonBusy] = React.useState(false);
  // The common food whose portion is being chosen for a quick log (null = none).
  const [portionFood, setPortionFood] = React.useState<CommonFood | null>(null);

  // Common-food create/edit form. `cfMode`: null = closed, 'new' = create,
  // otherwise the id of the food being edited.
  const [cfMode, setCfMode] = React.useState<null | 'new' | string>(null);
  const [cfName, setCfName] = React.useState('');
  const [cfKcal, setCfKcal] = React.useState('');
  const [cfProtein, setCfProtein] = React.useState('');
  const [cfCarbs, setCfCarbs] = React.useState('');
  const [cfFat, setCfFat] = React.useState('');
  // Portion the saved kcal/macros are measured per: a unit + (for g/ml/piece) a
  // size. 'serving' means unitless — logging then scales by a plain multiplier.
  const [cfUnit, setCfUnit] =
    React.useState<(typeof PORTION_UNITS)[number]['key']>('serving');
  const [cfSize, setCfSize] = React.useState('');
  const [cfBusy, setCfBusy] = React.useState(false);

  /** Parse an optional non-negative grams field; undefined when blank/invalid. */
  const parseMacro = (s: string): number | undefined => {
    const n = parseInt(s, 10);
    return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const editingFood =
    cfMode && cfMode !== 'new'
      ? (commonFoods.find(f => f.id === cfMode) ?? null)
      : null;

  const resetCommonForm = () => {
    setCfName('');
    setCfKcal('');
    setCfProtein('');
    setCfCarbs('');
    setCfFat('');
    setCfUnit('serving');
    setCfSize('');
  };

  /** Toggle the create form; closes any edit in progress. */
  const openNewCommon = () => {
    if (cfMode === 'new') {
      setCfMode(null);
      return;
    }
    resetCommonForm();
    setCfMode('new');
  };

  /** Open the form pre-filled with an existing food for editing. */
  const openEditCommon = (food: CommonFood) => {
    setCfName(food.name);
    setCfKcal(String(food.kcal));
    setCfProtein(food.proteinG != null ? String(food.proteinG) : '');
    setCfCarbs(food.carbsG != null ? String(food.carbsG) : '');
    setCfFat(food.fatG != null ? String(food.fatG) : '');
    const unit = (PORTION_UNITS.find(u => u.key === food.servingUnit)?.key ??
      'serving') as (typeof PORTION_UNITS)[number]['key'];
    setCfUnit(unit);
    setCfSize(
      unit !== 'serving' && food.servingSize != null
        ? String(food.servingSize)
        : '',
    );
    setCfMode(food.id);
  };

  const submitCommon = async () => {
    const kcalNum = parseInt(cfKcal, 10);
    if (!cfName.trim() || !Number.isFinite(kcalNum) || kcalNum <= 0) {
      Alert.alert('Save food', 'Enter a name and a calorie amount.');
      return;
    }
    const isUnit = cfUnit !== 'serving';
    const sizeNum = parseInt(cfSize, 10);
    const servingSize = isUnit
      ? Number.isFinite(sizeNum) && sizeNum > 0
        ? sizeNum
        : 1
      : null;
    const input: NewCommonFood = {
      name: cfName.trim(),
      kcal: kcalNum,
      proteinG: parseMacro(cfProtein) ?? null,
      carbsG: parseMacro(cfCarbs) ?? null,
      fatG: parseMacro(cfFat) ?? null,
      mealType: editingFood?.mealType ?? null,
      servingSize,
      servingUnit: isUnit ? cfUnit : null,
    };
    setCfBusy(true);
    try {
      if (cfMode === 'new') await addCommonFood(input);
      else if (cfMode) await editCommonFood(cfMode, input);
    } finally {
      setCfBusy(false);
    }
    setCfMode(null);
    resetCommonForm();
  };

  const submit = async () => {
    const kcalNum = parseInt(kcal, 10);
    if (!name.trim() || !Number.isFinite(kcalNum) || kcalNum <= 0) {
      Alert.alert('Add food', 'Enter a name and a calorie amount.');
      return;
    }
    const entry: FoodEntryInput = { name: name.trim(), kcal: kcalNum };
    const p = parseMacro(protein);
    const cb = parseMacro(carbs);
    const f = parseMacro(fat);
    if (p != null) entry.proteinG = p;
    if (cb != null) entry.carbsG = cb;
    if (f != null) entry.fatG = f;
    setBusy(true);
    const ok = await logFood(entry);
    setBusy(false);
    if (ok) {
      setName('');
      setKcal('');
      setProtein('');
      setCarbs('');
      setFat('');
      setAdding(false);
    } else {
      Alert.alert(
        'Not logged',
        `Connect ${healthSourceName()} in Setup to save food entries.`,
      );
    }
  };

  // Quick-log a common food at a chosen portion (opened via the chip → slider).
  const logPortion = React.useCallback(
    async (food: CommonFood, entry: ScaledEntry) => {
      setCommonBusy(true);
      const input: FoodEntryInput = { name: entry.name, kcal: entry.kcal };
      if (entry.proteinG != null) input.proteinG = entry.proteinG;
      if (entry.carbsG != null) input.carbsG = entry.carbsG;
      if (entry.fatG != null) input.fatG = entry.fatG;
      if (food.mealType) input.mealType = food.mealType;
      const ok = await logFood(input);
      setCommonBusy(false);
      if (!ok) {
        Alert.alert(
          'Not logged',
          `Connect ${healthSourceName()} in Setup to save food entries.`,
        );
      }
    },
    [logFood],
  );

  const confirmRemoveMeal = React.useCallback(
    (id: string, name: string) => {
      Alert.alert('Delete entry', `Delete “${name}” from your food log?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(id);
            const ok = await removeFoodEntry(id);
            setRemovingId(null);
            if (!ok) {
              Alert.alert(
                'Not deleted',
                `Could not remove the entry. Make sure ${healthSourceName()} is connected in Setup.`,
              );
            }
          },
        },
      ]);
    },
    [removeFoodEntry],
  );

  const confirmRemoveCommon = React.useCallback(
    (food: CommonFood, onDone?: () => void) => {
      Alert.alert('Remove food', `Remove "${food.name}" from common foods?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeCommonFood(food.id);
            onDone?.();
          },
        },
      ]);
    },
    [],
  );

  const deleteEditingCommon = () => {
    if (!editingFood) return;
    confirmRemoveCommon(editingFood, () => {
      setCfMode(null);
      resetCommonForm();
    });
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

  return (
    <BriefScreen>
      <InkBand>
        <HeroRow
          value={heroValue}
          pillText={heroPillText}
          caption={heroCaption}
        />
      </InkBand>

      {/* ── Balance ───────────────────────────────────────────────── */}
      <View style={[styles.energyCard, { backgroundColor: c.card, borderColor: c.hair }]}>
        <View style={styles.energyHead}>
          <Text style={cardTitleStyle(c.ink)}>Energy</Text>
        </View>
        <GridRow borderTop>
          <GridCell first label="EATEN">
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
              {eaten != null ? grp(eaten) : '——'}
            </Text>
          </GridCell>
          <GridCell label="BURNED">
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
              {burned > 0 ? grp(burned) : '——'}
            </Text>
          </GridCell>
          <GridCell label="NET">
            <Text
              style={M(700, 20, {
                ls: -0.2,
                color: hasNet && net < 0 ? c.grn : c.ink,
              })}
            >
              {hasNet ? signed(net) : '——'}
            </Text>
          </GridCell>
          <GridCell label="TARGET">
            <Text style={M(700, 20, { ls: -0.2, color: c.ink })}>
              {activeGoal ? signed(activeGoal.targetNet) : '——'}
            </Text>
          </GridCell>
        </GridRow>
      </View>

      {/* ── Macros ────────────────────────────────────────────────── */}
      <Card title="Macros">
        {MACRO_PLAN.map(m => {
          const cur = snap.nutrition ? snap.nutrition[m.key] : null;
          const over = cur != null && m.kind === 'max' && cur > m.target;
          const remaining = cur != null ? Math.round(m.target - cur) : 0;
          const fillColor =
            m.name === 'PROTEIN' ? c.ink : m.name === 'FAT' ? c.acc : c.sand;
          return (
            <MacroBar
              key={m.name}
              style={styles.macroGap}
              label={`${m.name} · ${m.kind === 'min' ? 'MIN ' : m.kind === 'max' ? 'MAX ' : ''}${m.target}G`}
              right={
                <>
                  {cur != null ? Math.round(cur) : '—'}
                  {cur != null && m.kind === 'min' && cur < m.target ? (
                    <Text style={{ color: c.acc }}> · {remaining} TO GO</Text>
                  ) : null}
                  {cur != null && m.kind === 'max' && cur <= m.target ? (
                    <Text style={{ color: c.acc }}> · {remaining} SPARE</Text>
                  ) : null}
                </>
              }
              fill={cur != null ? cur / m.target : 0}
              fillColor={fillColor}
              marker={m.kind === 'flat' ? undefined : over ? c.red : c.ink}
            />
          );
        })}
      </Card>

      {/* ── Common foods ──────────────────────────────────────────── */}
      <Card
        title="Common foods"
        right={
          <View style={styles.foodsActions}>
            {commonFoods.length > CHIP_LIMIT ? (
              <Pressable
                onPress={() => navigation.navigate('FoodsLibrary')}
                accessibilityRole="button"
                accessibilityLabel="Browse all common foods"
              >
                <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>MORE →</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={openNewCommon}
              accessibilityRole="button"
              accessibilityLabel="Add common food"
            >
              <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>
                {cfMode === 'new' ? 'CANCEL' : '+ ADD FOOD'}
              </Text>
            </Pressable>
          </View>
        }
      >
        {cfMode ? (
          <View style={styles.formWrap}>
            <View style={styles.form}>
              <TextInput
                value={cfName}
                onChangeText={setCfName}
                placeholder="Food name"
                placeholderTextColor={c.fnt}
                style={[inputStyle, styles.formName]}
              />
              <TextInput
                value={cfKcal}
                onChangeText={setCfKcal}
                placeholder="kcal"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.formKcal,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
              <Pressable
                onPress={submitCommon}
                disabled={cfBusy}
                accessibilityRole="button"
                accessibilityLabel={
                  cfMode === 'new' ? 'Save common food' : 'Update common food'
                }
                style={[
                  styles.formBtn,
                  { backgroundColor: c.accSolid, opacity: cfBusy ? 0.5 : 1 },
                ]}
              >
                <Text style={M(700, 16, { color: c.onAccent })}>
                  {cfMode === 'new' ? '+' : '✓'}
                </Text>
              </Pressable>
            </View>
            {/* Optional macros (grams) — protein / carbs / fat. */}
            <View style={styles.macroRow}>
              <TextInput
                value={cfProtein}
                onChangeText={setCfProtein}
                placeholder="protein g"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.macroInput,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
              <TextInput
                value={cfCarbs}
                onChangeText={setCfCarbs}
                placeholder="carbs g"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.macroInput,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
              <TextInput
                value={cfFat}
                onChangeText={setCfFat}
                placeholder="fat g"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.macroInput,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
            </View>
            {/* Portion the kcal/macros are measured per. */}
            <View style={styles.unitRow}>
              {PORTION_UNITS.map(u => {
                const on = cfUnit === u.key;
                return (
                  <Pressable
                    key={u.key}
                    onPress={() => setCfUnit(u.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={u.label}
                    style={[
                      styles.unitPill,
                      {
                        backgroundColor: on ? c.ink : 'transparent',
                        borderColor: on ? c.ink : c.hair,
                      },
                    ]}
                  >
                    <Text
                      style={M(700, 9.5, {
                        ls: 0.5,
                        color: on ? c.inv : c.mut,
                      })}
                    >
                      {u.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {cfUnit !== 'serving' ? (
              <View style={styles.sizeRow}>
                <TextInput
                  value={cfSize}
                  onChangeText={setCfSize}
                  placeholder="100"
                  placeholderTextColor={c.fnt}
                  keyboardType="number-pad"
                  style={[
                    inputStyle,
                    styles.sizeInput,
                    { fontFamily: M(600, 14).fontFamily },
                  ]}
                />
                <Text style={[M(600, 10, { color: c.fnt }), styles.sizeHint]}>
                  {`${cfUnit.toUpperCase()} · kcal & macros per this amount`}
                </Text>
              </View>
            ) : (
              <Text style={M(600, 9.5, { ls: 0.4, color: c.fnt })}>
                KCAL & MACROS PER SERVING · LOG SCALES BY A MULTIPLIER
              </Text>
            )}
            {editingFood ? (
              <Pressable
                onPress={deleteEditingCommon}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${editingFood.name}`}
                hitSlop={6}
                style={styles.deleteRow}
              >
                <Text style={M(700, 10.5, { ls: 1, color: c.red })}>
                  DELETE FOOD
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {portionFood ? (
          <PortionSheet
            food={portionFood}
            actionLabel="LOG"
            onConfirm={async entry => {
              const food = portionFood;
              setPortionFood(null);
              await logPortion(food, entry);
            }}
            onCancel={() => setPortionFood(null)}
          />
        ) : null}

        {commonFoods.length > 0 ? (
          <View style={styles.chips}>
            {commonFoods.slice(0, CHIP_LIMIT).map(food => (
              <Pressable
                key={food.id}
                onPress={() => setPortionFood(food)}
                onLongPress={() => openEditCommon(food)}
                disabled={commonBusy}
                accessibilityRole="button"
                accessibilityLabel={`Log ${food.name}. Long-press to edit.`}
                style={[
                  styles.chip,
                  {
                    borderColor:
                      cfMode === food.id || portionFood?.id === food.id
                        ? c.acc
                        : c.hair,
                    opacity: commonBusy ? 0.6 : 1,
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
            {commonFoods.length > CHIP_LIMIT ? (
              <Pressable
                onPress={() => navigation.navigate('FoodsLibrary')}
                accessibilityRole="button"
                accessibilityLabel="Browse all common foods"
                style={[styles.chip, { borderColor: c.hair }]}
              >
                <Text style={M(700, 11, { ls: 0.6, color: c.acc })}>
                  +{commonFoods.length - CHIP_LIMIT} MORE →
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : cfMode ? null : (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            No saved foods yet. Add one to tap-log it later.
          </Text>
        )}
      </Card>

      {/* ── Log a meal ────────────────────────────────────────────── */}
      <Card
        title="Log a meal"
        right={
          <Pressable
            onPress={() => setMealOpen(o => !o)}
            accessibilityRole="button"
            accessibilityLabel="Log a meal"
          >
            <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>
              {mealOpen ? 'CANCEL' : '+ NEW MEAL'}
            </Text>
          </Pressable>
        }
      >
        {mealOpen ? (
          <MealLogger onDone={() => setMealOpen(false)} />
        ) : (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            Group several foods under breakfast, lunch, dinner or a snack — tap
            common foods or type them in.
          </Text>
        )}
      </Card>

      {/* ── Logged ────────────────────────────────────────────────── */}
      <Card
        title="Logged"
        right={
          <Pressable
            onPress={() => setAdding(a => !a)}
            accessibilityRole="button"
            accessibilityLabel="Log food"
          >
            <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>
              {adding ? 'CANCEL' : '+ LOG FOOD'}
            </Text>
          </Pressable>
        }
      >
        {adding ? (
          <View style={styles.formWrap}>
            <View style={styles.form}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Food name"
                placeholderTextColor={c.fnt}
                style={[inputStyle, styles.formName]}
              />
              <TextInput
                value={kcal}
                onChangeText={setKcal}
                placeholder="kcal"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.formKcal,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
              <Pressable
                onPress={submit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Save food entry"
                style={[
                  styles.formBtn,
                  { backgroundColor: c.accSolid, opacity: busy ? 0.5 : 1 },
                ]}
              >
                <Text style={M(700, 16, { color: c.onAccent })}>+</Text>
              </Pressable>
            </View>
            {/* Optional macros (grams) — protein / carbs / fat. */}
            <View style={styles.macroRow}>
              <TextInput
                value={protein}
                onChangeText={setProtein}
                placeholder="protein g"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.macroInput,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
              <TextInput
                value={carbs}
                onChangeText={setCarbs}
                placeholder="carbs g"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.macroInput,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
              <TextInput
                value={fat}
                onChangeText={setFat}
                placeholder="fat g"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                style={[
                  inputStyle,
                  styles.macroInput,
                  { fontFamily: M(600, 14).fontFamily },
                ]}
              />
            </View>
          </View>
        ) : null}

        {meals.length === 0 && !adding ? (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            No meals logged today.
          </Text>
        ) : null}

        {meals.map((m, i) => (
          <View
            key={m.id ?? `${m.name}-${i}`}
            style={[styles.meal, { borderBottomColor: c.hair }]}
          >
            <Text
              numberOfLines={1}
              style={[S(600, 13.5, { color: c.ink }), styles.mealName]}
            >
              {m.name}
              <Text style={M(600, 10, { ls: 1, color: c.fnt })}>
                {' '}
                · {m.tag}
              </Text>
            </Text>
            <Text style={[M(700, 12, { color: c.ink }), styles.mealKcal]}>
              {grp(m.kcal)}
            </Text>
            {m.id ? (
              <Pressable
                onPress={() => confirmRemoveMeal(m.id!, m.name)}
                disabled={removingId === m.id}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${m.name}`}
                hitSlop={8}
                style={{ opacity: removingId === m.id ? 0.4 : 1 }}
              >
                <Text style={M(700, 15, { color: c.fnt })}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </Card>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  energyCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  energyHead: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12 },
  macroGap: { marginTop: 14 },
  foodsActions: { flexDirection: 'row', alignItems: 'baseline', gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
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
  formWrap: { marginTop: 14, gap: 8 },
  form: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formName: { flex: 1 },
  formKcal: { width: 78 },
  macroRow: { flexDirection: 'row', gap: 8 },
  macroInput: { flex: 1, textAlign: 'center' },
  deleteRow: { alignSelf: 'flex-start', paddingVertical: 2 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitPill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sizeInput: { width: 90 },
  sizeHint: { flex: 1, flexShrink: 1 },
  formBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { marginTop: 12 },
  meal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  mealName: { flex: 1, minWidth: 0 },
  mealKcal: { textAlign: 'right' },
});
