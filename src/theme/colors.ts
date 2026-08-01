/**
 * Design tokens for the Healthy app.
 *
 * Values are converted from the OKLCH tokens in the source design prototype
 * (design/bd2f7ef5-…/healthy-app-prototype.html) to sRGB hex, because React
 * Native's style engine does not understand the `oklch()` color function.
 *
 * The light palette matches the prototype 1:1. The dark palette is a derived
 * variant that preserves the same hue relationships. When the design changes,
 * update the light palette here first (see docs/adr/003-design-sync.md).
 */

export interface Palette {
  // surfaces & text
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentLight: string;
  accentSoft: string; // tinted accent background (selected states)
  // data / status colors
  rec: string;
  recAmber: string;
  recRed: string;
  strain: string;
  strainGradEnd: string;
  sleep: string;
  protein: string;
  carbs: string;
  fat: string;
  // semantic fills
  recStateBg: string;
  recStateFg: string;
  z4hard: string;
  logoBlue: string;
  logoRed: string;
  onAccent: string; // text/icon color on top of accent fills
}

export const light: Palette = {
  bg: '#f8fafd',
  surface: '#ffffff',
  surface2: '#f4f7fa',
  fg: '#151b24',
  muted: '#5e646c',
  faint: '#82868e',
  border: '#e2e5e9',
  accent: '#17a35f',
  accentLight: '#5dc879',
  accentSoft: '#ebf9ef',
  rec: '#43b966',
  recAmber: '#edb345',
  recRed: '#e94646',
  strain: '#1f86cd',
  strainGradEnd: '#3899e2',
  sleep: '#646abf',
  protein: '#00a159',
  carbs: '#e48e26',
  fat: '#a17adf',
  recStateBg: '#d0f7d6',
  recStateFg: '#00601c',
  z4hard: '#ec6d3d',
  logoBlue: '#2784d5',
  logoRed: '#e54151',
  onAccent: '#ffffff',
};

export const dark: Palette = {
  bg: '#0e1116',
  surface: '#171b21',
  surface2: '#1f242c',
  fg: '#eef1f5',
  muted: '#9aa1ab',
  faint: '#727884',
  border: '#2a2f38',
  accent: '#3cc47c',
  accentLight: '#5dc879',
  accentSoft: '#14251c',
  rec: '#43b966',
  recAmber: '#edb345',
  recRed: '#e94646',
  strain: '#3899e2',
  strainGradEnd: '#3899e2',
  sleep: '#8b90d6',
  protein: '#2bbd73',
  carbs: '#e9a04a',
  fat: '#b490e8',
  recStateBg: '#14351f',
  recStateFg: '#7fe0a0',
  z4hard: '#ec6d3d',
  logoBlue: '#2784d5',
  logoRed: '#e54151',
  onAccent: '#ffffff',
};

/** Legacy export kept for the navigation theme wiring in App.tsx. */
export const colors = {
  light: {
    primary: light.accent,
    background: light.bg,
    surface: light.surface,
    text: light.fg,
    textMuted: light.muted,
  },
  dark: {
    primary: dark.accent,
    background: dark.bg,
    surface: dark.surface,
    text: dark.fg,
    textMuted: dark.muted,
  },
} as const;
