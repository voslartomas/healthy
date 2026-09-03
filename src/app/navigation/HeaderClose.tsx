import React from 'react';
import { Pressable, Text } from 'react-native';

import { BAND, M } from '../../components/brief';

/** A "Close" header button for modal screens (dismisses via goBack). The modal
 * header is the v4 dark ink band, so the label reads in the light steel accent. */
export function HeaderClose({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={10}
    >
      <Text style={M(700, 11, { ls: 1, color: BAND.acc })}>CLOSE</Text>
    </Pressable>
  );
}
