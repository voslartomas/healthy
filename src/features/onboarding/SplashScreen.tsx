import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { S } from '../../components/brief';
import { useTheme } from '../../theme/theme';

/**
 * Branded launch splash — shown while the first health read settles (and for a
 * short minimum beat) so the app opens on "Healthy" rather than a flash of
 * empty content. Deliberately calm: no spinner, just the wordmark on the page
 * palette, in the friendly type (ADR-007: Nunito Black, sentence case). Uses {@link useTheme} directly (no provider needed) so it can render
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
        <Text style={[S(900, 36, { lh: 44, color: c.ink }), styles.word]}>
          Healthy
        </Text>
        <View style={[styles.rule, { backgroundColor: c.grnSolid }]} />
        <Text style={S(700, 17, { color: c.mut })}>
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
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  mark: { width: 62, height: 62 },
  // A little horizontal breathing room so iOS doesn't clip the trailing glyph's
  // ink (the right edge of the wordmark) past its measured advance width.
  word: { marginBottom: 14, paddingHorizontal: 4 },
  rule: { width: 36, height: 5, borderRadius: 3, marginBottom: 14 },
});
