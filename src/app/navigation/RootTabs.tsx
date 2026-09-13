import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
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
import { TAB_PILL, tabPillBottom } from './tabBarLayout';
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

/**
 * The floating glass tab pill.
 *
 * It keeps the design's numbered 01–05 identity but detaches from the bottom
 * edge and frosts whatever scrolls beneath it. Being absolutely positioned, it
 * takes no layout space — the screens run full height and their content passes
 * under the pill, which is the whole point of the effect. `box-none` on the
 * container means only the pill itself catches touches, not the full-width strip
 * it sits in.
 *
 * Only iOS actually blurs. `expo-blur` on Android needs the content you want
 * blurred wrapped in a `BlurTargetView` whose ref is handed to the BlurView —
 * i.e. the whole navigator — and without that it silently renders a plain
 * translucent view (verified on device: text behind the pill stayed sharp even
 * at intensity 100). Restructuring the navigation tree around a blur target is
 * not worth it for a tab bar, so Android gets a near-opaque tinted pill instead,
 * which still reads as floating glass against its shadow and hairline.
 *
 * Hence the platform-dependent scrim: light on iOS so the native blur shows
 * through, heavy on Android so the numerals never fight the content sliding
 * underneath them.
 */
function BriefTabBar({ state, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  // `card` with alpha — the pill is the same surface as the cards it floats
  // over, just see-through. Kept deliberately transparent so content visibly
  // slides under it; the floor on how far that can go is legibility of the
  // numerals, not taste.
  //
  // iOS can afford far more of it because the native blur softens whatever
  // shows through; Android has no blur here (see below), so its scrim does all
  // the separating on its own and has to be heavier.
  const scrim = t.dark
    ? Platform.select({
        ios: 'rgba(19,28,43,0.40)',
        default: 'rgba(19,28,43,0.82)',
      })
    : Platform.select({
        ios: 'rgba(255,255,255,0.48)',
        default: 'rgba(255,255,255,0.82)',
      });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: tabPillBottom(insets.bottom) }]}
    >
      <View
        style={[
          styles.pill,
          {
            borderColor: c.hair,
            shadowColor: c.scrim,
          },
        ]}
      >
        <BlurView
          intensity={80}
          tint={t.dark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]} />
        <View style={styles.row}>
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
                <Text style={M(700, 13, { color })}>{meta.num}</Text>
                <Text style={M(700, 8, { ls: 1.2, color })}>{meta.label}</Text>
              </Pressable>
            );
          })}
        </View>
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
  // Full-width strip the pill is centred in; `box-none` above keeps it from
  // intercepting touches meant for the content behind it.
  //
  // The inset lives here as PADDING, not as a margin on the pill: a percentage
  // width resolves against this container's content box, so padding insets the
  // pill, whereas a margin on a `width: '100%'` box just pushes it wider than
  // its container and it renders edge-to-edge.
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: TAB_PILL.sideGutter,
  },
  pill: {
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH - TAB_PILL.sideGutter * 2,
    height: TAB_PILL.height,
    borderRadius: TAB_PILL.radius,
    borderWidth: 1,
    // Required for the blur to clip to the rounded corners.
    overflow: 'hidden',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
});
