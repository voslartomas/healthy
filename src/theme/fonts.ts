/**
 * Typeface layer for the v3 "data brief" design.
 *
 * The design uses two Google-Fonts faces: Hanken Grotesk for prose/labels and
 * JetBrains Mono for every numeric readout. React Native maps a font *weight*
 * onto a distinct family name (there is no synthetic bolding of a custom face),
 * so each weight the design uses is registered as its own family and selected
 * through {@link sans} / {@link mono} rather than via `fontWeight`.
 */
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
  useFonts as useHanken,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
  JetBrainsMono_800ExtraBold,
} from '@expo-google-fonts/jetbrains-mono';

/** Weights the design actually references. */
export type Weight = 400 | 500 | 600 | 700 | 800;

const SANS: Record<Weight, string> = {
  400: 'HankenGrotesk_400Regular',
  500: 'HankenGrotesk_500Medium',
  600: 'HankenGrotesk_600SemiBold',
  700: 'HankenGrotesk_700Bold',
  800: 'HankenGrotesk_800ExtraBold',
};

const MONO: Record<Weight, string> = {
  400: 'JetBrainsMono_400Regular',
  500: 'JetBrainsMono_500Medium',
  600: 'JetBrainsMono_600SemiBold',
  700: 'JetBrainsMono_700Bold',
  800: 'JetBrainsMono_800ExtraBold',
};

/** Hanken Grotesk family for a given weight (`--sans` in the design). */
export function sans(weight: Weight = 400): string {
  return SANS[weight];
}

/** JetBrains Mono family for a given weight (`--mono` in the design). */
export function mono(weight: Weight = 400): string {
  return MONO[weight];
}

/**
 * Load every weight both faces use. Returns `[loaded, error]`; the app renders a
 * neutral splash until `loaded` so text never flashes in a fallback face.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useHanken({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
    JetBrainsMono_800ExtraBold,
  });
}
