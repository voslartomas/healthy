import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNav } from '../../app/navigation/types';
import { Card, M, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { foodTagLabel } from '../../state/foodTags';
import {
  allowanceShort,
  Habit,
  HabitDayStatus,
  isHeld,
} from '../../state/habits';
import { setHabitChecked, toggleHabitDay } from '../../state/habitsService';
import { useFoodTagsStore } from '../../state/useFoodTagsStore';
import {
  buildHabitViews,
  HabitDay,
  HabitView,
  heldTodayCount,
  openYesterday,
  sleepOnsetsFromSnapshot,
  useHabitsStore,
} from '../../state/useHabitsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useNow } from '../../state/useNow';
import { useTheme } from '../../theme/theme';

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/**
 * The line under a habit's name: what decided today, and how much allowance is
 * left. It is the only place the rules are spelled out, so a user can always see
 * why a row is green without opening anything.
 *
 * A sleep habit's today is normally still open: the day owns the night you are
 * about to have, so it settles in the morning. The line says so rather than
 * quoting last night's bedtime, which belongs to YESTERDAY's row.
 */
function detailLine(
  habit: Habit,
  status: HabitDayStatus,
  allowanceUsed: boolean,
): string {
  const sleep = habit.type === 'sleep';
  let detail: string;
  if (status === 'auto') {
    detail = sleep
      ? 'AUTO · ASLEEP IN TIME'
      : 'AUTO · NOTHING FLAGGED IN TODAY’S FOOD LOG';
  } else if (status === 'held') {
    detail = 'CHECKED · TAP TO UNDO';
  } else if (status === 'miss') {
    detail = sleep
      ? 'MISSED · ASLEEP TOO LATE'
      : `MISSED · LOGGED ${habit.tag ? foodTagLabel(habit.tag) : 'IT'}`;
  } else if (status === 'allowed') {
    detail = 'ALLOWED MISS · WEEK STILL COUNTS';
  } else if (status === 'open' && habit.auto) {
    detail = sleep
      ? 'AUTO · SETTLES TOMORROW FROM TONIGHT’S SLEEP'
      : 'AUTO · PASSES AT MIDNIGHT UNLESS YOU LOG IT';
  } else if (status === 'none') {
    detail = 'NO DATA YET';
  } else {
    detail = 'TAP TO CHECK · ENDS AT MIDNIGHT';
  }
  if (habit.allowance === 'never') return detail;
  return `${detail} · ${allowanceUsed ? 'ALLOWANCE USED' : allowanceShort(habit.allowance)}`;
}

/** Whether the allowance for the period covering today has already been spent. */
function allowanceSpentThisWeek(view: HabitView): boolean {
  // The last seven evaluated days cover the current week at worst partially,
  // which is the window the row's copy is talking about.
  return view.statuses.slice(-7).includes('allowed');
}

/**
 * The Today "Habits" card: one row per daily habit with its check, the line that
 * says what decided today, and the streak. A habit whose YESTERDAY is still open
 * (a manual one, before the noon cut-off) surfaces a catch-up strip so it can be
 * fixed without digging.
 */
export function HabitsCard({ navigation }: { navigation: AppNav }) {
  const c = useTheme().colors;
  const habits = useHabitsStore(s => s.habits);
  const days = useHabitsStore(s => s.days);
  const tagRows = useFoodTagsStore(s => s.rows);
  const sleep = useHealthStore(s => s.snapshot.sleep);
  // A minute is fine: what changes with time here is the noon catch-up cut-off
  // and the midnight rollover.
  const now = useNow();

  const views = React.useMemo(
    () =>
      buildHabitViews({
        habits,
        days,
        tagRows,
        sleepOnset: sleepOnsetsFromSnapshot(useHealthStore.getState().snapshot),
        now,
      }),
    // `sleep` stands in for the part of the snapshot this reads, so the rows
    // follow a fresh night without re-running on every other health field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, days, tagRows, sleep, now],
  );

  const todayName = DAY_NAMES[(new Date(now).getDay() + 6) % 7];
  const catchup = openYesterday(views);

  return (
    <Card
      title="Habits"
      right={
        habits.length > 0 ? (
          <Text style={M(700, 9.5, { color: c.fnt })}>
            {todayName} · {heldTodayCount(views)} OF {views.length}
          </Text>
        ) : null
      }
    >
      {views.length === 0 ? (
        <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
          No habits yet. Add one — “no junk food”, “asleep before 23:00” — and
          the app holds you to it every day.
        </Text>
      ) : null}

      <View style={styles.rows}>
        {views.map((v, i) => (
          <HabitRow
            key={v.habit.id}
            view={v}
            first={i === 0}
            onEdit={() =>
              navigation.navigate('HabitDefine', { habitId: v.habit.id })
            }
          />
        ))}
      </View>

      {catchup ? (
        <View
          style={[
            styles.catchup,
            { backgroundColor: c.warnBg, borderColor: c.warnLine },
          ]}
        >
          <View style={styles.catchupText}>
            <Text style={S(600, 12, { lh: 16, color: c.ink })}>
              Yesterday is still open
            </Text>
            <Text
              style={[
                M(600, 9.5, { ls: 0.6, color: c.fnt }),
                styles.catchupSub,
              ]}
            >
              {catchup.habit.name.toUpperCase()} · UNCHECKED
            </Text>
          </View>
          <Pressable
            onPress={() =>
              void setHabitChecked(
                catchup.habit.id,
                catchup.days[catchup.todayIndex - 1],
                true,
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`Check ${catchup.habit.name} for yesterday`}
            style={[styles.catchupBtn, { backgroundColor: c.accSolid }]}
          >
            <Text style={M(700, 10, { ls: 0.8, color: c.onAccent })}>
              CHECK IT
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.foot}>
        <Text style={M(700, 8.5, { ls: 1, color: c.fnt })}>
          {views.length > 0 ? 'MON → SUN · TAP ANY PAST DAY TO FIX IT' : ''}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('HabitDefine')}
          accessibilityRole="button"
          accessibilityLabel="Add a habit"
        >
          <Text style={M(700, 9.5, { ls: 1.6, color: c.acc })}>
            + NEW HABIT
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

function HabitRow({
  view,
  first,
  onEdit,
}: {
  view: HabitView;
  first: boolean;
  onEdit: () => void;
}) {
  const c = useTheme().colors;
  const { habit, today: status } = view;
  const on = status === 'auto' || status === 'held';
  // `days` runs past today to the end of the week (so the strip can show
  // Mon→Sun), so today is at `todayIndex`, NOT at the end of the array.
  const todayStart = view.days[view.todayIndex];

  // 'auto' is the app's own verdict, so there is nothing to undo — only a check
  // the user placed (or can place) is toggleable.
  const toggle = () => void toggleHabitDay(habit.id, todayStart, status);

  // A day that held is a day that held — the app reading your log and you
  // checking it off get the same green, because the difference is bookkeeping,
  // not something you need to look at. Only the outcomes differ: held, forgiven,
  // broken, undecided.
  const border = isHeld(status)
    ? status === 'allowed'
      ? c.gold
      : c.grn
    : status === 'miss'
      ? c.red
      : c.hair;

  return (
    <View style={first ? null : { borderTopWidth: 1, borderTopColor: c.hair }}>
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on }}
          accessibilityLabel={habit.name}
          style={[
            styles.check,
            {
              borderColor: border,
              borderStyle: status === 'allowed' ? 'dashed' : 'solid',
            },
          ]}
        >
          {on ? (
            <Icon name="check" size={18} strokeWidth={2.4} color={c.grn} />
          ) : null}
        </Pressable>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${habit.name}`}
          style={styles.rowText}
        >
          <Text style={S(600, 13.5, { lh: 17, color: c.ink })}>
            {habit.name}
          </Text>
          <Text
            style={[M(600, 9.5, { ls: 0.6, color: c.fnt }), styles.rowDetail]}
          >
            {detailLine(habit, status, allowanceSpentThisWeek(view))}
          </Text>
        </Pressable>
        <Text style={M(700, 11, { color: isHeld(status) ? c.grn : c.fnt })}>
          {view.streak}d
        </Text>
      </View>
      {/* The week, Monday → Sunday — the same seven-column read the weekly
          goals give, indented to line up under the habit's name. */}
      <View style={styles.week}>
        {view.week.map(d => (
          <WeekCell
            key={d.dayStart}
            day={d}
            habitName={habit.name}
            onToggle={() => void toggleHabitDay(habit.id, d.dayStart, d.status)}
          />
        ))}
      </View>
    </View>
  );
}

/** Marks a day carries in the week strip. An allowed slip gets its own glyph so
 * it never reads as either a clean day or a miss. */
const DAY_MARK: Partial<Record<HabitDay['status'], string>> = {
  auto: '✓',
  held: '✓',
  allowed: '~',
  miss: '×',
};

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekCell({
  day,
  habitName,
  onToggle,
}: {
  day: HabitDay;
  habitName: string;
  onToggle: () => void;
}) {
  const c = useTheme().colors;
  const { status } = day;
  // Held is held, however it was decided (see HabitRow) — 'auto' and 'held'
  // deliberately share one fill.
  const fill =
    status === 'auto' || status === 'held'
      ? c.grn
      : status === 'miss'
        ? c.red
        : status === 'open'
          ? c.track
          : 'transparent';
  // Every day of the week has to be visible, including the ones with nothing to
  // say: a brand-new habit's earlier days, and the days still to come, are drawn
  // as outlines rather than left as holes in the strip.
  const border = day.future
    ? { borderWidth: 1, borderColor: c.hair, borderStyle: 'dashed' as const }
    : status === 'allowed'
      ? { borderWidth: 1, borderColor: c.gold, borderStyle: 'dashed' as const }
      : status === 'none'
        ? { borderWidth: 1, borderColor: c.hair, borderStyle: 'solid' as const }
        : status === 'open' && day.isToday
          ? {
              borderWidth: 1,
              borderColor: c.acc,
              borderStyle: 'solid' as const,
            }
          : status === 'open'
            ? {
                borderWidth: 1,
                borderColor: c.hair,
                borderStyle: 'solid' as const,
              }
            : null;
  const weekday = new Date(day.dayStart).getDay();
  const letter = WEEK_LETTERS[(weekday + 6) % 7];
  return (
    <Pressable
      onPress={day.future ? undefined : onToggle}
      disabled={day.future}
      accessibilityRole="button"
      accessibilityLabel={`${habitName}, ${letter}`}
      style={[
        styles.weekCell,
        { backgroundColor: fill, opacity: day.future ? 0.7 : 1 },
        border,
      ]}
    >
      <Text
        style={M(700, 9, {
          color: status === 'allowed' ? c.gold : c.onAccent,
        })}
      >
        {DAY_MARK[status] ?? ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: 12 },
  rows: { marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowDetail: { marginTop: 3, lineHeight: 14 },
  // Indented past the 44px check + its 12px gap so the strip starts under the
  // habit's name, the way the design has it.
  week: { flexDirection: 'row', gap: 3, paddingLeft: 56, paddingBottom: 10 },
  weekCell: {
    flex: 1,
    height: 22,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catchup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  catchupText: { flex: 1, minWidth: 0 },
  catchupSub: { marginTop: 2, lineHeight: 14 },
  catchupBtn: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
});
