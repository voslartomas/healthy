import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';

import { Icon, IconName } from '../../components/Icon';
import { CoachScreen } from '../../features/coach/CoachScreen';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { NutritionScreen } from '../../features/nutrition/NutritionScreen';
import { TrendsScreen } from '../../features/trends/TrendsScreen';
import { useTheme } from '../../theme/theme';
import { asScreen, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, IconName> = {
  Today: 'today',
  Nutrition: 'nutrition',
  Coach: 'coach',
  Trends: 'trends',
};

export function RootTabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.colors.accent,
        tabBarInactiveTintColor: t.colors.muted,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarIcon: ({ color }) => (
          <Icon
            name={TAB_ICONS[route.name]}
            size={25}
            color={color}
            strokeWidth={1.8}
          />
        ),
      })}
    >
      <Tab.Screen name="Today" component={asScreen(DashboardScreen)} />
      <Tab.Screen name="Nutrition" component={asScreen(NutritionScreen)} />
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Trends" component={asScreen(TrendsScreen)} />
    </Tab.Navigator>
  );
}
