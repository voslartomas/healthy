import React from 'react';
import { Pressable, Text } from 'react-native';

import { S, useBand } from '../../components/brief';

/** A "Close" header button for modal screens (dismisses via goBack), in the
 * accent so it reads as the action it is. */
export function HeaderClose({ onPress }: { onPress: () => void }) {
  const band = useBand();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={10}
    >
      <Text style={S(900, 16, { color: band.acc })}>Close</Text>
    </Pressable>
  );
}
