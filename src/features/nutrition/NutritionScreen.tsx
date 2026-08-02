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
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { Ring } from '../../components/Ring';
import { AppHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
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
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Aug 1, 2026" for an epoch-ms date. */
function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Today as a "YYYY-MM-DD" input default. */
function todayInput(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parse a "YYYY-MM-DD" string to local-midnight epoch ms, or null if invalid. */
function parseDateInput(s: string): number | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

/** Signed kcal label: "−400" deficit, "+300" surplus, "0" maintenance. */
function signedKcal(n: number): string {
  if (n < 0) return `\u2212${grp(Math.abs(n))}`;
  if (n > 0) return `+${grp(n)}`;
  return '0';
}

/** Macro targets are the user's plan constants; `current` values come from the
 * real snapshot and render "-" when nothing is logged. */
const MACRO_PLAN = [
  { name: 'Protein', key: 'proteinG', target: 165, unit: 'g', colorKey: 'protein' as const },
  { name: 'Carbs', key: 'carbsG', target: 210, unit: 'g', colorKey: 'carbs' as const },
  { name: 'Fat', key: 'fatG', target: 62, unit: 'g', colorKey: 'fat' as const },
] as const;

interface MealRow {
  name: string;
  detail: string;
  kcal: string;
  planned: boolean;
}

/** Build the screen view-model from the live snapshot. No snapshot → every
 * value null and the UI renders "-". */
function buildView(live: NutritionSummary | null) {
  const eaten = live?.eaten ?? null;
  const macros = MACRO_PLAN.map(m => {
    const current = live ? live[m.key] : null;
    return {
      ...m,
      current,
      fill: current != null ? Math.max(0, Math.min(1, current / m.target)) : 0,
    };
  });
  const meals: MealRow[] = live
    ? live.meals.map(meal => ({
        name: meal.name,
        detail: meal.mealType ? titleCase(meal.mealType) : 'Logged',
        kcal: String(meal.kcal),
        planned: false,
      }))
    : [];
  return { eaten, macros, meals };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Nutrition screen: calorie budget, in vs out, macros, and today's meals. */
export function NutritionScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const snap = useHealthStore(s => s.snapshot);
  const logFood = useHealthStore(s => s.logFood);
  const commonFoods = useCommonFoodsStore(s => s.foods);
  const view = buildView(snap.nutrition);
  const burned = snap.energyBurnedToday;

  // Calorie goal (dated history). Net = eaten − burned; a deficit is negative.
  const calorieGoals = useCalorieGoalsStore(s => s.goals);
  const activeGoal = activeCalorieGoal(calorieGoals);
  const hasNet = view.eaten != null && burned > 0;
  const todayNet = (view.eaten ?? 0) - burned;
  const goalHit =
    activeGoal && hasNet
      ? isCalorieGoalHit(activeGoal.targetNet, todayNet)
      : null;
  const goalHistory = [...calorieGoals].sort(
    (a, b) => b.effectiveFrom - a.effectiveFrom,
  );

  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [commonBusy, setCommonBusy] = React.useState(false);

  const [goalEditing, setGoalEditing] = React.useState(false);
  const [goalMode, setGoalMode] = React.useState<'deficit' | 'surplus'>(
    'deficit',
  );
  const [goalMag, setGoalMag] = React.useState('');
  const [goalDate, setGoalDate] = React.useState(todayInput);
  const [goalBusy, setGoalBusy] = React.useState(false);

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
    const targetNet = goalMode === 'deficit' ? -mag : mag;
    setGoalBusy(true);
    try {
      await createCalorieGoal({ effectiveFrom, targetNet });
      setGoalMag('');
      setGoalDate(todayInput());
      setGoalEditing(false);
    } catch {
      Alert.alert('Not saved', 'Could not save the calorie goal.');
    } finally {
      setGoalBusy(false);
    }
  }, [goalMag, goalDate, goalMode]);

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
        'Connect Google Health in Settings to save food entries.',
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
          'Connect Google Health in Settings to save food entries.',
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
        onPress: () => {
          void removeCommonFood(food.id);
        },
      },
    ]);
  }, []);

  return (
    <Screen>
      <AppHeader
        eyebrow="Nutrition · Today"
        title="Fuel"
        onAvatarPress={() => navigation.navigate('Settings')}
      />

      <Card>
        <View style={styles.heroRing}>
          <Ring
            progress={0}
            color={t.colors.carbs}
            size={118}
            strokeWidth={10}
            value={view.eaten != null ? grp(view.eaten) : '-'}
            label="kcal eaten"
            valueFontSize={26}
          />
          <View style={styles.heroMeta}>
            <Text style={[styles.heroTitle, { color: t.colors.fg }]}>
              {view.eaten != null ? "Today's intake" : 'Nothing logged yet'}
            </Text>
            <Text style={[styles.heroBody, { color: t.colors.muted }]}>
              {view.eaten != null
                ? `${grp(view.eaten)} kcal eaten today.`
                : 'Log your first meal to see today\u2019s totals.'}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.spaced}>
        <SectionLabel style={styles.inlineLabel}>In vs out</SectionLabel>
        <View style={styles.inout}>
          <InOut
            label="Eaten"
            value={view.eaten != null ? grp(view.eaten) : '-'}
            color={t.colors.fg}
          />
          <InOut
            label="Burned"
            value={burned > 0 ? grp(burned) : '-'}
            color={t.colors.strain}
          />
          <InOut
            label="Net"
            value={
              view.eaten != null || burned > 0
                ? String((view.eaten ?? 0) - burned)
                : '-'
            }
            color={t.colors.rec}
          />
        </View>
      </Card>

      <Card style={styles.spaced}>
        <View style={styles.rowBetween}>
          <SectionLabel style={[styles.inlineLabel, { marginBottom: 6 }]}>
            Calorie goal
          </SectionLabel>
          <Pressable
            onPress={() => setGoalEditing(e => !e)}
            style={[styles.pill, { backgroundColor: t.colors.surface2 }]}
            accessibilityRole="button"
            accessibilityLabel="Set calorie goal"
          >
            <Icon
              name={goalEditing ? 'edit' : 'plus'}
              size={12}
              color={t.colors.accent}
              strokeWidth={2}
            />
            <Text style={[styles.pillText, { color: t.colors.accent }]}>
              {goalEditing ? 'Cancel' : 'New goal'}
            </Text>
          </Pressable>
        </View>

        {activeGoal ? (
          <>
            <View style={styles.goalRow}>
              <Text style={[styles.goalTarget, { color: t.colors.fg }]}>
                {signedKcal(activeGoal.targetNet)}
                <Text style={[styles.goalUnit, { color: t.colors.muted }]}>
                  {' '}
                  kcal/day
                </Text>
              </Text>
              {goalHit != null && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: goalHit
                        ? t.colors.recStateBg
                        : t.colors.surface2,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: goalHit ? t.colors.rec : t.colors.muted },
                    ]}
                  >
                    {goalHit ? 'On track' : 'Off target'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.goalSub, { color: t.colors.muted }]}>
              {hasNet
                ? `Today's net ${signedKcal(todayNet)} kcal · since ${shortDate(activeGoal.effectiveFrom)}`
                : `Log food to compare against target · since ${shortDate(activeGoal.effectiveFrom)}`}
            </Text>
          </>
        ) : (
          <Text style={[styles.goalSub, { color: t.colors.muted }]}>
            No calorie goal set. Add one to track your daily deficit or surplus.
          </Text>
        )}

        {goalEditing && (
          <View style={styles.goalFormCol}>
            <View style={styles.modeToggle}>
              {(['deficit', 'surplus'] as const).map(mode => {
                const on = goalMode === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setGoalMode(mode)}
                    style={[
                      styles.modeBtn,
                      { backgroundColor: on ? t.colors.fg : t.colors.surface2 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text
                      style={[
                        styles.modeText,
                        { color: on ? t.colors.bg : t.colors.muted },
                      ]}
                    >
                      {mode === 'deficit' ? 'Deficit' : 'Surplus'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.goalFormRow}>
              <TextInput
                value={goalDate}
                onChangeText={setGoalDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={t.colors.faint}
                autoCapitalize="none"
                accessibilityLabel="Goal start date"
                style={[
                  styles.addInput,
                  {
                    flex: 1,
                    color: t.colors.fg,
                    backgroundColor: t.colors.surface2,
                    borderColor: t.colors.border,
                  },
                ]}
              />
              <TextInput
                value={goalMag}
                onChangeText={setGoalMag}
                placeholder="kcal"
                placeholderTextColor={t.colors.faint}
                keyboardType="number-pad"
                style={[
                  styles.addInput,
                  {
                    width: 78,
                    color: t.colors.fg,
                    backgroundColor: t.colors.surface2,
                    borderColor: t.colors.border,
                  },
                ]}
              />
              <Pressable
                onPress={submitGoal}
                disabled={goalBusy}
                style={[
                  styles.addBtn,
                  {
                    backgroundColor: t.colors.accent,
                    opacity: goalBusy ? 0.5 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save calorie goal"
              >
                <Icon name="plus" size={16} color="#fff" strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        )}

        {goalHistory.length > 0 && (
          <View style={styles.history}>
            <Text style={[styles.historyLabel, { color: t.colors.muted }]}>
              History
            </Text>
            {goalHistory.map((g, i) => (
              <View
                key={g.id}
                style={[
                  styles.histRow,
                  i > 0 && {
                    borderTopColor: t.colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text style={[styles.histDate, { color: t.colors.fg }]}>
                  {shortDate(g.effectiveFrom)}
                </Text>
                <Text style={[styles.histVal, { color: t.colors.muted }]}>
                  {signedKcal(g.targetNet)} kcal
                </Text>
                <Pressable
                  onPress={() => removeCalorieGoal(g.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove goal from ${shortDate(g.effectiveFrom)}`}
                  hitSlop={8}
                >
                  <Icon
                    name="close"
                    size={15}
                    color={t.colors.faint}
                    strokeWidth={2}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={styles.spaced}>
        <SectionLabel style={[styles.inlineLabel, { marginBottom: 4 }]}>
          Macros
        </SectionLabel>
        {view.macros.map(m => (
          <View key={m.name} style={styles.macro}>
            <View style={styles.rowBetween}>
              <Text style={[styles.macroName, { color: t.colors.fg }]}>
                {m.name}
              </Text>
              <Text style={[styles.macroG, { color: t.colors.muted }]}>
                <Text style={{ color: t.colors.fg }}>{m.current ?? '-'}</Text> /{' '}
                {m.target} {m.unit}
              </Text>
            </View>
            <ProgressBar
              progress={m.fill}
              color={metricColor(t.colors, m.colorKey)}
              height={9}
            />
          </View>
        ))}
      </Card>

      {commonFoods.length > 0 && (
        <Card style={styles.spaced}>
          <SectionLabel style={[styles.inlineLabel, { marginBottom: 10 }]}>
            Common foods
          </SectionLabel>
          <View style={styles.commonWrap}>
            {commonFoods.map(food => (
              <Pressable
                key={food.id}
                onPress={() => logCommon(food)}
                onLongPress={() => confirmRemoveCommon(food)}
                disabled={commonBusy}
                style={[
                  styles.foodPill,
                  {
                    backgroundColor: t.colors.surface2,
                    borderColor: t.colors.border,
                    opacity: commonBusy ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Log ${food.name}, ${food.kcal} kcal. Long-press to remove.`}
              >
                <Icon
                  name="plus"
                  size={13}
                  color={t.colors.accent}
                  strokeWidth={2.4}
                />
                <Text
                  style={[styles.foodPillName, { color: t.colors.fg }]}
                  numberOfLines={1}
                >
                  {food.name}
                </Text>
                <Text style={[styles.foodPillKcal, { color: t.colors.muted }]}>
                  {food.kcal}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.commonHint, { color: t.colors.faint }]}>
            Tap to log · long-press to remove
          </Text>
        </Card>
      )}

      <Card style={styles.spaced}>
        <View style={styles.rowBetween}>
          <SectionLabel style={[styles.inlineLabel, { marginBottom: 6 }]}>
            {"Today's meals"}
          </SectionLabel>
          <Pressable
            onPress={() => setAdding(a => !a)}
            style={[styles.pill, { backgroundColor: t.colors.surface2 }]}
            accessibilityRole="button"
            accessibilityLabel="Log food"
          >
            <Icon
              name={adding ? 'edit' : 'plus'}
              size={12}
              color={t.colors.accent}
              strokeWidth={2}
            />
            <Text style={[styles.pillText, { color: t.colors.accent }]}>
              {adding ? 'Cancel' : 'Log food'}
            </Text>
          </Pressable>
        </View>

        {adding && (
          <View style={styles.addForm}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Food name"
              placeholderTextColor={t.colors.faint}
              style={[
                styles.addInput,
                {
                  flex: 1,
                  color: t.colors.fg,
                  backgroundColor: t.colors.surface2,
                  borderColor: t.colors.border,
                },
              ]}
            />
            <TextInput
              value={kcal}
              onChangeText={setKcal}
              placeholder="kcal"
              placeholderTextColor={t.colors.faint}
              keyboardType="number-pad"
              style={[
                styles.addInput,
                {
                  width: 78,
                  color: t.colors.fg,
                  backgroundColor: t.colors.surface2,
                  borderColor: t.colors.border,
                },
              ]}
            />
            <Pressable
              onPress={submit}
              disabled={busy}
              style={[
                styles.addBtn,
                { backgroundColor: t.colors.accent, opacity: busy ? 0.5 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save food entry"
            >
              <Icon name="plus" size={16} color="#fff" strokeWidth={2.4} />
            </Pressable>
          </View>
        )}

        {view.meals.length === 0 && !adding && (
          <Text style={[styles.emptyMeals, { color: t.colors.muted }]}>
            No meals logged today.
          </Text>
        )}

        {view.meals.map((meal, i) => (
          <View
            key={`${meal.name}-${i}`}
            style={[
              styles.meal,
              i > 0 && {
                borderTopColor: t.colors.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
              meal.planned && { opacity: 0.55 },
            ]}
          >
            <View
              style={[
                styles.mealIc,
                {
                  backgroundColor: meal.planned
                    ? 'transparent'
                    : t.colors.surface2,
                  borderWidth: meal.planned ? 1 : 0,
                  borderColor: t.colors.border,
                  borderStyle: 'dashed',
                },
              ]}
            >
              <Icon
                name={meal.planned ? 'plus' : 'nutrition'}
                size={18}
                color={t.colors.muted}
              />
            </View>
            <View style={styles.mealText}>
              <Text style={[styles.mealName, { color: t.colors.fg }]}>
                {meal.name}
              </Text>
              <Text style={[styles.mealDetail, { color: t.colors.muted }]}>
                {meal.detail}
              </Text>
            </View>
            <Text style={[styles.mealKcal, { color: t.colors.fg }]}>
              {meal.kcal}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function InOut({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const t = useTheme();
  return (
    <View style={[styles.inoutBox, { backgroundColor: t.colors.surface2 }]}>
      <Text style={[styles.inoutK, { color: t.colors.muted }]}>{label}</Text>
      <Text style={[styles.inoutV, { color }]}>{value}</Text>
    </View>
  );
}

function grp(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const styles = StyleSheet.create({
  spaced: { marginTop: 14 },
  heroRing: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroMeta: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  heroBody: { fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineLabel: { marginTop: 0, marginBottom: 14, marginHorizontal: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  pillText: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  inout: { flexDirection: 'row', gap: 10 },
  inoutBox: { flex: 1, borderRadius: 16, padding: 13 },
  inoutK: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inoutV: {
    fontFamily: monoFont,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 7,
  },
  macro: { marginTop: 16 },
  macroName: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  macroG: { fontFamily: monoFont, fontSize: 12, fontWeight: '700' },
  addForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  addInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  mealIc: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealText: { flex: 1 },
  mealName: { fontSize: 14, fontWeight: '700' },
  mealDetail: { fontSize: 11.5, marginTop: 2 },
  mealKcal: { fontFamily: monoFont, fontSize: 15, fontWeight: '800' },
  emptyMeals: { fontSize: 12.5, paddingVertical: 8 },
  commonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  foodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  foodPillName: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  foodPillKcal: { fontFamily: monoFont, fontSize: 11.5, fontWeight: '700' },
  commonHint: { fontSize: 10.5, marginTop: 10 },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalTarget: {
    fontFamily: monoFont,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  goalUnit: { fontFamily: monoFont, fontSize: 12, fontWeight: '700' },
  goalSub: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  goalFormCol: { gap: 10, marginTop: 14 },
  goalFormRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeToggle: { flexDirection: 'row', gap: 6, flex: 1 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: 'center',
  },
  modeText: { fontSize: 12.5, fontWeight: '700' },
  history: { marginTop: 16 },
  historyLabel: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
  },
  histDate: { flex: 1, fontSize: 13, fontWeight: '700' },
  histVal: { fontFamily: monoFont, fontSize: 13, fontWeight: '700' },
});
