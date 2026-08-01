import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { CardioScreen } from '../../features/cardio/CardioScreen';
import { RecoveryScreen } from '../../features/recovery/RecoveryScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import { RootTabs } from './RootTabs';
import { asScreen, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root navigator: the tab bar plus the detail/settings screens that push over
 * it (Recovery, Cardio, Settings). Detail headers are provided by each screen,
 * so the native header stays hidden.
 */
export function RootStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={RootTabs} />
      <Stack.Screen name="Recovery" component={asScreen(RecoveryScreen)} />
      <Stack.Screen name="Cardio" component={asScreen(CardioScreen)} />
      <Stack.Screen name="Settings" component={asScreen(SettingsScreen)} />
    </Stack.Navigator>
  );
}
