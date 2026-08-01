import { Palette } from './colors';

/**
 * Resolve a data-series color key (used throughout the static health data) to
 * an actual color from the active palette.
 */
export function metricColor(colors: Palette, key: string): string {
  const map: Record<string, string> = {
    rec: colors.rec,
    recAmber: colors.recAmber,
    recRed: colors.recRed,
    strain: colors.strain,
    sleep: colors.sleep,
    accent: colors.accent,
    protein: colors.protein,
    carbs: colors.carbs,
    fat: colors.fat,
    z4hard: colors.z4hard,
  };
  return map[key] ?? colors.accent;
}
