/**
 * Voice-input hook for the coach composer: hold the mic, speak, and get the
 * transcript dropped into the text field for review before sending.
 *
 * Records a 16 kHz mono PCM WAV with expo-audio (the format whisper.cpp consumes
 * natively) and hands the file to {@link ./ondevice/useWhisperStore}'s
 * `transcribe`, which lazy-loads the on-device Whisper model. The transcription
 * language tracks the coach's selected language ({@link ./ondevice/whisperModels}
 * maps it to a Whisper code, or `'auto'`).
 *
 * Recording lives here rather than in the store because expo-audio's recorder is
 * a React hook; the store owns only the model file and the decode call.
 *
 * NOTE: iOS produces a true 16 kHz WAV via LINEARPCM. Android's expo-audio
 * recorder has no PCM/WAV output format, so Android voice input needs the
 * whisper.rn realtime PCM path (a follow-up) — this hook targets iOS today.
 */

import { useCallback, useState } from 'react';
import {
  AudioQuality,
  IOSOutputFormat,
  RecordingOptions,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { useAppStore } from '../../state/useAppStore';
import { useWhisperStore } from './ondevice/useWhisperStore';
import { whisperLangCode } from './ondevice/whisperModels';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

/** 16 kHz mono PCM WAV. Spreads the HIGH_QUALITY preset for valid Android/web
 * blocks, then overrides iOS to LINEARPCM so whisper.cpp gets exactly the
 * uncompressed WAV it expects with no resample step. */
const WAV_16K: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export interface VoiceInput {
  /** Current phase of the mic flow. */
  state: VoiceState;
  /** True when the Whisper model is downloaded (voice input is usable). */
  ready: boolean;
  /** Last error (permission denied / transcription failure), or null. */
  error: string | null;
  /** Start recording when idle; stop + transcribe when recording. No-op while
   * transcribing. */
  toggle: () => void;
}

export function useVoiceInput(onTranscript: (text: string) => void): VoiceInput {
  const recorder = useAudioRecorder(WAV_16K);
  const ready = useWhisperStore(s => s.status === 'ready');
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Microphone access is off. Enable it in Settings to use voice.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState('recording');
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    setState('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('No audio was recorded.');
      const lang = whisperLangCode(useAppStore.getState().coachLanguage);
      const text = await useWhisperStore.getState().transcribe(uri, lang);
      if (text) onTranscript(text);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      // Give the audio session back so it doesn't hold the recording route.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      setState('idle');
    }
  }, [recorder, onTranscript]);

  const toggle = useCallback(() => {
    if (state === 'transcribing') return;
    if (state === 'recording') void stopAndTranscribe();
    else void start();
  }, [state, start, stopAndTranscribe]);

  return { state, ready, error, toggle };
}
