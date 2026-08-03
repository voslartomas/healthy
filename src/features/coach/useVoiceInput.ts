/**
 * Voice-input hook for the coach composer: hold the mic, speak, and get the
 * transcript dropped into the text field for review before sending.
 *
 * Captures 16 kHz mono 16-bit audio and hands it to
 * {@link ./ondevice/useWhisperStore}'s `transcribe`, which lazy-loads the
 * on-device Whisper model. The transcription language tracks the coach's selected
 * language ({@link ./ondevice/whisperModels} maps it to a Whisper code, or 'auto').
 *
 * Capture is platform-split because the two platforms expose PCM differently:
 *  - iOS: expo-audio's LINEARPCM recorder writes a real WAV file → its URI.
 *  - Android: expo-audio has no PCM output format, so we stream raw PCM off the
 *    mic ({@link ./pcmRecorder}) and wrap it as a `data:audio/wav;base64,…` URI.
 * Both feed the same engine. Recording lives here (not the store) because
 * expo-audio's recorder is a React hook; the store owns only the model + decode.
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
import { resolveVoiceLang } from './ondevice/whisperModels';
import { createPcmRecorder, PcmRecorder } from './pcmRecorder';

const IS_ANDROID = Platform.OS === 'android';

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
  // iOS records through this expo-audio recorder; on Android it's unused (the
  // hook must still be called unconditionally to satisfy the rules of hooks).
  const recorder = useAudioRecorder(WAV_16K);
  const pcmRef = useRef<PcmRecorder | null>(null);
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
    if (IS_ANDROID) {
      pcmRef.current ??= createPcmRecorder();
      pcmRef.current.start();
    } else {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    }
    setState('recording');
  }, [recorder]);

  const stopAndTranscribe = useCallback(async () => {
    setState('transcribing');
    try {
      let uri: string | null;
      if (IS_ANDROID) {
        uri = (await pcmRef.current?.stop()) ?? null;
      } else {
        await recorder.stop();
        uri = recorder.uri;
      }
      if (!uri) throw new Error('No audio was recorded.');
      const lang = resolveVoiceLang(useAppStore.getState().coachLanguage);
      const text = await useWhisperStore.getState().transcribe(uri, lang);
      if (text) onTranscript(text);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      // iOS only: give the audio session back so it doesn't hold the mic route.
      if (!IS_ANDROID) {
        await setAudioModeAsync({ allowsRecording: false }).catch(
          () => undefined,
        );
      }
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
