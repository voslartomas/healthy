import { useColorScheme } from 'react-native';

import { dark, light, Palette } from './colors';
import { mono } from './fonts';

/** Corner radii used across the design (card = 22, stat = 18, pill = 999). */
export const radii = {
  sm: 11,
  md: 14,
  lg: 18,
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

/** Monospace family used for numeric readouts (JetBrains Mono in the v3 design).
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

const lightShadow = {
  shadowColor: '#2b3038',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.06,
  shadowRadius: 16,
  elevation: 2,
};

const darkShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.4,
  shadowRadius: 16,
  elevation: 3,
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? dark : light,
    dark: isDark,
    cardShadow: isDark ? darkShadow : lightShadow,
  };
}
