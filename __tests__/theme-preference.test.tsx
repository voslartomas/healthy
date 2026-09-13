import { renderHook } from '@testing-library/react-native';

import { useAppStore } from '../src/state/useAppStore';
import { dark, light } from '../src/theme/colors';
import { resolveScheme, useTheme } from '../src/theme/theme';

beforeEach(() => {
  useAppStore.setState({ themePreference: 'system' });
});

describe('the stored preference', () => {
  it('defaults to following the system', () => {
    // A fresh install must not pin a scheme; only an explicit tap in Setup does.
    useAppStore.persist?.clearStorage?.();
    expect(useAppStore.getInitialState().themePreference).toBe('system');
  });

  it('is persisted, so the choice survives a relaunch', () => {
    // `partialize` decides what is written; a preference left out of it would
    // silently reset to 'system' on every launch.
    useAppStore.setState({ themePreference: 'dark' });
    const options = useAppStore.persist?.getOptions?.();
    const written = options?.partialize?.(useAppStore.getState()) as
      { themePreference?: string } | undefined;
    expect(written?.themePreference).toBe('dark');
  });
});

describe('resolveScheme', () => {
  it('follows the OS when the preference is "system"', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
  });

  it('pins to the choice, whatever the OS says', () => {
    // The point of the setting: a phone on SCHEDULED dark mode would otherwise
    // flip the app at sunset with no way to hold it where the user wants it.
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('falls back to light when the OS has not answered yet', () => {
    // The platform reports null until it responds. Light is the design's ground
    // state, so that must not flash dark on launch.
    expect(resolveScheme('system', null)).toBe('light');
    // …and an explicit choice still wins over the missing answer.
    expect(resolveScheme('dark', null)).toBe('dark');
  });
});

describe('useTheme', () => {
  it('hands every screen the palette the preference asks for', async () => {
    useAppStore.setState({ themePreference: 'dark' });
    const themed = (await renderHook(() => useTheme())).result.current;
    expect(themed.dark).toBe(true);
    expect(themed.colors).toBe(dark);

    useAppStore.setState({ themePreference: 'light' });
    const lit = (await renderHook(() => useTheme())).result.current;
    expect(lit.dark).toBe(false);
    expect(lit.colors).toBe(light);
  });
});
