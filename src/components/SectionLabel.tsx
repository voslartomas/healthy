import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle } from 'react-native';

import { monoFont, useTheme } from '../theme/theme';

/** Uppercase mono section heading (`.sec-label` in the design). */
export function SectionLabel({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) {
  const t = useTheme();
  return (
    <Text style={[styles.label, { color: t.colors.muted }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
    marginHorizontal: 2,
  },
});
