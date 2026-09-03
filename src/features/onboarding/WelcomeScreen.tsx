import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BigStat,
  BriefHeader,
  BRIEF_GUTTER,
  BRIEF_MAX_WIDTH,
  Card,
  cardTitleStyle,
  M,
} from '../../components/brief';
import {
  connectHealthSource,
  healthSourceName,
  isHealthSourceConfigured,
} from '../../health';
import { useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** A faint placeholder card for the pre-connection skeleton — the same card
 * shape the connected brief uses, with its content greyed to bars. */
function SkeletonCard({
  title,
  lines,
  first,
}: {
  title: string;
  lines: number;
  first?: boolean;
}) {
  const c = useTheme().colors;
  return (
    <Card first={first}>
      <View style={styles.skelBody}>
        <Text style={cardTitleStyle(c.fnt)}>{title}</Text>
        {Array.from({ length: lines }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.skel,
              { backgroundColor: c.track, height: lines > 2 ? 6 : 8 },
            ]}
          />
        ))}
      </View>
    </Card>
  );
}

/** First-run Welcome brief. Connecting Health Connect (or skipping past it) marks
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
      if (isHealthSourceConfigured()) {
        const ok = await connectHealthSource();
        setConnection('device', ok);
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
          pill={{ text: 'NOT CONNECTED', dot: c.fnt, bg: null }}
          caption="CONNECT A SOURCE TO START"
        />

        <SkeletonCard title="Body" lines={2} />
        <SkeletonCard title="Fuel" lines={2} />
        <SkeletonCard title="Week" lines={3} />

        <View style={styles.spacer} />

        <Pressable
          onPress={connect}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Connect ${healthSourceName()}`}
          style={[
            styles.cta,
            { backgroundColor: c.accSolid, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={M(700, 13, { ls: 1, color: c.onAccent })}>
            {`CONNECT ${healthSourceName().toUpperCase()}`}
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
  root: { flex: 1, paddingHorizontal: BRIEF_GUTTER, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: BRIEF_MAX_WIDTH },
  skelBody: { gap: 11 },
  skel: { borderRadius: 4 },
  spacer: { flex: 1, minHeight: 12 },
  cta: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  foot: { marginTop: 14, lineHeight: 16 },
});
