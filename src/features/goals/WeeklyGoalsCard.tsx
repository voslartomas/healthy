import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppNav } from '../../app/navigation/types';
import { chunky, S } from '../../components/brief';
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

/** "3 days left" — week runs Monday–Sunday. */
function daysLeftLabel(): string {
  const left = 6 - todayIndex();
  return left === 0 ? 'Last day' : `${left} day${left === 1 ? '' : 's'} left`;
}

/** Goal names are saved in caps (GoalDefine); show them as words. */
function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const lower = name.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const RING = 44;
const RING_STROKE = 7;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The Today screen's "This week" section (ADR-007): auto-tracked weekly goals as
 * a two-column grid of chunky tiles — each a progress ring in the goal's colour,
 * its value against the target, and a Mon→Sun mini-bar row — followed by a
 * dashed "+ New goal" tile, with inline edit. Subscribes to the goals +
 * snapshot stores; the host passes `navigation` to push the DefineGoal modal.
 */
export function WeeklyGoalsCard({ navigation }: { navigation: AppNav }) {
  const c = useTheme().colors;
  const goals = useGoalsStore(s => s.goals);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <View style={styles.head}>
        <Text style={S(900, 22, { lh: 28, color: c.ink })}>This week</Text>
        <View style={styles.titleRight}>
          <Text style={S(800, 14, { color: c.fnt })}>{daysLeftLabel()}</Text>
          {goals.length > 0 ? (
            <Pressable
              onPress={() => setEditing(e => !e)}
              accessibilityRole="button"
              accessibilityLabel={editing ? 'Done editing goals' : 'Edit goals'}
              hitSlop={10}
            >
              <Text style={S(900, 15, { color: c.acc })}>
                {editing ? 'Done' : 'Edit'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {goals.length === 0 ? (
        <Text style={[S(700, 15, { lh: 21, color: c.mut }), styles.empty]}>
          No goals yet — define one to track your week.
        </Text>
      ) : null}

      <View style={styles.grid}>
        {goals.map((g, i) => (
          <GoalTile key={g.id} goal={g} index={i} editing={editing} />
        ))}
        <Pressable
          onPress={() => navigation.navigate('DefineGoal')}
          accessibilityRole="button"
          accessibilityLabel="Define a goal"
          style={[styles.tile, styles.addTile, { borderColor: c.hair }]}
        >
          <Text style={S(900, 30, { lh: 32, color: c.acc })}>+</Text>
          <Text style={S(900, 15, { color: c.acc })}>New goal</Text>
        </Pressable>
      </View>
    </>
  );
}

function GoalTile({
  goal,
  index,
  editing,
}: {
  goal: WeeklyGoal;
  index: number;
  editing: boolean;
}) {
  const c = useTheme().colors;
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

  const avg = isAverageGoal(goal);
  const done = !avg && isGoalComplete(goal, tracked, activities, energy);

  const color = c.goalSeries[index % c.goalSeries.length];
  const binary = !avg && !unit && goal.target <= 7;
  const days = week ? goalDailySeries(goal, week) : [0, 0, 0, 0, 0, 0, 0];
  const today = todayIndex();

  const frac =
    goal.target > 0 ? Math.max(0, Math.min(1, cur / goal.target)) : 0;
  const dash = `${frac * RING_C} ${RING_C}`;

  return (
    <View style={[styles.tile, chunky(c, 20)]}>
      <View style={styles.tileTop}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RING_R}
            fill="none"
            stroke={c.track}
            strokeWidth={RING_STROKE}
          />
          {frac > 0 ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RING_R}
              fill="none"
              stroke={color}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={dash}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
        </Svg>
        <Text
          numberOfLines={2}
          style={[S(900, 16, { lh: 19, color: c.ink }), styles.tileLabel]}
        >
          {displayName(goal.name)}
          {done ? ' ✓' : ''}
        </Text>
        {editing ? (
          <Pressable
            onPress={() => removeGoal(goal.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${goal.name} goal`}
            hitSlop={10}
            style={[styles.remove, { backgroundColor: c.redTint }]}
          >
            <Text style={S(900, 16, { lh: 18, color: c.red })}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Text numberOfLines={1} style={S(800, 15, { color: c.mut })}>
        <Text style={S(900, 20, { color: done ? c.grn : c.ink })}>
          {kfmt(cur)}
        </Text>{' '}
        / {kfmt(goal.target)}
        {unit ? ` ${unit}` : ''}
      </Text>

      <View style={styles.bars}>
        {days.map((v, d) => {
          if (v > 0) {
            return (
              <View
                key={d}
                testID="weekly-goal-bar-filled"
                style={{
                  flex: 1,
                  borderRadius: 3,
                  height: binary ? 10 : (`${Math.max(38, v * 100)}%` as const),
                  backgroundColor: color,
                }}
              />
            );
          }
          return (
            <View
              key={d}
              testID="weekly-goal-bar-empty"
              style={{
                flex: 1,
                height: 10,
                borderRadius: 3,
                backgroundColor: c.track,
                ...(d === today
                  ? { borderWidth: 2, borderColor: color }
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    gap: 12,
  },
  titleRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  empty: { marginTop: 10 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
    padding: 14,
    gap: 10,
  },
  addTile: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 120,
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileLabel: { flex: 1, minWidth: 0 },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flexDirection: 'row', gap: 3, alignItems: 'flex-end', height: 24 },
});
