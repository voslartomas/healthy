import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNav } from '../../app/navigation/types';
import { cardTitleStyle, chunky, S } from '../../components/brief';
import { connectHealthSource, healthSourceName } from '../../health';
import { litresLabel, waterTarget } from '../../state/habits';
import { useHabitsStore } from '../../state/useHabitsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** ml → "1.25 L" (two decimals max, trailing zeros dropped). */
function litres(ml: number): string {
  return `${Number((ml / 1000).toFixed(2))} L`;
}

/**
 * Hydration at the top of the Food screen: a glass that fills toward the daily
 * target, today's total, and what is left.
 *
 * Read-only: water is logged in the user's tracker app and read back from the
 * OS store. Nothing logged renders "—", never a fabricated 0. Without a water
 * habit it offers to make one (the habit sheet opens pre-set to Water); with
 * one, it names it, since the habit is what turns the target into a streak.
 */
export function HydrationCard({ navigation }: { navigation: AppNav }) {
  const c = useTheme().colors;
  const waterMl = useHealthStore(s => s.snapshot.waterTodayMl);
  const refreshHealth = useHealthStore(s => s.refresh);
  const habits = useHabitsStore(s => s.habits);
  const target = waterTarget(habits);
  const frac = waterMl != null ? Math.min(1, waterMl / target.ml) : 0;
  const reached = waterMl != null && waterMl >= target.ml;

  return (
    <View
      style={[chunky(c), styles.card, { backgroundColor: c.waterTint }]}
      accessible={false}
    >
      <View style={[styles.glass, { borderColor: c.water }]}>
        <View
          style={[
            styles.glassFill,
            { height: `${frac * 100}%`, backgroundColor: c.water },
          ]}
        />
      </View>
      <View style={styles.text}>
        <Text style={cardTitleStyle(c.ink)}>Hydration</Text>
        <Text
          style={S(800, 16, { color: c.waterText })}
          accessibilityLabel={`Water ${waterMl != null ? litres(waterMl) : 'not logged'} of ${litres(target.ml)}`}
        >
          <Text style={S(900, 26, { lh: 32, color: c.ink })}>
            {waterMl != null ? litres(waterMl) : '—'}
          </Text>{' '}
          of {litres(target.ml)}
        </Text>
        {waterMl != null ? (
          <Text style={S(700, 14, { lh: 19, color: c.mut })}>
            {reached
              ? 'Reached for today'
              : `${litres(target.ml - waterMl)} to go`}{' '}
            · from {healthSourceName()}
          </Text>
        ) : (
          <>
            <Text style={S(700, 14, { lh: 19, color: c.mut })}>
              Nothing logged today. Water comes from {healthSourceName()} — log
              it in your water tracker.
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
              style={styles.link}
            >
              <Text style={S(900, 15, { color: c.waterText })}>
                Allow water access →
              </Text>
            </Pressable>
          </>
        )}
        {target.habit ? (
          <Pressable
            onPress={() =>
              navigation.navigate('HabitDefine', {
                habitId: target.habit?.id,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Edit habit ${target.habit.name}`}
            style={styles.link}
          >
            <Text style={S(800, 14, { color: c.waterText })}>
              Habit · {litresLabel(target.ml)} a day ›
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() =>
              navigation.navigate('HabitDefine', { habitType: 'water' })
            }
            accessibilityRole="button"
            accessibilityLabel="Make water a daily habit"
            style={styles.link}
          >
            <Text style={S(900, 15, { color: c.waterText })}>
              Make it a daily habit →
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  text: { flex: 1, minWidth: 0, gap: 2 },
  link: { minHeight: 40, justifyContent: 'center' },
});
