import { Platform } from 'react-native';

/**
 * Geometry of the floating tab pill.
 *
 * The pill is absolutely positioned, so nothing lays out against it — the
 * screens run full height with content passing underneath. Anything that has to
 * sit clear of it (the coach FAB) reads these helpers rather than carrying its
 * own copy of the numbers, which is how the two used to drift apart.
 */
export const TAB_PILL = {
  height: 58,
  /**
   * Inset from the left and right screen edges. Matches the brief column's own
   * gutter (`BRIEF_GUTTER`) so the pill's edges line up with the cards above it
   * — duplicated rather than imported to keep this leaf module dependency-free.
   */
  sideGutter: 22,
  radius: 999,
} as const;

/**
 * How far the pill's BOTTOM edge sits above the bottom of the window.
 *
 * The safe-area inset over-reserves for a bar that is already floating, so trim
 * it — but keep a floor so the pill never touches the home indicator, and a
 * larger one on Android, where button-nav devices report little or no inset.
 */
export function tabPillBottom(safeBottom: number): number {
  return Math.max(safeBottom - 12, Platform.OS === 'android' ? 16 : 10);
}

/** How far the pill's TOP edge sits above the bottom of the window. */
export function tabPillTop(safeBottom: number): number {
  return tabPillBottom(safeBottom) + TAB_PILL.height;
}

/** Breathing room between the top of the pill and anything floating above it. */
const FLOAT_GAP = 14;

/**
 * How far the coach FAB's bottom edge sits above the bottom of the window.
 *
 * Derived from the pill rather than from the screen edge, so the two stay a
 * fixed distance apart no matter what the safe-area inset reports.
 */
export function fabBottom(safeBottom: number): number {
  return tabPillTop(safeBottom) + FLOAT_GAP;
}
