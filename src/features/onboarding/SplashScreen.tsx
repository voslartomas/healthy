import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { M, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { useTheme } from '../../theme/theme';

/**
 * Branded launch splash — shown while the first health read settles (and for a
 * short minimum beat) so the app opens on "Health Buddy" rather than a flash of
 * empty content. Deliberately calm: no spinner, just the wordmark on the paper
 * palette. Uses {@link useTheme} directly (no provider needed) so it can render
 * before the navigation tree mounts.
 */
export function SplashScreen() {
  const c = useTheme().colors;
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.center}>
        <View style={[styles.chip, { backgroundColor: c.acc }]}>
          <Icon name="heart" size={46} color={c.inv} />
        </View>
        <Text style={[S(800, 32, { ls: -0.4, color: c.ink }), styles.word]}>
          Health Buddy
        </Text>
        <View style={[styles.rule, { backgroundColor: c.acc }]} />
        <Text style={M(700, 11, { ls: 2.4, upper: true, color: c.fnt })}>
          Your daily health brief
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: 24 },
  chip: {
    width: 88,
    height: 88,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  word: { marginBottom: 14 },
  rule: { width: 28, height: 3, borderRadius: 2, marginBottom: 14 },
});
