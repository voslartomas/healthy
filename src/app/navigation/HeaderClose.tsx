import React from 'react';
import { Pressable, Text } from 'react-native';

import { M } from '../../components/brief';
import { useTheme } from '../../theme/theme';

/** A "Close" header button for modal screens (dismisses via goBack). */
export function HeaderClose({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={10}
    >
      <Text style={M(700, 11, { ls: 1, color: t.colors.acc })}>CLOSE</Text>
    </Pressable>
  );
}
