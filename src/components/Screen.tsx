import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/theme';
import { Icon } from './Icon';

/** Scrollable screen body with the app background and consistent padding. */
export function Screen({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: object;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.bg }}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 6, paddingBottom: 24 },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

interface AvatarProps {
  initials: string;
  onPress: () => void;
}

/** Gradient-ish avatar button that opens Settings. */
export function Avatar({ initials, onPress }: AvatarProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open settings"
      style={({ pressed }) => [
        styles.avatar,
        { backgroundColor: t.colors.accent },
        pressed && { transform: [{ scale: 0.94 }] },
      ]}
    >
      <Text style={[styles.avatarText, { color: t.colors.onAccent }]}>
        {initials}
      </Text>
    </Pressable>
  );
}

/** Top-level screen header: eyebrow + title on the left, avatar on the right. */
export function AppHeader({
  eyebrow,
  title,
  onAvatarPress,
  initials = 'TG',
}: {
  eyebrow: string;
  title: string;
  onAvatarPress: () => void;
  initials?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.appHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color: t.colors.muted }]}>
          {eyebrow}
        </Text>
        <Text style={[styles.h1, { color: t.colors.fg }]}>{title}</Text>
      </View>
      <Avatar initials={initials} onPress={onAvatarPress} />
    </View>
  );
}

/** Detail-screen header: circular back button + title + subtitle. */
export function DetailHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.detailHead}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [
          styles.backBtn,
          { backgroundColor: t.colors.surface, borderColor: t.colors.border },
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <Icon name="back" size={18} color={t.colors.fg} strokeWidth={2.2} />
      </Pressable>
      <View>
        <Text style={[styles.detailTitle, { color: t.colors.fg }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.detailSub, { color: t.colors.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 18,
  },
  appHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingBottom: 16,
    paddingHorizontal: 2,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  h1: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 15,
  },
  detailHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 6,
    paddingBottom: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  detailSub: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
});
