import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { M, S, Section } from '../../components/brief';
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

/**
 * Calorie-goal setup: the active daily net target, an editor to add a new goal
 * (deficit/surplus, effective date), and the goal history with delete. Lives on
 * the Setup tab — goals are set occasionally, not every day, so this belongs
 * with configuration rather than the daily Fuel screen (which still shows the
 * active target in its hero + quad).
 */
export function CalorieGoalSection({ n = '03' }: { n?: string }) {
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

  const inputStyle = {
    ...S(600, 14, { color: c.ink }),
    borderWidth: 1,
    borderColor: c.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  } as const;

  return (
    <Section
      n={n}
      title="Calorie goal"
      titleRight={
        <Pressable
          onPress={() => setEditing(e => !e)}
          accessibilityRole="button"
          accessibilityLabel="Set calorie goal"
        >
          <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>
            {editing ? 'CANCEL' : '+ NEW GOAL'}
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
              style={M(700, 10.5, { ls: 0.5, color: goalHit ? c.grn : c.fnt })}
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

      {editing ? (
        <View style={styles.form}>
          <View style={styles.modeRow}>
            {(['deficit', 'surplus'] as const).map(mo => {
              const on = mode === mo;
              return (
                <Pressable
                  key={mo}
                  onPress={() => setMode(mo)}
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
                    {mo.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.formRow}>
            <TextInput
              value={date}
              onChangeText={setDate}
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
              value={mag}
              onChangeText={setMag}
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
              accessibilityLabel="Save calorie goal"
              style={[
                styles.formBtn,
                { backgroundColor: c.ink, opacity: busy ? 0.5 : 1 },
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
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 12 },
  goalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
  },
  form: { marginTop: 6 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  formName: { flex: 1 },
  formKcal: { width: 78 },
  formBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
