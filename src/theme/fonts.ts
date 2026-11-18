/**
 * Typeface layer for the "friendly" design (ADR-007).
 *
 * One Google-Fonts face, Nunito, for everything: its rounded terminals and
 * generous x-height are what make the redesign read as simple and approachable,
 * and one family keeps the type scale legible at every size. It replaced the v3
 * pair (Archivo prose + condensed Oswald numerals).
 *
 * React Native maps a font *weight* onto a distinct family name (there is no
 * synthetic bolding of a custom face), so each weight is registered as its own
 * family and selected through {@link sans} / {@link mono} rather than via
 * `fontWeight`.
 *
 * {@link mono} survives as the "number face" so the ~40 call sites that set
 * numerals with `M(…)` did not have to change: it is the same Nunito, one step
 * heavier, because the design's numbers are always its boldest element.
 */
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';

/** Weights the design references. */
export type Weight = 400 | 500 | 600 | 700 | 800 | 900;

const NUNITO: Record<Weight, string> = {
  400: 'Nunito_400Regular',
  500: 'Nunito_500Medium',
  600: 'Nunito_600SemiBold',
  700: 'Nunito_700Bold',
  800: 'Nunito_800ExtraBold',
  900: 'Nunito_900Black',
};

/** Numbers sit one weight above the text around them. */
const NUMBER_STEP: Record<Weight, Weight> = {
  400: 600,
  500: 700,
  600: 800,
  700: 800,
  800: 900,
  900: 900,
};

/** Nunito family for a given text weight. */
export function sans(weight: Weight = 400): string {
  return NUNITO[weight];
}

/** The number face: Nunito, one step heavier than `weight` (see the header). */
export function mono(weight: Weight = 400): string {
  return NUNITO[NUMBER_STEP[weight]];
}

/**
 * Load every weight the design uses. Returns `[loaded, error]`; the app renders a
 * neutral splash until `loaded` so text never flashes in a fallback face.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });
}
