import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { GoalsScreen } from '../../features/goals/GoalsScreen';
import { CoachScreen } from '../../features/coach/CoachScreen';

export type RootTabParamList = {
  Dashboard: undefined;
  Goals: undefined;
  Coach: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Goals" component={GoalsScreen} />
      <Tab.Screen name="Coach" component={CoachScreen} />
    </Tab.Navigator>
  );
}
