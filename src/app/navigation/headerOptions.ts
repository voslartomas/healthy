import { Palette } from '../../theme/colors';
import { sans } from '../../theme/fonts';

/**
 * Shared native-header styling for both navigators, themed to the v3 palette:
 * flat (no shadow), page-ground background, ink title in Archivo.
 * Spread into a navigator's `screenOptions`; per-screen `title`s come from the
 * individual `Screen` options. Typed loosely because native-stack and
 * bottom-tabs option shapes differ but share these header keys.
 */
export function headerOptions(colors: Palette) {
  return {
    headerShown: true,
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
    headerTintColor: colors.ink,
    headerTitleAlign: 'left',
    headerTitleStyle: {
      fontFamily: sans(700),
      color: colors.ink,
      fontSize: 18,
    },
  } as const;
}
