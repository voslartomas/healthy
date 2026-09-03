/**
 * Shared primitives for the v3 "data brief" layout (HealthApp v3.dc.html).
 *
 * The design is a scrolling column of cards on a cool page ground: each section
 * is a `card`-filled block outlined in a `hair` hairline, 10px radius, 16/18
 * padding, separated by a 12px gap. Titles are Archivo ExtraBold; every number,
 * label and eyebrow is Oswald, uppercase. These pieces encode that vocabulary so
 * each screen stays declarative.
 *
 * (The previous revision was a flat editorial sheet with numbered 01/02/03
 * sections and hairline rules — hence no `n` prop here any more.)
 */
import { HeaderHeightContext } from '@react-navigation/elements';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  const s: TextStyle = { fontFamily: family, fontSize: size };
  // iOS clips the top of tall glyphs (caps, accents) in some custom faces when
  // no lineHeight is set and layout falls back to the font's own slightly-too-
  // tight metrics. Default to a roomy line box so ascenders are never cut;
  // callers pass an explicit `lh` when they need a precise rhythm (e.g. the
  // oversized hero numbers), and that always wins.
  s.lineHeight = opts.lh ?? Math.ceil(size * 1.3);
  if (opts.ls != null) s.letterSpacing = opts.ls;
  if (opts.color != null) s.color = opts.color;
  if (opts.upper) s.textTransform = 'uppercase';
  if (opts.align) s.textAlign = opts.align;
  return s;
}

/** Convenience wrappers so screens read `M(700, 10, …)` / `S(800, 16, …)`.
 * IMPORTANT: only `fontFamily` is set — the weight-specific family (e.g.
 * `Archivo_700Bold`) already carries the weight. Do NOT add `fontWeight`
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

/** Max content width of the brief. On phones the column fills the screen; on
 * wider surfaces (tablet / web) it stays a centered phone-width column so the
 * mobile layout never stretches edge-to-edge. */
export const BRIEF_MAX_WIDTH = 440;

/** Horizontal gutter of the card column (the design's `padding: 4px 22px`). */
export const BRIEF_GUTTER = 22;

/** The card title face — Archivo ExtraBold 15, used by {@link Card} and by the
 * few screens that head a block without wrapping it in one. */
export function cardTitleStyle(ink: string): TextStyle {
  return S(800, 15, { ls: -0.15, lh: 18, color: ink });
}

/**
 * The fixed inverted palette used for content that sits inside an ink band. The
 * band ({@link Palette.band}) is dark in *both* colour schemes, so the text,
 * hairlines and accents on top of it are constant — white ink, cool-grey muted
 * copy, and the light steel accents the dark theme already uses. Screens read
 * these directly (not through {@link useTheme}) because there is no theme
 * provider to override for a subtree. Mirrors the design's per-band CSS-var
 * overrides in HealthApp v4. */
export const BAND = {
  ink: '#FFFFFF',
  mut: '#D5DEE9',
  fnt: '#B4C1D2',
  hair: 'rgba(255,255,255,0.14)',
  track: 'rgba(255,255,255,0.14)',
  acc: '#6FA3D6',
  accSolid: '#6FA3D6',
  sand: '#7FA8CE',
  grn: '#5FAE8B',
  pillBg: 'rgba(95,174,139,0.18)',
  pillText: '#5FAE8B',
} as const;

/** Shared field styling for the design's text inputs: hairline box on the page
 * ground, 12px radius, 12/14 padding. */
export function inputStyle(c: Palette): ViewStyle {
  return {
    borderWidth: 1,
    borderColor: c.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: c.bg,
  };
}

/** Page-ground scrolling screen body with the v3 gutter, centered and capped to
 * a phone-width column on wide screens. */
export function BriefScreen({
  children,
  scrollRef,
}: {
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
}) {
  const t = useTheme();
  // Lift the whole sheet above the keyboard so a focused input is never hidden.
  // Under Android edge-to-edge (SDK 57 / RN 0.86) `adjustResize` no longer
  // shrinks the window, so a bare ScrollView gets overlapped; KeyboardAvoidingView
  // is the JS-only fix that works on both platforms. Offset by the nav header
  // height (0 when there is no header) so the avoided distance is measured from
  // the top of the scroll area, matching CoachScreen.
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
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        // Let a Save/＋ button fire on the first tap while the keyboard is up,
        // instead of that tap only dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
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

/** The mono eyebrow row: uppercase context on the left, accent status right. */
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
      <Text style={M(700, 10, { ls: 2, upper: true, color: t.colors.fnt })}>
        {left}
      </Text>
      {right ? (
        <Text
          style={M(700, 10, {
            ls: 2,
            upper: true,
            color: rightColor ?? t.colors.acc,
          })}
        >
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** A free-standing mono label above a card ("OVERNIGHT VITALS"). */
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
      <Text style={M(700, 10, { ls: 2, upper: true, color: c.fnt })}>
        {children}
      </Text>
    </View>
  );
}

export interface PillSpec {
  text: string;
  /** Dot colour before the text; omit for no dot. */
  dot?: string;
  /** Fill; defaults to the tinted `pillBg`. Pass `null` for a hairline outline. */
  bg?: string | null;
  textColor?: string;
}

/** Small rounded status pill — a tinted fill by default, hairline when `bg` is
 * explicitly null. `small` is the tighter variant the Today "Body & fuel" rows
 * use (9.5px text, 4/8 padding) so the trailing pill sits inside a metric row
 * without crowding it. */
export function Pill({ spec, small }: { spec: PillSpec; small?: boolean }) {
  const c = useTheme().colors;
  const outlined = spec.bg === null;
  return (
    <View
      style={[
        small ? styles.pillSmall : styles.pill,
        outlined
          ? { borderWidth: 1, borderColor: c.hair }
          : { backgroundColor: spec.bg ?? c.pillBg },
      ]}
    >
      {spec.dot ? (
        <View style={[styles.pillDot, { backgroundColor: spec.dot }]} />
      ) : null}
      <Text
        style={M(700, small ? 9.5 : 10.5, {
          ls: small ? 0.3 : 1,
          color: spec.textColor ?? (outlined ? c.fnt : c.pillText),
        })}
      >
        {spec.text}
      </Text>
    </View>
  );
}

/**
 * A section card: the design's `background:card; border:1px hair; radius:10;
 * padding:16px 18px` block. `title` renders the Archivo ExtraBold heading with
 * an optional `right` slot; `flush` drops the padding so edge-to-edge media can
 * sit inside; `first` uses the tighter top gap the first card gets under the
 * native header.
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
    {
      backgroundColor: c.card,
      borderColor: c.hair,
      marginTop: first ? cardGeom.firstGap : cardGeom.gap,
    },
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
 * The oversized mono hero number with an optional unit suffix, status pill and
 * caption, wrapped in its own card. Becomes a button when `onPress` is set
 * (e.g. tap → Recovery).
 */
export function BigStat({
  value,
  suffix,
  suffixSize = 30,
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
      <Text
        style={[
          { color: valueColor ?? c.ink },
          // lineHeight must stay >= fontSize or iOS clips the tops of the digits
          // (a shorter line box crops the glyph). Keep it snug but not clipping.
          M(700, 64, { ls: -1, lh: 68 }),
        ]}
      >
        {value}
        {suffix ? (
          <Text style={M(700, suffixSize, { ls: -0.2, color: c.fnt })}>
            {suffix}
          </Text>
        ) : null}
      </Text>
      {pill || caption ? (
        <View style={styles.bigRight}>
          {pill ? <Pill spec={pill} /> : null}
          {caption ? (
            <Text
              style={[
                M(700, 10, { ls: 1, upper: true, color: c.fnt }),
                { lineHeight: 16, marginTop: 5 },
              ]}
            >
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
  const cardStyle: ViewStyle = {
    backgroundColor: c.card,
    borderColor: c.hair,
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

/**
 * A full-bleed dark "ink band" — the v4 signature surface. It bleeds past the
 * brief's 22px gutter to the column edge and re-adds the gutter as padding, so
 * the dark fill runs edge-to-edge while its content keeps the page rhythm. The
 * native header is the same band, so a hero band at the top of a screen (with
 * the default −4 top margin) meets the header with no seam.
 */
export function InkBand({
  children,
  style,
  marginTop = -4,
  paddingTop = 8,
  paddingBottom = 22,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  marginTop?: number;
  paddingTop?: number;
  paddingBottom?: number;
}) {
  const c = useTheme().colors;
  return (
    <View
      style={[
        {
          backgroundColor: c.band,
          marginHorizontal: -BRIEF_GUTTER,
          marginTop,
          paddingHorizontal: BRIEF_GUTTER,
          paddingTop,
          paddingBottom,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The oversized hero readout that sits inside an {@link InkBand}: a 72px Oswald
 * number (optional smaller unit suffix) on the left, with an optional status
 * pill and uppercase caption stacked to its lower-right. Rendered with the
 * fixed {@link BAND} palette. Becomes a button when `onPress` is set.
 */
export function HeroRow({
  value,
  suffix,
  suffixSize = 30,
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
  /** Show the green status dot before the pill text. */
  pillDot?: boolean;
  caption?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const body = (
    <>
      <Text style={M(700, 72, { ls: -1.5, lh: 72, color: BAND.ink })}>
        {value}
        {suffix ? (
          <Text style={M(700, suffixSize, { ls: -0.2, color: BAND.fnt })}>
            {suffixSpace ? ' ' : ''}
            {suffix}
          </Text>
        ) : null}
      </Text>
      {pillText || caption ? (
        <View style={styles.heroRight}>
          {pillText ? (
            <View style={styles.heroPill}>
              {pillDot ? <View style={styles.heroDot} /> : null}
              <Text style={M(700, 10.5, { ls: 1, color: BAND.pillText })}>
                {pillText}
              </Text>
            </View>
          ) : null}
          {caption ? (
            <Text
              style={[
                M(700, 10, { ls: 1, upper: true, color: BAND.fnt }),
                styles.heroCaption,
              ]}
            >
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

/** The outlined, rounded shell that holds a bordered stat grid ({@link
 * GridRow} / {@link GridCell}). Clips the cells' bled left dividers. */
export function GridBox({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme().colors;
  return (
    <View
      style={[
        styles.gridBox,
        { backgroundColor: c.card, borderColor: c.hair },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A row of cells inside a {@link GridBox}. `borderTop` draws the hairline that
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
        borderTop ? { borderTopWidth: 1, borderTopColor: c.hair } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** One grid cell: a mono eyebrow label over its value node(s). `first` drops
 * the left divider (the leading cell in a row); the rest carry a hairline. */
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
    first ? null : { borderLeftWidth: 1, borderLeftColor: c.hair },
    style,
  ];
  const body = (
    <>
      <Text style={M(700, 8.5, { ls: 1.2, upper: true, color: c.fnt })}>
        {label}
      </Text>
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

/** A four-up row of mono stats (HRV / RHR / SLEEP / LOAD). */
export function Quad({ items }: { items: QuadItem[] }) {
  const c = useTheme().colors;
  return (
    <View style={styles.quad}>
      {items.map((it, i) => {
        const inner = (
          <>
            <Text style={M(700, 20, { ls: -0.2, color: it.color ?? c.ink })}>
              {it.value}
            </Text>
            <Text
              style={[M(600, 9, { ls: 1, color: c.fnt }), { lineHeight: 14 }]}
            >
              {it.label}
            </Text>
          </>
        );
        return it.onPress ? (
          <Pressable key={i} style={styles.quadCell} onPress={it.onPress}>
            {inner}
          </Pressable>
        ) : (
          <View key={i} style={styles.quadCell}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

/** A labelled macro/target bar: caption row + track + fill, with an optional
 * target marker line pinned to the right edge. `compact` is the slimmer variant
 * the Today fuel row uses (9.5px caption, 6px track) so the bars nest under a
 * metric row rather than heading their own card. */
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
  const capSize = compact ? 9.5 : 11;
  return (
    <View style={style}>
      <View style={compact ? styles.macroCapCompact : styles.macroCap}>
        <Text style={M(700, capSize, { color: c.mut })}>{label}</Text>
        <Text style={M(700, capSize, { color: c.ink })}>{right}</Text>
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
            borderRadius: compact ? 3 : 4,
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

type ButtonKind = 'solid' | 'outline' | 'dashed';

/**
 * The design's one button shape: a full-width 999-radius pill. `solid` is the
 * steel-blue call to action (white label in both schemes), `outline` the
 * hairline secondary, `dashed` the accent "add another" affordance.
 */
export function BriefButton({
  label,
  onPress,
  kind = 'solid',
  disabled,
  size = 16,
  fontSize,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  /** Vertical padding; the design uses 16 for primary, 13 for inline adds. */
  size?: number;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTheme().colors;
  const fill =
    kind === 'solid'
      ? { backgroundColor: c.accSolid }
      : kind === 'outline'
        ? { borderWidth: 1, borderColor: c.hair }
        : {
            borderWidth: 1,
            borderColor: c.acc,
            borderStyle: 'dashed' as const,
          };
  const color =
    kind === 'solid' ? c.onAccent : kind === 'outline' ? c.ink : c.acc;
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
      <Text
        style={M(700, fontSize ?? (kind === 'solid' ? 13 : 12), {
          ls: 1,
          color,
        })}
      >
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
  groupLabel: { marginTop: 20, paddingHorizontal: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
  },
  pillSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  card: {
    borderWidth: cardGeom.borderWidth,
    borderRadius: cardGeom.radius,
    paddingVertical: cardGeom.paddingVertical,
    paddingHorizontal: cardGeom.paddingHorizontal,
  },
  cardFlush: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  bigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  bigRight: { paddingBottom: 6, flexShrink: 1 },
  // Hero readout inside an ink band (72px number + pill/caption to lower-right).
  heroBox: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  heroRight: { paddingBottom: 6, flexShrink: 1 },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: BAND.pillBg,
  },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BAND.grn },
  heroCaption: { lineHeight: 16, marginTop: 5 },
  // Bordered stat grid (GridBox / GridRow / GridCell).
  gridBox: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  gridRow: { flexDirection: 'row' },
  gridCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 6,
  },
  quad: { flexDirection: 'row', marginTop: 12 },
  quadCell: { flex: 1, gap: 4 },
  macroCap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  macroCapCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  macroTrack: {
    position: 'relative',
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
  },
  macroTrackCompact: {
    position: 'relative',
    height: 6,
    borderRadius: 3,
    overflow: 'visible',
  },
  macroMarker: {
    position: 'absolute',
    right: 0,
    top: -3,
    height: 14,
    width: 2,
  },
  macroMarkerCompact: {
    position: 'absolute',
    right: 0,
    top: -3,
    height: 12,
    width: 2,
  },
  button: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
