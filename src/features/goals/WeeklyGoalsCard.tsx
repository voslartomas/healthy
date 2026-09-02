import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNav } from '../../app/navigation/types';
import { M, Card } from '../../components/brief';
import { ENERGY_METRICS, GOAL_SOURCES } from '../../data/goalSources';
import { removeGoal } from '../../state/goalsService';
import { useHealthStore } from '../../state/useHealthStore';
import {
  goalCurrent,
  goalDailySeries,
  isAverageGoal,
  isGoalComplete,
  useGoalsStore,
  WeeklyGoal,
} from '../../state/useGoalsStore';
import { useTheme } from '../../theme/theme';

/** Group + abbreviate a number ("56,000" → "56K"). */
function kfmt(n: number): string {
  const r = Math.round(n);
  if (r >= 10000)
    return `${(Math.round(r / 100) / 10).toString().replace(/\.0$/, '')}K`;
  return r.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Weekday index Mon=0 … Sun=6, for both the countdown and the today marker. */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

/** "This week · N days left" — week runs Monday–Sunday. */
function daysLeftLabel(): string {
  const left = 6 - todayIndex();
  return `${left} DAY${left === 1 ? '' : 'S'} LEFT`;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** The Mon→Sun letter strip under the header; today's letter reads in `ink`,
 * the rest in `fnt`, so the per-goal bars below have a column to line up to. */
function WeekStrip() {
  const c = useTheme().colors;
  const today = todayIndex();
  return (
    <View style={styles.strip}>
      {DAY_LETTERS.map((l, i) => (
        <Text
          key={i}
          style={[
            M(700, 8.5, {
              ls: 0.8,
              align: 'center',
              color: i === today ? c.ink : c.fnt,
            }),
            styles.stripDay,
          ]}
        >
          {l}
        </Text>
      ))}
    </View>
  );
}

/** The Today screen's "Week" section: auto-tracked weekly goals, each drawn as a
 * seven-day bar row in its own colour, with inline edit + a native modal screen
 * to define new ones. Kept as its own component because it owns the editing
 * state and subscribes to the goals + snapshot stores; the host passes
 * `navigation` so it can push the DefineGoal modal. */
export function WeeklyGoalsCard({ navigation }: { navigation: AppNav }) {
  const t = useTheme();
  const c = t.colors;
  const goals = useGoalsStore(s => s.goals);
  const [editing, setEditing] = useState(false);

  return (
    <Card
      title="Week"
      right={
        <View style={styles.titleRight}>
          <Text style={M(700, 10.5, { color: c.fnt })}>{daysLeftLabel()}</Text>
          <Pressable
            onPress={() => setEditing(e => !e)}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Done editing goals' : 'Edit goals'}
          >
            <Text style={M(700, 10.5, { ls: 1, color: c.acc })}>
              {editing ? 'DONE' : 'EDIT'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <WeekStrip />
      <View style={styles.list}>
        {goals.map((g, i) => (
          <GoalRow key={g.id} goal={g} index={i} editing={editing} />
        ))}
        <Pressable
          onPress={() => navigation.navigate('DefineGoal')}
          accessibilityRole="button"
          accessibilityLabel="Define a goal"
          style={styles.add}
        >
          <Text style={M(700, 10, { ls: 1.6, color: c.acc })}>
            + DEFINE GOAL
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

function GoalRow({
  goal,
  index,
  editing,
}: {
  goal: WeeklyGoal;
  index: number;
  editing: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  // Progress must reflect the *calendar* week (Mon–Sun) the header counts down,
  // not a rolling last-7-days window — otherwise on Monday last week's activity
  // still counts and every goal reads as already finished. The current-week
  // entry weeklyGoalHistory already derives uses exactly that Monday-based
  // window, so reusing it keeps this tile and the Trends grid in lock-step.
  const week = useHealthStore(
    s => s.snapshot.weeklyHistory[s.snapshot.weeklyHistory.length - 1],
  );
  const tracked = week?.tracked ?? {};
  const activities = week?.activities ?? [];
  const energy = week?.energy ?? [];
  const cur = goalCurrent(goal, tracked, activities, energy);
  const unit = goal.source
    ? GOAL_SOURCES[goal.source].unit
    : goal.metric
      ? ENERGY_METRICS[goal.metric].unit
      : '';

  // An average goal (deficit) is a whole-week average, so it is never "done"
  // mid-week — a strong day-1 average can still slip. Show it as live progress
  // with the count of days that have data so far, so it reads as in-progress
  // rather than finished. Accumulating goals keep the ✓/complete treatment.
  const avg = isAverageGoal(goal);
  const done = !avg && isGoalComplete(goal, tracked, activities, energy);
  const loggedDays = avg ? energy.filter(d => d.net != null).length : 0;

  // Each goal owns a colour from the series, cycled by position. A binary goal
  // (a small count with no unit — "3 strength workouts") shows a fixed tick on
  // the days it happened; everything else scales the bar by that day's share.
  const color = c.goalSeries[index % c.goalSeries.length];
  const binary = !avg && !unit && goal.target <= 7;
  const days = week ? goalDailySeries(goal, week) : [0, 0, 0, 0, 0, 0, 0];
  const today = todayIndex();

  const valText = avg
    ? `${kfmt(cur)}/${kfmt(goal.target)}${unit} · ${loggedDays}d`
    : done
      ? `${kfmt(goal.target)}/${kfmt(goal.target)}`
      : `${kfmt(cur)}/${kfmt(goal.target)}${unit}`;

  return (
    <View style={styles.goal}>
      <View style={styles.goalTop}>
        <Text
          style={[
            M(700, 10, {
              lh: 14,
              ls: 0.6,
              color: done ? color : c.mut,
            }),
            styles.label,
          ]}
        >
          {goal.name}
          {done ? ' ✓' : ''}
        </Text>
        <Text style={[M(700, 10, { lh: 14, color }), styles.val]}>
          {valText}
        </Text>
        {editing ? (
          <Pressable
            onPress={() => removeGoal(goal.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${goal.name} goal`}
            hitSlop={8}
            style={[styles.remove, { borderColor: c.hair }]}
          >
            <Text style={M(700, 11, { color: c.fnt })}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.bars}>
        {days.map((v, d) => {
          if (v > 0) {
            return (
              <View
                key={d}
                testID="weekly-goal-bar-filled"
                style={{
                  flex: 1,
                  borderRadius: 2,
                  height: binary ? 8 : `${Math.max(38, v * 100)}%`,
                  backgroundColor: color,
                }}
              />
            );
          }
          // An empty day: a low track stub, ringed in the goal colour when it is
          // today so the "you are here" column is legible even before any data.
          return (
            <View
              key={d}
              testID="weekly-goal-bar-empty"
              style={{
                flex: 1,
                height: 8,
                borderRadius: 2,
                backgroundColor: c.track,
                ...(d === today
                  ? { borderWidth: 1, borderColor: color }
                  : null),
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRight: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  strip: { flexDirection: 'row', gap: 4, marginTop: 14 },
  stripDay: { flex: 1 },
  list: { marginTop: 12, gap: 14 },
  goal: { gap: 7 },
  goalTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  label: { flex: 1, minWidth: 0 },
  val: { flexShrink: 0, textAlign: 'right' },
  bars: { flexDirection: 'row', gap: 4, alignItems: 'flex-end', height: 22 },
  remove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
});
