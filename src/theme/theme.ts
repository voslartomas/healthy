import { ColorSchemeName, useColorScheme } from 'react-native';

import { ThemePreference, useAppStore } from '../state/useAppStore';
import { dark, light, Palette } from './colors';
import { mono } from './fonts';

/** Corner radii (ADR-007): chips 10, inputs/buttons 14–16, cards 22, pills 999.
 * Rounder than v3 throughout — softness is most of the friendly look. */
export const radii = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Baseline spacing scale (matches the prototype's 4px rhythm). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 18,
} as const;

/**
 * Card geometry shared by every section card (ADR-007): a 2px outline whose
 * bottom edge is 4px, so cards read as chunky physical tiles rather than flat
 * panels — the same depth cue the primary buttons use.
 */
export const card = {
  radius: 22,
  borderWidth: 2,
  borderBottomWidth: 4,
  paddingVertical: 18,
  paddingHorizontal: 18,
  /** Gap between consecutive cards; the first card after the header uses 8. */
  gap: 14,
  firstGap: 8,
} as const;

/** Monospace family used for numeric readouts (Oswald in the v3 design).
 * Kept for primitives that reference a single mono family; new v3 screens select
 * a specific weight via `mono(weight)` from ./fonts. */
export const monoFont = mono(700);

export interface Theme {
  colors: Palette;
  dark: boolean;
  /** Card shadow, tuned per color scheme. */
  cardShadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
}

// The v3 cards are flat: a white/slate surface separated from the page ground by
// a hairline, not by a drop shadow. These stay near-zero so any primitive that
// still spreads `cardShadow` matches the outlined look.
const lightShadow = {
  shadowColor: '#0E1726',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.03,
  shadowRadius: 2,
  elevation: 0,
};

const darkShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.2,
  shadowRadius: 2,
  elevation: 0,
};

/**
 * The colour scheme to paint in: the user's explicit choice when they have made
 * one, otherwise whatever the OS reports.
 *
 * Pure, so the decision can be tested without standing up a renderer — and so
 * the hook below is nothing but wiring.
 */
export function resolveScheme(
  preference: ThemePreference,
  // `null` as well as the typed `undefined`: the platform genuinely hands back
  // null on some Android versions before it has answered.
  system: ColorSchemeName | null,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  // The OS reports null until it answers; light is the design's ground state,
  // so fall back to it rather than flashing dark on launch.
  return system === 'dark' ? 'dark' : 'light';
}

/**
 * Every surface resolves the scheme through here — {@link useTheme} for the
 * screens, and App.tsx for the navigation theme and the splash — so a preference
 * can never apply to some of the app and not the rest.
 */
export function useResolvedScheme(): 'light' | 'dark' {
  return resolveScheme(
    useAppStore(s => s.themePreference),
    useColorScheme(),
  );
}

export function useTheme(): Theme {
  const isDark = useResolvedScheme() === 'dark';
  return {
    colors: isDark ? dark : light,
    dark: isDark,
    cardShadow: isDark ? darkShadow : lightShadow,
  };
}
