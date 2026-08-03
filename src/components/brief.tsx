/**
 * Shared primitives for the v3 "data brief" layout (HealthApp v3.dc.html).
 *
 * The design is a flat editorial sheet — no cards. Screens are a scrolling
 * column of numbered sections (01 / 02 / 03) divided by hairlines, headed by a
 * mono eyebrow row and, usually, one oversized mono hero number. These pieces
 * encode that vocabulary so each screen stays declarative.
 */
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { mono, sans, Weight } from '../theme/fonts';
import { useTheme } from '../theme/theme';

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
  // iOS clips the top of tall glyphs (caps, accents) in some custom faces — most
  // visibly Hanken Grotesk ExtraBold — when no lineHeight is set and layout falls
  // back to the font's own slightly-too-tight metrics. Default to a roomy line
  // box so ascenders are never cut; callers pass an explicit `lh` when they need
  // a precise rhythm (e.g. the oversized hero numbers), and that always wins.
  s.lineHeight = opts.lh ?? Math.ceil(size * 1.3);
  if (opts.ls != null) s.letterSpacing = opts.ls;
  if (opts.color != null) s.color = opts.color;
  if (opts.upper) s.textTransform = 'uppercase';
  if (opts.align) s.textAlign = opts.align;
  return s;
}

/** Convenience wrappers so screens read `M(700, 10, …)` / `S(800, 16, …)`.
 * IMPORTANT: only `fontFamily` is set — the weight-specific family (e.g.
 * `HankenGrotesk_700Bold`) already carries the weight. Do NOT add `fontWeight`
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

/** Paper-backed scrolling screen body with the v3 padding, centered and capped
 * to a phone-width column on wide screens. */
export function BriefScreen({
  children,
  scrollRef,
}: {
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
}) {
  const t = useTheme();
  return (
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
    >
      <View
        style={{
          width: '100%',
          maxWidth: BRIEF_MAX_WIDTH,
          paddingHorizontal: 24,
        }}
      >
        {children}
      </View>
    </ScrollView>
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

export interface PillSpec {
  text: string;
  /** Dot colour before the text; omit for no dot. */
  dot?: string;
  /** Fill; omit for a hairline-outlined pill. */
  bg?: string;
  textColor?: string;
}

/** Small rounded status pill (ink fill or hairline outline). */
export function Pill({ spec }: { spec: PillSpec }) {
  const t = useTheme();
  const outlined = spec.bg == null;
  return (
    <View
      style={[
        styles.pill,
        outlined
          ? { borderWidth: 1, borderColor: t.colors.hair }
          : { backgroundColor: spec.bg },
      ]}
    >
      {spec.dot ? (
        <View style={[styles.pillDot, { backgroundColor: spec.dot }]} />
      ) : null}
      <Text
        style={M(700, 10.5, {
          ls: 1,
          color: spec.textColor ?? (outlined ? t.colors.fnt : t.colors.inv),
        })}
      >
        {spec.text}
      </Text>
    </View>
  );
}

/** The oversized mono hero number with an optional unit suffix, status pill and
 * caption. Becomes a button when `onPress` is set (e.g. tap → Recovery). */
export function BigStat({
  value,
  suffix,
  valueColor,
  pill,
  caption,
  onPress,
  accessibilityLabel,
}: {
  value: string;
  suffix?: string;
  valueColor?: string;
  pill?: PillSpec;
  caption?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const body = (
    <>
      <Text
        style={[
          styles.big,
          { color: valueColor ?? t.colors.ink },
          M(800, 64, { ls: -4 }),
          // lineHeight must stay >= fontSize or iOS clips the tops of the digits
          // (a shorter line box crops the glyph). Keep it snug but not clipping.
          { lineHeight: 70 },
        ]}
      >
        {value}
        {suffix ? (
          <Text style={[M(800, 30, { ls: -1, color: t.colors.fnt })]}>
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
                M(700, 10, { ls: 1, upper: true, color: t.colors.fnt }),
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
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.bigRow}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={styles.bigRow}>{body}</View>;
}

/** A numbered section (01 / 02 / …) headed by a title, divided by a hairline —
 * a 2px ink rule for the first section, a 1px hairline otherwise. */
export function Section({
  n,
  title,
  first,
  titleRight,
  onTitlePress,
  children,
  style,
}: {
  n: string;
  title: string;
  first?: boolean;
  titleRight?: React.ReactNode;
  onTitlePress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const header = (
    <View style={styles.sectTitleRow}>
      <Text style={S(800, 16, { ls: -0.16, color: t.colors.ink })}>
        {title}
      </Text>
      {titleRight}
    </View>
  );
  return (
    <View
      style={[
        styles.section,
        first
          ? { borderTopWidth: 2, borderTopColor: t.colors.ink }
          : { borderTopWidth: 1, borderTopColor: t.colors.hair },
        style,
      ]}
    >
      <Text
        style={[
          M(800, 15, { color: first ? t.colors.acc : t.colors.acc }),
          styles.sectNum,
        ]}
      >
        {n}
      </Text>
      <View style={styles.sectBody}>
        {onTitlePress ? (
          <Pressable onPress={onTitlePress}>{header}</Pressable>
        ) : (
          header
        )}
        {children}
      </View>
    </View>
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
  const t = useTheme();
  return (
    <View style={styles.quad}>
      {items.map((it, i) => {
        const inner = (
          <>
            <Text
              style={M(800, 20, { ls: -1, color: it.color ?? t.colors.ink })}
            >
              {it.value}
            </Text>
            <Text
              style={[
                M(600, 9, { ls: 1, color: t.colors.fnt }),
                { lineHeight: 14 },
              ]}
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
 * target marker line pinned to the right edge. */
export function MacroBar({
  label,
  right,
  fill,
  fillColor,
  marker,
  style,
}: {
  label: React.ReactNode;
  right: React.ReactNode;
  fill: number;
  fillColor: string;
  marker?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const pct = `${Math.max(0, Math.min(1, fill)) * 100}%` as const;
  return (
    <View style={style}>
      <View style={styles.macroCap}>
        <Text style={M(700, 11, { color: t.colors.mut })}>{label}</Text>
        <Text style={M(700, 11, { color: t.colors.ink })}>{right}</Text>
      </View>
      <View style={[styles.macroTrack, { backgroundColor: t.colors.track }]}>
        <View
          style={{
            width: pct,
            height: '100%',
            borderRadius: 4,
            backgroundColor: fillColor,
          }}
        />
        {marker ? (
          <View style={[styles.macroMarker, { backgroundColor: marker }]} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginTop: 6,
  },
  big: {},
  bigRight: { paddingBottom: 6, flexShrink: 1 },
  section: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 16,
    marginTop: 4,
  },
  sectNum: { flexShrink: 0 },
  sectBody: { flex: 1, minWidth: 0 },
  sectTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  quad: { flexDirection: 'row', marginTop: 12 },
  quadCell: { flex: 1, gap: 4 },
  macroCap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  macroTrack: {
    position: 'relative',
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
  },
  macroMarker: {
    position: 'absolute',
    right: 0,
    top: -3,
    height: 14,
    width: 2,
  },
});
