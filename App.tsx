import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  hideAsync as hideNativeSplash,
  preventAutoHideAsync as holdNativeSplash,
} from 'expo-splash-screen';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { AppState, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { navigationRef } from './src/app/navigation/navigationRef';
import { RootStack } from './src/app/navigation/RootStack';
import { SplashScreen } from './src/features/onboarding/SplashScreen';
import { WelcomeScreen } from './src/features/onboarding/WelcomeScreen';
import { registerGoogleHealthAuth } from './src/health/googleAuth';
import { initCalorieGoals } from './src/state/calorieGoalsService';
import { initCommonFoods } from './src/state/commonFoodsService';
import { initDailyEnergy } from './src/state/dailyEnergyService';
import { initGoalHistory } from './src/state/goalHistoryService';
import { initGoals } from './src/state/goalsService';
import { useAppStore } from './src/state/useAppStore';
import { initHealth, useHealthStore } from './src/state/useHealthStore';
import { colors } from './src/theme/colors';
import { useAppFonts } from './src/theme/fonts';

const lightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.light.primary,
    background: colors.light.background,
    card: colors.light.surface,
    text: colors.light.text,
  },
};

const darkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.dark.primary,
    background: colors.dark.background,
    card: colors.dark.surface,
    text: colors.dark.text,
  },
};

// Hold the native (pre-JS) splash so there's no white flash before React paints.
// We hand off to the in-app branded splash the moment we mount — both share the
// paper background, so the transition is seamless.
void holdNativeSplash().catch(() => {});

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  // Kick off loading the brand faces, but never block first paint on them — the
  // weight-specific `fontWeight` fallback keeps text bold until they swap in.
  useAppFonts();
  const onboarded = useAppStore(s => s.onboarded);
  const setOnboarded = useAppStore(s => s.setOnboarded);
  // An already-connected user (a remembered Google sign-in) gets live data on
  // launch; treat that as onboarded so the brief opens straight to Today
  // instead of stranding real data behind the first-run Welcome screen.
  const hasLiveData = useHealthStore(s => s.snapshot.live);
  const status = useHealthStore(s => s.status);

  // Once mounted, dismiss the native splash — the in-app branded splash is now
  // painted underneath it, so this reveals it without a flash.
  useEffect(() => {
    void hideNativeSplash().catch(() => {});
  }, []);

  // Keep the branded splash up for a short minimum beat so it never just flickers.
  const [minSplash, setMinSplash] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setMinSplash(false), 1300);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (hasLiveData && !onboarded) setOnboarded(true);
  }, [hasLiveData, onboarded, setOnboarded]);

  // Load persisted goals from SQLite and the live health snapshot on startup.
  useEffect(() => {
    registerGoogleHealthAuth();
    initGoals().catch(err => console.warn('Failed to load goals', err));
    initCalorieGoals().catch(err =>
      console.warn('Failed to load calorie goals', err),
    );
    initCommonFoods().catch(err =>
      console.warn('Failed to load common foods', err),
    );
    initDailyEnergy().catch(err =>
      console.warn('Failed to load daily energy', err),
    );
    initGoalHistory().catch(err =>
      console.warn('Failed to load goal history', err),
    );
    initHealth().catch(err => console.warn('Failed to load health data', err));
  }, []);

  // Refresh when the app returns to the foreground so today's data + goals are
  // current without a manual pull. This runs the fast recent-slice path (the
  // cached 12-week history is reused), and a short throttle avoids a needless
  // fetch on brief blur/focus flickers.
  useEffect(() => {
    let lastActive = Date.now();
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active') return;
      const now = Date.now();
      if (now - lastActive < 30_000) return;
      lastActive = now;
      void useHealthStore
        .getState()
        .refresh()
        .catch(err => console.warn('Foreground refresh failed', err));
    });
    return () => sub.remove();
  }, []);

  const bg = isDark ? colors.dark.background : colors.light.background;
  const showApp = onboarded || hasLiveData;
  // Hold the splash until the first read settles (data, cache, or a definitive
  // empty) and the minimum beat has passed — so we never flash empty content or
  // the Welcome gate before we know which to show.
  const showSplash = minSplash || (status !== 'ready' && !hasLiveData);

  return (
    <SafeAreaProvider>
      {showSplash ? (
        <SplashScreen />
      ) : showApp ? (
        <NavigationContainer
          ref={navigationRef}
          theme={isDark ? darkTheme : lightTheme}
        >
          <RootStack />
        </NavigationContainer>
      ) : (
        <View style={{ flex: 1, backgroundColor: bg }}>
          <WelcomeScreen />
        </View>
      )}
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}
