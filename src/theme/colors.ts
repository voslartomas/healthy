/**
 * Design tokens for the Healthy app — v3 "data brief" palette.
 *
 * Values are the slate/steel-blue card system from the v3 prototype (HealthApp
 * v3.dc.html). Light matches the prototype's `:root` 1:1; dark matches its
 * `[data-theme="dark"]` block. React Native cannot parse `oklch()`/CSS vars, so
 * everything is sRGB hex/rgba here.
 *
 * The palette carries both the v3 semantic names (card, ink, mut, fnt, hair,
 * track, sand, acc, accSolid, grn, red, inv, scrim, pillBg, pillText) and the
 * legacy keys the older primitives still import, so nothing has to change in one
 * pass. New v3 screens read the v3 names; kept primitives keep compiling off the
 * legacy aliases.
 *
 * Note that `bg` and `card` are now *different* surfaces: the sheet sits on the
 * cool page ground and every section is a raised card outlined in `hair`. In the
 * previous (warm paper) revision the two were the same colour.
 */

export interface Palette {
  // ── v3 core ──────────────────────────────────────────────────────────────
  bg: string; // page ground behind the cards
  band: string; // full-bleed dark "ink band" behind headers & heroes (v4)
  card: string; // card surface
  ink: string; // primary text
  mut: string; // muted text
  fnt: string; // faint text / disabled
  hair: string; // hairline dividers & borders
  track: string; // progress-track fill
  sand: string; // tertiary fill / third-place bars
  acc: string; // accent (steel blue), tinted per scheme for text/icons
  accSolid: string; // the one accent fill that stays put in both schemes
  grn: string; // positive / good-direction
  red: string; // over-limit / bad-direction
  inv: string; // text/icon on an ink fill
  scrim: string; // modal backdrop
  pillBg: string; // status-pill fill
  pillText: string; // status-pill text
  /** Text/icon colour on an `accSolid` fill — white in both schemes. */
  onAccent: string;
  /** Categorical data-series colours (the prototype's `--c1…--c5`), cycled by
   * index to give each weekly goal its own colour. */
  goalSeries: readonly string[];

  // ── legacy aliases (kept for older primitives) ─────────────────────────────
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentLight: string;
  accentSoft: string;
  rec: string;
  recAmber: string;
  recRed: string;
  strain: string;
  strainGradEnd: string;
  sleep: string;
  protein: string;
  carbs: string;
  fat: string;
  recStateBg: string;
  recStateFg: string;
  z4hard: string;
  logoBlue: string;
  logoRed: string;
}

export const light: Palette = {
  // v3 core
  bg: '#F4F6F9',
  band: '#0E1726',
  card: '#FFFFFF',
  ink: '#0E1726',
  mut: '#4B5A6E',
  fnt: '#8494A8',
  hair: '#DDE4EC',
  track: '#E7ECF3',
  sand: '#9DBBD8',
  acc: '#2A5580',
  accSolid: '#336699',
  grn: '#2F7D5E',
  red: '#B3453A',
  inv: '#FFFFFF',
  scrim: 'rgba(14,23,38,0.45)',
  pillBg: 'rgba(47,125,94,0.10)',
  pillText: '#2F7D5E',
  onAccent: '#FFFFFF',
  goalSeries: ['#336699', '#3F8F9C', '#2F7D5E', '#C08A2E', '#A8524A'],

  // legacy aliases
  surface: '#FFFFFF',
  surface2: '#E7ECF3',
  fg: '#0E1726',
  muted: '#4B5A6E',
  faint: '#8494A8',
  border: '#DDE4EC',
  accent: '#2A5580',
  accentLight: '#336699',
  accentSoft: 'rgba(42,85,128,0.10)',
  rec: '#2F7D5E',
  recAmber: '#8A6A2B',
  recRed: '#B3453A',
  strain: '#0E1726',
  strainGradEnd: '#0E1726',
  sleep: '#4B5A6E',
  protein: '#0E1726',
  carbs: '#9DBBD8',
  fat: '#2A5580',
  recStateBg: 'rgba(47,125,94,0.10)',
  recStateFg: '#2F7D5E',
  z4hard: '#2A5580',
  logoBlue: '#336699',
  logoRed: '#B3453A',
};

export const dark: Palette = {
  // v3 core
  bg: '#0B1220',
  band: '#162236',
  card: '#131C2B',
  ink: '#E8EEF6',
  mut: '#94A6BE',
  fnt: '#61738C',
  hair: 'rgba(51,102,153,0.26)',
  track: 'rgba(255,255,255,0.08)',
  sand: '#7FA8CE',
  acc: '#6FA3D6',
  accSolid: '#336699',
  grn: '#5FAE8B',
  red: '#E0776B',
  inv: '#0B1220',
  scrim: 'rgba(3,8,16,0.62)',
  pillBg: 'rgba(95,174,139,0.15)',
  pillText: '#5FAE8B',
  onAccent: '#FFFFFF',
  goalSeries: ['#6FA3D6', '#5FB3C0', '#5FAE8B', '#D9A94E', '#D18076'],

  // legacy aliases
  surface: '#131C2B',
  surface2: 'rgba(255,255,255,0.08)',
  fg: '#E8EEF6',
  muted: '#94A6BE',
  faint: '#61738C',
  border: 'rgba(51,102,153,0.26)',
  accent: '#6FA3D6',
  accentLight: '#8FBBE4',
  accentSoft: 'rgba(111,163,214,0.16)',
  rec: '#5FAE8B',
  recAmber: '#D2A263',
  recRed: '#E0776B',
  strain: '#E8EEF6',
  strainGradEnd: '#E8EEF6',
  sleep: '#94A6BE',
  protein: '#E8EEF6',
  carbs: '#7FA8CE',
  fat: '#6FA3D6',
  recStateBg: 'rgba(95,174,139,0.15)',
  recStateFg: '#5FAE8B',
  z4hard: '#6FA3D6',
  logoBlue: '#6FA3D6',
  logoRed: '#E0776B',
};

/** Legacy export kept for the navigation theme wiring in App.tsx. */
export const colors = {
  light: {
    primary: light.acc,
    background: light.bg,
    surface: light.card,
    text: light.ink,
    textMuted: light.mut,
  },
  dark: {
    primary: dark.acc,
    background: dark.bg,
    surface: dark.card,
    text: dark.ink,
    textMuted: dark.mut,
  },
} as const;
