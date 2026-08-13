import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefScreen, M, S, Section } from '../../components/brief';
import { LanguageSelect } from '../coach/LanguageSelect';
import { formatBytes, modelByLabel } from '../coach/ondevice/models';
import { useModelStore } from '../coach/ondevice/useModelStore';
import { useWhisperStore } from '../coach/ondevice/useWhisperStore';
import { WHISPER_MODEL } from '../coach/ondevice/whisperModels';
import { CalorieGoalSection } from '../nutrition/CalorieGoalSection';
import {
  connectHealthSource,
  disconnectHealthSource,
  healthSourceName,
  isHealthSourceConfigured,
  isHealthSourceConnected,
} from '../../health';
import { ProfileSection } from './ProfileSection';
import { createBackup, restoreBackup } from '../../state/backupService';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/** Setup tab (04): health data connections and AI coach provider configuration. */
export function SettingsScreen(_props: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const model = useAppStore(s => s.model);
  const aiProvider = useAppStore(s => s.aiProvider);
  const connected = useAppStore(s => s.connections.device);
  const setAiProvider = useAppStore(s => s.setAiProvider);
  const setConnection = useAppStore(s => s.setConnection);
  const refreshHealth = useHealthStore(s => s.refresh);
  const clientConfigured = isHealthSourceConfigured();
  const sourceName = healthSourceName();

  // The coach is on-device only now — migrate any legacy cloud selection so the
  // download card always reflects the local Gemma provider.
  React.useEffect(() => {
    if (aiProvider !== 'ondevice') setAiProvider('ondevice');
  }, [aiProvider, setAiProvider]);
  const modelLabel = modelByLabel(model)?.label ?? PROVIDERS.ondevice.models[0];

  React.useEffect(() => {
    isHealthSourceConnected()
      .then(on => setConnection('device', on))
      .catch(() => undefined);
  }, [setConnection]);

  const onToggle = React.useCallback(
    async (next: boolean) => {
      if (!next) {
        await disconnectHealthSource();
        setConnection('device', false);
        return;
      }
      if (!clientConfigured) {
        Alert.alert(
          `${sourceName} unavailable`,
          `${sourceName} is only available on a native device build.`,
        );
        return;
      }
      try {
        const ok = await connectHealthSource();
        setConnection('device', ok);
        if (ok) await refreshHealth();
        else
          Alert.alert(
            'Not connected',
            `${sourceName} permission was not granted.`,
          );
      } catch (err) {
        Alert.alert(
          'Connection failed',
          err instanceof Error ? err.message : `Could not connect to ${sourceName}.`,
        );
      }
    },
    [clientConfigured, refreshHealth, setConnection, sourceName],
  );

  return (
    <BriefScreen>
      {/* ── 01 Data sources ─────────────────────────────────────────── */}
      <Section n="01" title="Data sources" first>
        <View style={[styles.conn, { borderBottomColor: c.hair }]}>
          <View style={styles.connText}>
            <Text style={S(600, 13.5, { color: c.ink })}>{sourceName}</Text>
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
            label={`${sourceName} connection`}
          />
        </View>
        <Text style={[M(600, 10.5, { color: c.fnt }), styles.note]}>
          {clientConfigured
            ? `${sourceName.toUpperCase()} IS YOUR DATA SOURCE — IT STAYS ON YOUR PHONE, ACTIVITIES AUTO-FILL YOUR GOALS, AND FOOD YOU LOG IS WRITTEN BACK TO IT.`
            : `${sourceName.toUpperCase()} IS ONLY AVAILABLE ON A NATIVE DEVICE BUILD. UNTIL CONNECTED, METRICS SHOW "—".`}
        </Text>
      </Section>

      {/* ── Profile ─────────────────────────────────────────────────── */}
      <ProfileSection n="02" />

      {/* ── 03 AI coach ─────────────────────────────────────────────── */}
      <Section n="03" title="AI coach">
        <Text style={[M(600, 10.5, { color: c.fnt }), styles.coachNote]}>
          YOUR COACH RUNS FULLY ON YOUR PHONE — PRIVATE, NO API KEY, WORKS
          OFFLINE ONCE THE MODEL IS DOWNLOADED.
        </Text>

        <OnDeviceModelCard modelLabel={modelLabel} />

        <LanguageSelect />

        <Text style={[M(700, 10, { ls: 1, color: c.fnt }), styles.voiceLabel]}>
          VOICE INPUT
        </Text>
        <VoiceModelCard />
      </Section>

      {/* ── 04 Calorie goal ─────────────────────────────────────────── */}
      <CalorieGoalSection n="04" />

      {/* ── 05 Backup ───────────────────────────────────────────────── */}
      <BackupSection n="05" />
    </BriefScreen>
  );
}

/**
 * Back up / restore local data (goals, calorie goals, weekly history, common
 * foods, profile, conversations) to a JSON file via the OS share sheet and
 * document picker — so the user can save to Google Drive/Files and restore on a
 * new device. Health metrics themselves live in Health Connect/HealthKit and
 * re-sync on their own; this covers the app's own local state.
 */
function BackupSection({ n }: { n: string }) {
  const t = useTheme();
  const c = t.colors;
  const [busy, setBusy] = React.useState<null | 'backup' | 'restore'>(null);

  const onBackup = React.useCallback(async () => {
    if (busy) return;
    setBusy('backup');
    const res = await createBackup();
    setBusy(null);
    if (!res.ok && !res.canceled) {
      Alert.alert('Backup failed', res.error ?? 'Could not create a backup.');
    }
  }, [busy]);

  const onRestore = React.useCallback(() => {
    if (busy) return;
    Alert.alert(
      'Restore backup',
      'This replaces your current goals and local data with the backup file. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          style: 'destructive',
          onPress: async () => {
            setBusy('restore');
            const res = await restoreBackup();
            setBusy(null);
            if (res.ok) {
              Alert.alert('Restored', 'Your data was restored from the backup.');
            } else if (!res.canceled) {
              Alert.alert(
                'Restore failed',
                res.error ?? 'Could not restore the backup.',
              );
            }
          },
        },
      ],
    );
  }, [busy]);

  return (
    <Section n={n} title="Backup">
      <Text style={[M(600, 10.5, { color: c.fnt }), styles.coachNote]}>
        SAVE YOUR GOALS AND LOCAL DATA TO A FILE YOU CAN KEEP IN GOOGLE DRIVE OR
        FILES, AND RESTORE IT LATER OR ON A NEW PHONE.
      </Text>
      <View style={styles.backupRow}>
        <Pressable
          onPress={onBackup}
          disabled={busy != null}
          accessibilityRole="button"
          accessibilityLabel="Back up data to a file"
          style={[
            styles.backupBtn,
            { backgroundColor: c.ink, opacity: busy != null ? 0.5 : 1 },
          ]}
        >
          <Text style={M(700, 11, { ls: 0.6, color: c.inv })}>
            {busy === 'backup' ? 'BACKING UP…' : 'BACK UP'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onRestore}
          disabled={busy != null}
          accessibilityRole="button"
          accessibilityLabel="Restore data from a backup file"
          style={[
            styles.backupBtn,
            styles.backupBtnAlt,
            { borderColor: c.ink, opacity: busy != null ? 0.5 : 1 },
          ]}
        >
          <Text style={M(700, 11, { ls: 0.6, color: c.ink })}>
            {busy === 'restore' ? 'RESTORING…' : 'RESTORE'}
          </Text>
        </Pressable>
      </View>
    </Section>
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

      {status === 'downloading' || status === 'paused' ? (
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
              {`${status === 'paused' ? 'PAUSED · ' : ''}${pct}% · ${formatBytes(bytesWritten)} / ${formatBytes(bytesTotal)}`}
            </Text>
            <View style={styles.modelCardActions}>
              {status === 'paused' && (
                <Pressable
                  onPress={() => void download()}
                  accessibilityRole="button"
                >
                  <Text style={M(700, 10.5, { ls: 0.4, color: c.grn })}>
                    RESUME
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => void cancel()}
                accessibilityRole="button"
              >
                <Text style={M(700, 10.5, { ls: 0.4, color: c.fnt })}>
                  CANCEL
                </Text>
              </Pressable>
            </View>
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

/**
 * Download card for the on-device Whisper speech-to-text model. Same states as
 * {@link OnDeviceModelCard} but a single model (no tier), driven by
 * {@link useWhisperStore}. Downloading it reveals the mic in the coach composer.
 */
function VoiceModelCard() {
  const t = useTheme();
  const c = t.colors;
  const status = useWhisperStore(s => s.status);
  const progress = useWhisperStore(s => s.progress);
  const bytesWritten = useWhisperStore(s => s.bytesWritten);
  const bytesTotal = useWhisperStore(s => s.bytesTotal);
  const download = useWhisperStore(s => s.download);
  const cancel = useWhisperStore(s => s.cancel);
  const remove = useWhisperStore(s => s.remove);

  // Re-check whether the model is already on disk when the card appears.
  React.useEffect(() => {
    void useWhisperStore.getState().check();
  }, []);

  const pct = Math.round(progress * 100);

  return (
    <View style={[styles.modelCard, { borderColor: c.hair }]}>
      <View style={styles.modelCardHead}>
        <Text style={S(600, 13.5, { color: c.ink })}>{WHISPER_MODEL.label}</Text>
        <Text style={M(600, 10, { ls: 1, color: c.fnt })}>
          {formatBytes(bytesTotal).toUpperCase()}
        </Text>
      </View>

      {status === 'downloading' || status === 'paused' ? (
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
              {`${status === 'paused' ? 'PAUSED · ' : ''}${pct}% · ${formatBytes(bytesWritten)} / ${formatBytes(bytesTotal)}`}
            </Text>
            <View style={styles.modelCardActions}>
              {status === 'paused' && (
                <Pressable
                  onPress={() => void download()}
                  accessibilityRole="button"
                >
                  <Text style={M(700, 10.5, { ls: 0.4, color: c.grn })}>
                    RESUME
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => void cancel()}
                accessibilityRole="button"
              >
                <Text style={M(700, 10.5, { ls: 0.4, color: c.fnt })}>
                  CANCEL
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : status === 'ready' ? (
        <View style={styles.modelCardHead}>
          <Text style={M(700, 10, { ls: 1, color: c.grn })}>VOICE READY</Text>
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
        SPEECH-TO-TEXT RUNS FULLY ON YOUR PHONE · TAP THE MIC IN CHAT TO TALK TO
        YOUR COACH · WORKS OFFLINE ONCE DOWNLOADED
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
  voiceLabel: { marginTop: 22, marginBottom: 2 },
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
  modelCardActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  downloadBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modelErr: { lineHeight: 15 },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  backupBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  backupBtnAlt: { backgroundColor: 'transparent', borderWidth: 1 },
});
