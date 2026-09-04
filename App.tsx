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
import { PostHogProvider } from 'posthog-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { posthog } from './src/analytics/posthog';
import { navigationRef } from './src/app/navigation/navigationRef';
import { RootStack } from './src/app/navigation/RootStack';
import { useModelStore } from './src/features/coach/ondevice/useModelStore';
import { useWhisperStore } from './src/features/coach/ondevice/useWhisperStore';
import { SplashScreen } from './src/features/onboarding/SplashScreen';
import { WelcomeScreen } from './src/features/onboarding/WelcomeScreen';
import { initCalorieGoals } from './src/state/calorieGoalsService';
import { initCommonFoods } from './src/state/commonFoodsService';
import { initConversations } from './src/state/conversationsService';
import { initDailyEnergy } from './src/state/dailyEnergyService';
import { initGoalHistory } from './src/state/goalHistoryService';
import { initGoals } from './src/state/goalsService';
import { initProfile } from './src/state/profileService';
import { initStrength } from './src/state/strengthService';
import { useAppStore } from './src/state/useAppStore';
import { initHealth, useHealthStore } from './src/state/useHealthStore';
import { initWorkoutNotifications } from './src/state/workoutNotifications';
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
    // Initialise on-device model status from disk so a previously downloaded
    // coach/voice model is usable immediately — the coach and daily brief gate
    // on this status, so without it the user would have to open Settings first.
    void useModelStore.getState().check();
    void useWhisperStore.getState().check();
    initGoals().catch(err => console.warn('Failed to load goals', err));
    initCalorieGoals().catch(err =>
      console.warn('Failed to load calorie goals', err),
    );
    initCommonFoods().catch(err =>
      console.warn('Failed to load common foods', err),
    );
    initConversations().catch(err =>
      console.warn('Failed to load conversations', err),
    );
    initDailyEnergy().catch(err =>
      console.warn('Failed to load daily energy', err),
    );
    initGoalHistory().catch(err =>
      console.warn('Failed to load goal history', err),
    );
    initProfile().catch(err => console.warn('Failed to load profile', err));
    initStrength().catch(err =>
      console.warn('Failed to load strength workouts', err),
    );
    initHealth().catch(err => console.warn('Failed to load health data', err));
    // Mirror the active workout into an ongoing Android notification (elapsed
    // chronometer + sets done/remaining). No-op off Android.
    initWorkoutNotifications();
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

  // Pause any in-flight model download when the app backgrounds and resume it on
  // return. Pausing persists the resume token, which makes continuation reliable
  // (vs. a hard kill, which may have to restart) — a big deal for the multi-GB
  // on-device coach model. No-ops unless a download is actually in flight.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const model = useModelStore.getState();
      const whisper = useWhisperStore.getState();
      if (next === 'active') {
        if (model.status === 'paused') void model.download();
        if (whisper.status === 'paused') void whisper.download();
      } else if (next === 'background') {
        // Only on a committed background — not the transient 'inactive' iOS
        // fires for the app switcher / control center, which would otherwise
        // race a pause against the immediate 'active' on return.
        if (model.status === 'downloading') void model.pause();
        if (whisper.status === 'downloading') void whisper.pause();
      }
    });
    return () => sub.remove();
  }, []);

  const bg = isDark ? colors.dark.background : colors.light.background;
  const showApp = onboarded || hasLiveData;
  // Hold the splash until the first read settles (data, cache, or a definitive
  // empty) and the minimum beat has passed — so we never flash empty content or
  // the Welcome gate before we know which to show.
  const showSplash = minSplash || (status !== 'ready' && !hasLiveData);

  const tree = (
    <SafeAreaProvider>
      {showSplash ? (
        <SplashScreen />
      ) : showApp ? (
        <NavigationContainer
          ref={navigationRef}
          theme={isDark ? darkTheme : lightTheme}
          onStateChange={() => {
            // Manual screen capture: the navigator is mounted conditionally
            // (behind splash/welcome), so we track route changes off the
            // container ref rather than relying on provider autocapture.
            const route = navigationRef.getCurrentRoute();
            if (route) posthog?.screen(route.name, route.params);
          }}
        >
          <RootStack />
        </NavigationContainer>
      ) : (
        <View style={{ flex: 1, backgroundColor: bg }}>
          <WelcomeScreen />
        </View>
      )}
      {/* The native header is the v4 dark ink band in both schemes, so the
          status-bar glyphs above it are always light. */}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );

  // Wrap in the PostHog provider when analytics is configured; the provider
  // powers the usePostHog() hook and app-lifecycle autocapture. Screen tracking
  // is handled manually above. Falls through to the bare tree when unconfigured.
  return posthog ? (
    <PostHogProvider
      client={posthog}
      autocapture={{ captureScreens: false, captureTouches: true }}
    >
      {tree}
    </PostHogProvider>
  ) : (
    tree
  );
}
