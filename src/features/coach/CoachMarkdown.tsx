import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import Markdown, { ASTNode, hasParents } from 'react-native-markdown-display';

import { mono, sans } from '../../theme/fonts';
import { useTheme } from '../../theme/theme';

/**
 * Renders an AI coach reply as Markdown, mapped onto the friendly type ramp
 * (ADR-007: Nunito throughout — `sans()` for prose, the heavier `mono()` number
 * face for code) and theme colours. The reply sits in a soft-filled bubble, so
 * prose is 16/22 Bold like the rest of the coach's copy.
 *
 * Every leaf is styled through a single `text` render rule keyed on its ancestry
 * rather than the library's default element styles. This is deliberate: our
 * faces encode weight in the *family name* (e.g. `Nunito_700Bold`), so a
 * weighted family paired with an inherited `fontWeight`/`fontStyle` silently
 * falls back to the system font on iOS. The library's defaults set exactly those
 * props on `strong`/`em`, so we render with `mergeStyle={false}`, blank those
 * elements out, and pick the correct weighted family here instead.
 */
export function CoachMarkdown({ text }: { text: string }) {
  const c = useTheme().colors;

  const { block, rules } = useMemo(() => {
    const leaf = StyleSheet.create({
      base: {
        fontFamily: sans(700),
        fontSize: 16,
        lineHeight: 22,
        color: c.ink,
      },
      strong: {
        fontFamily: sans(900),
        fontSize: 16,
        lineHeight: 22,
        color: c.ink,
      },
      em: { fontFamily: sans(600), fontSize: 16, lineHeight: 22, color: c.mut },
      link: {
        fontFamily: sans(800),
        fontSize: 16,
        lineHeight: 22,
        color: c.acc,
      },
      h1: { fontFamily: sans(900), fontSize: 20, lineHeight: 25, color: c.ink },
      h2: { fontFamily: sans(900), fontSize: 18, lineHeight: 23, color: c.ink },
      h3: { fontFamily: sans(900), fontSize: 16, lineHeight: 22, color: c.ink },
    });

    // Later branches lose to earlier ones, so order matters: a bold word inside
    // a heading should still read as a heading.
    const pick = (parents: ASTNode[]): TextStyle => {
      if (hasParents(parents, 'heading1')) return leaf.h1;
      if (hasParents(parents, 'heading2')) return leaf.h2;
      if (
        hasParents(parents, 'heading3') ||
        hasParents(parents, 'heading4') ||
        hasParents(parents, 'heading5') ||
        hasParents(parents, 'heading6')
      )
        return leaf.h3;
      if (hasParents(parents, 'link')) return leaf.link;
      if (hasParents(parents, 'strong')) return leaf.strong;
      if (hasParents(parents, 'em')) return leaf.em;
      return leaf.base;
    };

    const rules = {
      text: (node: ASTNode, _children: React.ReactNode, parents: ASTNode[]) => (
        <Text key={node.key} selectable style={pick(parents)}>
          {node.content}
        </Text>
      ),
    };

    // Block/layout styling only — no text-weight props here (those live on the
    // leaves above). `mergeStyle={false}` means these fully replace the
    // library's light-mode defaults, so every colour is theme-driven.
    const block = StyleSheet.create({
      body: {},
      // Blanked so the defaults' fontWeight/fontStyle never reach a leaf.
      strong: {},
      em: {},
      s: { textDecorationLine: 'line-through' },
      link: { textDecorationLine: 'underline' },
      paragraph: {
        marginTop: 0,
        marginBottom: 8,
        flexWrap: 'wrap',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        width: '100%',
      },
      heading1: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
        marginBottom: 4,
      },
      heading2: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
        marginBottom: 4,
      },
      heading3: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 6,
        marginBottom: 3,
      },
      bullet_list: { marginTop: 2, marginBottom: 2 },
      ordered_list: { marginTop: 2, marginBottom: 2 },
      list_item: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginBottom: 3,
      },
      bullet_list_icon: {
        marginLeft: 0,
        marginRight: 8,
        color: c.accSolid,
        fontFamily: sans(900),
        fontSize: 16,
        lineHeight: 22,
      },
      ordered_list_icon: {
        marginLeft: 0,
        marginRight: 8,
        color: c.mut,
        fontFamily: mono(800),
        fontSize: 15,
        lineHeight: 22,
      },
      bullet_list_content: { flex: 1 },
      ordered_list_content: { flex: 1 },
      // Code sits on the card colour: the bubble is already the soft fill, so
      // `track` (v3's code well) barely separated from it.
      code_inline: {
        fontFamily: mono(700),
        fontSize: 14,
        color: c.ink,
        backgroundColor: c.card,
        borderRadius: 6,
        paddingHorizontal: 4,
      },
      code_block: {
        fontFamily: mono(600),
        fontSize: 14,
        color: c.ink,
        backgroundColor: c.card,
        borderColor: c.hair,
        borderWidth: 2,
        borderRadius: 14,
        padding: 12,
        marginVertical: 4,
      },
      fence: {
        fontFamily: mono(600),
        fontSize: 14,
        color: c.ink,
        backgroundColor: c.card,
        borderColor: c.hair,
        borderWidth: 2,
        borderRadius: 14,
        padding: 12,
        marginVertical: 4,
      },
      blockquote: {
        backgroundColor: 'transparent',
        borderLeftColor: c.hair,
        borderLeftWidth: 4,
        marginVertical: 4,
        paddingLeft: 10,
      },
      hr: {
        backgroundColor: c.hair,
        height: 2,
        marginVertical: 10,
      },
      table: {
        borderColor: c.hair,
        borderWidth: 2,
        borderRadius: 12,
        marginVertical: 4,
      },
      thead: {},
      tbody: {},
      th: { flex: 1, padding: 6 },
      tr: {
        borderBottomColor: c.hair,
        borderBottomWidth: 2,
        flexDirection: 'row',
      },
      td: { flex: 1, padding: 6 },
    });

    return { block, rules };
  }, [c]);

  return (
    <Markdown mergeStyle={false} style={block} rules={rules}>
      {text}
    </Markdown>
  );
}
