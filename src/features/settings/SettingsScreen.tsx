import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  Card,
  chunky,
  pageTitleStyle,
  S,
  SegmentedRow,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
import { LanguageSelect } from '../coach/LanguageSelect';
import { formatBytes } from '../coach/ondevice/models';
import type { UnavailableReason } from '../coach/ondevice/systemLlm';
import { ModelStatus, useModelStore } from '../coach/ondevice/useModelStore';
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
import { SectionHead } from './SectionHead';
import { createBackup, restoreBackup } from '../../state/backupService';
import { ThemePreference, useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';

/**
 * The "Me" tab (ADR-007; route name still `Settings`): the health data source,
 * appearance, the profile, the on-device coach (model, language, voice), the
 * calorie goal and backup — each a titled section on the page, per the
 * friendly "Settings" artboard.
 */
export function SettingsScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const aiProvider = useAppStore(s => s.aiProvider);
  const connected = useAppStore(s => s.connections.device);
  const setAiProvider = useAppStore(s => s.setAiProvider);
  const setConnection = useAppStore(s => s.setConnection);
  const refreshHealth = useHealthStore(s => s.refresh);
  const clientConfigured = isHealthSourceConfigured();
  const sourceName = healthSourceName();

  // The coach is on-device only now — migrate any legacy cloud selection so the
  // coach card always reflects the OS's on-device model (ADR-008).
  React.useEffect(() => {
    if (aiProvider !== 'ondevice') setAiProvider('ondevice');
  }, [aiProvider, setAiProvider]);

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
          err instanceof Error
            ? err.message
            : `Could not connect to ${sourceName}.`,
        );
      }
    },
    [clientConfigured, refreshHealth, setConnection, sourceName],
  );

  return (
    <BriefScreen>
      <Text style={[pageTitleStyle(c.ink), styles.pageTitle]}>Me</Text>

      {/* ── Data source ──────────────────────────────────────────── */}
      <Card first>
        <View style={styles.conn}>
          <View style={[styles.connIcon, { backgroundColor: c.grnTint }]}>
            <Icon name="heartLine" size={24} color={c.grn} strokeWidth={2.2} />
          </View>
          <View style={styles.connText}>
            <Text style={S(900, 17, { lh: 22, color: c.ink })}>
              {sourceName}
            </Text>
            <Text
              style={S(800, 14, { lh: 19, color: connected ? c.grn : c.fnt })}
            >
              {connected
                ? 'Connected · steps, activities, HR, sleep, HRV'
                : 'Not connected'}
            </Text>
          </View>
          <Toggle
            on={connected}
            onToggle={() => onToggle(!connected)}
            label={`${sourceName} connection`}
          />
        </View>
        <Text style={[S(700, 14, { lh: 19, color: c.mut }), styles.connNote]}>
          {clientConfigured
            ? `${sourceName} is your data source. It stays on your phone, your activities fill in your goals, and food you log is written back to it.`
            : `${sourceName} is only available on a native device build. Until it's connected, metrics show “—”.`}
        </Text>
      </Card>

      {/* ── Appearance ───────────────────────────────────────────── */}
      <AppearanceSection />

      {/* ── Profile ("About you") ────────────────────────────────── */}
      <ProfileSection />

      {/* ── Your coach ───────────────────────────────────────────── */}
      <SectionHead
        title="Your coach"
        sub="Runs fully on your phone with its built-in AI — private, no key, no download of ours."
      />
      <CoachModelCard />
      <LanguageSelect />
      <VoiceModelCard />

      {/* ── Calorie goal ─────────────────────────────────────────── */}
      <CalorieGoalSection />

      {/* ── Backup ───────────────────────────────────────────────── */}
      <BackupSection />
    </BriefScreen>
  );
}

const THEME_OPTIONS = [
  { key: 'system' as const, label: 'System' },
  { key: 'light' as const, label: 'Light' },
  { key: 'dark' as const, label: 'Dark' },
];

/**
 * Colour scheme picker.
 *
 * 'System' is the default and right for most people, but a phone on *scheduled*
 * dark mode flips the app at sunset with no way to pin it — which is the whole
 * reason this exists. Choosing Light or Dark overrides the OS for this app only.
 */
function AppearanceSection() {
  const c = useTheme().colors;
  const preference = useAppStore(s => s.themePreference);
  const setPreference = useAppStore(s => s.setThemePreference);

  return (
    <>
      <SectionHead title="Appearance" />
      <SegmentedRow<ThemePreference>
        options={THEME_OPTIONS}
        value={preference}
        onChange={next => next && setPreference(next)}
        style={styles.themeRow}
      />
      <Text style={[S(700, 14, { lh: 19, color: c.fnt }), styles.note]}>
        {preference === 'system'
          ? 'Follows your phone — including its scheduled dark mode, which switches the app at sunset.'
          : `Always ${preference}, whatever your phone is set to.`}
      </Text>
    </>
  );
}

/**
 * Back up / restore local data (goals, calorie goals, weekly history, common
 * foods, profile, conversations) to a JSON file via the OS share sheet and
 * document picker — so the user can save to Google Drive/Files and restore on a
 * new device. Health metrics themselves live in Health Connect/HealthKit and
 * re-sync on their own; this covers the app's own local state.
 */
function BackupSection() {
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
              Alert.alert(
                'Restored',
                'Your data was restored from the backup.',
              );
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
    <>
      <SectionHead
        title="Backup"
        sub="Save your goals and local data to a file you keep in Google Drive or Files, and restore it later or on a new phone."
      />
      <View style={styles.btnRow}>
        <BriefButton
          label={busy === 'backup' ? 'Backing up…' : 'Back up'}
          onPress={() => void onBackup()}
          disabled={busy != null}
          accessibilityLabel="Back up data to a file"
          size={13}
          fontSize={16}
          style={styles.btnHalf}
        />
        <BriefButton
          label={busy === 'restore' ? 'Restoring…' : 'Restore'}
          onPress={onRestore}
          kind="outline"
          disabled={busy != null}
          accessibilityLabel="Restore data from a backup file"
          size={13}
          fontSize={16}
          style={styles.btnHalf}
        />
      </View>
    </>
  );
}

/** What a {@link DownloadCard} needs from a model store with a download
 * lifecycle (`useWhisperStore`; the coach model is the OS's, see
 * {@link CoachModelCard}). */
interface DownloadState {
  status: string;
  progress: number;
  bytesWritten: number;
  bytesTotal: number;
  download: () => Promise<void>;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
  remove: () => Promise<void>;
}

/**
 * One downloadable on-device model as a chunky card: its name, a status line
 * carrying the size (and live progress), and the control for the state it is in:
 *  - absent → Download {size};
 *  - downloading → progress bar + Pause / Cancel;
 *  - paused → progress bar + Resume / Cancel (paused also happens on its own
 *    when the app is backgrounded, see App.tsx);
 *  - ready → Delete;
 *  - error → the failure line + Retry download.
 * `compact` puts the Download button beside the title (the voice card).
 */
function DownloadCard({
  title,
  idleLine,
  readyLine,
  noun,
  state,
  compact,
}: {
  title: string;
  /** Status line before anything is downloaded (size is appended). */
  idleLine: string;
  /** Status line once on disk (size is appended). */
  readyLine: string;
  /** What is being downloaded, for the controls' accessibility labels. */
  noun: string;
  state: DownloadState;
  compact?: boolean;
}) {
  const c = useTheme().colors;
  const { status, progress, bytesWritten, bytesTotal } = state;
  const pct = Math.round(progress * 100);
  const size = formatBytes(bytesTotal);
  const inFlight = status === 'downloading' || status === 'paused';

  const line = inFlight
    ? `${status === 'paused' ? 'Paused' : 'Downloading'} · ${pct}% · ${formatBytes(bytesWritten)} of ${size}`
    : status === 'ready'
      ? `${readyLine} · ${size}`
      : status === 'error'
        ? 'Download failed — check your connection and retry.'
        : `${idleLine} · ${size}`;
  const lineColor =
    status === 'ready' ? c.grn : status === 'error' ? c.red : c.mut;

  const downloadBtn = (
    <BriefButton
      label={status === 'error' ? 'Retry download' : `Download ${size}`}
      onPress={() => void state.download()}
      accessibilityLabel={
        status === 'error' ? `Retry ${noun} download` : `Download ${noun}`
      }
      size={12}
      fontSize={15}
      style={compact ? styles.inlineBtn : null}
    />
  );

  return (
    <View style={[chunky(c), styles.dlCard]}>
      <View style={styles.dlHead}>
        <View style={styles.dlText}>
          <Text style={S(900, 17, { lh: 22, color: c.ink })}>{title}</Text>
          <Text style={S(800, 14, { lh: 19, color: lineColor })}>{line}</Text>
        </View>
        {compact && (status === 'absent' || status === 'error')
          ? downloadBtn
          : null}
      </View>

      {inFlight ? (
        <>
          <View style={[styles.progressTrack, { backgroundColor: c.accTint }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: c.accSolid, width: `${pct}%` },
              ]}
            />
          </View>
          <View style={styles.cardBtnRow}>
            {status === 'paused' ? (
              <BriefButton
                label="Resume"
                onPress={() => void state.download()}
                tone="green"
                accessibilityLabel={`Resume ${noun} download`}
                size={11}
                fontSize={15}
                style={styles.btnHalf}
              />
            ) : (
              <BriefButton
                label="Pause"
                onPress={() => void state.pause()}
                kind="outline"
                accessibilityLabel={`Pause ${noun} download`}
                size={11}
                style={styles.btnHalf}
              />
            )}
            <OutlineDanger
              label="Cancel"
              onPress={() => void state.cancel()}
              accessibilityLabel={`Cancel ${noun} download`}
            />
          </View>
        </>
      ) : status === 'ready' ? (
        <View style={styles.cardBtnRow}>
          <OutlineDanger
            label="Delete"
            onPress={() => void state.remove()}
            accessibilityLabel={`Delete ${noun}`}
          />
        </View>
      ) : compact ? null : (
        downloadBtn
      )}
    </View>
  );
}

/** The outlined slab with red text the artboard uses for Cancel / Delete.
 * (`BriefButton`'s outline is always ink text, so this one is drawn here.) */
function OutlineDanger({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const c = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.danger, { borderColor: c.hair, backgroundColor: c.card }]}
    >
      <Text style={S(900, 15, { color: c.red })}>{label}</Text>
    </Pressable>
  );
}

/** What the coach card says for each state the OS can be in (ADR-008). */
function coachLine(
  status: ModelStatus,
  reason: UnavailableReason | null,
  modelName: string,
  bytesDownloaded: number,
): string {
  switch (status) {
    case 'checking':
      return 'Checking this phone…';
    case 'ready':
      return `${modelName} · ready on this phone`;
    case 'downloadable':
      return `${modelName} is supported — download it once to start`;
    case 'downloading':
      return bytesDownloaded > 0
        ? `Setting up ${modelName} · ${formatBytes(bytesDownloaded)} so far`
        : `${modelName} is being set up on this phone…`;
    case 'error':
      return 'Download failed — check your connection and retry.';
    default:
      if (reason === 'notEnabled')
        return 'Turn on Apple Intelligence in iOS Settings to use the coach.';
      if (reason === 'osTooOld')
        return 'Needs iOS 26 or newer with Apple Intelligence.';
      if (reason === 'error')
        return `${modelName} isn't ready yet — it can take a few minutes on a new phone.`;
      if (reason === 'missing')
        return "On-device AI isn't included in this build.";
      return "This phone doesn't support on-device AI, so the coach and daily brief are off.";
  }
}

/**
 * The coach's model: the OS's own (Gemini Nano on Android, Apple Intelligence
 * on iOS — ADR-008), so there's nothing of ours to download or delete. The card
 * says whether this phone can run it, offers Android's one-time "Download"
 * when AICore reports it downloadable, and a "Check again" for the transient
 * cases (AICore still initialising, Apple Intelligence just switched on).
 * Driven by {@link useModelStore}.
 */
function CoachModelCard() {
  const c = useTheme().colors;
  const status = useModelStore(s => s.status);
  const reason = useModelStore(s => s.reason);
  const modelName = useModelStore(s => s.modelName);
  const bytesDownloaded = useModelStore(s => s.bytesDownloaded);
  const download = useModelStore(s => s.download);
  const check = useModelStore(s => s.check);

  // Re-ask the OS whenever the card appears.
  React.useEffect(() => {
    void useModelStore.getState().check();
  }, []);

  const lineColor =
    status === 'ready'
      ? c.grn
      : status === 'error' || status === 'unavailable'
        ? c.red
        : c.mut;
  const canRecheck =
    status === 'unavailable' && (reason === 'error' || reason === 'notEnabled');

  return (
    <View style={[chunky(c), styles.dlCard]}>
      <View style={styles.dlHead}>
        <View style={styles.dlText}>
          <Text style={S(900, 17, { lh: 22, color: c.ink })}>Coach model</Text>
          <Text style={S(800, 14, { lh: 19, color: lineColor })}>
            {coachLine(status, reason, modelName, bytesDownloaded)}
          </Text>
        </View>
      </View>
      {status === 'downloading' ? (
        <View style={[styles.progressTrack, { backgroundColor: c.accTint }]}>
          {/* AICore reports bytes but no total, so the bar is a steady
              "working" fill rather than a fake percentage. */}
          <View
            style={[
              styles.progressFill,
              { backgroundColor: c.accSolid, width: '40%' },
            ]}
          />
        </View>
      ) : null}
      {status === 'downloadable' || status === 'error' ? (
        <BriefButton
          label={
            status === 'error' ? 'Retry download' : `Download ${modelName}`
          }
          onPress={() => void download()}
          accessibilityLabel={
            status === 'error'
              ? 'Retry coach model download'
              : 'Download coach model'
          }
          size={12}
          fontSize={15}
        />
      ) : canRecheck ? (
        <BriefButton
          label="Check again"
          kind="outline"
          onPress={() => void check()}
          accessibilityLabel="Check coach model again"
          size={12}
          fontSize={15}
        />
      ) : null}
    </View>
  );
}

/**
 * Download card for the on-device Whisper speech-to-text model. Same states as
 * {@link OnDeviceModelCard} but a single model (no tier), driven by
 * {@link useWhisperStore}. Downloading it reveals the mic in the coach composer,
 * so the card says what voice input is for rather than only naming the model.
 */
function VoiceModelCard() {
  const c = useTheme().colors;
  const state: DownloadState = {
    status: useWhisperStore(s => s.status),
    progress: useWhisperStore(s => s.progress),
    bytesWritten: useWhisperStore(s => s.bytesWritten),
    bytesTotal: useWhisperStore(s => s.bytesTotal),
    download: useWhisperStore(s => s.download),
    pause: useWhisperStore(s => s.pause),
    cancel: useWhisperStore(s => s.cancel),
    remove: useWhisperStore(s => s.remove),
  };

  // Re-check whether the model is already on disk when the card appears.
  React.useEffect(() => {
    void useWhisperStore.getState().check();
  }, []);

  return (
    <>
      <DownloadCard
        title="Voice input"
        idleLine={`Talk to your coach · ${WHISPER_MODEL.label}`}
        readyLine={`Voice ready · ${WHISPER_MODEL.label}`}
        noun="voice model"
        state={state}
        compact
      />
      <Text style={[S(700, 14, { lh: 19, color: c.fnt }), styles.note]}>
        Speech-to-text runs fully on your phone. Tap the mic in chat to talk to
        your coach — works offline once downloaded.
      </Text>
    </>
  );
}

/** The on/off switch: a green track with a white knob when on, a grey track
 * when off. The knob is the card colour so it stays a "knob" in dark mode. */
function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  const c = useTheme().colors;
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      hitSlop={6}
      style={[
        styles.toggle,
        {
          backgroundColor: on ? c.grnSolid : c.hair,
          justifyContent: on ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <View
        style={[styles.knob, { backgroundColor: c.card, shadowColor: c.ink }]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageTitle: { marginTop: 4 },
  conn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  connIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connText: { flex: 1, minWidth: 0 },
  connNote: { marginTop: 12 },
  toggle: {
    width: 58,
    height: 34,
    borderRadius: 17,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  knob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  themeRow: { marginTop: 10 },
  note: { marginTop: 10 },
  dlCard: { marginTop: 12, padding: 16, gap: 12 },
  dlHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dlText: { flex: 1, minWidth: 0 },
  inlineBtn: { paddingHorizontal: 16 },
  progressTrack: { height: 14, borderRadius: 7, overflow: 'hidden' },
  progressFill: { height: 14, borderRadius: 7 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cardBtnRow: { flexDirection: 'row', gap: 10 },
  btnHalf: { flex: 1 },
  danger: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
});
