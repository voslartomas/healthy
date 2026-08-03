import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BigStat,
  BriefHeader,
  BRIEF_MAX_WIDTH,
  M,
} from '../../components/brief';
import {
  connectGoogleHealth,
  isGoogleHealthClientConfigured,
} from '../../health/googleAuth';
import { useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** A faint numbered placeholder row for the pre-connection skeleton. */
function SkeletonSection({
  n,
  title,
  lines,
  first,
}: {
  n: string;
  title: string;
  lines: number;
  first?: boolean;
}) {
  const t = useTheme();
  const c = t.colors;
  return (
    <View
      style={[
        styles.section,
        first
          ? { borderTopWidth: 2, borderTopColor: c.ink }
          : { borderTopWidth: 1, borderTopColor: c.hair },
      ]}
    >
      <Text style={M(800, 15, { color: c.fnt })}>{n}</Text>
      <View style={styles.sectionBody}>
        <Text style={M(800, 16, { color: c.fnt })}>{title}</Text>
        {Array.from({ length: lines }).map((_, i) => (
          <View key={i} style={[styles.skel, { backgroundColor: c.track }]} />
        ))}
      </View>
    </View>
  );
}

/** First-run Welcome brief. Connecting Google Health (or skipping past it) marks
 * the user onboarded, after which the tab brief opens on every launch. */
export function WelcomeScreen() {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  const setOnboarded = useAppStore(s => s.setOnboarded);
  const setConnection = useAppStore(s => s.setConnection);
  const refreshHealth = useHealthStore(s => s.refresh);
  const [busy, setBusy] = React.useState(false);

  const connect = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isGoogleHealthClientConfigured()) {
        const ok = await connectGoogleHealth();
        setConnection('googleHealth', ok);
        if (ok) await refreshHealth();
      }
    } catch {
      // Non-fatal: they can connect later in Setup. Enter the app either way.
    } finally {
      setOnboarded(true);
      setBusy(false);
    }
  }, [busy, refreshHealth, setConnection, setOnboarded]);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: c.bg,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 34,
        },
      ]}
    >
      <View style={styles.column}>
        <BriefHeader left="Welcome" right="No data yet" />

        <BigStat
          value="—"
          valueColor={c.sand}
          pill={{ text: 'NOT CONNECTED', dot: c.fnt }}
          caption="CONNECT A SOURCE TO START"
        />

        <SkeletonSection n="01" title="Body" lines={2} first />
        <SkeletonSection n="02" title="Fuel" lines={2} />
        <SkeletonSection n="03" title="Week" lines={3} />

        <View style={styles.spacer} />

        <Pressable
          onPress={connect}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Connect Google Health"
          style={[
            styles.cta,
            { backgroundColor: c.ink, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={M(700, 13, { ls: 1, color: c.inv })}>
            CONNECT GOOGLE HEALTH
          </Text>
        </Pressable>
        <Text
          style={[
            M(600, 9.5, { ls: 1, upper: true, color: c.fnt, align: 'center' }),
            styles.foot,
          ]}
        >
          SYNCS STEPS · ACTIVITIES · HR · SLEEP · HRV{'\n'}DATA STAYS ON-DEVICE
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: BRIEF_MAX_WIDTH },
  section: { flexDirection: 'row', gap: 14, paddingVertical: 16, marginTop: 4 },
  sectionBody: { flex: 1, gap: 11 },
  skel: { height: 8, borderRadius: 4, marginTop: 3 },
  spacer: { flex: 1, minHeight: 12 },
  cta: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  foot: { marginTop: 14, lineHeight: 16 },
});
