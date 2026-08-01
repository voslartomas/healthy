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
import { nutrition } from '../../data/health';
import { NutritionSummary } from '../../health';
import { useHealthStore } from '../../state/useHealthStore';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Macro targets come from the user's plan (design constants for now); live
 * `current` values overlay them from the real snapshot when present. */
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

/** Build the screen view-model from the live snapshot, falling back to the
 * design sample for the plan (budget/targets/burn) which live data lacks. */
function buildView(live: NutritionSummary | null) {
  const budget = nutrition.budget;
  const eaten = live ? live.eaten : nutrition.eaten;
  const kcalLeft = budget - eaten;
  const macros = MACRO_PLAN.map(m => {
    const current = live ? live[m.key] : macroSample(m.name);
    return {
      ...m,
      current,
      fill: Math.max(0, Math.min(1, current / m.target)),
    };
  });
  const meals: MealRow[] = live
    ? live.meals.map(meal => ({
        name: meal.name,
        detail: meal.mealType ? titleCase(meal.mealType) : 'Logged',
        kcal: String(meal.kcal),
        planned: false,
      }))
    : nutrition.meals.map(meal => ({
        name: meal.name,
        detail: meal.detail,
        kcal: meal.kcal,
        planned: Boolean(meal.planned),
      }));
  return { budget, eaten, kcalLeft, macros, meals };
}

function macroSample(name: string): number {
  const m = nutrition.macros.find(x => x.name === name);
  return m ? m.current : 0;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Nutrition screen: calorie budget, in vs out, macros, and today's meals. */
export function NutritionScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const snap = useHealthStore(s => s.snapshot);
  const logFood = useHealthStore(s => s.logFood);
  const n = nutrition;
  const view = buildView(snap.nutrition);
  const ringPct = Math.max(0, Math.min(1, view.eaten / view.budget));

  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [kcal, setKcal] = React.useState('');
  const [busy, setBusy] = React.useState(false);

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
            progress={ringPct}
            color={t.colors.carbs}
            size={118}
            strokeWidth={10}
            value={String(view.kcalLeft)}
            label="kcal left"
            valueFontSize={26}
          />
          <View style={styles.heroMeta}>
            <Text style={[styles.heroTitle, { color: t.colors.fg }]}>
              {n.headline}
            </Text>
            <Text style={[styles.heroBody, { color: t.colors.muted }]}>
              {grp(view.eaten)} of a {grp(view.budget)} kcal budget.
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.spaced}>
        <View style={styles.rowBetween}>
          <SectionLabel style={styles.inlineLabel}>In vs out</SectionLabel>
          <View style={[styles.pill, { backgroundColor: t.colors.surface2 }]}>
            <Text style={[styles.pillText, { color: t.colors.accent }]}>
              Deficit −500
            </Text>
            <Icon
              name="edit"
              size={12}
              color={t.colors.accent}
              strokeWidth={2}
            />
          </View>
        </View>
        <View style={styles.inout}>
          <InOut label="Eaten" value={grp(view.eaten)} color={t.colors.fg} />
          <InOut label="Burned" value={grp(n.burned)} color={t.colors.strain} />
          <InOut
            label="Net"
            value={String(view.eaten - n.burned)}
            color={t.colors.rec}
          />
        </View>
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
                <Text style={{ color: t.colors.fg }}>{m.current}</Text> /{' '}
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
});
