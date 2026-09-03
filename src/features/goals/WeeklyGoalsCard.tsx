import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppNav } from '../../app/navigation/types';
import { Card, M } from '../../components/brief';
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

/** "3 DAYS LEFT" — week runs Monday–Sunday. */
function daysLeftLabel(): string {
  const left = 6 - todayIndex();
  return `${left} DAY${left === 1 ? '' : 'S'} LEFT`;
}

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

// Ring geometry: r=13 in a 32×32 box (stroke 4), starting from 12 o'clock.
const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The Today screen's "Week" section (v4): auto-tracked weekly goals laid out as
 * a grid of tiles — each a progress ring with its current value and a seven-day
 * mini-bar row in the goal's colour — with inline edit and a native modal to
 * define new ones. Owns the editing state and subscribes to the goals +
 * snapshot stores; the host passes `navigation` to push the DefineGoal modal.
 */
export function WeeklyGoalsCard({ navigation }: { navigation: AppNav }) {
  const c = useTheme().colors;
  const goals = useGoalsStore(s => s.goals);
  const [editing, setEditing] = useState(false);

  return (
    <Card
      title="Week"
      right={
        <View style={styles.titleRight}>
          <Text style={M(700, 9.5, { color: c.fnt })}>{daysLeftLabel()}</Text>
          <Pressable
            onPress={() => setEditing(e => !e)}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Done editing goals' : 'Edit goals'}
          >
            <Text style={M(700, 9.5, { ls: 1, color: c.acc })}>
              {editing ? 'DONE' : 'EDIT'}
            </Text>
          </Pressable>
        </View>
      }
    >
      {goals.length > 0 ? (
        <View style={styles.grid}>
          {goals.map((g, i) => (
            <GoalTile key={g.id} goal={g} index={i} editing={editing} />
          ))}
        </View>
      ) : (
        <Text style={[M(600, 11, { lh: 16, color: c.mut }), styles.empty]}>
          No goals yet — define one to track your week.
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={M(700, 8.5, { ls: 1, color: c.fnt })}>
          MON → SUN · TODAY {DAY_NAMES[todayIndex()]}
        </Text>
        <Pressable
          onPress={() => navigation.navigate('DefineGoal')}
          accessibilityRole="button"
          accessibilityLabel="Define a goal"
        >
          <Text style={M(700, 9.5, { ls: 1.6, color: c.acc })}>
            + DEFINE GOAL
          </Text>
        </Pressable>
      </View>
    </Card>
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
  // Progress reflects the calendar week (Mon–Sun) the header counts down, using
  // the same current-week window the Trends grid derives from.
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

  const frac = goal.target > 0 ? Math.max(0, Math.min(1, cur / goal.target)) : 0;
  const dash = `${frac * RING_C} ${RING_C}`;

  return (
    <View style={styles.tile}>
      <View style={styles.tileTop}>
        <Text
          numberOfLines={2}
          style={[
            M(700, 9.5, { lh: 12, ls: 0.4, color: done ? color : c.mut }),
            styles.tileLabel,
          ]}
        >
          {goal.name}
          {done ? ' ✓' : ''}
        </Text>
        {editing ? (
          <Pressable
            onPress={() => removeGoal(goal.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${goal.name} goal`}
            hitSlop={8}
          >
            <Text style={M(700, 12, { lh: 12, color: c.fnt })}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tileMid}>
        <Svg width={32} height={32}>
          <Circle
            cx={16}
            cy={16}
            r={RING_R}
            fill="none"
            stroke={c.track}
            strokeWidth={4}
          />
          <Circle
            cx={16}
            cy={16}
            r={RING_R}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={dash}
            transform="rotate(-90 16 16)"
          />
        </Svg>
        <View style={styles.tileVals}>
          <Text style={M(700, 13, { ls: -0.2, color: done ? color : c.ink })}>
            {kfmt(cur)}
          </Text>
          <Text
            numberOfLines={1}
            style={M(600, 8.5, { ls: 0.6, color: c.fnt })}
          >
            /{kfmt(goal.target)}
            {unit ? ` ${unit}` : ''}
          </Text>
        </View>
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
                  height: binary ? 8 : (`${Math.max(38, v * 100)}%` as const),
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
                height: 8,
                borderRadius: 2,
                backgroundColor: c.track,
                ...(d === today ? { borderWidth: 1, borderColor: color } : null),
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
  empty: { marginTop: 14 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
    columnGap: 12,
    marginTop: 16,
  },
  tile: { flexGrow: 1, flexBasis: 96, minWidth: 96, gap: 8 },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    minHeight: 24,
  },
  tileLabel: { flex: 1, minWidth: 0 },
  tileMid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileVals: { flex: 1, minWidth: 0, gap: 4 },
  bars: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 22 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
});
