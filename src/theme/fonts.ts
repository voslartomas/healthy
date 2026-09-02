/**
 * Typeface layer for the v3 "data brief" design.
 *
 * The design uses two Google-Fonts faces: Archivo for prose/labels and Oswald
 * for every numeric readout (the design's `--mono` slot — Oswald is condensed
 * rather than strictly monospaced, but its figures are uniform width, which is
 * what the numeric columns need). React Native maps a font *weight* onto a
 * distinct family name (there is no synthetic bolding of a custom face), so each
 * weight the design uses is registered as its own family and selected through
 * {@link sans} / {@link mono} rather than via `fontWeight`.
 */
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  useFonts as useArchivo,
} from '@expo-google-fonts/archivo';
import {
  Oswald_400Regular,
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';

/** Weights the design actually references. */
export type Weight = 400 | 500 | 600 | 700 | 800;

const SANS: Record<Weight, string> = {
  400: 'Archivo_400Regular',
  500: 'Archivo_500Medium',
  600: 'Archivo_600SemiBold',
  700: 'Archivo_700Bold',
  800: 'Archivo_800ExtraBold',
};

// Oswald ships no ExtraBold, so 800 resolves to its heaviest cut. Keeping the
// key means callers can pass the same Weight union to both families.
const MONO: Record<Weight, string> = {
  400: 'Oswald_400Regular',
  500: 'Oswald_500Medium',
  600: 'Oswald_600SemiBold',
  700: 'Oswald_700Bold',
  800: 'Oswald_700Bold',
};

/** Archivo family for a given weight (`--sans` in the design). */
export function sans(weight: Weight = 400): string {
  return SANS[weight];
}

/** Oswald family for a given weight (`--mono` in the design). */
export function mono(weight: Weight = 400): string {
  return MONO[weight];
}

/**
 * Load every weight both faces use. Returns `[loaded, error]`; the app renders a
 * neutral splash until `loaded` so text never flashes in a fallback face.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useArchivo({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Oswald_400Regular,
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
  });
}
