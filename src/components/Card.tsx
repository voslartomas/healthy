import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii, useTheme } from '../theme/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Accessibility label, used when the card is pressable. */
  accessibilityLabel?: string;
}

/**
 * Surface container matching `.card` in the design: rounded, bordered, soft
 * shadow. When `onPress` is supplied it becomes a tappable card (`.card-tap`)
 * with a subtle press scale.
 */
export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
}: CardProps) {
  const t = useTheme();
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
          styles.card,
          base,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.card, base, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
});
