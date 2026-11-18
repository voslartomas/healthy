import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  Card,
  cardTitleStyle,
  chunky,
  MacroBar,
  pageTitleStyle,
  Pill,
  PillSpec,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  connectHealthSource,
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
import { FoodTagRow } from '../../db/foodTagsRepository';
import { FOOD_TAGS, FoodTagKey, foodTagsLabel } from '../../state/foodTags';
import { deleteFoodEntry, replaceFoodEntry } from '../../state/foodLogService';
import { tagLoggedFood } from '../../state/foodTagsService';
import { ScaledEntry } from '../../state/portion';
import {
  activeCalorieGoal,
  useCalorieGoalsStore,
} from '../../state/useCalorieGoalsStore';
import {
  CommonFood,
  useCommonFoodsStore,
} from '../../state/useCommonFoodsStore';
import { tagsForEntry, useFoodTagsStore } from '../../state/useFoodTagsStore';
import { useHabitsStore } from '../../state/useHabitsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import {
  ChoiceTile,
  CloseButton,
  FieldLabel,
  fieldStyle,
  formStyles,
  MacroFields,
} from './foodFormParts';
import { FoodEditSheet } from './FoodEditSheet';
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

/**
 * Daily water reference (ml) for the Water bar. Like MACRO_PLAN this is a fixed
 * plan value, not a user goal: ~2.5 L is the common adult guideline for drinks.
 * It only scales the bar; the number shown is always the real logged total.
 */
const WATER_TARGET_ML = 2500;

/** ml → "1.25 L" (two decimals max, trailing zeros dropped). */
function litres(ml: number): string {
  return `${Number((ml / 1000).toFixed(2))} L`;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Epoch ms → local "07:40"; null for a missing/zero timestamp. */
function clock(ms: number): string | null {
  if (!ms) return null;
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildMeals(live: NutritionSummary | null, tagRows: FoodTagRow[]) {
  return live
    ? live.meals.map(m => {
        const tags = tagsForEntry(tagRows, m.id);
        return {
          id: m.id ?? null,
          name: m.name,
          // A tagged entry shows what it was tagged as instead of its meal slot
          // — "JUNK FOOD" is the fact the user chose to record about it.
          tag: tags.length
            ? foodTagsLabel(tags)
            : (m.mealType ? titleCase(m.mealType) : 'Logged').toUpperCase(),
          tagged: tags.length > 0,
          time: clock(m.time),
          kcal: m.kcal,
          // For the food editor (tap a row to adjust its numbers).
          proteinG: m.proteinG ?? null,
          carbsG: m.carbsG ?? null,
          fatG: m.fatG ?? null,
          mealType: m.mealType,
        };
      })
    : [];
}

/** What a saved food's kcal is measured per, for its Quick add tile:
 * "150 g", "1 piece", or "serving" for the unitless multiplier foods. */
function servingText(f: CommonFood): string {
  if (f.servingUnit && f.servingUnit !== 'serving') {
    return `${f.servingSize ?? 1} ${f.servingUnit}`;
  }
  return 'serving';
}

/** The hero ring: today's eaten share of the goal's allowance as an orange arc
 * on a soft track (red once over), with the hero number inside. */
function KcalRing({
  frac,
  over,
  value,
  label,
  size = 168,
  stroke = 18,
}: {
  frac: number;
  over: boolean;
  value: string;
  label: string;
  size?: number;
  stroke?: number;
}) {
  const c = useTheme().colors;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? c.redTint : c.foodTint}
          strokeWidth={stroke}
          fill="none"
        />
        {f > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={over ? c.redSolid : c.food}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * f} ${circ}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={S(900, 44, { lh: 48, color: c.ink })}
        >
          {value}
        </Text>
        <Text style={S(800, 15, { color: c.mut })}>{label}</Text>
      </View>
    </View>
  );
}

/** One soft stat chip under the ring (EATEN / BURNED / NET). */
function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  const c = useTheme().colors;
  return (
    <View style={[styles.chip, { backgroundColor: c.soft }]}>
      <Text style={S(800, 12, { color: c.fnt })}>{label}</Text>
      <Text numberOfLines={1} style={S(900, 20, { color: color ?? c.ink })}>
        {value}
      </Text>
    </View>
  );
}

/** Portion units a saved food's kcal/macros can be measured per. 'serving' is
 * the unitless fallback (a plain multiplier when logging). `label` is the
 * tile's accessibility label (kept from the v3 chips); the tile shows `key`. */
const PORTION_UNITS = [
  { key: 'g', label: 'G' },
  { key: 'ml', label: 'ML' },
  { key: 'piece', label: 'PIECE' },
  { key: 'serving', label: 'SERVING' },
] as const;

/** How many saved-food tiles Quick add shows inline before the rest move
 * behind "See all" (the full searchable library modal). */
const CHIP_LIMIT = 8;

/**
 * Food tab (ADR-007 "friendly" layout, Food artboard): a "kcal left" ring with
 * eaten / burned / net chips, the two primary actions (Log food, Log a meal)
 * whose forms open inline right below them, Quick add tiles for saved foods
 * (tap → portion, hold → edit), Macros, Water (read-only, from the OS store)
 * and today's log with per-entry delete.
 *
 * The artboards draw Log food, Log a meal and the portion picker as their own
 * screens/sheets; they stay inline here so no routes were added and every flow
 * keeps its state handling. Setting the calorie goal lives on the Me tab
 * (CalorieGoalSection); this screen only reads the active goal.
 */
export function NutritionScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const logFoodEntry = useHealthStore(s => s.logFoodEntry);
  const logFood = useHealthStore(s => s.logFood);
  const refreshHealth = useHealthStore(s => s.refresh);
  const waterMl = snap.waterTodayMl;
  const commonFoods = useCommonFoodsStore(s => s.foods);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const hasNet = eaten != null || burned > 0;
  const net = (eaten ?? 0) - burned;
  const tagRows = useFoodTagsStore(s => s.rows);
  const meals = buildMeals(snap.nutrition, tagRows);
  /** The "Eaten today" row open in the food editor, if any. */
  const [editingMeal, setEditingMeal] = React.useState<
    (typeof meals)[number] | null
  >(null);
  /** Save from the editor: replace the entry, keeping its time, meal and tags
   * (see foodLogService). Returns an error string, or null on success. */
  const saveMealEdit = async (values: {
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }): Promise<string | null> => {
    if (!editingMeal?.id) return 'This entry can no longer be edited.';
    const res = await replaceFoodEntry(editingMeal.id, {
      name: editingMeal.name,
      ...values,
      mealType: editingMeal.mealType ?? undefined,
    });
    if (!res.ok) return res.error ?? 'Could not save the change.';
    setEditingMeal(null);
    return null;
  };
  const deleteMealEdit = async (): Promise<string | null> => {
    if (!editingMeal?.id) return 'This entry can no longer be deleted.';
    const ok = await deleteFoodEntry(editingMeal.id);
    if (!ok) {
      return `Could not remove the entry. Make sure ${healthSourceName()} is connected in Me.`;
    }
    setEditingMeal(null);
    return null;
  };
  const habits = useHabitsStore(s => s.habits);

  // The active calorie goal drives the hero + target quad here; setting/editing
  // goals lives on the Setup tab (CalorieGoalSection).
  const activeGoal = activeCalorieGoal(useCalorieGoalsStore(s => s.goals));

  // Hero: kcal left toward the goal's daily allowance (burned + target net)
  // when there is a goal and food logged; otherwise what was eaten, or nothing.
  // The ring is the eaten share of that allowance, so without a goal it stays
  // an empty track rather than a fill against a made-up target.
  const hero: {
    value: string;
    label: string;
    frac: number;
    over: boolean;
    pill: PillSpec;
  } = {
    value: '—',
    label: 'No food yet',
    frac: 0,
    over: false,
    pill: { text: 'Log a meal to start', bg: c.soft, textColor: c.mut },
  };
  if (activeGoal && eaten != null) {
    const allowance = burned + activeGoal.targetNet;
    const left = Math.round(allowance - eaten);
    hero.over = left < 0;
    hero.value = grp(Math.abs(left));
    hero.label = hero.over ? 'kcal over' : 'kcal left';
    hero.frac = allowance > 0 ? eaten / allowance : 1;
    hero.pill = hero.over
      ? {
          text: `Over your ${signed(activeGoal.targetNet)} goal`,
          bg: c.redTint,
          textColor: c.red,
        }
      : {
          text: `On track for ${signed(activeGoal.targetNet)}`,
          bg: c.grnTint,
          textColor: c.grn,
        };
  } else if (eaten != null) {
    hero.value = grp(eaten);
    hero.label = 'kcal eaten';
    hero.pill = {
      text: `Net ${signed(net)} · no goal set`,
      bg: c.soft,
      textColor: c.mut,
    };
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
  /** Tags on the entry being typed — junk / alcohol / sweets. The food habits
   * read these, so tagging is how "no junk food" ever breaks. */
  const [tags, setTags] = React.useState<FoodTagKey[]>([]);
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
    // Go through logFoodEntry (not logFood) so we get the platform's record id
    // back and can hang the tags off that exact entry.
    const res = await logFoodEntry(entry);
    if (res.ok && tags.length > 0) {
      await tagLoggedFood({
        name: entry.name,
        tags,
        entryId: res.name ?? null,
      }).catch(err => console.warn('Failed to save food tags', err));
    }
    setBusy(false);
    if (res.ok) {
      setName('');
      setKcal('');
      setProtein('');
      setCarbs('');
      setFat('');
      setTags([]);
      setAdding(false);
    } else {
      Alert.alert(
        'Not logged',
        `Connect ${healthSourceName()} in Me to save food entries.`,
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
          `Connect ${healthSourceName()} in Me to save food entries.`,
        );
      }
    },
    [logFood],
  );

  const confirmRemoveMeal = React.useCallback((id: string, name: string) => {
    Alert.alert('Delete entry', `Delete “${name}” from your food log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setRemovingId(id);
          // Drops the tags with the entry, so a deleted junk meal stops
          // breaking the day's food habits.
          const ok = await deleteFoodEntry(id);
          setRemovingId(null);
          if (!ok) {
            Alert.alert(
              'Not deleted',
              `Could not remove the entry. Make sure ${healthSourceName()} is connected in Me.`,
            );
          }
        },
      },
    ]);
  }, []);

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

  // Naming the habits a tag is about to break is the whole point of the note —
  // it turns an abstract label into a consequence the user can weigh.
  const breaks = React.useMemo(
    () =>
      tags.length === 0
        ? []
        : habits
            .filter(
              h => h.type === 'food' && h.auto && h.tag && tags.includes(h.tag),
            )
            .map(h => h.name),
    [habits, tags],
  );
  const tagNote = breaks.length
    ? `Heads up: this breaks today for “${breaks.join('”, “')}”.`
    : tags.length
      ? 'Tagged — none of your habits watch this one.'
      : 'Tag junk food, alcohol or sweets so your food habits can count them.';

  const kcalNum = parseInt(kcal, 10);
  const logLabel =
    Number.isFinite(kcalNum) && kcalNum > 0
      ? `Log ${kcalNum} kcal`
      : 'Log food';
  const seeAll = commonFoods.length > CHIP_LIMIT;
  const tiles = commonFoods.slice(0, CHIP_LIMIT);
  // Two-up grid as explicit rows: a wrapped flex row can't size an odd last
  // tile to half width without measuring, a spacer cell can.
  const tileRows: CommonFood[][] = [];
  for (let i = 0; i < tiles.length; i += 2)
    tileRows.push(tiles.slice(i, i + 2));
  const goalPill = activeGoal
    ? `Goal ${signed(activeGoal.targetNet)} / day`
    : 'No goal';

  return (
    <BriefScreen>
      {/* ── Title ─────────────────────────────────────────────────────── */}
      <View style={styles.titleRow}>
        <Text style={pageTitleStyle(c.ink)}>Food</Text>
        <Pill spec={{ text: goalPill, bg: c.soft, textColor: c.mut }} />
      </View>

      {/* ── Calories left: ring + eaten / burned / net ────────────────── */}
      <View style={[chunky(c), styles.heroCard]}>
        <KcalRing
          frac={hero.frac}
          over={hero.over}
          value={hero.value}
          label={hero.label}
        />
        <Pill spec={hero.pill} />
        <View style={styles.chipRow}>
          <StatChip label="EATEN" value={eaten != null ? grp(eaten) : '—'} />
          <StatChip label="BURNED" value={burned > 0 ? grp(burned) : '—'} />
          <StatChip
            label="NET"
            value={hasNet ? signed(net) : '—'}
            color={hasNet && net < 0 ? c.grn : undefined}
          />
        </View>
      </View>

      {/* ── Primary actions ───────────────────────────────────────────── */}
      {/* Each toggles its inline form below; the label flips to Cancel while
          open, the accessibility label stays put. */}
      <View style={styles.actions}>
        <BriefButton
          label={adding ? 'Cancel' : '+ Log food'}
          accessibilityLabel="Log food"
          onPress={() => setAdding(a => !a)}
          kind={adding ? 'outline' : 'solid'}
          tone="food"
          fontSize={17}
          style={styles.action}
        />
        <BriefButton
          label={mealOpen ? 'Cancel' : 'Log a meal'}
          accessibilityLabel="Log a meal"
          onPress={() => setMealOpen(o => !o)}
          kind="outline"
          fontSize={17}
          style={styles.action}
        />
      </View>

      {/* ── Log food (inline form, LogFood artboard) ──────────────────── */}
      {adding ? (
        <View style={[chunky(c), styles.formCard]}>
          <View style={formStyles.head}>
            <Text style={cardTitleStyle(c.ink)}>Log food</Text>
            <CloseButton
              onPress={() => setAdding(false)}
              accessibilityLabel="Close log food form"
            />
          </View>

          <Pressable
            onPress={() => navigation.navigate('Coach', { intent: 'food' })}
            accessibilityRole="button"
            accessibilityLabel="Tell the coach what you ate"
            style={[styles.coach, { backgroundColor: c.accTint }]}
          >
            <View style={[styles.coachIcon, { backgroundColor: c.accSolid }]}>
              <Icon name="sparkles" size={20} color={c.onAccent} />
            </View>
            <View style={styles.coachText}>
              <Text style={S(900, 16, { color: c.ink })}>
                Just tell the coach
              </Text>
              <Text style={S(700, 14, { lh: 19, color: c.mut })}>
                “Two eggs and toast” — it fills in the numbers
              </Text>
            </View>
          </Pressable>

          <View style={formStyles.group}>
            <FieldLabel>What did you eat?</FieldLabel>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Food name"
              placeholderTextColor={c.fnt}
              accessibilityLabel="Food name"
              style={fieldStyle(c, 18)}
            />
          </View>
          <View style={formStyles.group}>
            <FieldLabel>Calories</FieldLabel>
            <View style={styles.kcalRow}>
              <TextInput
                value={kcal}
                onChangeText={setKcal}
                placeholder="kcal"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                accessibilityLabel="Calories"
                style={[fieldStyle(c, 26), styles.kcalInput]}
              />
              <Text style={S(900, 18, { color: c.mut })}>kcal</Text>
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

          {/* Tag it if it was junk, alcohol or sweets — the food habits read
              these, and nothing else in the app does. */}
          <View style={formStyles.group}>
            <FieldLabel>Was it a treat?</FieldLabel>
            <View style={formStyles.tileRow}>
              {FOOD_TAGS.map(tag => (
                <ChoiceTile
                  key={tag.key}
                  label={titleCase(tag.label)}
                  on={tags.includes(tag.key)}
                  onPress={() =>
                    setTags(cur =>
                      cur.includes(tag.key)
                        ? cur.filter(x => x !== tag.key)
                        : [...cur, tag.key],
                    )
                  }
                  role="checkbox"
                  // The stored uppercase label, unchanged: tests and the
                  // habit editor both refer to tags by it.
                  accessibilityLabel={tag.label}
                  tone="red"
                />
              ))}
            </View>
            <View
              style={[
                styles.note,
                { backgroundColor: breaks.length ? c.redTint : c.soft },
              ]}
            >
              <Text
                style={S(800, 14, {
                  lh: 19,
                  color: breaks.length ? c.red : c.mut,
                })}
              >
                {tagNote}
              </Text>
            </View>
          </View>

          <BriefButton
            label={logLabel}
            accessibilityLabel="Save food entry"
            onPress={submit}
            disabled={busy}
            tone="food"
            fontSize={18}
          />
        </View>
      ) : null}

      {/* ── Log a meal (inline, MealLogger artboard) ──────────────────── */}
      {mealOpen ? (
        <View style={[chunky(c), styles.formCard]}>
          <View style={formStyles.head}>
            <Text style={cardTitleStyle(c.ink)}>Log a meal</Text>
            <CloseButton
              onPress={() => setMealOpen(false)}
              accessibilityLabel="Close meal logger"
            />
          </View>
          <MealLogger onDone={() => setMealOpen(false)} />
        </View>
      ) : null}

      {/* ── Quick add (common foods) ──────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={S(900, 22, { lh: 28, color: c.ink })}>Quick add</Text>
        <View style={styles.links}>
          {seeAll ? (
            <Pressable
              onPress={() => navigation.navigate('FoodsLibrary')}
              accessibilityRole="button"
              accessibilityLabel="Browse all common foods"
              hitSlop={12}
            >
              <Text style={S(900, 15, { color: c.acc })}>
                See all {commonFoods.length}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={openNewCommon}
            accessibilityRole="button"
            accessibilityLabel="Add common food"
            hitSlop={12}
          >
            <Text style={S(900, 15, { color: c.acc })}>
              {cfMode === 'new' ? 'Cancel' : '+ Save food'}
            </Text>
          </Pressable>
        </View>
      </View>

      {cfMode ? (
        <View style={[chunky(c), styles.formCard, styles.cfCard]}>
          <View style={formStyles.head}>
            <Text
              numberOfLines={1}
              style={[cardTitleStyle(c.ink), styles.shrink]}
            >
              {editingFood ? `Edit ${editingFood.name}` : 'Save a food'}
            </Text>
            <CloseButton
              onPress={() => {
                setCfMode(null);
                resetCommonForm();
              }}
              accessibilityLabel="Close saved food form"
            />
          </View>
          <View style={formStyles.group}>
            <FieldLabel>Name</FieldLabel>
            <TextInput
              value={cfName}
              onChangeText={setCfName}
              placeholder="Food name"
              placeholderTextColor={c.fnt}
              accessibilityLabel="Saved food name"
              style={fieldStyle(c, 18)}
            />
          </View>
          <View style={formStyles.group}>
            <FieldLabel>Calories</FieldLabel>
            <View style={styles.kcalRow}>
              <TextInput
                value={cfKcal}
                onChangeText={setCfKcal}
                placeholder="kcal"
                placeholderTextColor={c.fnt}
                keyboardType="number-pad"
                accessibilityLabel="Saved food calories"
                style={[fieldStyle(c, 26), styles.kcalInput]}
              />
              <Text style={S(900, 18, { color: c.mut })}>kcal</Text>
            </View>
          </View>
          <MacroFields
            protein={cfProtein}
            carbs={cfCarbs}
            fat={cfFat}
            onProtein={setCfProtein}
            onCarbs={setCfCarbs}
            onFat={setCfFat}
          />
          {/* Portion the kcal/macros are measured per. */}
          <View style={formStyles.group}>
            <FieldLabel>Measured per</FieldLabel>
            <View style={formStyles.tileRow}>
              {PORTION_UNITS.map(u => (
                <ChoiceTile
                  key={u.key}
                  label={u.key}
                  on={cfUnit === u.key}
                  onPress={() => setCfUnit(u.key)}
                  role="radio"
                  accessibilityLabel={u.label}
                />
              ))}
            </View>
            {cfUnit !== 'serving' ? (
              <View style={styles.kcalRow}>
                <TextInput
                  value={cfSize}
                  onChangeText={setCfSize}
                  placeholder="100"
                  placeholderTextColor={c.fnt}
                  keyboardType="number-pad"
                  accessibilityLabel={`Portion size in ${cfUnit}`}
                  style={[fieldStyle(c, 18), styles.sizeInput]}
                />
                <Text
                  style={[S(700, 14, { lh: 19, color: c.mut }), styles.shrink]}
                >
                  {`${cfUnit} — kcal & macros are for this amount`}
                </Text>
              </View>
            ) : (
              <Text style={S(700, 14, { lh: 19, color: c.mut })}>
                kcal & macros are for one serving; logging scales them by a
                multiplier.
              </Text>
            )}
          </View>
          <BriefButton
            label={cfMode === 'new' ? 'Save food' : 'Update food'}
            accessibilityLabel={
              cfMode === 'new' ? 'Save common food' : 'Update common food'
            }
            onPress={submitCommon}
            disabled={cfBusy}
            tone="food"
          />
          {editingFood ? (
            <Pressable
              onPress={deleteEditingCommon}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${editingFood.name}`}
              style={styles.deleteRow}
            >
              <Text style={S(900, 15, { color: c.red })}>Delete food</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {portionFood ? (
        <PortionSheet
          food={portionFood}
          actionLabel="Log"
          onConfirm={async entry => {
            const food = portionFood;
            setPortionFood(null);
            await logPortion(food, entry);
          }}
          onCancel={() => setPortionFood(null)}
        />
      ) : null}

      {commonFoods.length > 0 ? (
        <>
          <View style={styles.tiles}>
            {tileRows.map(row => (
              <View key={row[0].id} style={styles.tileRow}>
                {row.map(food => {
                  const on = cfMode === food.id || portionFood?.id === food.id;
                  return (
                    <Pressable
                      key={food.id}
                      onPress={() => setPortionFood(food)}
                      onLongPress={() => openEditCommon(food)}
                      disabled={commonBusy}
                      accessibilityRole="button"
                      accessibilityLabel={`Log ${food.name}. Long-press to edit.`}
                      style={[
                        chunky(c, 18),
                        styles.tile,
                        {
                          borderColor: on ? c.food : c.hair,
                          opacity: commonBusy ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={S(900, 16, { color: c.ink })}
                      >
                        {food.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={S(700, 14, { color: c.mut })}
                      >
                        {`${food.kcal} kcal · ${servingText(food)}`}
                      </Text>
                    </Pressable>
                  );
                })}
                {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
              </View>
            ))}
          </View>
          <Text style={[S(700, 14, { color: c.fnt }), styles.tileHint]}>
            Tap to pick a portion · hold to edit
          </Text>
        </>
      ) : cfMode ? null : (
        <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.empty]}>
          No saved foods yet. Add one to tap-log it later.
        </Text>
      )}

      {/* ── Macros ────────────────────────────────────────────────────── */}
      <Card title="Macros">
        {MACRO_PLAN.map(m => {
          const cur = snap.nutrition ? snap.nutrition[m.key] : null;
          const over = cur != null && m.kind === 'max' && cur > m.target;
          const remaining = cur != null ? Math.round(m.target - cur) : 0;
          const fillColor =
            m.name === 'PROTEIN'
              ? c.food
              : m.name === 'FAT'
                ? over
                  ? c.redSolid
                  : c.streak
                : c.lift;
          const limit =
            m.kind === 'min' ? 'min ' : m.kind === 'max' ? 'max ' : '';
          return (
            <MacroBar
              key={m.name}
              style={styles.macroGap}
              label={
                <>
                  <Text style={{ color: c.ink }}>{titleCase(m.name)}</Text>
                  {` ${limit}${m.target} g`}
                </>
              }
              right={
                <>
                  {cur != null ? `${Math.round(cur)} g` : '—'}
                  {cur != null && m.kind === 'min' && cur < m.target ? (
                    <Text style={{ color: c.foodText }}>
                      {' '}
                      · {remaining} to go
                    </Text>
                  ) : null}
                  {cur != null && m.kind === 'max' && cur <= m.target ? (
                    <Text style={{ color: c.grn }}> · {remaining} spare</Text>
                  ) : null}
                  {over ? (
                    <Text style={{ color: c.red }}> · {-remaining} over</Text>
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

      {/* ── Water ─────────────────────────────────────────────────────── */}
      {/* Read-only: water is logged in the user's tracker app and read back
          from the OS store. Nothing logged renders "—", never a fake 0. */}
      <View style={[chunky(c), styles.water, { backgroundColor: c.waterTint }]}>
        <View
          style={[styles.glass, { borderColor: c.water }]}
          accessible={false}
        >
          <View
            style={[
              styles.glassFill,
              {
                height: `${waterMl != null ? Math.min(1, waterMl / WATER_TARGET_ML) * 100 : 0}%`,
                backgroundColor: c.water,
              },
            ]}
          />
        </View>
        <View style={styles.waterText}>
          <Text style={cardTitleStyle(c.ink)}>Water</Text>
          <Text style={S(800, 16, { color: c.waterText })}>
            <Text style={S(900, 26, { lh: 32, color: c.ink })}>
              {waterMl != null ? litres(waterMl) : '—'}
            </Text>{' '}
            of {litres(WATER_TARGET_ML)}
          </Text>
          {waterMl != null ? (
            <Text style={S(700, 14, { lh: 19, color: c.mut })}>
              {waterMl < WATER_TARGET_ML
                ? `${litres(WATER_TARGET_ML - waterMl)} to go`
                : 'Reached for today'}{' '}
              · from {healthSourceName()}
            </Text>
          ) : (
            <>
              <Text style={S(700, 14, { lh: 19, color: c.mut })}>
                Nothing logged today. Water comes from {healthSourceName()} —
                log it in your water tracker.
              </Text>
              {/* Users who connected before water was requested don't hold the
                  read grant yet; re-running the sheet asks only for what's
                  missing, so this is how they opt in without disconnecting. */}
              <Pressable
                onPress={async () => {
                  if (await connectHealthSource()) await refreshHealth();
                }}
                accessibilityRole="button"
                accessibilityLabel="Allow water access"
                style={styles.waterLink}
              >
                <Text style={S(900, 15, { color: c.waterText })}>
                  Allow water access →
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* ── Eaten today ───────────────────────────────────────────────── */}
      <View style={styles.sectionHead}>
        <Text style={S(900, 22, { lh: 28, color: c.ink })}>Eaten today</Text>
        {meals.length > 0 ? (
          <Text style={S(800, 15, { color: c.fnt })}>
            {meals.length} {meals.length === 1 ? 'entry' : 'entries'}
          </Text>
        ) : null}
      </View>
      <View style={[chunky(c), styles.log]}>
        {meals.length === 0 ? (
          <Text style={[S(700, 15, { color: c.mut }), styles.logEmpty]}>
            No meals logged today.
          </Text>
        ) : null}
        {meals.map((m, i) => (
          <View
            key={m.id ?? `${m.name}-${i}`}
            style={[
              styles.meal,
              i > 0 ? { borderTopWidth: 2, borderTopColor: c.hair } : null,
            ]}
          >
            <Pressable
              onPress={m.id ? () => setEditingMeal(m) : undefined}
              disabled={!m.id}
              accessibilityRole="button"
              accessibilityLabel={`Adjust ${m.name}`}
              style={styles.mealMain}
            >
              <Text numberOfLines={1} style={S(900, 16, { color: c.ink })}>
                {m.name}
              </Text>
              {m.tagged ? (
                <View style={styles.mealTagRow}>
                  <Pill
                    small
                    spec={{ text: m.tag, bg: c.redTint, textColor: c.red }}
                  />
                  {m.time ? (
                    <Text style={S(800, 13, { color: c.fnt })}>{m.time}</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={S(800, 13, { color: c.fnt })}>
                  {m.time ? `${m.tag} · ${m.time}` : m.tag}
                </Text>
              )}
            </Pressable>
            <Text style={S(900, 17, { color: c.ink })}>{grp(m.kcal)}</Text>
            {m.id ? (
              <Pressable
                onPress={() => confirmRemoveMeal(m.id!, m.name)}
                disabled={removingId === m.id}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${m.name}`}
                style={[
                  styles.mealDelete,
                  {
                    backgroundColor: c.soft,
                    opacity: removingId === m.id ? 0.4 : 1,
                  },
                ]}
              >
                <Icon name="close" size={18} color={c.mut} strokeWidth={3} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <FoodEditSheet
        food={editingMeal}
        onCancel={() => setEditingMeal(null)}
        onSave={saveMealEdit}
        onDelete={deleteMealEdit}
      />
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  heroCard: {
    marginTop: 14,
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 14,
  },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  chip: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  action: { flex: 1, minHeight: 56, paddingVertical: 0 },
  formCard: { marginTop: 14, padding: 18, gap: 18 },
  cfCard: { marginTop: 12 },
  coach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
  },
  coachIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachText: { flex: 1, minWidth: 0 },
  kcalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kcalInput: { flex: 1, minWidth: 0 },
  sizeInput: { width: 96 },
  shrink: { flex: 1, flexShrink: 1 },
  note: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14 },
  deleteRow: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 26,
  },
  links: { flexDirection: 'row', gap: 16 },
  tiles: { marginTop: 12, gap: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 14 },
  tileSpacer: { flex: 1 },
  tileHint: { marginTop: 10 },
  empty: { marginTop: 10 },
  macroGap: { marginTop: 16 },
  water: {
    marginTop: 14,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  glass: {
    width: 56,
    height: 84,
    borderWidth: 3,
    borderTopWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  glassFill: { width: '100%' },
  waterText: { flex: 1, minWidth: 0, gap: 2 },
  waterLink: { minHeight: 44, justifyContent: 'center' },
  log: { marginTop: 12, overflow: 'hidden' },
  logEmpty: { paddingVertical: 18, paddingHorizontal: 16 },
  meal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  mealMain: { flex: 1, minWidth: 0, gap: 3 },
  mealTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealDelete: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
