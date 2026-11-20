import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRIEF_GUTTER, BRIEF_MAX_WIDTH } from '../../components/brief';
import { useTheme } from '../../theme/theme';

/**
 * A form screen whose main action stays in reach: the content scrolls, the
 * `footer` (the save slab) is pinned to the bottom above a hairline, clear of
 * the home indicator. The Log food and Log a meal screens use it (LogFood /
 * MealLogger artboards) — as inline forms on the Food tab, their save button
 * sat below a long scroll, often under the keyboard.
 *
 * On iOS the whole thing rides up with the keyboard so the footer stays
 * visible while typing; Android resizes the window itself.
 */
export function PinnedFooterLayout({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      style={[styles.root, { backgroundColor: c.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            backgroundColor: c.bg,
            borderTopColor: c.hair,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
          },
        ]}
      >
        <View style={styles.column}>{footer}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    paddingHorizontal: BRIEF_GUTTER,
    paddingTop: 16,
    paddingBottom: 24,
  },
  column: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    alignSelf: 'center',
    gap: 18,
  },
  footer: {
    paddingHorizontal: BRIEF_GUTTER,
    paddingTop: 12,
    borderTopWidth: 2,
  },
});
