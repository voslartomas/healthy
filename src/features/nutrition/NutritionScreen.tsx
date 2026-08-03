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
import {
  createCalorieGoal,
  removeCalorieGoal,
} from '../../state/calorieGoalsService';
import { removeCommonFood } from '../../state/commonFoodsService';
import {
  activeCalorieGoal,
  isCalorieGoalHit,
  useCalorieGoalsStore,
} from '../../state/useCalorieGoalsStore';
import {
  CommonFood,
  useCommonFoodsStore,
} from '../../state/useCommonFoodsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function todayInput(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function parseDateInput(s: string): number | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

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
  const commonFoods = useCommonFoodsStore(s => s.foods);

  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const hasNet = eaten != null || burned > 0;
  const net = (eaten ?? 0) - burned;
  const meals = buildMeals(snap.nutrition);

  const calorieGoals = useCalorieGoalsStore(s => s.goals);
  const activeGoal = activeCalorieGoal(calorieGoals);
  const todayNet = (eaten ?? 0) - burned;
  const goalHit =
    activeGoal && eaten != null && burned > 0
      ? isCalorieGoalHit(activeGoal.targetNet, todayNet)
      : null;
  const goalHistory = [...calorieGoals].sort(
    (a, b) => b.effectiveFrom - a.effectiveFrom,
  );

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

  // Calorie-goal editor.
  const [goalEditing, setGoalEditing] = React.useState(false);
  const [goalMode, setGoalMode] = React.useState<'deficit' | 'surplus'>(
    'deficit',
  );
  const [goalMag, setGoalMag] = React.useState('');
  const [goalDate, setGoalDate] = React.useState(todayInput);
  const [goalBusy, setGoalBusy] = React.useState(false);

  const submit = React.useCallback(async () => {
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
  }, [name, kcal, logFood]);

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

  const submitGoal = React.useCallback(async () => {
    const mag = parseInt(goalMag, 10);
    if (!Number.isFinite(mag) || mag < 0) {
      Alert.alert('Set goal', 'Enter a kcal amount (e.g. 400).');
      return;
    }
    const effectiveFrom = parseDateInput(goalDate);
    if (effectiveFrom == null) {
      Alert.alert('Set goal', 'Enter a valid date as YYYY-MM-DD.');
      return;
    }
    setGoalBusy(true);
    try {
      await createCalorieGoal({
        effectiveFrom,
        targetNet: goalMode === 'deficit' ? -mag : mag,
      });
      setGoalMag('');
      setGoalDate(todayInput());
      setGoalEditing(false);
    } catch {
      Alert.alert('Not saved', 'Could not save the calorie goal.');
    } finally {
      setGoalBusy(false);
    }
  }, [goalMag, goalDate, goalMode]);

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
            key={`${m.name}-${i}`}
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
          </View>
        ))}
      </Section>

      {/* ── 05 Calorie goal ──────────────────────────────────────────── */}
      <Section
        n="05"
        title="Calorie goal"
        titleRight={
          <Pressable
            onPress={() => setGoalEditing(e => !e)}
            accessibilityRole="button"
            accessibilityLabel="Set calorie goal"
          >
            <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>
              {goalEditing ? 'CANCEL' : '+ NEW GOAL'}
            </Text>
          </Pressable>
        }
      >
        {activeGoal ? (
          <View style={styles.goalHead}>
            <Text style={M(800, 22, { ls: -0.5, color: c.ink })}>
              {signed(activeGoal.targetNet)}
              <Text style={M(700, 12, { color: c.fnt })}> KCAL/DAY</Text>
            </Text>
            {goalHit != null ? (
              <Text
                style={M(700, 10.5, {
                  ls: 0.5,
                  color: goalHit ? c.grn : c.fnt,
                })}
              >
                {goalHit ? 'ON TRACK' : 'OFF TARGET'}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
            No calorie goal set. Add one to track your daily deficit or surplus.
          </Text>
        )}

        {goalEditing ? (
          <View style={styles.goalForm}>
            <View style={styles.modeRow}>
              {(['deficit', 'surplus'] as const).map(mode => {
                const on = goalMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setGoalMode(mode)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.modeBtn,
                      {
                        borderColor: on ? c.ink : c.hair,
                        backgroundColor: on ? c.ink : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={M(700, 11, { ls: 0.5, color: on ? c.inv : c.mut })}
                    >
                      {mode.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.form}>
              <TextInput
                value={goalDate}
                onChangeText={setGoalDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={c.fnt}
                autoCapitalize="none"
                accessibilityLabel="Goal start date"
                style={[
                  inputStyle,
                  styles.formName,
                  { fontFamily: M(600, 13).fontFamily },
                ]}
              />
              <TextInput
                value={goalMag}
                onChangeText={setGoalMag}
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
                onPress={submitGoal}
                disabled={goalBusy}
                accessibilityRole="button"
                accessibilityLabel="Save calorie goal"
                style={[
                  styles.formBtn,
                  { backgroundColor: c.ink, opacity: goalBusy ? 0.5 : 1 },
                ]}
              >
                <Text style={M(700, 16, { color: c.inv })}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {goalHistory.length > 0 ? (
          <View style={styles.history}>
            {goalHistory.map(g => (
              <View
                key={g.id}
                style={[styles.histRow, { borderTopColor: c.hair }]}
              >
                <Text style={[S(600, 12.5, { color: c.ink }), styles.histDate]}>
                  {shortDate(g.effectiveFrom)}
                </Text>
                <Text style={M(700, 12, { color: c.mut })}>
                  {signed(g.targetNet)}
                </Text>
                <Pressable
                  onPress={() => removeCalorieGoal(g.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove goal from ${shortDate(g.effectiveFrom)}`}
                  hitSlop={8}
                >
                  <Text style={M(700, 13, { color: c.fnt })}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
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
  goalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
  },
  goalForm: { marginTop: 6 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  history: { marginTop: 16 },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  histDate: { flex: 1 },
});
