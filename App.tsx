import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootStack } from './src/app/navigation/RootStack';
import { registerGoogleHealthAuth } from './src/health/googleAuth';
import { initGoals } from './src/state/goalsService';
import { initHealth } from './src/state/useHealthStore';
import { colors } from './src/theme/colors';

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

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Load persisted goals from SQLite and the live health snapshot on startup.
  useEffect(() => {
    registerGoogleHealthAuth();
    initGoals().catch(err => console.warn('Failed to load goals', err));
    initHealth().catch(err => console.warn('Failed to load health data', err));
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={isDark ? darkTheme : lightTheme}>
        <RootStack />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
