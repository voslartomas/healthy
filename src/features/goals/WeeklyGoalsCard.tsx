import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNav } from '../../app/navigation/types';
import { M, Section } from '../../components/brief';
import { ENERGY_METRICS, GOAL_SOURCES } from '../../data/goalSources';
import { removeGoal } from '../../state/goalsService';
import { useHealthStore } from '../../state/useHealthStore';
import {
  goalCurrent,
  goalProgress,
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

/** "This week · N days left" — week runs Monday–Sunday. */
function daysLeftLabel(): string {
  const dayIdx = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
  const left = 6 - dayIdx;
  return `${left} DAY${left === 1 ? '' : 'S'} LEFT`;
}

/** The Today screen's "03 Week" section: auto-tracked weekly goals with inline
 * edit + a native modal screen to define new ones. Kept as its own component
 * because it owns the editing state and subscribes to the goals + snapshot
 * stores; the host passes `navigation` so it can push the DefineGoal modal. */
export function WeeklyGoalsCard({ navigation }: { navigation: AppNav }) {
  const t = useTheme();
  const c = t.colors;
  const goals = useGoalsStore(s => s.goals);
  const [editing, setEditing] = useState(false);

  return (
    <Section
      n="03"
      title="Week"
      titleRight={
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
      <View style={styles.list}>
        {goals.map(g => (
          <GoalRow key={g.id} goal={g} editing={editing} />
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
    </Section>
  );
}

function GoalRow({ goal, editing }: { goal: WeeklyGoal; editing: boolean }) {
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
  const p = goalProgress(goal, tracked, activities, energy);
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

  const barColor = done ? c.grn : p >= 4 / 7 ? c.ink : c.acc;
  const valColor = done ? c.grn : p >= 4 / 7 ? c.ink : c.acc;
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
              upper: true,
              color: done ? c.grn : c.mut,
            }),
            styles.label,
          ]}
        >
          {goal.name}
          {done ? ' ✓' : ''}
        </Text>
        <Text style={[M(700, 10, { lh: 14, color: valColor }), styles.val]}>
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
      <View style={[styles.track, { backgroundColor: c.track }]}>
        <View
          style={{
            width: `${p * 100}%`,
            height: '100%',
            borderRadius: 3,
            backgroundColor: barColor,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRight: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  list: { marginTop: 14, gap: 13 },
  goal: { gap: 7 },
  goalTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  label: { flex: 1, minWidth: 0 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  val: { flexShrink: 0, textAlign: 'right' },
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
