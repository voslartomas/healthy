/**
 * Design tokens for the Healthy app — v3 "data brief" palette.
 *
 * Values are the warm paper/sand system from the v3 prototype (HealthApp
 * v3.dc.html). Light matches the prototype's `:root` 1:1; dark matches its
 * `[data-theme="dark"]` block. React Native cannot parse `oklch()`/CSS vars, so
 * everything is sRGB hex/rgba here.
 *
 * The palette carries both the v3 semantic names (ink, mut, fnt, hair, track,
 * sand, acc, grn, red, inv, scrim) and the legacy keys the older primitives
 * still import, so nothing has to change in one pass. New v3 screens read the
 * v3 names; kept primitives keep compiling off the legacy aliases.
 */

export interface Palette {
  // ── v3 core ──────────────────────────────────────────────────────────────
  ink: string; // primary text
  mut: string; // muted text
  fnt: string; // faint text / disabled
  hair: string; // hairline dividers & borders
  track: string; // progress-track fill
  sand: string; // tertiary fill / third-place bars
  acc: string; // accent (burnt orange)
  grn: string; // positive / good-direction
  red: string; // over-limit / bad-direction
  inv: string; // text/icon on an ink fill (= paper)
  scrim: string; // modal backdrop

  // ── legacy aliases (kept for older primitives) ─────────────────────────────
  bg: string;
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
  onAccent: string;
}

export const light: Palette = {
  // v3 core
  ink: '#1C1710',
  mut: '#6B6152',
  fnt: '#A89878',
  hair: '#E3D8C2',
  track: '#F0E9DB',
  sand: '#E8DCC4',
  acc: '#D97917',
  grn: '#2E7D46',
  red: '#B3261E',
  inv: '#FAF6EF',
  scrim: 'rgba(28,23,16,0.5)',

  // legacy aliases
  bg: '#FAF6EF',
  surface: '#FAF6EF',
  surface2: '#F0E9DB',
  fg: '#1C1710',
  muted: '#6B6152',
  faint: '#A89878',
  border: '#E3D8C2',
  accent: '#D97917',
  accentLight: '#E08A2E',
  accentSoft: 'rgba(217,121,23,0.12)',
  rec: '#2E7D46',
  recAmber: '#B26B0F',
  recRed: '#B3261E',
  strain: '#1C1710',
  strainGradEnd: '#1C1710',
  sleep: '#6B6152',
  protein: '#1C1710',
  carbs: '#E8DCC4',
  fat: '#D97917',
  recStateBg: 'rgba(46,125,70,0.14)',
  recStateFg: '#2E7D46',
  z4hard: '#D97917',
  logoBlue: '#D97917',
  logoRed: '#B3261E',
  onAccent: '#FFFFFF',
};

export const dark: Palette = {
  // v3 core
  ink: '#F0E8D8',
  mut: '#B5A98F',
  fnt: '#8A7E66',
  hair: '#332B1E',
  track: '#292217',
  sand: '#3A311F',
  acc: '#E08A2E',
  grn: '#5BAF7A',
  red: '#E06052',
  inv: '#161209',
  scrim: 'rgba(0,0,0,0.55)',

  // legacy aliases
  bg: '#161209',
  surface: '#161209',
  surface2: '#292217',
  fg: '#F0E8D8',
  muted: '#B5A98F',
  faint: '#8A7E66',
  border: '#332B1E',
  accent: '#E08A2E',
  accentLight: '#E08A2E',
  accentSoft: 'rgba(224,138,46,0.16)',
  rec: '#5BAF7A',
  recAmber: '#D69A4A',
  recRed: '#E06052',
  strain: '#F0E8D8',
  strainGradEnd: '#F0E8D8',
  sleep: '#B5A98F',
  protein: '#F0E8D8',
  carbs: '#3A311F',
  fat: '#E08A2E',
  recStateBg: 'rgba(91,175,122,0.18)',
  recStateFg: '#5BAF7A',
  z4hard: '#E08A2E',
  logoBlue: '#E08A2E',
  logoRed: '#E06052',
  onAccent: '#161209',
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
