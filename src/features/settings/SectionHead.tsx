import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cardTitleStyle, S } from '../../components/brief';
import { useTheme } from '../../theme/theme';

/**
 * A section heading on the Me tab (ADR-007 "Settings" artboard): a Nunito Black
 * 20 title sitting on the page — not inside a card — with an optional one-line
 * explainer under it and an optional action (e.g. "+ New goal") on the right.
 *
 * It lives here rather than in `brief.tsx` because only the Me tab's sections
 * (Settings, Profile, Calorie goal) use it; `GroupLabel` is the Today variant
 * and takes text children only, so it can't carry the right-hand action.
 */
export function SectionHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  const c = useTheme().colors;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={cardTitleStyle(c.ink)}>{title}</Text>
        {right}
      </View>
      {sub ? (
        <Text style={[S(700, 14, { lh: 19, color: c.fnt }), styles.sub]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
  },
  sub: { marginTop: -4 },
});
