import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNav } from '../../app/navigation/types';
import { chunky, Pill, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { foodTagLabel } from '../../state/foodTags';
import {
  allowanceShort,
  DEFAULT_WATER_TARGET_ML,
  Habit,
  HabitDayStatus,
  litresLabel,
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
  waterFromSnapshot,
  useHabitsStore,
} from '../../state/useHabitsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useNow } from '../../state/useNow';
import { useTheme } from '../../theme/theme';

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
  waterTodayMl: number | null = null,
): string {
  const sleep = habit.type === 'sleep';
  let detail: string;
  if (habit.type === 'water' && (status === 'auto' || status === 'open')) {
    // Progress toward the target, read straight from today's hydration.
    const target = litresLabel(habit.targetMl ?? DEFAULT_WATER_TARGET_ML);
    detail =
      status === 'auto'
        ? `Auto · ${litresLabel(waterTodayMl ?? 0)} — target reached`
        : `Auto · ${waterTodayMl != null ? litresLabel(waterTodayMl) : '0 L'} of ${target} so far`;
  } else if (habit.type === 'water' && status === 'miss') {
    detail = 'Missed · target not reached';
  } else if (status === 'auto') {
    detail = sleep
      ? 'Auto · asleep in time'
      : 'Auto · nothing flagged in today’s food';
  } else if (status === 'held') {
    detail = 'Checked · tap to undo';
  } else if (status === 'miss') {
    detail = sleep
      ? 'Missed · asleep too late'
      : `Missed · logged ${habit.tag ? foodTagLabel(habit.tag).toLowerCase() : 'it'}`;
  } else if (status === 'allowed') {
    detail = 'Allowed miss · the week still counts';
  } else if (status === 'open' && habit.auto) {
    detail = sleep
      ? 'Auto · settles tomorrow from tonight’s sleep'
      : 'Auto · passes at midnight unless you log it';
  } else if (status === 'none') {
    detail = 'No data yet';
  } else {
    detail = 'Tap to check · ends at midnight';
  }
  if (habit.allowance === 'never') return detail;
  return `${detail} · ${allowanceUsed ? 'allowance used' : allowanceShort(habit.allowance).toLowerCase()}`;
}

/** Whether the allowance for the period covering today has already been spent. */
function allowanceSpentThisWeek(view: HabitView): boolean {
  return view.statuses.slice(-7).includes('allowed');
}

/**
 * The Today "habits" card (ADR-007): a big tappable check per habit, the line
 * that says what decided today, the streak with its flame, and the week strip.
 * A habit whose YESTERDAY is still open (a manual one, before the noon cut-off)
 * surfaces an amber catch-up banner above the list so it can be fixed without
 * digging.
 */
export function HabitsCard({ navigation }: { navigation: AppNav }) {
  const c = useTheme().colors;
  const habits = useHabitsStore(s => s.habits);
  const days = useHabitsStore(s => s.days);
  const tagRows = useFoodTagsStore(s => s.rows);
  const sleep = useHealthStore(s => s.snapshot.sleep);
  const waterDays = useHealthStore(s => s.snapshot.waterDays);
  const now = useNow();

  const views = React.useMemo(
    () =>
      buildHabitViews({
        habits,
        days,
        tagRows,
        sleepOnset: sleepOnsetsFromSnapshot(useHealthStore.getState().snapshot),
        waterMl: waterFromSnapshot(useHealthStore.getState().snapshot, now),
        now,
      }),
    // `sleep` / `waterDays` stand in for the parts of the snapshot this reads,
    // so the rows follow a fresh night or glass without re-running on every
    // other health field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [habits, days, tagRows, sleep, waterDays, now],
  );

  const catchup = openYesterday(views);

  return (
    <>
      <View style={styles.head}>
        <Text style={S(900, 22, { lh: 28, color: c.ink })}>Today’s habits</Text>
        {views.length > 0 ? (
          <Pill
            spec={{
              text: `${heldTodayCount(views)} of ${views.length} done`,
              bg: c.streakTint,
              textColor: c.streakText,
            }}
          />
        ) : null}
      </View>

      {catchup ? (
        <View
          style={[
            styles.catchup,
            { backgroundColor: c.warnBg, borderColor: c.warnLine },
          ]}
        >
          <View style={styles.catchupText}>
            <Text style={S(900, 16, { color: c.ink })}>
              Yesterday is still open
            </Text>
            <Text style={S(700, 14, { color: c.amb })}>
              {catchup.habit.name} · not checked
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
            style={[
              styles.catchupBtn,
              { backgroundColor: c.streak, borderBottomColor: c.streakText },
            ]}
          >
            <Text style={S(900, 15, { color: '#3D2A00' })}>Check it</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[chunky(c), styles.list]}>
        {views.length === 0 ? (
          <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.empty]}>
            No habits yet. Add one — “no junk food”, “asleep before 23:00” — and
            the app holds you to it every day.
          </Text>
        ) : null}
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

      <View style={styles.foot}>
        <Pressable
          onPress={() => navigation.navigate('HabitDefine')}
          accessibilityRole="button"
          accessibilityLabel="Add a habit"
          hitSlop={10}
        >
          <Text style={S(900, 16, { color: c.acc })}>+ New habit</Text>
        </Pressable>
        {views.length > 0 ? (
          <Text style={S(700, 13, { color: c.fnt })}>
            Tap any past day to fix it
          </Text>
        ) : null}
      </View>
    </>
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
  const waterTodayMl = useHealthStore(s => s.snapshot.waterTodayMl);
  const on = status === 'auto' || status === 'held';
  const todayStart = view.days[view.todayIndex];

  const toggle = () => void toggleHabitDay(habit.id, todayStart, status);

  // The check: a solid green disc when today holds, an amber dashed ring for
  // an allowed slip, red ring for a miss, an empty grey ring when still open.
  const ring = on
    ? { backgroundColor: c.grnSolid, borderColor: c.grnSolid }
    : status === 'allowed'
      ? { borderColor: c.streak, borderStyle: 'dashed' as const }
      : status === 'miss'
        ? { borderColor: c.redSolid, backgroundColor: c.redTint }
        : { borderColor: c.hair };

  return (
    <View
      style={[
        styles.rowWrap,
        first ? null : { borderTopWidth: 2, borderTopColor: c.hair },
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={toggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on }}
          accessibilityLabel={habit.name}
          style={[styles.check, ring]}
        >
          {on ? (
            <Icon name="check" size={22} strokeWidth={3} color={c.onAccent} />
          ) : null}
        </Pressable>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${habit.name}`}
          style={styles.rowText}
        >
          <Text style={S(900, 17, { lh: 22, color: c.ink })}>{habit.name}</Text>
          <Text style={S(700, 14, { lh: 19, color: c.mut })}>
            {detailLine(
              habit,
              status,
              allowanceSpentThisWeek(view),
              waterTodayMl,
            )}
          </Text>
        </Pressable>
        <View
          style={styles.streak}
          accessible
          accessibilityLabel={`${view.streak} day streak`}
        >
          <Icon name="flame" size={20} color={c.streak} />
          <Text style={S(900, 17, { color: c.streakText })}>{view.streak}</Text>
        </View>
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
 * it never reads as either a clean day or a miss; other days show their letter. */
const DAY_MARK: Partial<Record<HabitDay['status'], string>> = {
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
  const held = status === 'auto' || status === 'held';
  const look = day.future
    ? {
        borderWidth: 2,
        borderColor: c.hair,
        borderStyle: 'dashed' as const,
        text: c.fnt,
      }
    : held
      ? { backgroundColor: c.grnSolid, text: c.onAccent }
      : status === 'allowed'
        ? {
            backgroundColor: c.streakTint,
            borderWidth: 2,
            borderColor: c.streak,
            borderStyle: 'dashed' as const,
            text: c.streakText,
          }
        : status === 'miss'
          ? {
              backgroundColor: c.redTint,
              borderWidth: 2,
              borderColor: c.redSolid,
              text: c.red,
            }
          : { backgroundColor: c.soft, text: c.mut };
  const { text, ...box } = look;
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
        box,
        // Today gets a ring around the cell, whatever its state.
        day.isToday ? [styles.today, { borderColor: c.ink }] : null,
      ]}
    >
      <Text style={S(900, 12, { color: text })}>
        {DAY_MARK[status] ?? letter}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    gap: 12,
  },
  list: { marginTop: 12, overflow: 'hidden' },
  empty: { padding: 16 },
  rowWrap: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  week: { flexDirection: 'row', gap: 6, paddingLeft: 58 },
  weekCell: {
    flex: 1,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: { borderWidth: 2, borderStyle: 'solid' },
  catchup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderRadius: 18,
  },
  catchupText: { flex: 1, minWidth: 0 },
  catchupBtn: {
    borderRadius: 14,
    borderBottomWidth: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
});
