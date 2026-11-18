import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BRIEF_MAX_WIDTH,
  BriefButton,
  S,
  toneColors,
  Tone,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  connectHealthSource,
  healthSourceName,
  isHealthSourceConfigured,
} from '../../health';
import { useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** One numbered promise on the welcome screen, its badge in an area's colour. */
function Point({ n, tone, text }: { n: number; tone: Tone; text: string }) {
  const c = useTheme().colors;
  const tc = toneColors(c, tone);
  return (
    <View style={[styles.point, { backgroundColor: c.soft }]}>
      <View style={[styles.badge, { backgroundColor: tc.tint }]}>
        <Text style={S(900, 16, { color: tc.text })}>{n}</Text>
      </View>
      <Text style={[S(800, 16, { lh: 21, color: c.ink }), styles.pointText]}>
        {text}
      </Text>
    </View>
  );
}

/**
 * First-run Welcome (ADR-007 "Welcome" artboard): a friendly hello, three
 * numbered promises (what is read, that it stays on the phone, what is written
 * back), then one green "Connect …" slab and a "Maybe later".
 *
 * Either path marks the user onboarded, after which the tab brief opens on
 * every launch: a declined or failed permission request still lets them in —
 * they can connect later from the Me tab, and missing metrics render as "—".
 */
export function WelcomeScreen() {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const setOnboarded = useAppStore(s => s.setOnboarded);
  const setConnection = useAppStore(s => s.setConnection);
  const refreshHealth = useHealthStore(s => s.refresh);
  const [busy, setBusy] = React.useState(false);
  const sourceName = healthSourceName();

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
      // Non-fatal: they can connect later in Me. Enter the app either way.
    } finally {
      setOnboarded(true);
      setBusy(false);
    }
  }, [busy, refreshHealth, setConnection, setOnboarded]);

  const later = React.useCallback(() => {
    if (!busy) setOnboarded(true);
  }, [busy, setOnboarded]);

  const tone = toneColors(c, 'green');

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>
        <View style={[styles.hero, { backgroundColor: tone.tint }]}>
          <Icon name="heart" size={72} color={tone.solid} />
        </View>

        <View style={styles.hello}>
          <Text style={S(900, 34, { lh: 40, color: c.ink, align: 'center' })}>
            Hi, I’m Healthy
          </Text>
          <Text style={S(700, 18, { lh: 25, color: c.mut, align: 'center' })}>
            Your daily health brief: recovery, food, lifting and habits — in one
            place.
          </Text>
        </View>

        <View style={styles.points}>
          <Point
            n={1}
            tone="green"
            text="Reads steps, workouts, heart rate, sleep and HRV"
          />
          <Point n={2} tone="accent" text="Everything stays on your phone" />
          <Point
            n={3}
            tone="food"
            text={`Food you log is saved back to ${sourceName}`}
          />
        </View>

        <View style={styles.spacer} />

        <BriefButton
          label={`Connect ${sourceName}`}
          onPress={() => void connect()}
          tone="green"
          disabled={busy}
          accessibilityLabel={`Connect ${sourceName}`}
          size={16}
          fontSize={18}
        />
        <Pressable
          onPress={later}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
          style={styles.later}
        >
          <Text style={S(900, 16, { color: c.acc })}>Maybe later</Text>
        </Pressable>
        <Text style={S(700, 13, { color: c.fnt, align: 'center' })}>
          Syncs steps · activities · HR · sleep · HRV. Your data stays on this
          device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24 },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: BRIEF_MAX_WIDTH,
    alignItems: 'stretch',
  },
  hero: {
    alignSelf: 'center',
    width: 132,
    height: 132,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hello: { marginTop: 22, gap: 8 },
  points: { marginTop: 24, gap: 10 },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { flex: 1, minWidth: 0 },
  spacer: { flex: 1, minHeight: 24 },
  later: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 6,
  },
});
