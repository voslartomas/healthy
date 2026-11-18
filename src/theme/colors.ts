/**
 * Design tokens — the "friendly" palette (ADR-007).
 *
 * Source of truth is the Healthy redesign canvas: a white page, chunky outlined
 * cards, one bright colour per area of the app (recovery/habits green, food
 * orange, lifting violet, water sky, sleep indigo, streak amber) and the blue
 * brand accent for primary actions. Light matches the canvas 1:1; the canvas
 * has no dark artboards, so dark is derived here: the same hues lifted for a
 * dark ground, tints as low-alpha washes.
 *
 * Contrast rule the values follow: anything used as TEXT on the page or a card
 * (`ink`, `mut`, `fnt`, `acc`, `grn`, `red`, the `*Text` tokens) clears 4.5:1;
 * the brighter `*Solid` fills are for bars, rings and button faces, where text
 * on them is white and large.
 *
 * Token NAMES are kept from the v3 palette (plus its legacy aliases) so every
 * screen kept compiling through the switch; the meaning of a few moved and is
 * noted inline. RN cannot parse `oklch()`/CSS vars, so everything is sRGB.
 */

export interface Palette {
  // ── core ────────────────────────────────────────────────────────────────
  bg: string; // page ground
  band: string; // header + hero ground — now the page itself (no dark band)
  card: string; // card surface
  ink: string; // primary text
  mut: string; // secondary text
  fnt: string; // tertiary text / labels — still passes 4.5:1
  hair: string; // card outlines & dividers
  track: string; // progress-track fill
  sand: string; // tertiary data fill (third bar, light sleep, carbs)
  acc: string; // accent for text/icons (links, selected labels)
  accSolid: string; // primary button / brand fill
  grn: string; // positive TEXT (good direction, held)
  red: string; // negative TEXT (over limit, miss)
  inv: string; // text/icon on an ink fill
  scrim: string; // modal backdrop
  pillBg: string; // positive status-pill fill
  pillText: string; // positive status-pill text
  warnBg: string; // soft amber panel ("yesterday is still open")
  warnLine: string; // its outline
  amb: string; // amber text on `warnBg`
  gold: string; // perfect week / streak flame fill
  /** Text/icon colour on an `accSolid` (or any `*Solid`) fill. */
  onAccent: string;
  /** Categorical series colours, cycled to give each weekly goal its own. */
  goalSeries: readonly string[];

  // ── friendly design additions ───────────────────────────────────────────
  /** Inset fill: stat chips, input wells, icon tiles. */
  soft: string;
  /** The darker bottom edge that gives a primary button its "pressable" depth. */
  accEdge: string;
  accTint: string;
  grnSolid: string;
  grnEdge: string;
  grnTint: string;
  redSolid: string;
  redTint: string;
  /** Food & nutrition. */
  food: string;
  foodEdge: string;
  foodTint: string;
  foodText: string;
  /** Strength / lifting. */
  lift: string;
  liftEdge: string;
  liftTint: string;
  liftText: string;
  /** Water & rest timer. */
  water: string;
  waterTint: string;
  waterText: string;
  /** Sleep. */
  sleepSolid: string;
  sleepTint: string;
  sleepText: string;
  /** Streak flame / allowed-miss / perfect week. */
  streak: string;
  streakTint: string;
  streakText: string;

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
  bg: '#FFFFFF',
  band: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#1E2A3B',
  mut: '#556377',
  fnt: '#64748B',
  hair: '#E2E8F0',
  track: '#EEF2F7',
  sand: '#8CC6F0',
  acc: '#1E54C2',
  accSolid: '#2F6FED',
  grn: '#137A4A',
  red: '#B8323A',
  inv: '#FFFFFF',
  scrim: 'rgba(30,42,59,0.45)',
  pillBg: '#E6F6EE',
  pillText: '#137A4A',
  warnBg: '#FFF6E0',
  warnLine: '#F5D38A',
  amb: '#7A5200',
  gold: '#F5A524',
  onAccent: '#FFFFFF',
  goalSeries: ['#2F6FED', '#E0484E', '#6E56F0', '#1C9E62', '#F2711C'],

  soft: '#F3F6FA',
  accEdge: '#1E54C2',
  accTint: '#EAF1FE',
  grnSolid: '#1C9E62',
  grnEdge: '#137A4A',
  grnTint: '#E6F6EE',
  redSolid: '#E0484E',
  redTint: '#FDECEC',
  food: '#F2711C',
  foodEdge: '#C9560D',
  foodTint: '#FFF1E6',
  foodText: '#B5500F',
  lift: '#6E56F0',
  liftEdge: '#5240C9',
  liftTint: '#F0EDFE',
  liftText: '#5240C9',
  water: '#1E9BD7',
  waterTint: '#F2FAFE',
  waterText: '#0F6E9E',
  sleepSolid: '#4453C9',
  sleepTint: '#ECEEFB',
  sleepText: '#3341A8',
  streak: '#F5A524',
  streakTint: '#FFF6E0',
  streakText: '#9A6200',

  surface: '#FFFFFF',
  surface2: '#EEF2F7',
  fg: '#1E2A3B',
  muted: '#556377',
  faint: '#64748B',
  border: '#E2E8F0',
  accent: '#1E54C2',
  accentLight: '#2F6FED',
  accentSoft: '#EAF1FE',
  rec: '#1C9E62',
  recAmber: '#F5A524',
  recRed: '#E0484E',
  strain: '#1E2A3B',
  strainGradEnd: '#1E2A3B',
  sleep: '#4453C9',
  protein: '#F2711C',
  carbs: '#6E56F0',
  fat: '#F5A524',
  recStateBg: '#E6F6EE',
  recStateFg: '#137A4A',
  z4hard: '#E0484E',
  logoBlue: '#2F6FED',
  logoRed: '#E0484E',
};

export const dark: Palette = {
  bg: '#0F1622',
  band: '#0F1622',
  card: '#18212F',
  ink: '#EDF2F8',
  mut: '#B3BFCF',
  fnt: '#93A2B6',
  hair: '#2A3648',
  track: '#253043',
  sand: '#5D9FD1',
  acc: '#8EB1F7',
  accSolid: '#2F6FED',
  grn: '#5CCB95',
  red: '#F28A8E',
  inv: '#0F1622',
  scrim: 'rgba(0,0,0,0.62)',
  pillBg: 'rgba(92,203,149,0.16)',
  pillText: '#5CCB95',
  warnBg: 'rgba(245,165,36,0.12)',
  warnLine: 'rgba(245,165,36,0.38)',
  amb: '#F2B544',
  gold: '#F5B83D',
  onAccent: '#FFFFFF',
  goalSeries: ['#5B8DF2', '#F07A7E', '#9B87F7', '#4CC38A', '#F79250'],

  soft: '#202B3B',
  accEdge: '#1E4AA8',
  accTint: 'rgba(47,111,237,0.18)',
  grnSolid: '#22A86A',
  grnEdge: '#167A4C',
  grnTint: 'rgba(92,203,149,0.14)',
  redSolid: '#E0484E',
  redTint: 'rgba(240,122,126,0.14)',
  food: '#F2711C',
  foodEdge: '#B44D0C',
  foodTint: 'rgba(242,113,28,0.16)',
  foodText: '#F9A06A',
  lift: '#7C66F2',
  liftEdge: '#5240C9',
  liftTint: 'rgba(124,102,242,0.18)',
  liftText: '#B3A6FA',
  water: '#2AA6E0',
  waterTint: 'rgba(42,166,224,0.14)',
  waterText: '#7CC8EE',
  sleepSolid: '#6170DE',
  sleepTint: 'rgba(97,112,222,0.18)',
  sleepText: '#AEB6F4',
  streak: '#F5A524',
  streakTint: 'rgba(245,165,36,0.14)',
  streakText: '#F2B544',

  surface: '#18212F',
  surface2: '#253043',
  fg: '#EDF2F8',
  muted: '#B3BFCF',
  faint: '#93A2B6',
  border: '#2A3648',
  accent: '#8EB1F7',
  accentLight: '#5B8DF2',
  accentSoft: 'rgba(47,111,237,0.18)',
  rec: '#4CC38A',
  recAmber: '#F5B83D',
  recRed: '#F07A7E',
  strain: '#EDF2F8',
  strainGradEnd: '#EDF2F8',
  sleep: '#6170DE',
  protein: '#F79250',
  carbs: '#9B87F7',
  fat: '#F5B83D',
  recStateBg: 'rgba(92,203,149,0.16)',
  recStateFg: '#5CCB95',
  z4hard: '#F07A7E',
  logoBlue: '#5B8DF2',
  logoRed: '#F07A7E',
};

/** Legacy export kept for the navigation theme wiring in App.tsx. */
export const colors = {
  light: {
    primary: light.accSolid,
    background: light.bg,
    surface: light.card,
    text: light.ink,
    textMuted: light.mut,
  },
  dark: {
    primary: dark.accSolid,
    background: dark.bg,
    surface: dark.card,
    text: dark.ink,
    textMuted: dark.mut,
  },
} as const;
