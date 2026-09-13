import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { navigate, navigationRef } from '../../app/navigation/navigationRef';
import { fabBottom } from '../../app/navigation/tabBarLayout';
import { BRIEF_MAX_WIDTH, M } from '../../components/brief';
import { Icon, IconName } from '../../components/Icon';
import { useTheme } from '../../theme/theme';
import { COACH_INTENTS } from './intents';

/** Routes that fully cover the brief — the FAB must not float over them. */
const HIDDEN_ON = new Set(['Coach', 'DefineGoal', 'HabitDefine']);

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
 * rides over every brief screen and tab bar (as in the v4 design).
 *
 * A tap opens the coach chat. A LONG PRESS opens a small context menu with the
 * two things people actually come to the coach to do — log food and build a
 * workout — and picking one opens the chat with that action already armed (the
 * same chips the composer offers, see {@link COACH_INTENTS}). That saves the
 * round trip of opening the chat and then reaching for the chip.
 *
 * The FAB lives outside any navigator screen, so it pushes via the container
 * navigation ref rather than `useNavigation`.
 */
export function CoachOverlay() {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const activeRoute = useActiveRouteName();
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Any navigation closes the menu, so it can never be left floating over a
  // screen the user moved on to (including the ones the FAB itself hides on).
  React.useEffect(() => {
    if (!navigationRef.isReady()) return;
    return navigationRef.addListener('state', () => setMenuOpen(false));
  }, []);

  if (activeRoute != null && HIDDEN_ON.has(activeRoute)) return null;

  // Keep the FAB at the right edge of the centered phone-width column, not the
  // window edge, so it stays with the brief on wide (web / tablet) screens.
  const gutter = Math.max(0, (width - BRIEF_MAX_WIDTH) / 2);

  const openCoach = (intent?: string) => {
    setMenuOpen(false);
    navigate('Coach', intent ? { intent } : undefined);
  };

  return (
    <>
      {menuOpen ? (
        // Full-bleed catcher: a tap anywhere else dismisses the menu rather than
        // falling through to whatever is underneath it.
        <Pressable
          onPress={() => setMenuOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close coach actions"
          style={styles.scrim}
        />
      ) : null}
      <View
        style={[
          styles.stack,
          // Sit clear of the floating tab pill rather than of the screen edge,
          // so the two can't drift apart when the pill's geometry changes.
          { bottom: fabBottom(insets.bottom), right: gutter + 20 },
        ]}
      >
        {menuOpen
          ? COACH_INTENTS.map(it => (
              <MenuItem
                key={it.key}
                label={it.label}
                icon={it.icon}
                onPress={() => openCoach(it.key)}
              />
            ))
          : null}
        <Pressable
          onPress={() => (menuOpen ? setMenuOpen(false) : openCoach())}
          onLongPress={() => setMenuOpen(true)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel="Open coach"
          accessibilityHint="Long-press for quick actions"
          style={[
            styles.fab,
            { backgroundColor: c.accSolid, shadowColor: c.scrim },
          ]}
        >
          <Icon
            name="sparkles"
            color={c.onAccent}
            size={24}
            strokeWidth={1.9}
          />
        </Pressable>
      </View>
    </>
  );
}

/** One row of the long-press menu: an outlined pill on the card surface, right
 * aligned above the FAB. */
function MenuItem({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  const c = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.menuItem,
        {
          backgroundColor: c.card,
          borderColor: c.hair,
          shadowColor: c.scrim,
        },
      ]}
    >
      <Icon name={icon} color={c.acc} size={15} strokeWidth={1.9} />
      <Text style={M(700, 10.5, { ls: 0.8, upper: true, color: c.ink })}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 55,
  },
  stack: {
    position: 'absolute',
    zIndex: 60,
    alignItems: 'flex-end',
    gap: 10,
  },
  fab: {
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
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
});
