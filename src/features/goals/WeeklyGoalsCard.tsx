import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { Ring } from '../../components/Ring';
import { GOAL_SOURCES } from '../../data/goalSources';
import { dashboard } from '../../data/health';
import { removeGoal } from '../../state/goalsService';
import {
  goalCurrent,
  goalProgress,
  isGoalComplete,
  useGoalsStore,
  WeeklyGoal,
} from '../../state/useGoalsStore';
import { monoFont, radii, useTheme } from '../../theme/theme';
import { GoalDefinitionSheet } from './GoalDefinitionSheet';

/** Group a number with thousands separators (Hermes-safe, no Intl dependency). */
function fmt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function headline(avg: number, count: number): string {
  if (count === 0) return 'Set your first goal';
  if (avg >= 0.8) return 'Crushing it this week';
  if (avg >= 0.5) return 'Strong week so far';
  return "Let's get moving";
}

export function WeeklyGoalsCard() {
  const t = useTheme();
  const goals = useGoalsStore(s => s.goals);
  const [editing, setEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const total = goals.reduce((sum, g) => sum + goalProgress(g), 0);
  const avg = goals.length ? total / goals.length : 0;
  const doneCount = goals.filter(isGoalComplete).length;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={[styles.week, { color: t.colors.muted }]}>
          {dashboard.weekLabel}
        </Text>
        <Pressable
          onPress={() => setEditing(e => !e)}
          accessibilityRole="button"
        >
          <Text style={[styles.config, { color: t.colors.accent }]}>
            {editing ? 'Done' : 'Edit'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Ring
          progress={avg}
          color={t.colors.accent}
          size={80}
          strokeWidth={9}
          value={goals.length ? `${Math.round(avg * 100)}%` : '—'}
          label="on track"
          valueFontSize={20}
        />
        <View style={styles.heroMeta}>
          <Text style={[styles.heroTitle, { color: t.colors.fg }]}>
            {headline(avg, goals.length)}
          </Text>
          <Text style={[styles.heroBody, { color: t.colors.muted }]}>
            {goals.length === 0
              ? 'Auto-tracked from your steps and logged activities.'
              : `${doneCount} of ${goals.length} goals complete · auto-tracked from steps & activities`}
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {goals.map((g, i) => (
          <GoalRow key={g.id} goal={g} editing={editing} first={i === 0} />
        ))}
      </View>

      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.add,
          { borderColor: t.colors.border, backgroundColor: t.colors.surface2 },
          pressed && { transform: [{ scale: 0.985 }] },
        ]}
      >
        <Icon name="plus" size={15} color={t.colors.accent} strokeWidth={2} />
        <Text style={[styles.addText, { color: t.colors.accent }]}>
          Define a goal
        </Text>
      </Pressable>

      <GoalDefinitionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </Card>
  );
}

function GoalRow({
  goal,
  editing,
  first,
}: {
  goal: WeeklyGoal;
  editing: boolean;
  first: boolean;
}) {
  const t = useTheme();
  const done = isGoalComplete(goal);
  const src = GOAL_SOURCES[goal.source];
  const cur = goalCurrent(goal);

  return (
    <View
      style={[
        styles.goal,
        !first && {
          borderTopColor: t.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View
        style={[
          styles.gic,
          { backgroundColor: done ? t.colors.recStateBg : t.colors.surface2 },
        ]}
      >
        <Icon name={src.icon} size={19} color={t.colors.accent} />
      </View>
      <View style={styles.gmain}>
        <View style={styles.grow}>
          <View style={styles.gnameWrap}>
            <Text
              style={[styles.gname, { color: t.colors.fg }]}
              numberOfLines={1}
            >
              {goal.name}
            </Text>
            <View style={[styles.auto, { backgroundColor: t.colors.surface2 }]}>
              <Icon name="bolt" size={9} color={t.colors.muted} />
              <Text style={[styles.autoText, { color: t.colors.muted }]}>
                Auto
              </Text>
            </View>
          </View>
          <Text style={[styles.gval, { color: t.colors.muted }]}>
            <Text style={{ color: t.colors.fg }}>{fmt(cur)}</Text> /{' '}
            {fmt(goal.target)}
            {src.unit}
          </Text>
        </View>
        <ProgressBar
          progress={goalProgress(goal)}
          color={done ? t.colors.rec : t.colors.accent}
          height={8}
        />
      </View>
      {editing ? (
        <Pressable
          onPress={() => removeGoal(goal.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${goal.name} goal`}
          hitSlop={8}
        >
          <Icon name="close" size={16} color={t.colors.faint} strokeWidth={2} />
        </Pressable>
      ) : done ? (
        <Icon name="check" size={18} color={t.colors.rec} strokeWidth={2.4} />
      ) : (
        <View style={styles.checkSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  week: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  config: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroMeta: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  heroBody: {
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 18,
  },
  list: {
    marginTop: 6,
  },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  gic: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gmain: {
    flex: 1,
    minWidth: 0,
  },
  grow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  gnameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  gname: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  auto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  autoText: {
    fontFamily: monoFont,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gval: {
    fontFamily: monoFont,
    fontSize: 12,
    fontWeight: '700',
  },
  add: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  checkSpacer: {
    width: 18,
  },
});
