import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { monoFont, useTheme } from '../theme/theme';

interface RingProps {
  /** Progress 0..1. */
  progress: number;
  color: string;
  size: number;
  strokeWidth: number;
  /** Large centered value, e.g. "68". */
  value?: string;
  /** Small superscript after the value, e.g. "%". */
  valueSuffix?: string;
  /** Uppercase caption under the value. */
  label?: string;
  valueFontSize?: number;
}

/**
 * Circular progress ring (`.ring` in the design). Track + rounded fill arc,
 * with an optional centered value/label. The arc starts at 12 o'clock.
 */
export function Ring({
  progress,
  color,
  size,
  strokeWidth,
  value,
  valueSuffix,
  label,
  valueFontSize,
}: RingProps) {
  const t = useTheme();
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={t.colors.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          fill="none"
          // rotate so the arc begins at the top
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {(value || label) && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          {value != null && (
            <Text
              style={[
                styles.value,
                { color: t.colors.fg, fontSize: valueFontSize ?? size * 0.26 },
              ]}
            >
              {value}
              {valueSuffix ? (
                <Text style={[styles.suffix, { color: t.colors.muted }]}>
                  {valueSuffix}
                </Text>
              ) : null}
            </Text>
          )}
          {label ? (
            <Text style={[styles.label, { color: t.colors.muted }]}>
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: monoFont,
    fontWeight: '800',
    letterSpacing: -1,
  },
  suffix: {
    fontWeight: '700',
  },
  label: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});
