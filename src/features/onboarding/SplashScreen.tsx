import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { M, S } from '../../components/brief';
import { useTheme } from '../../theme/theme';

/**
 * Branded launch splash — shown while the first health read settles (and for a
 * short minimum beat) so the app opens on "Healthy" rather than a flash of
 * empty content. Deliberately calm: no spinner, just the wordmark on the page
 * palette. Uses {@link useTheme} directly (no provider needed) so it can render
 * before the navigation tree mounts.
 */
export function SplashScreen() {
  const c = useTheme().colors;
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.center}>
        <View style={styles.chip}>
          <Image
            source={require('../../../assets/brand-mark.png')}
            style={styles.mark}
            resizeMode="contain"
          />
        </View>
        <Text style={[S(800, 32, { ls: -0.4, color: c.ink }), styles.word]}>
          Healthy
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
  // White rounded tile mirrors the home-screen app icon so the launch splash
  // reads as the same mark in both light and dark schemes.
  chip: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  mark: { width: 58, height: 58 },
  // A little horizontal breathing room so iOS doesn't clip the trailing glyph's
  // ink (the right edge of the wordmark) past its measured advance width.
  word: { marginBottom: 14, paddingHorizontal: 4 },
  rule: { width: 28, height: 3, borderRadius: 2, marginBottom: 14 },
});
