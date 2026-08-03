import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { M, S } from '../../components/brief';
import { useTheme } from '../../theme/theme';
import { Sparkle } from '../coach/CoachScreen';
import { useDailyBriefStore } from './useDailyBriefStore';

/**
 * The "Today" daily brief card: an AI-written line about how the user is doing,
 * from their live data. Generates once per day on mount via
 * {@link useDailyBriefStore} and hides itself when the coach isn't set up (no
 * on-device model / no API key) so it never nags an unconfigured user.
 */
export function DailyBriefCard() {
  const t = useTheme();
  const c = t.colors;
  const status = useDailyBriefStore(s => s.status);
  const text = useDailyBriefStore(s => s.text);
  const ensure = useDailyBriefStore(s => s.ensure);
  const regenerate = useDailyBriefStore(s => s.regenerate);

  React.useEffect(() => {
    void ensure();
  }, [ensure]);

  const loading = status === 'loading';

  // Nothing worth showing: unconfigured (idle) or errored with no prior text.
  if (!text && !loading) return null;

  return (
    <View style={[styles.card, { borderColor: c.hair }]}>
      <View style={styles.head}>
        <Sparkle color={c.acc} size={13} />
        <Text style={M(700, 9, { ls: 1.4, color: c.fnt })}>DAILY BRIEF</Text>
        <View style={styles.spacer} />
        <Pressable
          onPress={() => void regenerate()}
          disabled={loading}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Refresh daily brief"
        >
          <Text style={M(700, 9, { ls: 1, color: loading ? c.fnt : c.acc })}>
            {loading ? '…' : 'REFRESH'}
          </Text>
        </Pressable>
      </View>
      <Text
        selectable
        style={[
          S(500, 13.5, { lh: 20, color: loading && !text ? c.mut : c.ink }),
          styles.body,
        ]}
      >
        {loading && !text ? 'Writing your brief…' : text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginTop: 18,
    gap: 9,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  spacer: { flex: 1 },
  body: { marginTop: 1 },
});
