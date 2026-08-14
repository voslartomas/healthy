import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { View } from 'react-native';

import { CardioScreen } from '../../features/cardio/CardioScreen';
import { CoachOverlay } from '../../features/coach/CoachOverlay';
import { CoachScreen } from '../../features/coach/CoachScreen';
import { GoalDefineScreen } from '../../features/goals/GoalDefineScreen';
import { RecoveryScreen } from '../../features/recovery/RecoveryScreen';
import { SleepScreen } from '../../features/sleep/SleepScreen';
import { ExercisePickerScreen } from '../../features/strength/ExercisePickerScreen';
import { WorkoutBuilderScreen } from '../../features/strength/WorkoutBuilderScreen';
import { WorkoutRunScreen } from '../../features/strength/WorkoutRunScreen';
import { WorkoutSummaryScreen } from '../../features/strength/WorkoutSummaryScreen';
import { useTheme } from '../../theme/theme';
import {
  CardioRight,
  CardioTitle,
  RecoveryRight,
  RecoveryTitle,
  WorkoutBuilderTitle,
  WorkoutRunRight,
  WorkoutRunTitle,
  WorkoutSummaryTitle,
} from './headers';
import { HeaderClose } from './HeaderClose';
import { headerOptions } from './headerOptions';
import { RootTabs } from './RootTabs';
import { asScreen, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root navigator: the numbered tab brief plus the detail screens that push over
 * it (Recovery, Cardio). Detail screens carry a native header with a back
 * button; the tab host provides its own per-tab headers. The Coach FAB + sheet
 * is mounted once on top so it floats over every screen, matching the v3 design.
 */
export function RootStack() {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        screenOptions={{
          ...headerOptions(t.colors),
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen
          name="Tabs"
          component={RootTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Recovery"
          component={asScreen(RecoveryScreen)}
          options={{ headerTitle: RecoveryTitle, headerRight: RecoveryRight }}
        />
        <Stack.Screen
          name="Cardio"
          component={asScreen(CardioScreen)}
          options={{ headerTitle: CardioTitle, headerRight: CardioRight }}
        />
        <Stack.Screen
          name="Sleep"
          component={asScreen(SleepScreen)}
          options={{ title: 'Sleep' }}
        />
        <Stack.Screen
          name="WorkoutBuilder"
          component={asScreen(WorkoutBuilderScreen)}
          options={{ headerTitle: WorkoutBuilderTitle }}
        />
        <Stack.Screen
          name="ExercisePicker"
          component={asScreen(ExercisePickerScreen)}
          options={({ navigation }) => ({
            presentation: 'modal',
            title: 'Add exercise',
            headerRight: () => <HeaderClose onPress={navigation.goBack} />,
          })}
        />
        <Stack.Screen
          name="WorkoutRun"
          component={asScreen(WorkoutRunScreen)}
          options={{
            headerTitle: WorkoutRunTitle,
            headerRight: WorkoutRunRight,
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="WorkoutSummary"
          component={asScreen(WorkoutSummaryScreen)}
          options={{ headerTitle: WorkoutSummaryTitle, headerBackVisible: false }}
        />
        <Stack.Screen
          name="Coach"
          component={asScreen(CoachScreen)}
          options={({ navigation }) => ({
            presentation: 'modal',
            title: 'Coach',
            headerRight: () => <HeaderClose onPress={navigation.goBack} />,
          })}
        />
        <Stack.Screen
          name="DefineGoal"
          component={asScreen(GoalDefineScreen)}
          options={({ navigation }) => ({
            presentation: 'modal',
            title: 'Define goal',
            headerRight: () => <HeaderClose onPress={navigation.goBack} />,
          })}
        />
      </Stack.Navigator>
      <CoachOverlay />
    </View>
  );
}
