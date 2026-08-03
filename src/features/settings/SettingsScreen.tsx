import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefScreen, M, S, Section } from '../../components/brief';
import { LanguageSelect } from '../coach/LanguageSelect';
import { formatBytes, modelByLabel } from '../coach/ondevice/models';
import { useModelStore } from '../coach/ondevice/useModelStore';
import { CalorieGoalSection } from '../nutrition/CalorieGoalSection';
import {
  connectGoogleHealth,
  disconnectGoogleHealth,
  isGoogleHealthClientConfigured,
  isGoogleHealthConnected,
} from '../../health/googleAuth';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** Setup tab (04): health data connections and AI coach provider configuration. */
export function SettingsScreen(_props: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const model = useAppStore(s => s.model);
  const aiProvider = useAppStore(s => s.aiProvider);
  const connected = useAppStore(s => s.connections.googleHealth);
  const setAiProvider = useAppStore(s => s.setAiProvider);
  const setConnection = useAppStore(s => s.setConnection);
  const refreshHealth = useHealthStore(s => s.refresh);
  const clientConfigured = isGoogleHealthClientConfigured();

  // The coach is on-device only now — migrate any legacy cloud selection so the
  // download card always reflects the local Gemma provider.
  React.useEffect(() => {
    if (aiProvider !== 'ondevice') setAiProvider('ondevice');
  }, [aiProvider, setAiProvider]);
  const modelLabel = modelByLabel(model)?.label ?? PROVIDERS.ondevice.models[0];

  React.useEffect(() => {
    isGoogleHealthConnected()
      .then(on => setConnection('googleHealth', on))
      .catch(() => undefined);
  }, [setConnection]);

  const onToggle = React.useCallback(
    async (next: boolean) => {
      if (!next) {
        await disconnectGoogleHealth();
        setConnection('googleHealth', false);
        return;
      }
      if (!clientConfigured) {
        Alert.alert(
          'Google Health unavailable',
          'Native Google sign-in is only available on Android and iOS builds.',
        );
        return;
      }
      try {
        const ok = await connectGoogleHealth();
        setConnection('googleHealth', ok);
        if (ok) await refreshHealth();
        else
          Alert.alert('Not connected', 'Google Health sign-in was cancelled.');
      } catch {
        Alert.alert('Connection failed', 'Could not connect to Google Health.');
      }
    },
    [clientConfigured, refreshHealth, setConnection],
  );

  return (
    <BriefScreen>
      {/* ── 01 Data sources ─────────────────────────────────────────── */}
      <Section n="01" title="Data sources" first>
        <View style={[styles.conn, { borderBottomColor: c.hair }]}>
          <View style={styles.connText}>
            <Text style={S(600, 13.5, { color: c.ink })}>Google Health</Text>
            <Text
              style={[
                M(600, 9.5, { ls: 1, color: connected ? c.grn : c.fnt }),
                styles.status,
              ]}
            >
              {connected
                ? 'CONNECTED · STEPS · ACTIVITIES · HR · SLEEP · HRV'
                : 'NOT CONNECTED'}
            </Text>
          </View>
          <Toggle
            on={connected}
            onToggle={() => onToggle(!connected)}
            label="Google Health connection"
          />
        </View>
        <Text style={[M(600, 10.5, { color: c.fnt }), styles.note]}>
          {clientConfigured
            ? 'GOOGLE HEALTH IS YOUR DATA SOURCE — ACTIVITIES AUTO-FILL YOUR GOALS, AND FOOD YOU LOG IS WRITTEN BACK TO IT.'
            : 'NATIVE GOOGLE SIGN-IN IS ONLY AVAILABLE ON ANDROID & IOS BUILDS. UNTIL CONNECTED, METRICS SHOW "—".'}
        </Text>
      </Section>

      {/* ── 02 AI coach ─────────────────────────────────────────────── */}
      <Section n="02" title="AI coach">
        <Text style={[M(600, 10.5, { color: c.fnt }), styles.coachNote]}>
          YOUR COACH RUNS FULLY ON YOUR PHONE — PRIVATE, NO API KEY, WORKS
          OFFLINE ONCE THE MODEL IS DOWNLOADED.
        </Text>

        <OnDeviceModelCard modelLabel={modelLabel} />

        <LanguageSelect />
      </Section>

      {/* ── 03 Calorie goal ─────────────────────────────────────────── */}
      <CalorieGoalSection n="03" />
    </BriefScreen>
  );
}

/**
 * Download card for the on-device Gemma model. Shows the selected tier's size
 * and a state-dependent control: Download → live progress + Cancel → Ready +
 * Delete. Driven entirely by {@link useModelStore}; all writes hit the
 * filesystem, so this only renders on a native build (a mock covers tests).
 */
function OnDeviceModelCard({ modelLabel }: { modelLabel: string }) {
  const t = useTheme();
  const c = t.colors;
  const status = useModelStore(s => s.status);
  const progress = useModelStore(s => s.progress);
  const bytesWritten = useModelStore(s => s.bytesWritten);
  const bytesTotal = useModelStore(s => s.bytesTotal);
  const download = useModelStore(s => s.download);
  const cancel = useModelStore(s => s.cancel);
  const remove = useModelStore(s => s.remove);

  // Keep the store's selected tier in sync with the coach's model, and re-check
  // whether it's already on disk when this card appears or the tier changes.
  React.useEffect(() => {
    const m = modelByLabel(modelLabel);
    if (!m) return;
    const st = useModelStore.getState();
    if (st.selectedId !== m.id) void st.select(m.id);
    else void st.check();
  }, [modelLabel]);

  const pct = Math.round(progress * 100);

  return (
    <View style={[styles.modelCard, { borderColor: c.hair }]}>
      <View style={styles.modelCardHead}>
        <Text style={S(600, 13.5, { color: c.ink })}>{modelLabel}</Text>
        <Text style={M(600, 10, { ls: 1, color: c.fnt })}>
          {formatBytes(bytesTotal).toUpperCase()}
        </Text>
      </View>

      {status === 'downloading' ? (
        <>
          <View style={[styles.progressTrack, { backgroundColor: c.hair }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: c.acc, width: `${pct}%` },
              ]}
            />
          </View>
          <View style={styles.modelCardHead}>
            <Text style={M(600, 10.5, { color: c.mut })}>
              {`${pct}% · ${formatBytes(bytesWritten)} / ${formatBytes(bytesTotal)}`}
            </Text>
            <Pressable onPress={() => void cancel()} accessibilityRole="button">
              <Text style={M(700, 10.5, { ls: 0.4, color: c.fnt })}>
                CANCEL
              </Text>
            </Pressable>
          </View>
        </>
      ) : status === 'ready' ? (
        <View style={styles.modelCardHead}>
          <Text style={M(700, 10, { ls: 1, color: c.grn })}>MODEL READY</Text>
          <Pressable onPress={() => void remove()} accessibilityRole="button">
            <Text style={M(700, 10.5, { ls: 0.4, color: c.fnt })}>DELETE</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {status === 'error' && (
            <Text style={[M(600, 10.5, { color: c.fnt }), styles.modelErr]}>
              DOWNLOAD FAILED — CHECK YOUR CONNECTION AND RETRY.
            </Text>
          )}
          <Pressable
            onPress={() => void download()}
            accessibilityRole="button"
            style={[styles.downloadBtn, { backgroundColor: c.ink }]}
          >
            <Text style={M(700, 11, { ls: 0.6, color: c.inv })}>
              {status === 'error'
                ? 'RETRY DOWNLOAD'
                : `DOWNLOAD ${formatBytes(bytesTotal).toUpperCase()}`}
            </Text>
          </Pressable>
        </>
      )}

      <Text style={[M(600, 10.5, { color: c.fnt }), styles.note]}>
        RUNS FULLY ON YOUR PHONE · NO KEY · WORKS OFFLINE ONCE DOWNLOADED
      </Text>
    </View>
  );
}

/** The v3 pill toggle (ink track when on, accent knob). */
function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  const t = useTheme();
  const c = t.colors;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={[
        styles.toggle,
        {
          borderColor: on ? c.ink : c.hair,
          backgroundColor: on ? c.ink : 'transparent',
          justifyContent: on ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: on ? c.acc : c.fnt }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  conn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    marginTop: 4,
    borderBottomWidth: 1,
  },
  connText: { flex: 1, minWidth: 0 },
  status: { marginTop: 3 },
  note: { marginTop: 16, lineHeight: 16 },
  toggle: {
    width: 46,
    height: 27,
    borderRadius: 999,
    borderWidth: 1,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: { width: 19, height: 19, borderRadius: 999 },
  coachNote: { marginTop: 4, lineHeight: 16 },
  modelCard: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  modelCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  downloadBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modelErr: { lineHeight: 15 },
});
