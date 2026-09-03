import { Palette } from '../../theme/colors';
import { sans } from '../../theme/fonts';

/**
 * Shared native-header styling for both navigators, themed to the v4 palette:
 * the header is the full-bleed dark "ink band" ({@link Palette.band}) in both
 * colour schemes, flat (no shadow), with white content. A hero band at the top
 * of a screen continues it seamlessly. Spread into a navigator's
 * `screenOptions`; per-screen title/right come from the individual `Screen`
 * options (see headers.tsx). Typed loosely because native-stack and
 * bottom-tabs option shapes differ but share these header keys.
 */
export function headerOptions(colors: Palette) {
  return {
    headerShown: true,
    headerStyle: { backgroundColor: colors.band },
    headerShadowVisible: false,
    // Back chevron / default glyphs on the dark band — the light steel accent.
    headerTintColor: '#6FA3D6',
    headerTitleAlign: 'left',
    headerTitleStyle: {
      fontFamily: sans(700),
      color: '#FFFFFF',
      fontSize: 18,
    },
  } as const;
}
