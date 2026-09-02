import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BRIEF_MAX_WIDTH, M } from '../../components/brief';
import { DashboardScreen } from '../../features/dashboard/DashboardScreen';
import { NutritionScreen } from '../../features/nutrition/NutritionScreen';
import { SettingsScreen } from '../../features/settings/SettingsScreen';
import { StrengthHomeScreen } from '../../features/strength/StrengthHomeScreen';
import { TrendsScreen } from '../../features/trends/TrendsScreen';
import { useTheme } from '../../theme/theme';
import {
  FuelRight,
  FuelTitle,
  SetupRight,
  SetupTitle,
  StrengthRight,
  StrengthTitle,
  TodayRight,
  TodayTitle,
  TrendsRight,
  TrendsTitle,
} from './headers';
import { headerOptions } from './headerOptions';
import { asScreen, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

/** Numbered mono labels for each tab, matching the v3 tab bar (01 TODAY …). */
const TABS: Record<keyof RootTabParamList, { num: string; label: string }> = {
  Today: { num: '01', label: 'TODAY' },
  Nutrition: { num: '02', label: 'FUEL' },
  Strength: { num: '03', label: 'LIFT' },
  Trends: { num: '04', label: 'TRENDS' },
  Settings: { num: '05', label: 'SETUP' },
};

/** The flat, numbered v3 tab bar (no icons — just 01/02/03/04 + labels). */
function BriefTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: c.bg,
          borderTopColor: c.hair,
          // Sit closer to the home indicator than the full safe-area inset — the
          // inset over-reserves for a tab bar. Trim it, but keep a floor so the
          // labels never touch the indicator (or the edge on non-notched phones).
          // Android reports little/no bottom inset on button-nav devices, so the
          // labels sit almost on the edge — give them a larger floor there.
          paddingBottom: Math.max(
            insets.bottom - 16,
            Platform.OS === 'android' ? 21 : 6,
          ),
        },
      ]}
    >
      <View style={styles.barInner}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const meta = TABS[route.name as keyof RootTabParamList];
          const color = focused ? c.acc : c.fnt;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented)
              navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              style={styles.tab}
            >
              <Text style={M(700, 14, { color })}>{meta.num}</Text>
              <Text style={M(700, 8.5, { ls: 1.4, color })}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function RootTabs() {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={headerOptions(t.colors)}
      tabBar={props => <BriefTabBar {...props} />}
    >
      <Tab.Screen
        name="Today"
        component={asScreen(DashboardScreen)}
        options={{ headerTitle: TodayTitle, headerRight: TodayRight }}
      />
      <Tab.Screen
        name="Nutrition"
        component={asScreen(NutritionScreen)}
        options={{ headerTitle: FuelTitle, headerRight: FuelRight }}
      />
      <Tab.Screen
        name="Strength"
        component={asScreen(StrengthHomeScreen)}
        options={{ headerTitle: StrengthTitle, headerRight: StrengthRight }}
      />
      <Tab.Screen
        name="Trends"
        component={asScreen(TrendsScreen)}
        options={{ headerTitle: TrendsTitle, headerRight: TrendsRight }}
      />
      <Tab.Screen
        name="Settings"
        component={asScreen(SettingsScreen)}
        options={{ headerTitle: SetupTitle, headerRight: SetupRight }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: 1,
    paddingTop: 9,
    alignItems: 'center',
  },
  barInner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
});
