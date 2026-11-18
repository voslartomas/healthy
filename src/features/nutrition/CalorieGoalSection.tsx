import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  BriefButton,
  chunky,
  inputStyle,
  Pill,
  S,
  SegmentedRow,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  createCalorieGoal,
  removeCalorieGoal,
} from '../../state/calorieGoalsService';
import {
  activeCalorieGoal,
  isCalorieGoalHit,
  useCalorieGoalsStore,
} from '../../state/useCalorieGoalsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import { SectionHead } from '../settings/SectionHead';

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

const MODE_OPTIONS = [
  { key: 'deficit' as const, label: 'Deficit' },
  { key: 'surplus' as const, label: 'Surplus' },
];

/**
 * Calorie-goal setup: the active daily net target (with today's on-track /
 * off-target pill), an editor to add a new goal (deficit/surplus, effective
 * date), and the goal history with delete. Lives on the Me tab — goals are set
 * occasionally, not every day, so this belongs with configuration rather than
 * the daily Food screen (which still shows the active target in its hero).
 */
export function CalorieGoalSection() {
  const t = useTheme();
  const c = t.colors;
  const snap = useHealthStore(s => s.snapshot);
  const calorieGoals = useCalorieGoalsStore(s => s.goals);
  const activeGoal = activeCalorieGoal(calorieGoals);

  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const todayNet = (eaten ?? 0) - burned;
  const goalHit =
    activeGoal && eaten != null && burned > 0
      ? isCalorieGoalHit(activeGoal.targetNet, todayNet)
      : null;
  const goalHistory = [...calorieGoals].sort(
    (a, b) => b.effectiveFrom - a.effectiveFrom,
  );

  const [editing, setEditing] = React.useState(false);
  const [mode, setMode] = React.useState<'deficit' | 'surplus'>('deficit');
  const [mag, setMag] = React.useState('');
  const [date, setDate] = React.useState(todayInput);
  const [busy, setBusy] = React.useState(false);

  const submit = React.useCallback(async () => {
    const magNum = parseInt(mag, 10);
    if (!Number.isFinite(magNum) || magNum < 0) {
      Alert.alert('Set goal', 'Enter a kcal amount (e.g. 400).');
      return;
    }
    const effectiveFrom = parseDateInput(date);
    if (effectiveFrom == null) {
      Alert.alert('Set goal', 'Enter a valid date as YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    try {
      await createCalorieGoal({
        effectiveFrom,
        targetNet: mode === 'deficit' ? -magNum : magNum,
      });
      setMag('');
      setDate(todayInput());
      setEditing(false);
    } catch {
      Alert.alert('Not saved', 'Could not save the calorie goal.');
    } finally {
      setBusy(false);
    }
  }, [mag, date, mode]);

  const field = [inputStyle(c), S(800, 17, { color: c.ink }), styles.input];

  return (
    <>
      <SectionHead
        title="Calorie goal"
        right={
          <Pressable
            onPress={() => setEditing(e => !e)}
            accessibilityRole="button"
            accessibilityLabel="Set calorie goal"
            hitSlop={8}
            style={styles.newBtn}
          >
            <Text style={S(900, 15, { color: c.acc })}>
              {editing ? 'Cancel' : '+ New goal'}
            </Text>
          </Pressable>
        }
      />
      <View style={[chunky(c), styles.card]}>
        {activeGoal ? (
          <View style={styles.goalHead}>
            <Text style={S(900, 24, { lh: 30, color: c.ink })}>
              {signed(activeGoal.targetNet)}
              <Text style={S(900, 15, { color: c.mut })}> kcal / day</Text>
            </Text>
            {goalHit != null ? (
              <Pill
                spec={
                  goalHit
                    ? { text: 'On track', bg: c.grnTint, textColor: c.grn }
                    : { text: 'Off target', bg: c.soft, textColor: c.mut }
                }
              />
            ) : null}
          </View>
        ) : (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            No calorie goal set. Add one to track your daily deficit or surplus.
          </Text>
        )}

        {editing ? (
          <View style={[styles.form, { borderTopColor: c.hair }]}>
            <SegmentedRow<'deficit' | 'surplus'>
              options={MODE_OPTIONS}
              value={mode}
              onChange={next => next && setMode(next)}
            />
            <View style={styles.formRow}>
              <View style={styles.dateCol}>
                <Text style={[S(900, 14, { color: c.mut }), styles.label]}>
                  Starts on
                </Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={c.fnt}
                  autoCapitalize="none"
                  accessibilityLabel="Goal start date"
                  style={field}
                />
              </View>
              <View style={styles.kcalCol}>
                <Text style={[S(900, 14, { color: c.mut }), styles.label]}>
                  kcal / day
                </Text>
                <TextInput
                  value={mag}
                  onChangeText={setMag}
                  placeholder="400"
                  placeholderTextColor={c.fnt}
                  keyboardType="number-pad"
                  accessibilityLabel="Calories per day"
                  style={field}
                />
              </View>
            </View>
            <BriefButton
              label="Save goal"
              onPress={() => void submit()}
              disabled={busy}
              accessibilityLabel="Save calorie goal"
              size={13}
              style={styles.save}
            />
          </View>
        ) : null}

        {goalHistory.length > 0 ? (
          <View style={styles.history}>
            {goalHistory.map(g => (
              <View
                key={g.id}
                style={[styles.histRow, { borderTopColor: c.hair }]}
              >
                <Text style={[S(700, 15, { color: c.mut }), styles.histDate]}>
                  {`Since ${shortDate(g.effectiveFrom)}`}
                </Text>
                <Text style={S(900, 15, { color: c.ink })}>
                  {signed(g.targetNet)}
                </Text>
                <Pressable
                  onPress={() => removeCalorieGoal(g.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove goal from ${shortDate(g.effectiveFrom)}`}
                  style={styles.remove}
                >
                  <Icon
                    name="close"
                    size={16}
                    color={c.fnt}
                    strokeWidth={2.6}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  newBtn: { minHeight: 44, justifyContent: 'center' },
  card: { marginTop: 10, padding: 16 },
  goalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  form: { marginTop: 14, paddingTop: 14, borderTopWidth: 2 },
  formRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  dateCol: { flex: 3, minWidth: 0 },
  kcalCol: { flex: 2, minWidth: 0 },
  label: { marginBottom: 6 },
  input: { paddingVertical: 12 },
  save: { marginTop: 12 },
  history: { marginTop: 10 },
  histRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
    marginTop: 4,
    borderTopWidth: 2,
  },
  histDate: { flex: 1 },
  // A 44pt tap target around the small ×, so removing a goal never needs aim.
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
});
