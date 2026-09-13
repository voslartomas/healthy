import { Platform } from 'react-native';

import {
  fabBottom,
  TAB_PILL,
  tabPillBottom,
  tabPillTop,
} from '../src/app/navigation/tabBarLayout';

/**
 * The coach FAB reads these helpers to sit clear of the pill. They used to be
 * two independent magic numbers in two files, which is exactly how a FAB ends up
 * overlapping a tab bar on one device and floating miles above it on another.
 */
describe('the floating tab pill geometry', () => {
  it('trims the over-generous safe-area inset', () => {
    // A notched iPhone reports 34 for a bar that is already floating.
    expect(tabPillBottom(34)).toBe(22);
  });

  it('keeps a floor so the pill never touches the screen edge', () => {
    expect(tabPillBottom(0)).toBeGreaterThanOrEqual(10);
    expect(tabPillBottom(5)).toBeGreaterThanOrEqual(10);
  });

  it('gives Android a larger floor, where button-nav reports no inset', () => {
    const original = Platform.OS;
    try {
      Object.defineProperty(Platform, 'OS', { value: 'android' });
      expect(tabPillBottom(0)).toBe(16);
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original });
    }
  });

  it('puts the top exactly one pill above the bottom', () => {
    expect(tabPillTop(34) - tabPillBottom(34)).toBe(TAB_PILL.height);
  });

  it('leaves the FAB clear of the pill at every inset', () => {
    for (const inset of [0, 5, 20, 34, 48]) {
      // The FAB's bottom edge clears the pill's top with room to spare…
      expect(fabBottom(inset)).toBeGreaterThanOrEqual(tabPillTop(inset) + 8);
      // …and the pill itself is fully on screen.
      expect(tabPillBottom(inset)).toBeGreaterThan(0);
    }
  });
});
