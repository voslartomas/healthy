import { useColorScheme } from 'react-native';

import { dark, light, Palette } from './colors';
import { mono } from './fonts';

/** Corner radii used across the design (card = 10, input/tile = 12, pill = 999). */
export const radii = {
  sm: 6,
  md: 10,
  lg: 12,
  xl: 14,
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

/** Card geometry shared by every section card in the v4 sheet. */
export const card = {
  radius: 12,
  borderWidth: 1,
  paddingVertical: 16,
  paddingHorizontal: 18,
  /** Gap between consecutive cards; the first card after the header uses 6. */
  gap: 12,
  firstGap: 6,
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

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return {
    colors: isDark ? dark : light,
    dark: isDark,
    cardShadow: isDark ? darkShadow : lightShadow,
  };
}
