/**
 * Shared primitives for the "friendly" layout (ADR-007).
 *
 * The design is a white scrolling column of chunky, rounded cards — 2px outline
 * with a 4px bottom edge, 22px radius — each holding one idea, in Nunito, with
 * oversized numbers and a colour per area of the app. These pieces encode that
 * vocabulary so each screen stays declarative.
 *
 * Every export of the earlier v3 "data brief" vocabulary is kept (same names,
 * same props) and restyled here, which is how every screen picked up the new
 * look at once; screens then get rebuilt one by one on top. The two that changed
 * meaning:
 *  - {@link InkBand} is no longer a full-bleed dark band but a soft, tinted hero
 *    card; pass `tone` for the area's colour.
 *  - the fixed white-on-dark `BAND` palette became {@link useBand}, because the
 *    header and hero now sit on the page colour, which follows the theme.
 */
import { HeaderHeightContext } from '@react-navigation/elements';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { Palette } from '../theme/colors';
import { mono, sans, Weight } from '../theme/fonts';
import { card as cardGeom, useTheme } from '../theme/theme';

/** Smallest type the design allows. The v3 sheet ran labels down to 8–9px, which
 * is exactly what "readable" was asking us to stop; a floor here lifts every
 * screen at once, before each is rebuilt. */
const MIN_FONT_SIZE = 12;
/** v3's spaced-out uppercase eyebrows used 1–2px tracking; at Nunito's width
 * that reads as shouting, so tracking is capped. */
const MAX_LETTER_SPACING = 0.6;

/** Build a text style from a family + size, with optional line-height,
 * letter-spacing, colour and uppercasing. Keeps one-off labels terse. */
export function txt(
  family: string,
  size: number,
  opts: {
    lh?: number;
    ls?: number;
    color?: string;
    upper?: boolean;
    align?: TextStyle['textAlign'];
  } = {},
): TextStyle {
  const fontSize = Math.max(size, MIN_FONT_SIZE);
  const s: TextStyle = { fontFamily: family, fontSize };
  // iOS clips the top of tall glyphs (caps, accents) in some custom faces when
  // no lineHeight is set and layout falls back to the font's own slightly-too-
  // tight metrics. Default to a roomy line box so ascenders are never cut;
  // callers pass an explicit `lh` when they need a precise rhythm (e.g. the
  // oversized hero numbers), and that always wins — but never below the size.
  s.lineHeight = Math.max(opts.lh ?? Math.ceil(fontSize * 1.3), fontSize);
  if (opts.ls != null) s.letterSpacing = Math.min(opts.ls, MAX_LETTER_SPACING);
  if (opts.color != null) s.color = opts.color;
  if (opts.upper) s.textTransform = 'uppercase';
  if (opts.align) s.textAlign = opts.align;
  return s;
}

/** Convenience wrappers so screens read `M(700, 10, …)` / `S(800, 16, …)`.
 * `M` is the number face (Nunito one weight heavier, see fonts.ts), `S` text.
 * IMPORTANT: only `fontFamily` is set — the weight-specific family (e.g.
 * `Nunito_800ExtraBold`) already carries the weight. Do NOT add `fontWeight`
 * here: on iOS, pairing a weighted custom family with `fontWeight` makes the
 * face fail to resolve and silently fall back to the system font. */
export const M = (
  w: Weight,
  size: number,
  o?: Parameters<typeof txt>[2],
): TextStyle => txt(mono(w), size, o);
export const S = (
  w: Weight,
  size: number,
  o?: Parameters<typeof txt>[2],
): TextStyle => txt(sans(w), size, o);

/** Max content width. On phones the column fills the screen; on wider surfaces
 * (tablet / web) it stays a centered phone-width column. */
export const BRIEF_MAX_WIDTH = 440;

/** Horizontal gutter of the card column. */
export const BRIEF_GUTTER = 20;

/** The card title face — Nunito Black 20. */
export function cardTitleStyle(ink: string): TextStyle {
  return S(900, 20, { lh: 25, color: ink });
}

/** A screen's big page title ("Food", "Lift"). */
export function pageTitleStyle(ink: string): TextStyle {
  return S(900, 30, { lh: 36, color: ink });
}

/**
 * Colours for content in the header and the hero. v3 drew these white on a dark
 * band that was dark in BOTH schemes; the friendly design puts them on the page
 * itself, so they follow the theme like everything else.
 */
export interface BandPalette {
  ink: string;
  mut: string;
  fnt: string;
  hair: string;
  track: string;
  acc: string;
  accSolid: string;
  sand: string;
  grn: string;
  pillBg: string;
  pillText: string;
}

export function bandPalette(c: Palette): BandPalette {
  return {
    ink: c.ink,
    mut: c.mut,
    fnt: c.fnt,
    hair: c.hair,
    track: c.track,
    acc: c.acc,
    accSolid: c.accSolid,
    sand: c.sand,
    grn: c.grn,
    pillBg: c.pillBg,
    pillText: c.pillText,
  };
}

export function useBand(): BandPalette {
  return bandPalette(useTheme().colors);
}

/** The colour families a hero / button can take — one per area of the app. */
export type Tone =
  'accent' | 'green' | 'food' | 'lift' | 'water' | 'sleep' | 'red' | 'streak';

/** `tint` = soft fill, `text` = readable text on it, `solid` = bars/buttons,
 * `edge` = a solid button's darker bottom edge. */
export function toneColors(
  c: Palette,
  tone: Tone,
): { tint: string; text: string; solid: string; edge: string } {
  switch (tone) {
    case 'green':
      return {
        tint: c.grnTint,
        text: c.grn,
        solid: c.grnSolid,
        edge: c.grnEdge,
      };
    case 'food':
      return {
        tint: c.foodTint,
        text: c.foodText,
        solid: c.food,
        edge: c.foodEdge,
      };
    case 'lift':
      return {
        tint: c.liftTint,
        text: c.liftText,
        solid: c.lift,
        edge: c.liftEdge,
      };
    case 'water':
      return {
        tint: c.waterTint,
        text: c.waterText,
        solid: c.water,
        edge: c.waterText,
      };
    case 'sleep':
      return {
        tint: c.sleepTint,
        text: c.sleepText,
        solid: c.sleepSolid,
        edge: c.sleepText,
      };
    case 'red':
      return { tint: c.redTint, text: c.red, solid: c.redSolid, edge: c.red };
    case 'streak':
      return {
        tint: c.streakTint,
        text: c.streakText,
        solid: c.streak,
        edge: c.streakText,
      };
    default:
      return {
        tint: c.accTint,
        text: c.acc,
        solid: c.accSolid,
        edge: c.accEdge,
      };
  }
}

/** Shared field styling: a soft well with a 2px outline, 14px radius. */
export function inputStyle(c: Palette): ViewStyle {
  return {
    borderWidth: 2,
    borderColor: c.hair,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: c.soft,
  };
}

/** The chunky outline every card and tile shares: 2px, 4px at the bottom. */
export function chunky(
  c: Palette,
  radius: number = cardGeom.radius,
): ViewStyle {
  return {
    borderWidth: cardGeom.borderWidth,
    borderBottomWidth: cardGeom.borderBottomWidth,
    borderColor: c.hair,
    borderRadius: radius,
    backgroundColor: c.card,
  };
}

/** Page-ground scrolling screen body with the gutter, centered and capped to a
 * phone-width column on wide screens.
 *
 * Pass `onRefresh` to enable pull-to-refresh; `refreshing` drives the spinner and
 * should be the store's in-flight flag, so a refresh started elsewhere (app
 * foreground, a just-logged meal) also shows up here rather than only a pull the
 * user performed themselves. */
export function BriefScreen({
  children,
  scrollRef,
  onRefresh,
  refreshing = false,
}: {
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const t = useTheme();
  const headerHeight = React.useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: t.colors.bg }}
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: 4,
          paddingBottom: 140,
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.colors.fnt}
              colors={[t.colors.accSolid]}
            />
          ) : undefined
        }
      >
        <View
          style={{
            width: '100%',
            maxWidth: BRIEF_MAX_WIDTH,
            paddingHorizontal: BRIEF_GUTTER,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A small context row: label on the left, coloured status on the right. */
export function BriefHeader({
  left,
  right,
  rightColor,
}: {
  left: string;
  right?: string;
  rightColor?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.headRow}>
      <Text style={S(800, 14, { color: t.colors.fnt })}>{left}</Text>
      {right ? (
        <Text style={S(800, 14, { color: rightColor ?? t.colors.acc })}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** A section heading above a card ("Today's habits"). */
export function GroupLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  return (
    <View style={[styles.groupLabel, style]}>
      <Text style={S(900, 22, { lh: 28, color: c.ink })}>{children}</Text>
    </View>
  );
}

export interface PillSpec {
  text: string;
  /** Dot colour before the text; omit for no dot. */
  dot?: string;
  /** Fill; defaults to the tinted `pillBg`. Pass `null` for an outline. */
  bg?: string | null;
  textColor?: string;
}

/** Rounded status pill — a tinted fill by default, outlined when `bg` is
 * explicitly null. `small` is the tighter variant for inside a row. */
export function Pill({ spec, small }: { spec: PillSpec; small?: boolean }) {
  const c = useTheme().colors;
  const outlined = spec.bg === null;
  return (
    <View
      style={[
        small ? styles.pillSmall : styles.pill,
        outlined
          ? { borderWidth: 2, borderColor: c.hair }
          : { backgroundColor: spec.bg ?? c.pillBg },
      ]}
    >
      {spec.dot ? (
        <View style={[styles.pillDot, { backgroundColor: spec.dot }]} />
      ) : null}
      <Text
        style={S(900, small ? 12 : 13.5, {
          color: spec.textColor ?? (outlined ? c.mut : c.pillText),
        })}
      >
        {spec.text}
      </Text>
    </View>
  );
}

/**
 * A section card: chunky outline (2px, 4px bottom edge), 22px radius, 18px
 * padding. `title` renders the Nunito Black heading with an optional `right`
 * slot; `flush` drops the padding so edge-to-edge content can sit inside;
 * `first` uses the tighter top gap of the first card under the header.
 */
export function Card({
  title,
  right,
  onTitlePress,
  onPress,
  first,
  flush,
  children,
  style,
  accessibilityLabel,
}: {
  title?: string;
  right?: React.ReactNode;
  /** Tap target on the title row only (e.g. "Fuel →"). */
  onTitlePress?: () => void;
  /** Makes the whole card a button (e.g. the Today sleep card). */
  onPress?: () => void;
  first?: boolean;
  flush?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme().colors;
  const header = title ? (
    <View style={styles.cardTitleRow}>
      <Text style={cardTitleStyle(c.ink)}>{title}</Text>
      {right}
    </View>
  ) : null;
  const body = (
    <>
      {onTitlePress && header ? (
        <Pressable onPress={onTitlePress}>{header}</Pressable>
      ) : (
        header
      )}
      {children}
    </>
  );
  const shell = [
    styles.card,
    chunky(c),
    { marginTop: first ? cardGeom.firstGap : cardGeom.gap },
    flush ? styles.cardFlush : null,
    style,
  ];
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={shell}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={shell}>{body}</View>;
}

/**
 * The oversized number with an optional unit suffix, status pill and caption,
 * wrapped in its own card. Becomes a button when `onPress` is set.
 */
export function BigStat({
  value,
  suffix,
  suffixSize = 26,
  valueColor,
  pill,
  caption,
  onPress,
  first = true,
  accessibilityLabel,
}: {
  value: string;
  suffix?: string;
  suffixSize?: number;
  valueColor?: string;
  pill?: PillSpec;
  caption?: string;
  onPress?: () => void;
  first?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useTheme().colors;
  const body = (
    <>
      <Text style={[{ color: valueColor ?? c.ink }, S(900, 56, { lh: 62 })]}>
        {value}
        {suffix ? (
          <Text style={S(900, suffixSize, { color: c.fnt })}>{suffix}</Text>
        ) : null}
      </Text>
      {pill || caption ? (
        <View style={styles.bigRight}>
          {pill ? <Pill spec={pill} /> : null}
          {caption ? (
            <Text style={[S(700, 14, { color: c.mut }), styles.heroCaption]}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
  const cardStyle: ViewStyle = {
    ...chunky(c),
    marginTop: first ? cardGeom.firstGap : cardGeom.gap,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.card, styles.bigRow, cardStyle]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={[styles.card, styles.bigRow, cardStyle]}>{body}</View>;
}

const ToneContext = React.createContext<Tone>('accent');

/**
 * The screen's hero: a soft, rounded card tinted in the area's colour (`tone`)
 * that holds the one number the screen is about. It replaced v3's full-bleed
 * dark "ink band"; the name stays so every screen kept working through the
 * switch. {@link HeroRow} inside it picks the tone up for its pill.
 *
 * `marginTop` defaults to a small gap below the header; the old band's negative
 * offset (to meet a dark header with no seam) no longer applies.
 */
export function InkBand({
  children,
  style,
  tone = 'accent',
  marginTop = 8,
  paddingTop = 20,
  paddingBottom = 20,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: Tone;
  marginTop?: number;
  paddingTop?: number;
  paddingBottom?: number;
}) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
  return (
    <ToneContext.Provider value={tone}>
      <View
        style={[
          {
            backgroundColor: tc.tint,
            borderRadius: 26,
            marginTop: Math.max(0, marginTop),
            paddingHorizontal: 20,
            paddingTop,
            paddingBottom,
          },
          style,
        ]}
      >
        {children}
      </View>
    </ToneContext.Provider>
  );
}

/**
 * The hero readout inside an {@link InkBand}: a big Nunito Black number (with
 * an optional smaller unit), and a status pill + caption beside it. The pill
 * takes the band's tone. Becomes a button when `onPress` is set.
 */
export function HeroRow({
  value,
  suffix,
  suffixSize = 26,
  suffixSpace,
  pillText,
  pillDot,
  caption,
  onPress,
  accessibilityLabel,
}: {
  value: string;
  suffix?: string;
  suffixSize?: number;
  /** Render a space before the unit (" kg"); omit for "%". */
  suffixSpace?: boolean;
  pillText?: string;
  /** Show the status dot before the pill text. */
  pillDot?: boolean;
  caption?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = useTheme().colors;
  const tc = toneColors(c, React.useContext(ToneContext));
  const body = (
    <>
      <Text style={S(900, 60, { lh: 64, color: c.ink })}>
        {value}
        {suffix ? (
          <Text style={S(900, suffixSize, { color: c.mut })}>
            {suffixSpace ? ' ' : ''}
            {suffix}
          </Text>
        ) : null}
      </Text>
      {pillText || caption ? (
        <View style={styles.heroRight}>
          {pillText ? (
            <View style={[styles.heroPill, { backgroundColor: c.card }]}>
              {pillDot ? (
                <View style={[styles.heroDot, { backgroundColor: tc.solid }]} />
              ) : null}
              <Text style={S(900, 13.5, { color: tc.text })}>{pillText}</Text>
            </View>
          ) : null}
          {caption ? (
            <Text style={[S(700, 14, { color: c.mut }), styles.heroCaption]}>
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.heroBox}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={styles.heroBox}>{body}</View>;
}

/** The chunky rounded shell that holds a stat grid ({@link GridRow} /
 * {@link GridCell}). Clips the cells' dividers. */
export function GridBox({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  return <View style={[styles.gridBox, chunky(c, 20), style]}>{children}</View>;
}

/** A row of cells inside a {@link GridBox}. `borderTop` draws the divider that
 * splits it from the row above (or from a card body it is nested under). */
export function GridRow({
  children,
  borderTop,
  style,
}: {
  children: React.ReactNode;
  borderTop?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  return (
    <View
      style={[
        styles.gridRow,
        borderTop ? { borderTopWidth: 2, borderTopColor: c.hair } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** One grid cell: a small label over its value node(s). `first` drops the left
 * divider (the leading cell in a row); the rest carry one. */
export function GridCell({
  label,
  children,
  first,
  onPress,
  accessibilityLabel,
  style,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  const cellStyle = [
    styles.gridCell,
    first ? null : { borderLeftWidth: 2, borderLeftColor: c.hair },
    style,
  ];
  const body = (
    <>
      <Text style={S(800, 12, { color: c.fnt })}>{label}</Text>
      {children}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={cellStyle}
    >
      {body}
    </Pressable>
  ) : (
    <View style={cellStyle}>{body}</View>
  );
}

export interface QuadItem {
  value: string;
  label: React.ReactNode;
  color?: string;
  onPress?: () => void;
}

/** A row of stat chips (HRV / RHR / SLEEP / LOAD) on soft wells. */
export function Quad({ items }: { items: QuadItem[] }) {
  const c = useTheme().colors;
  return (
    <View style={styles.quad}>
      {items.map((it, i) => {
        const inner = (
          <>
            <Text style={S(800, 12, { color: c.fnt })}>{it.label}</Text>
            <Text style={S(900, 20, { color: it.color ?? c.ink })}>
              {it.value}
            </Text>
          </>
        );
        const cell = [styles.quadCell, { backgroundColor: c.soft }];
        return it.onPress ? (
          <Pressable key={i} style={cell} onPress={it.onPress}>
            {inner}
          </Pressable>
        ) : (
          <View key={i} style={cell}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

/** A labelled progress bar: caption row + rounded track + fill, with an
 * optional target marker pinned to the right edge. `compact` is the slimmer
 * variant for nesting under a row. */
export function MacroBar({
  label,
  right,
  fill,
  fillColor,
  marker,
  compact,
  style,
}: {
  label: React.ReactNode;
  right: React.ReactNode;
  fill: number;
  fillColor: string;
  marker?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  const pct = `${Math.max(0, Math.min(1, fill)) * 100}%` as const;
  const capSize = compact ? 13 : 15;
  return (
    <View style={style}>
      <View style={compact ? styles.macroCapCompact : styles.macroCap}>
        <Text style={S(800, capSize, { color: c.mut })}>{label}</Text>
        <Text style={S(900, capSize, { color: c.ink })}>{right}</Text>
      </View>
      <View
        style={[
          compact ? styles.macroTrackCompact : styles.macroTrack,
          { backgroundColor: c.track },
        ]}
      >
        <View
          style={{
            width: pct,
            height: '100%',
            borderRadius: compact ? 5 : 7,
            backgroundColor: fillColor,
          }}
        />
        {marker ? (
          <View
            style={[
              compact ? styles.macroMarkerCompact : styles.macroMarker,
              { backgroundColor: marker },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
}

/**
 * A row of mutually-exclusive chunky tiles — the design's one "pick one of
 * these" control: tinted with an accent outline when chosen.
 *
 * `allowDeselect` covers an optional field (Sex), where tapping the active tile
 * clears it; a required choice (Appearance) leaves it off so a tile can never be
 * turned off into nothing.
 */
export function SegmentedRow<T extends string>({
  options,
  value,
  onChange,
  allowDeselect = false,
  style,
}: {
  options: readonly SegmentOption<T>[];
  value: T | null;
  onChange: (next: T | null) => void;
  allowDeselect?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  return (
    <View style={[styles.segRow, style]}>
      {options.map(option => {
        const on = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(on && allowDeselect ? null : option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            style={[
              styles.segPill,
              {
                backgroundColor: on ? c.accTint : c.card,
                borderColor: on ? c.accSolid : c.hair,
              },
            ]}
          >
            <Text style={S(900, 15, { color: on ? c.acc : c.ink })}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type ButtonKind = 'solid' | 'outline' | 'dashed';

/**
 * The design's button: a 16px-radius slab. `solid` is the call to action — a
 * bright fill with a darker 4px bottom edge, so it looks pressable — in the
 * area's `tone`; `outline` the chunky secondary; `dashed` the "add another"
 * affordance.
 */
export function BriefButton({
  label,
  onPress,
  kind = 'solid',
  tone = 'accent',
  disabled,
  size = 15,
  fontSize,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  tone?: Tone;
  disabled?: boolean;
  /** Vertical padding; 15 for primary, smaller for inline adds. */
  size?: number;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
  const fill: ViewStyle =
    kind === 'solid'
      ? {
          backgroundColor: tc.solid,
          borderBottomWidth: 4,
          borderBottomColor: tc.edge,
        }
      : kind === 'outline'
        ? {
            borderWidth: 2,
            borderBottomWidth: 4,
            borderColor: c.hair,
            backgroundColor: c.card,
          }
        : {
            borderWidth: 2,
            borderColor: tc.solid,
            borderStyle: 'dashed',
          };
  const color =
    kind === 'solid' ? c.onAccent : kind === 'outline' ? c.ink : tc.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.button,
        fill,
        { paddingVertical: size, opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      <Text style={S(900, fontSize ?? (kind === 'solid' ? 17 : 15), { color })}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  groupLabel: { marginTop: 26, marginBottom: -2, paddingHorizontal: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  pillSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  card: {
    paddingVertical: cardGeom.paddingVertical,
    paddingHorizontal: cardGeom.paddingHorizontal,
  },
  cardFlush: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  bigRight: { paddingBottom: 8, flexShrink: 1 },
  heroBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  heroRight: { paddingBottom: 8, flexShrink: 1 },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroCaption: { marginTop: 6 },
  gridBox: { overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },
  gridCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 4,
  },
  quad: { flexDirection: 'row', gap: 8, marginTop: 14 },
  quadCell: { flex: 1, gap: 2, padding: 10, borderRadius: 14 },
  macroCap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  macroCapCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  macroTrack: {
    position: 'relative',
    height: 14,
    borderRadius: 7,
    overflow: 'visible',
  },
  macroTrackCompact: {
    position: 'relative',
    height: 10,
    borderRadius: 5,
    overflow: 'visible',
  },
  macroMarker: {
    position: 'absolute',
    right: 0,
    top: -3,
    height: 20,
    width: 3,
    borderRadius: 2,
  },
  macroMarkerCompact: {
    position: 'absolute',
    right: 0,
    top: -3,
    height: 16,
    width: 3,
    borderRadius: 2,
  },
  button: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segRow: { flexDirection: 'row', gap: 8 },
  segPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
});
