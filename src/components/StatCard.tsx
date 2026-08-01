import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { monoFont, radii, useTheme } from '../theme/theme';

export type StatTrend = 'up' | 'down' | 'flat';

interface StatCardProps {
  label: string;
  /** Dot color next to the label. */
  dotColor: string;
  value: string;
  /** Small unit shown after the value, e.g. "ms". */
  unit?: string;
  /** Delta / caption line under the value. */
  detail?: string;
  trend?: StatTrend;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Mini metric tile (`.stat` in the design). */
export function StatCard({
  label,
  dotColor,
  value,
  unit,
  detail,
  trend = 'flat',
  onPress,
  accessibilityLabel,
  style,
}: StatCardProps) {
  const t = useTheme();
  const trendColor =
    trend === 'up'
      ? t.colors.rec
      : trend === 'down'
        ? t.colors.recRed
        : t.colors.muted;

  const body = (
    <>
      <View style={styles.k}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.kText, { color: t.colors.muted }]}>{label}</Text>
      </View>
      <Text style={[styles.v, { color: t.colors.fg }]}>
        {value}
        {unit ? (
          <Text style={[styles.unit, { color: t.colors.muted }]}> {unit}</Text>
        ) : null}
      </Text>
      {detail ? (
        <Text style={[styles.d, { color: trendColor }]}>{detail}</Text>
      ) : null}
    </>
  );

  const base: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    ...t.cardShadow,
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.stat,
          base,
          pressed && { transform: [{ scale: 0.985 }] },
          style,
        ]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[styles.stat, base, style]}>{body}</View>;
}

const styles = StyleSheet.create({
  stat: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  k: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  kText: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  v: {
    fontFamily: monoFont,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 10,
  },
  unit: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  d: {
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 6,
  },
});
