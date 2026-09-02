import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { navigate, navigationRef } from '../../app/navigation/navigationRef';
import { BRIEF_MAX_WIDTH } from '../../components/brief';
import { useTheme } from '../../theme/theme';
import { Sparkle } from './CoachScreen';

/** Routes that fully cover the brief — the FAB must not float over them. */
const HIDDEN_ON = new Set(['Coach', 'DefineGoal']);

/** Track the active root route so the overlay can hide itself. The overlay is
 * mounted outside any navigator screen, so it uses the container ref (not
 * navigation hooks) and re-renders on every navigation state change. */
function useActiveRouteName(): string | undefined {
  const [name, setName] = React.useState<string | undefined>(() =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined,
  );
  React.useEffect(() => {
    if (!navigationRef.isReady()) return;
    const update = () => setName(navigationRef.getCurrentRoute()?.name);
    update();
    return navigationRef.addListener('state', update);
  }, []);
  return name;
}

/**
 * The floating coach button, mounted once above the whole navigation tree so it
 * rides over every brief screen and tab bar (as in the v3 design). Tapping it
 * pushes the native Coach modal screen via the container navigation ref (the FAB
 * lives outside any navigator screen, so it can't use `useNavigation`).
 */
export function CoachOverlay() {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const activeRoute = useActiveRouteName();

  // Don't float the coach button over the Coach chat itself (or other modals).
  if (activeRoute && HIDDEN_ON.has(activeRoute)) return null;

  // Keep the FAB at the right edge of the centered phone-width column, not the
  // window edge, so it stays with the brief on wide (web / tablet) screens.
  const gutter = Math.max(0, (width - BRIEF_MAX_WIDTH) / 2);

  return (
    <Pressable
      onPress={() => navigate('Coach')}
      accessibilityRole="button"
      accessibilityLabel="Open coach"
      style={[
        styles.fab,
        {
          backgroundColor: c.accSolid,
          bottom: insets.bottom + 78,
          right: gutter + 20,
          shadowColor: c.scrim,
        },
      ]}
    >
      <Sparkle color={c.onAccent} size={24} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    zIndex: 60,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
});
