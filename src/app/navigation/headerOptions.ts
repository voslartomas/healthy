import { Palette } from '../../theme/colors';
import { sans } from '../../theme/fonts';

/**
 * Shared native-header styling for both navigators (ADR-007): the header sits
 * on the page colour ({@link Palette.band} = the page) in either scheme, flat
 * (no shadow), with ink text and the accent for the back chevron. v3 drew it as
 * a dark band with hard-coded white content; those constants would now be
 * white-on-white. Spread into a navigator's `screenOptions`; per-screen
 * title/right come from the individual `Screen` options (see headers.tsx).
 * Typed loosely because native-stack and bottom-tabs option shapes differ but
 * share these header keys.
 */
export function headerOptions(colors: Palette) {
  return {
    headerShown: true,
    headerStyle: { backgroundColor: colors.band },
    headerShadowVisible: false,
    headerTintColor: colors.acc,
    headerTitleAlign: 'left',
    headerTitleStyle: {
      fontFamily: sans(900),
      color: colors.ink,
      fontSize: 19,
    },
  } as const;
}
