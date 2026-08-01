import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { radii, useTheme } from '../theme/theme';

interface ProgressBarProps {
  /** Fill fraction 0..1. */
  progress: number;
  color: string;
  height?: number;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Rounded track + fill bar (`.bar` / `.gbar` in the design). */
export function ProgressBar({
  progress,
  color,
  height = 9,
  trackColor,
  style,
}: ProgressBarProps) {
  const t = useTheme();
  const pct = `${Math.max(0, Math.min(1, progress)) * 100}%` as const;
  return (
    <View
      style={[
        styles.track,
        {
          height,
          borderRadius: radii.pill,
          backgroundColor: trackColor ?? t.colors.surface2,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.fill,
          { width: pct, backgroundColor: color, borderRadius: radii.pill },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
  },
});
