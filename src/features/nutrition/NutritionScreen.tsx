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
  BigStat,
  BriefScreen,
  M,
  MacroBar,
  PillSpec,
  Quad,
  S,
  Section,
} from '../../components/brief';
import { FoodEntryInput, NutritionSummary } from '../../health';
import { removeCommonFood } from '../../state/commonFoodsService';
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

/** Fuel screen: energy balance, macros, quick-log foods, meals + a calorie goal. */
export function NutritionScreen(_props: ScreenProps) {
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
  let heroPill: PillSpec = { text: 'NO FOOD YET', dot: c.fnt };
  let heroCaption = 'LOG A MEAL TO START';
  if (activeGoal && eaten != null) {
    const left = Math.round(burned + activeGoal.targetNet - eaten);
    heroValue = signed(left).replace('+', '');
    heroPill = { text: 'KCAL LEFT', bg: c.ink, textColor: c.inv };
    heroCaption = `ON TRACK FOR ${signed(activeGoal.targetNet)}`;
  } else if (eaten != null) {
    heroValue = grp(eaten);
    heroPill = { text: 'KCAL EATEN', bg: c.ink, textColor: c.inv };
    heroCaption = hasNet ? `NET ${signed(net)}` : 'NO GOAL SET';
  }

  // Add-food form.
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [commonBusy, setCommonBusy] = React.useState(false);

  const submit = async () => {
    const kcalNum = parseInt(kcal, 10);
    if (!name.trim() || !Number.isFinite(kcalNum) || kcalNum <= 0) {
      Alert.alert('Add food', 'Enter a name and a calorie amount.');
      return;
    }
    setBusy(true);
    const ok = await logFood({ name: name.trim(), kcal: kcalNum });
    setBusy(false);
    if (ok) {
      setName('');
      setKcal('');
      setAdding(false);
    } else {
      Alert.alert(
        'Not logged',
        'Connect Google Health in Setup to save food entries.',
      );
    }
  };

  const logCommon = React.useCallback(
    async (food: CommonFood) => {
      if (commonBusy) return;
      setCommonBusy(true);
      const entry: FoodEntryInput = { name: food.name, kcal: food.kcal };
      if (food.proteinG != null) entry.proteinG = food.proteinG;
      if (food.carbsG != null) entry.carbsG = food.carbsG;
      if (food.fatG != null) entry.fatG = food.fatG;
      if (food.mealType) entry.mealType = food.mealType;
      const ok = await logFood(entry);
      setCommonBusy(false);
      if (!ok) {
        Alert.alert(
          'Not logged',
          'Connect Google Health in Setup to save food entries.',
        );
      }
    },
    [commonBusy, logFood],
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
                'Could not remove the entry. Make sure Google Health is connected in Setup.',
              );
            }
          },
        },
      ]);
    },
    [removeFoodEntry],
  );

  const confirmRemoveCommon = React.useCallback((food: CommonFood) => {
    Alert.alert('Remove food', `Remove "${food.name}" from common foods?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void removeCommonFood(food.id),
      },
    ]);
  }, []);

  const inputStyle = {
    ...S(600, 14, { color: c.ink }),
    borderWidth: 1,
    borderColor: c.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  } as const;

  return (
    <BriefScreen>
      <BigStat value={heroValue} pill={heroPill} caption={heroCaption} />

      {/* ── 01 Balance ───────────────────────────────────────────────── */}
      <Section n="01" title="Energy" first>
        <Quad
          items={[
            { value: eaten != null ? grp(eaten) : '——', label: 'EATEN' },
            { value: burned > 0 ? grp(burned) : '——', label: 'BURNED' },
            {
              value: hasNet ? signed(net) : '——',
              color: hasNet && net < 0 ? c.grn : c.ink,
              label: 'NET',
            },
            {
              value: activeGoal ? signed(activeGoal.targetNet) : '——',
              label: 'TARGET',
            },
          ]}
        />
      </Section>

      {/* ── 02 Macros ────────────────────────────────────────────────── */}
      <Section n="02" title="Macros">
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
      </Section>

      {/* ── 03 Common foods ──────────────────────────────────────────── */}
      {commonFoods.length > 0 ? (
        <Section
          n="03"
          title="Common foods"
          titleRight={
            <Text style={M(700, 10.5, { color: c.fnt })}>TAP TO LOG</Text>
          }
        >
          <View style={styles.chips}>
            {commonFoods.map(food => (
              <Pressable
                key={food.id}
                onPress={() => logCommon(food)}
                onLongPress={() => confirmRemoveCommon(food)}
                disabled={commonBusy}
                accessibilityRole="button"
                accessibilityLabel={`Log ${food.name}, ${food.kcal} kcal. Long-press to remove.`}
                style={[
                  styles.chip,
                  { borderColor: c.hair, opacity: commonBusy ? 0.6 : 1 },
                ]}
              >
                <Text style={M(800, 12, { color: c.acc })}>+</Text>
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
        </Section>
      ) : null}

      {/* ── 04 Logged ────────────────────────────────────────────────── */}
      <Section
        n="04"
        title="Logged"
        titleRight={
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
                { backgroundColor: c.ink, opacity: busy ? 0.5 : 1 },
              ]}
            >
              <Text style={M(700, 16, { color: c.inv })}>+</Text>
            </Pressable>
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
            <Text style={[M(800, 12, { color: c.ink }), styles.mealKcal]}>
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
      </Section>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  macroGap: { marginTop: 14 },
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
  form: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  formName: { flex: 1 },
  formKcal: { width: 78 },
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
